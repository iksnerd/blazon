import fs from 'node:fs';
import path from 'node:path';
import { launchChrome } from '../shared/chrome.js';
import { runPlugin } from '../shared/plugin.js';
import { siteFile } from '../shared/site.js';
import { readBrand, type KitAsset } from './brand.js';
import { planPieces } from './kit.js';
import { finding, parseOptions, type Finding } from './options.js';
import { takeBlocked } from '../shared/network.js';
import { svgToPng } from './render.js';
import { jobFor, MANIFEST, NAME } from './request.js';
import { clearSpaceSvg, initiativeSvg, partnershipSvg } from './svg.js';

// blazon.logo-kit: blazon's build role. Reads one request on standard input and writes the logo kit into out_dir: for each logo that states a
// `partnership` rule and each partner, a lockup, and for each logo that states a `clearSpace`, a sheet showing it, as SVG and as PNG. It
// answers {"findings": [...]}. Wrong options are findings, not a failure. A broken request, or no browser when a PNG is asked for, is exit 2
// with the reason as the first line of standard output, and nothing is written.

const MEDIA: Record<string, string> = { svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif' };

/** The asset's file as a data: address, or undefined when it is not in the site, or leaves it. */
function dataAddress(siteDir: string, asset: KitAsset): string | undefined {
  const data = siteFile(siteDir, asset.file);
  return data && `data:${MEDIA[asset.format] ?? 'application/octet-stream'};base64,${data.toString('base64')}`;
}

async function build(text: string): Promise<{ findings: Finding[] }> {
  const job = jobFor(text);
  const brand = readBrand(job.brand);
  const { options, findings } = parseOptions(job.options, new Set(brand.assets.keys()));
  const planned = planPieces(brand, options);
  findings.push(...planned.findings);

  const drawn: { stem: string; svg: string; size: { width: number; height: number } }[] = [];
  const missing = new Set<string>();
  const address = (asset: KitAsset): string | undefined => {
    const found = dataAddress(job.siteDir, asset);
    if (!found && !missing.has(asset.id)) {
      missing.add(asset.id);
      findings.push(finding('file-missing', 'error', asset.id, `${asset.id} is not in the built site at ${asset.file}`));
    }
    return found;
  };
  for (const piece of planned.pieces) {
    if (piece.kind === 'partnership') {
      const [logo, partner] = [address(piece.logo), address(piece.partner)];
      if (logo && partner) drawn.push({ stem: piece.stem, svg: partnershipSvg(piece, { logo, partner }), size: piece.layout });
    } else if (piece.kind === 'initiative') {
      const [logo, mark] = [address(piece.logo), address(piece.mark)];
      if (logo && mark) drawn.push({ stem: piece.stem, svg: initiativeSvg(piece, { logo, mark }), size: piece.layout });
    } else {
      const logo = address(piece.logo);
      if (logo) drawn.push({ stem: piece.stem, svg: clearSpaceSvg(piece, logo), size: { width: piece.size.width + 2 * piece.space, height: piece.size.height + 2 * piece.space } });
    }
  }

  const files = new Map<string, Buffer | string>();
  if (options.formats.includes('svg')) for (const item of drawn) files.set(`${item.stem}.svg`, item.svg);
  if (options.formats.includes('png') && drawn.length > 0) {
    const browser = await launchChrome(process.env, 'draw the kit with');
    try {
      for (const item of drawn) {
        files.set(`${item.stem}.png`, await svgToPng(browser, item.svg, item.size, 1));
        if (options.scale === 2) files.set(`${item.stem}@2x.png`, await svgToPng(browser, item.svg, item.size, 2));
      }
    } finally {
      await browser.close();
    }
  }
  // Written once, whole, after the work is done: a call that ends earlier leaves out_dir empty
  for (const [name, data] of files) fs.writeFileSync(path.join(job.outDir, name), data);
  return { findings: [...findings, ...takeBlocked(NAME)] };
}

// Not a top-level await: the built program is CommonJS (scripts/build-plugins.mjs), which has none.
void runPlugin(process.argv.slice(2), MANIFEST, build, 'the browser could not draw the kit', NAME).then((code) => {
  process.exitCode = code;
});
