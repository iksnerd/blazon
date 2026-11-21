import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Browser } from 'playwright-core';
import { launchBrowser } from '../../support/chrome';
import { loadConfig } from '../../../src/core/config/index.js';
import { buildSite } from '../../../src/builder/site-builder.js';
import { serve } from '../../../src/shipped/print-book/site.js';
import { starterProject, tempDir } from '../../support/project';

// The logo contrast grid, printed in a real browser: eight background tokens, two configured logos and four more that
// declare an ink, so a tile has six rows. A slide is drawn smaller and wider when its content is too tall, and the
// wider content reflows into a different number of grid rows than the one that was measured; the second row of tiles
// was cut off at the foot of the slide. The jsdom tests cannot see it (they measure every block as 0px high).

const MAC_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CHROME = process.env.BLAZON_CHROME || (fs.existsSync(MAC_CHROME) ? MAC_CHROME : '');
if (!CHROME) {
  if (process.env.BLAZON_REQUIRE_CHROME) throw new Error('BLAZON_REQUIRE_CHROME is set, and there is no Chrome to print with');
  console.warn('print-book logo contrast test: skipped, no Chrome to print with (set BLAZON_CHROME)');
}

const SLIDE = { width: 1280, height: 720 };
const svg = (fill: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 40" width="100" height="40"><rect width="100" height="40" fill="${fill}"/></svg>`;
const GROUNDS = ['#ffffff', '#f4f6fb', '#dbe4ff', '#0b1f3a', '#0a1830', '#050c1a', '#3f73f8', '#e91e8c'];

let site: Awaited<ReturnType<typeof serve>>;
let browser: Browser;

beforeAll(async () => {
  if (!CHROME) return;
  const root = await starterProject();
  const logos = path.join(root, 'assets/logos');
  // The configured pair: a blue logo for light backgrounds and a white one for dark, each declaring its ink
  fs.writeFileSync(path.join(logos, 'blazon-graphite.svg'), svg('#3f73f8'));
  fs.writeFileSync(path.join(logos, 'blazon-graphite.json'), JSON.stringify({ ink: '#3F73F8' }));
  fs.writeFileSync(path.join(logos, 'blazon-bone.svg'), svg('#ffffff'));
  fs.writeFileSync(path.join(logos, 'blazon-bone.json'), JSON.stringify({ ink: '#FFFFFF' }));
  for (const name of ['symbol-blue', 'symbol-white', 'symbol-navy', 'symbol-pink']) {
    fs.writeFileSync(path.join(logos, `${name}.svg`), svg('#3f73f8'));
    fs.writeFileSync(path.join(logos, `${name}.json`), JSON.stringify({ ink: { 'symbol-blue': '#3F73F8', 'symbol-white': '#FFFFFF', 'symbol-navy': '#0B1F3A', 'symbol-pink': '#E91E8C' }[name] }));
  }
  const tokens = Object.fromEntries(GROUNDS.map((value, i) => [`ground${i + 1}`, { $type: 'color', $value: value }]));
  fs.writeFileSync(path.join(root, 'tokens/grounds.json'), JSON.stringify({ ground: tokens }));
  // The starter's resolver document loads only the token files it names
  const resolver = path.join(root, 'blazon.resolver.json');
  const doc = JSON.parse(fs.readFileSync(resolver, 'utf-8'));
  doc.sets.base.sources.push({ $ref: 'tokens/grounds.json' });
  fs.writeFileSync(resolver, JSON.stringify(doc));
  fs.writeFileSync(
    path.join(root, 'docs/09-grounds.md'),
    `---\ntitle: Grounds\nsection: overview\norder: 9\n---\n\n## Logo on each ground\n\n<!-- blazon:logo-contrast ${GROUNDS.map((_, i) => `ground.ground${i + 1}`).join(' ')} -->\n`,
  );
  const out = tempDir('blazon-logo-contrast-');
  // The fixture brand is made to print one thing, not to pass blazon check: it builds although it has findings
  await buildSite({ ...(await loadConfig(root)), outDir: out }, root, { allowErrors: true });
  site = await serve(out);
  browser = await launchBrowser(CHROME);
}, 120_000);

afterAll(async () => {
  await browser?.close();
  await site?.close();
}, 30_000);

/** Each tile and the body of its slide, in slide coordinates: the tile must lie inside the body, which clips what does not. */
async function tiles(): Promise<{ rows: number; bottom: number; bodyBottom: number }[]> {
  const page = await browser.newPage({ viewport: SLIDE });
  try {
    await page.emulateMedia({ media: 'print' });
    await page.goto(`${site.origin}/index.html#print/pages=doc/grounds`);
    await page.waitForFunction(() => (window as { __blazonPrint?: { ready?: unknown } }).__blazonPrint?.ready === true, undefined, { timeout: 30_000 });
    return await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('[data-print-deck] [data-print-slide]')].flatMap((slide) => {
        const origin = slide.getBoundingClientRect();
        const body = slide.querySelector<HTMLElement>('[data-print-slide-body]')!.getBoundingClientRect();
        return [...slide.querySelectorAll<HTMLElement>('[data-logo-contrast]')].map((tile) => ({
          rows: tile.querySelectorAll('[data-variant]').length,
          bottom: tile.getBoundingClientRect().bottom - origin.top,
          bodyBottom: body.bottom - origin.top,
        }));
      }),
    );
  } finally {
    await page.close();
  }
}

describe.skipIf(!CHROME)('the logo contrast grid, printed', () => {
  it('lists each logo once: two configured rows and four inked ones, in every tile', async () => {
    const all = await tiles();
    expect(all).toHaveLength(GROUNDS.length);
    expect(all.map((t) => t.rows)).toEqual(GROUNDS.map(() => 6));
  });

  it('draws every tile whole inside its slide, not cut off at the foot of the body', async () => {
    for (const tile of await tiles()) expect(tile.bottom).toBeLessThanOrEqual(tile.bodyBottom + 1);
  });
});
