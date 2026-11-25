import fs from 'node:fs';
import path from 'node:path';
import { runPlugin } from '../shared/plugin.js';
import { siteFile } from '../shared/site.js';
import { readBrand, type LogoAsset } from './brand.js';
import { planFonts, planHeading } from './fonts.js';
import { chooseLogos, logoFindings, logosBySurface } from './logo.js';
import { buildPackage, type Media } from './ooxml.js';
import { finding, parseOptions, type Finding } from './options.js';
import { slug } from '../shared/slug.js';
import { planPalette } from './palette.js';
import { planLayouts } from './plan.js';
import { jobFor, MANIFEST, NAME } from './request.js';
import { readSvg } from './svg.js';

// blazon.office-template: blazon's build role. Reads one request on standard input and writes an editable PowerPoint template into out_dir: a
// theme with the brand's colors and fonts, a master and five layouts with the logo placed as its sidecar says, as a .potx and a .pptx
// (the .pptx has a sample slide for each layout). It answers {"findings": [...]}. Wrong options are findings, not a failure. A broken
// request is exit 2 with the reason as the first line of standard output, and nothing is written. It needs Node and nothing else.

/** A one-pixel transparent PNG: what a program that cannot draw an SVG logo shows in its place */
const BLANK = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAHnOcQAAAAABJRU5ErkJggg==', 'base64');
const RASTER: Record<string, 'png' | 'jpeg' | 'gif'> = { png: 'png', jpg: 'jpeg', jpeg: 'jpeg', gif: 'gif' };

/** What a logo is drawn from: vector shapes when its SVG is plain, else the file as it is */
function mediaOf(asset: LogoAsset, data: Buffer, findings: Finding[]): Media | undefined {
  if (asset.format === 'svg') {
    const read = readSvg(data.toString('utf-8'));
    if ('vector' in read) {
      const { width, height } = read.vector;
      const ratio = asset.size ? asset.size.width / asset.size.height / (width / height) : 1;
      if (Math.abs(ratio - 1) < 0.01) return { kind: 'vector', vector: read.vector };
      findings.push(finding('logo-not-vector', 'warning', asset.id, `${asset.id} is embedded as an SVG picture: its size and its view box have different proportions`));
    } else
      findings.push(
        finding(
          'logo-not-vector',
          'warning',
          asset.id,
          `${asset.id} is embedded as an SVG picture, which PowerPoint 2016 and later draws and Keynote and older programs do not: ${read.why}`,
        ),
      );
    return { kind: 'svg', data, fallback: BLANK };
  }
  const ext = RASTER[asset.format];
  if (!ext) {
    findings.push(
      finding('logo-format-unsupported', 'warning', asset.id, `${asset.id} is a ${asset.format} file, which an Office template does not take: use SVG, PNG, JPEG or GIF`),
    );
    return undefined;
  }
  return { kind: 'raster', ext, data };
}

async function build(text: string): Promise<{ findings: Finding[] }> {
  const job = jobFor(text);
  const brand = readBrand(job.brand);
  const { options, findings } = parseOptions(job.options, new Set(brand.assets.keys()));

  const { palette, findings: paletteFindings } = planPalette(brand, options.accents);
  const fonts = planFonts(brand.roles);
  const heading = planHeading(brand.typography, fonts.major);
  const logos = chooseLogos(brand, options);
  findings.push(...paletteFindings, ...fonts.findings, ...logoFindings(brand, logos));

  const surfaces = logosBySurface(brand, logos);
  findings.push(...surfaces.findings);

  // Every logo the plan may draw is read once: the light and the dark one, and what a denied surface swapped in
  const media = new Map<string, Media>();
  const readable = new Set<string>();
  for (const asset of new Set([logos.light, logos.dark, ...Object.values(surfaces.logos)])) {
    if (!asset || !asset.size) continue;
    if (!media.has(asset.id)) {
      const data = siteFile(job.siteDir, asset.file);
      if (!data) {
        findings.push(finding('file-missing', 'error', asset.id, `${asset.id} is not in the built site at ${asset.file}`));
        continue;
      }
      const item = mediaOf(asset, data, findings);
      if (!item) continue;
      media.set(asset.id, item);
    }
    readable.add(asset.id);
  }
  const usable: { light?: LogoAsset; dark?: LogoAsset } = {};
  for (const surface of ['light', 'dark'] as const) if (logos[surface] && readable.has(logos[surface]!.id)) usable[surface] = logos[surface];
  const bySurface = Object.fromEntries(Object.entries(surfaces.logos).map(([surface, asset]) => [surface, asset && readable.has(asset.id) ? asset : null]));

  const plan = planLayouts(palette, usable, bySurface);
  const name = options.name ?? slug(brand.title, 'brand-template');
  // Written once, whole, after the work is done: a call that ends earlier leaves out_dir empty
  const files = options.formats.map((ext) => [`${name}.${ext}`, buildPackage({ title: brand.title, palette, fonts, heading, plan, media, ext })] as const);
  for (const [file, data] of files) fs.writeFileSync(path.join(job.outDir, file), data);
  return { findings };
}

// Not a top-level await: the built program is CommonJS (scripts/build-plugins.mjs), which has none.
void runPlugin(process.argv.slice(2), MANIFEST, build, 'the template could not be written', NAME).then((code) => {
  process.exitCode = code;
});
