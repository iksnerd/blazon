import fs from 'node:fs';
import path from 'node:path';
import type { Browser } from 'playwright-core';
import { launchChrome } from '../shared/chrome.js';
import { Cannot, runPlugin } from '../shared/plugin.js';
import { siteFile } from '../shared/site.js';
import { defaultLogos, readBrand } from './brand.js';
import { decodeRaster } from './decode.js';
import { constructionSvg } from './figure.js';
import { Unsupported } from './geometry.js';
import { labelRaster } from './labels.js';
import { analyzeRaster, analyzeSvg, type Measurement } from './measure.js';
import { fixed } from './numbers.js';
import { finding, parseOptions, type Finding, type Target } from './options.js';
import { takeBlocked } from '../shared/network.js';
import { jobFor, MANIFEST, NAME } from './request.js';

// blazon.logo-geometry: blazon's build role. Reads one request on standard input and measures each logo of the brand: how closely it matches
// itself mirrored and turned, where its weight sits, and for an SVG the grid its points lie on. It writes geometry.json and, for each SVG, a
// construction figure into out_dir. It answers {"findings": [...]}: an error for an axis the options require and a logo lacks, a warning for
// a logo it could not measure. Wrong options are findings, not a failure. A broken request is exit 2 with the reason as the first line of
// standard output, and nothing is written.

const ACCENT = '#ff5a1f';
const DEFAULT_REPORT = 'geometry.json';

/** The report as JSON with its keys in sorted order at every depth, so the same measurements are the same bytes. */
function stable(value: unknown): string {
  const sort = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(sort)
      : v && typeof v === 'object'
        ? Object.fromEntries(
            Object.entries(v)
              .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
              .map(([k, x]) => [k, sort(x)]),
          )
        : v;
  return `${JSON.stringify(sort(value), null, 2)}\n`;
}

/** The file a logo's figure is written to: its name, or its whole id when another logo already has that name. */
const figureName = (taken: Map<string, string>, id: string): string => {
  const plain = `${path.basename(id)}-construction.svg`;
  return taken.has(plain) ? `${id.replace(/\//g, '-')}-construction.svg` : plain;
};

/** The findings a measurement earns: each required axis the logo lacks, and each point off a stated grid. */
function judge(target: Target, result: Measurement): Finding[] {
  const found: Finding[] = [];
  for (const axis of target.require) {
    if (result.axes.includes(axis)) continue;
    const score = result.symmetry[axis];
    found.push(
      finding(
        'axis-not-held',
        'error',
        target.id,
        score
          ? `${target.id} lacks ${axis}: its silhouette scores ${fixed(score.silhouette, 2)} and ${fixed(target.tolerance, 2)} is needed`
          : `${target.id} cannot be tested for ${axis}: that axis is measured only on a logo that is nearly square`,
      ),
    );
  }
  if (result.grid && result.grid.off.length > 0) {
    const shown = result.grid.off
      .slice(0, 5)
      .map((p) => `(${p.x}, ${p.y})`)
      .join(', ');
    const more = result.grid.off.length > 5 ? ` and ${result.grid.off.length - 5} more` : '';
    found.push(
      finding(
        'off-grid',
        'warning',
        target.id,
        `${target.id} has ${result.grid.off.length} point${result.grid.off.length === 1 ? '' : 's'} off the grid of ${result.grid.stated}: ${shown}${more}`,
      ),
    );
  }
  return found;
}

async function build(text: string): Promise<{ findings: Finding[] }> {
  const job = jobFor(text);
  const brand = readBrand(job.brand);
  const { options, findings } = parseOptions(job.options, new Set(brand.assets.keys()));
  const targets: Target[] =
    options.targets ??
    defaultLogos(brand).map((id) => ({
      id,
      named: false,
      ...(options.all.grid !== undefined && { grid: options.all.grid }),
      require: options.all.require,
      tolerance: options.all.tolerance,
    }));
  const accent = options.accent ?? brand.accent ?? ACCENT;

  const report: Record<string, Measurement> = {};
  const figures = new Map<string, string>();
  const rasters: { target: Target; bytes: Buffer; format: string }[] = [];
  const cannot = (target: Target, reason: string) =>
    findings.push(finding('not-measured', target.named ? 'error' : 'warning', target.id, `${target.id} was not measured: ${reason}`));
  const keep = (target: Target, result: Measurement, notes: string[]) => {
    report[target.id] = result;
    findings.push(...judge(target, result));
    for (const note of notes) findings.push(finding('reading-limited', 'warning', target.id, `${target.id}: ${note}`));
  };

  for (const target of targets) {
    const asset = brand.assets.get(target.id)!;
    const bytes = siteFile(job.siteDir, asset.file);
    if (!bytes) {
      findings.push(finding('file-missing', 'error', target.id, `${target.id} is not in the built site at ${asset.file}`));
      continue;
    }
    if (asset.format === 'svg') {
      try {
        const svg = bytes.toString('utf-8');
        const { measurement, notes } = analyzeSvg(svg, {
          ...(target.crop && { crop: target.crop }),
          ...(target.grid !== undefined && { grid: target.grid }),
          tolerance: target.tolerance,
        });
        keep(target, measurement, notes);
        if (options.figures)
          figures.set(
            figureName(figures, target.id),
            constructionSvg(svg, measurement as Measurement & { box: NonNullable<Measurement['box']> }, accent, target.id, brand.bodyFont),
          );
      } catch (error) {
        if (!(error instanceof Unsupported)) throw error;
        cannot(target, error.message);
      }
    } else if (asset.format === 'png' || asset.format === 'webp') rasters.push({ target, bytes, format: asset.format });
    else cannot(target, `${asset.format} is not a format this plugin reads; use SVG, PNG or WebP`);
  }

  if (rasters.length > 0) {
    let browser: Browser | undefined;
    try {
      browser = await launchChrome(process.env, 'read the PNG and WebP logos with');
    } catch (error) {
      if (!(error instanceof Cannot)) throw error;
      for (const { target } of rasters) findings.push(finding('raster-skipped', 'warning', target.id, `${target.id} was not measured: ${error.message}`));
    }
    if (browser) {
      try {
        for (const { target, bytes, format } of rasters) {
          try {
            const pixels = await decodeRaster(browser, bytes, format, target.crop);
            keep(target, analyzeRaster(labelRaster(pixels.rgba, pixels.width, pixels.height), { tolerance: target.tolerance }), []);
          } catch (error) {
            if (!(error instanceof Unsupported)) throw error;
            cannot(target, error.message);
          }
        }
      } finally {
        await browser.close();
      }
    }
  }

  // Written once, whole, after the work is done: a call that ends earlier leaves out_dir empty
  if (options.report && Object.keys(report).length > 0) fs.writeFileSync(path.join(job.outDir, DEFAULT_REPORT), stable(report));
  for (const [name, data] of figures) fs.writeFileSync(path.join(job.outDir, name), data);
  findings.push(...takeBlocked(NAME));
  return { findings };
}

// Not a top-level await: the built program is CommonJS (scripts/build-plugins.mjs), which has none.
void runPlugin(process.argv.slice(2), MANIFEST, build, 'the logos could not be measured', NAME).then((code) => {
  process.exitCode = code;
});
