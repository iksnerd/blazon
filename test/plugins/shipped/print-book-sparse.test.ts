import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Browser } from 'playwright-core';
import { launchBrowser } from '../../support/chrome';
import { loadConfig } from '../../../src/core/config/index.js';
import { buildSite } from '../../../src/builder/site-builder.js';
import { serve } from '../../../src/shipped/print-book/site.js';
import { tempDir } from '../../support/project';
import { starterProject } from '../../support/init-project';

// A narrow table and a grid of wide marks, split over slides: how much of each slide they fill. The fill of a slide is
// the lowest y of its content over the frame's height, read from the DOM.

const MAC_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CHROME = process.env.BLAZON_CHROME || (fs.existsSync(MAC_CHROME) ? MAC_CHROME : '');
if (!CHROME) {
  if (process.env.BLAZON_REQUIRE_CHROME) throw new Error('BLAZON_REQUIRE_CHROME is set, and there is no Chrome to print with');
  console.warn('print-book sparse test: skipped, no Chrome to print with (set BLAZON_CHROME)');
}

const SLIDE = { width: 1280, height: 720 };
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 120" width="400" height="120"><rect width="400" height="120" fill="#36c"/></svg>`;
const TILES = Array.from({ length: 24 }, (_, i) => `tile-${String(i + 1).padStart(2, '0')}`);
const CODES = Array.from({ length: 60 }, (_, i) => `Code${String(i + 1).padStart(2, '0')}`);

let site: Awaited<ReturnType<typeof serve>>;
let browser: Browser;

beforeAll(async () => {
  if (!CHROME) return;
  const root = await starterProject();
  const dir = path.join(root, 'assets/tiles');
  fs.mkdirSync(dir, { recursive: true });
  for (const name of TILES) {
    fs.writeFileSync(path.join(dir, `${name}.svg`), svg);
    fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify({ title: name, description: 'A mark for the shop.' }));
  }
  fs.writeFileSync(path.join(root, 'docs/13-tiles.md'), '---\ntitle: Tiles\nsection: overview\norder: 13\n---\n\n## Tiles\n\n<!-- blazon:assets tiles -->\n');
  fs.writeFileSync(
    path.join(root, 'docs/14-codes.md'),
    ['---\ntitle: Codes\nsection: overview\norder: 14\n---\n', '## Codes\n', ['| Code | Meaning |', '|---|---|', ...CODES.map((c, i) => `| ${c} | Case ${i + 1} |`)].join('\n') + '\n'].join('\n'),
  );
  fs.writeFileSync(
    path.join(root, 'docs/15-short.md'),
    ['---\ntitle: Short\nsection: overview\norder: 15\n---\n', '## Short\n', ['| Code | Meaning |', '|---|---|', ...CODES.slice(0, 8).map((c) => `| ${c} | Case |`)].join('\n') + '\n'].join('\n'),
  );
  const out = tempDir('blazon-sparse-');
  await buildSite({ ...(await loadConfig(root)), outDir: out }, root, { allowErrors: true });
  site = await serve(out);
  browser = await launchBrowser(CHROME);
}, 180_000);

afterAll(async () => {
  await browser?.close();
  await site?.close();
}, 30_000);

interface Drawn {
  clipped: number[];
  slides: { fill: number; text: string; zoom: number; groups: number; tables: number }[];
}

async function printed(pages: string): Promise<Drawn> {
  const page = await browser.newPage({ viewport: SLIDE });
  try {
    await page.emulateMedia({ media: 'print' });
    await page.goto(`${site.origin}/index.html#print/pages=${pages}`);
    await page.waitForFunction(() => (window as { __blazonPrint?: { ready?: unknown } }).__blazonPrint?.ready === true, undefined, { timeout: 90_000 });
    return await page.evaluate(() => ({
      clipped: (window as { __blazonPrint?: { clipped?: number[] } }).__blazonPrint?.clipped ?? [],
      slides: [...document.querySelectorAll<HTMLElement>('[data-print-deck] [data-print-slide="content"]')].map((slide) => {
        const body = slide.querySelector<HTMLElement>('[data-print-slide-body]')!;
        const top = slide.getBoundingClientRect().top;
        let low = 0;
        for (const el of body.querySelectorAll('*')) {
          const box = el.getBoundingClientRect();
          if (box.height > 0 && box.width > 0) low = Math.max(low, box.bottom - top);
        }
        return {
          fill: low / slide.getBoundingClientRect().height,
          text: body.textContent ?? '',
          zoom: Number(body.style.zoom || 1),
          groups: body.querySelectorAll('[data-print-columns]').length,
          tables: body.querySelectorAll('table').length,
        };
      }),
    }));
  } finally {
    await page.close();
  }
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

// Before the change, on the same fixtures: the grid took 12 slides at a mean fill of 0.66 (minimum 0.66, two marks to a slide)
// and the table 6 slides at 0.77 (minimum 0.49).
describe.skipIf(!CHROME)('slides that a narrow table and a grid of wide marks are split over', () => {
  it('lays the marks of a split grid in columns: every mark once, in order, on few slides, each fuller than before', async () => {
    const { slides, clipped } = await printed('doc/tiles');
    expect([...slides.map((s) => s.text).join('\n').matchAll(/Tile \d\d/g)].map((m) => m[0])).toEqual(TILES.map((t) => t.replace('tile-', 'Tile ')));
    expect(clipped).toEqual([]);
    expect(slides.length).toBeLessThanOrEqual(3);
    expect(Math.min(...slides.map((s) => s.fill))).toBeGreaterThan(0.66);
    expect(mean(slides.map((s) => s.fill))).toBeGreaterThan(0.7);
    expect(slides.every((s) => s.zoom === 1)).toBe(true);
  }, 120_000);

  it('sets the rows of a split narrow table in two groups with the header over each, every row once, in order', async () => {
    const { slides, clipped } = await printed('doc/codes');
    expect([...slides.map((s) => s.text).join('\n').matchAll(/Code\d\d/g)].map((m) => m[0])).toEqual(CODES);
    expect(clipped).toEqual([]);
    expect(slides.length).toBeLessThanOrEqual(4);
    for (const slide of slides) {
      expect(slide.groups).toBe(1);
      expect(slide.tables).toBe(2);
      expect([...slide.text.matchAll(/Code\s*Meaning/g)]).toHaveLength(2);
      expect(slide.zoom).toBe(1);
    }
    expect(Math.min(...slides.map((s) => s.fill))).toBeGreaterThan(0.6);
    expect(mean(slides.map((s) => s.fill))).toBeGreaterThan(0.75);
  }, 120_000);

  it('leaves a table that is not split alone: one table, no groups', async () => {
    const { slides } = await printed('doc/short');
    expect(slides).toHaveLength(1);
    expect(slides[0]).toMatchObject({ groups: 0, tables: 1 });
  }, 120_000);
});
