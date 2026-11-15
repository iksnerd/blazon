import fs from 'node:fs';
import path from 'node:path';
import { readBrand, type BrandRead } from './brand.js';
import { boundFindings } from './bound.js';
import { launch } from './browser.js';
import type { Finding } from './checks.js';
import { parseOptions, type Known } from './options.js';
import { drawCards } from './render.js';
import { Cannot, jobFor, MANIFEST } from './request.js';

// blazon.social-cards: blazon's build role. Reads one request on standard input, draws each card the options ask for as a
// PNG in out_dir, and answers {"findings": [...]}. Wrong options are findings, not a failure. When the request is broken
// or there is no browser to draw with, it exits 2 with the reason as the first line of standard output, and writes nothing.

const IMAGES = new Set(['svg', 'png', 'jpg', 'gif', 'webp', 'avif']);

/** What the options may name: the formats, the image assets and color or gradient tokens as backgrounds, the color tokens. */
function knownOf(brand: BrandRead): Known {
  const tokens = [...brand.tokens];
  return {
    formats: new Set(brand.formats.keys()),
    backgrounds: new Set([
      ...[...brand.assets.values()].filter((asset) => IMAGES.has(asset.format)).map((asset) => asset.id),
      ...tokens.filter(([, token]) => token.type === 'color' || token.type === 'gradient').map(([name]) => name),
    ]),
    colors: new Set(tokens.filter(([, token]) => token.type === 'color').map(([name]) => name)),
  };
}

async function build(text: string): Promise<{ findings: Finding[] }> {
  const job = jobFor(text);
  const brand = readBrand(job.brand);
  const { cards, scale, findings } = parseOptions(job.options, knownOf(brand));
  if (cards.length === 0) return { findings: boundFindings(findings) };
  const browser = await launch(process.env);
  let drawn;
  try {
    drawn = await drawCards(browser, job, brand, cards, scale);
  } finally {
    await browser.close();
  }
  // Written once, whole, after the browser is done: a call that ends earlier leaves out_dir empty
  for (const card of drawn) {
    for (const [name, png] of card.files) fs.writeFileSync(path.join(job.outDir, name), png);
    findings.push(...card.findings);
  }
  return { findings: boundFindings(findings) };
}

async function main(argv: string[]): Promise<number> {
  if (argv[0] === '--blazon-manifest') {
    process.stdout.write(`${JSON.stringify(MANIFEST)}\n`);
    return 0;
  }
  try {
    process.stdout.write(`${JSON.stringify(await build(fs.readFileSync(0, 'utf-8')))}\n`);
    return 0;
  } catch (error) {
    const reason =
      error instanceof Cannot
        ? error.message
        : `the browser could not draw the cards: ${String((error as Error).message ?? error)
            .split('\n')[0]!
            .slice(0, 500)}`;
    process.stdout.write(`${reason}\n`);
    return 2;
  }
}

// Not a top-level await: the built program is CommonJS (scripts/build-plugins.mjs), which has none.
void main(process.argv.slice(2)).then((code) => {
  process.exitCode = code;
});
