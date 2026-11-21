import fs from 'node:fs';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Browser } from 'playwright-core';
import { launchBrowser } from '../../support/chrome';
import { loadConfig } from '../../../src/core/config/index.js';
import { buildSite } from '../../../src/builder/site-builder.js';
import { serve } from '../../../src/shipped/print-book/site.js';
import { tempDir } from '../../support/project';
import { starterProject } from '../../support/init-project';
import { writePalette } from '../../support/palette';

// A grid of colour swatches drawn from tokens (the `blazon:tokens` directive), split over slides: each slide holds as many
// whole rows as fit, and the last takes the remainder. The cards are 203 x 174 px in a 1056 px frame (5 to a row), so three
// rows with the continued label (32 px) and the grid's margin are about 590 px against the 576 of a slide's body (drawn at 0.97),
// and a fourth never fits.

const MAC_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CHROME = process.env.BLAZON_CHROME || (fs.existsSync(MAC_CHROME) ? MAC_CHROME : '');
if (!CHROME) {
  if (process.env.BLAZON_REQUIRE_CHROME) throw new Error('BLAZON_REQUIRE_CHROME is set, and there is no Chrome to print with');
  console.warn('print-book palette test: skipped, no Chrome to print with (set BLAZON_CHROME)');
}

const SLIDE = { width: 1280, height: 720 };
let site: Awaited<ReturnType<typeof serve>>;
let browser: Browser;
let names: string[] = [];

beforeAll(async () => {
  if (!CHROME) return;
  const root = await starterProject();
  names = writePalette(root, { count: 36, group: 'swatch', file: '16-palette.md', order: 16 });
  writePalette(root, { count: 8, group: 'few', file: '17-few.md', order: 17 });
  const out = tempDir('blazon-palette-');
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
  slides: { tokens: string[]; rows: number; fill: number; zoom: number}[];
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
        const cards = [...slide.querySelectorAll<HTMLElement>('[data-token]')].map((card) => card.getBoundingClientRect());
        let low = 0;
        for (const el of body.querySelectorAll('*')) {
          const box = el.getBoundingClientRect();
          if (box.height > 0 && box.width > 0) low = Math.max(low, box.bottom - top);
        }
        return {
          tokens: [...slide.querySelectorAll<HTMLElement>('[data-token]')].map((card) => card.dataset.token!),
          rows: new Set(cards.map((c) => Math.round(c.top))).size,
          fill: low / slide.getBoundingClientRect().height,
          zoom: Number(body.style.zoom || 1),
        };
      }),
    }));
  } finally {
    await page.close();
  }
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

// Before the change, on this fixture: 4 slides of 2 rows (10, 10, 10 and 6 swatches) at a mean fill of 0.67 (minimum 0.65).
describe.skipIf(!CHROME)('a split grid of colour swatches', () => {
  it('fills each slide with as many whole rows as fit: every swatch once and in order, three rows a slide where it had two', async () => {
    const { slides, clipped } = await printed('doc/palette');
    expect(slides.flatMap((s) => s.tokens)).toEqual(names.map((n) => `swatch.${n}`));
    expect(clipped).toEqual([]);
    // three rows, the label and the grid's margin are 590 px of the 576 a slide has: drawn at 0.97, well above the 0.9 the packer allows
    expect(slides.every((s) => s.zoom >= 0.95)).toBe(true);
    expect(slides.map((s) => s.rows)).toEqual([2, 3, 3]);
    expect(Math.min(...slides.map((s) => s.fill))).toBeGreaterThan(0.7);
    expect(mean(slides.map((s) => s.fill))).toBeGreaterThan(0.8);
  }, 120_000);

  it('leaves a grid that is not split alone: one slide, its rows as laid out', async () => {
    const { slides } = await printed('doc/few');
    expect(slides).toHaveLength(1);
    expect(slides[0]!.tokens).toHaveLength(8);
    expect(slides[0]!.rows).toBe(2);
    expect(slides[0]!.zoom).toBe(1);
  }, 120_000);
});
