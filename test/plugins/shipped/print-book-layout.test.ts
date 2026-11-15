import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser } from 'playwright-core';
import { loadConfig } from '../../../src/core/config/index.js';
import { buildSite } from '../../../src/builder/site-builder.js';
import { serve } from '../../../src/shipped/print-book/site.js';
import { starterProject, tempDir } from '../../support/project';

// Print layout defects a production review found in a printed brand book, in a real browser (the jsdom tests measure every
// block as 0px high): the web page's copy button on a code block, a table column of numbers left aligned, and a logo
// sample that says "Minimum width 150px" drawn at a fraction of it because the slide was drawn smaller to fit.

const MAC_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CHROME = process.env.BLAZON_CHROME || (fs.existsSync(MAC_CHROME) ? MAC_CHROME : '');
if (!CHROME) {
  if (process.env.BLAZON_REQUIRE_CHROME) throw new Error('BLAZON_REQUIRE_CHROME is set, and there is no Chrome to print with');
  console.warn('print-book layout test: skipped, no Chrome to print with (set BLAZON_CHROME)');
}

const SLIDE = { width: 1280, height: 720 };
const MIN_WIDTH = 150;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 700" width="200" height="700"><rect width="200" height="700" fill="#36c"/></svg>`;
// Two tiles of a tall mark: each is one figure that cannot be cut at a row, taller than a slide, so its slide is drawn smaller to fit
// (at the floor, 0.9). A grid of tiles is split over slides instead and is drawn at its own size.
const NAMES = Array.from({ length: 2 }, (_, i) => `mark-${i + 1}`);

let site: Awaited<ReturnType<typeof serve>>;
let browser: Browser;

beforeAll(async () => {
  if (!CHROME) return;
  const root = await starterProject();
  const dir = path.join(root, 'assets/marks');
  fs.mkdirSync(dir, { recursive: true });
  for (const name of NAMES) {
    fs.writeFileSync(path.join(dir, `${name}.svg`), svg);
    fs.writeFileSync(
      path.join(dir, `${name}.json`),
      JSON.stringify({ title: name, background: 'light', unit: { value: 40, unit: 'px' }, clearSpace: { units: 1 }, minSize: { width: { value: MIN_WIDTH, unit: 'px' } } }),
    );
  }
  fs.writeFileSync(
    path.join(root, 'docs/09-layout.md'),
    [
      '---\ntitle: Layout\nsection: overview\norder: 9\n---\n',
      '## Tokens as code\n',
      '```css\n:root { --brand: #36c; }\n```\n',
      '| Case | Share | Note |\n|---|---|---|\n| Amount | 4.25% | a |\n| Small | 12.5% | b |\n| Large | 100% | c |\n',
      '## Sizes\n',
      '<!-- blazon:logo-space marks -->\n',
    ].join('\n'),
  );
  const out = tempDir('blazon-layout-');
  // The fixture brand is made to print one thing, not to pass blazon check: it builds although it has findings
  await buildSite({ ...(await loadConfig(root)), outDir: out }, root, { allowErrors: true });
  site = await serve(out);
  browser = await chromium.launch({ executablePath: CHROME });
}, 180_000);

afterAll(async () => {
  await browser?.close();
  await site?.close();
}, 30_000);

async function printed<T>(read: () => T): Promise<Awaited<T>> {
  const page = await browser.newPage({ viewport: SLIDE });
  try {
    await page.emulateMedia({ media: 'print' });
    await page.goto(`${site.origin}/index.html#print/pages=doc/layout`);
    await page.waitForFunction(() => (window as { __blazonPrint?: { ready?: unknown } }).__blazonPrint?.ready === true, undefined, { timeout: 90_000 });
    return (await page.evaluate(read)) as Awaited<T>;
  } finally {
    await page.close();
  }
}

describe.skipIf(!CHROME)('the printed book keeps the web page out of the print and lays a tile out honestly', () => {
  it('shows no copy button on a code block', async () => {
    const shown = await printed(() => {
      const code = document.querySelector('[data-print-deck] [data-slot="code-block"]');
      const buttons = [...document.querySelectorAll<HTMLElement>('[data-print-deck] [data-slot="code-block"] button')];
      return { code: code !== null, visible: buttons.filter((b) => getComputedStyle(b).display !== 'none' && b.getBoundingClientRect().width > 0).length };
    });
    expect(shown.code, 'the fixture prints a code block').toBe(true);
    expect(shown.visible).toBe(0);
  });

  it('right-aligns, in tabular figures, a column of numbers and not the one beside it', async () => {
    const cells = await printed(() => {
      const row = document.querySelector('[data-print-deck] tbody tr')!;
      return [...row.children].map((c) => ({ align: getComputedStyle(c).textAlign, tabular: getComputedStyle(c).fontVariantNumeric }));
    });
    expect(cells[1]!.align).toBe('right');
    expect(cells[1]!.tabular).toContain('tabular-nums');
    expect(cells[2]!.align).not.toBe('right');
  });

  it('draws a sample that says 150px at 150 CSS px, whatever the slide was drawn at', async () => {
    const samples = await printed(() =>
      [...document.querySelectorAll<HTMLElement>('[data-print-deck] [data-min-size]')].map((img) => {
        const slide = img.closest<HTMLElement>('[data-print-slide-body]')!;
        const zoom = Number(slide.style.zoom || 1);
        const figure = img.closest<HTMLElement>('[data-logo-space]')!;
        const zone = figure.querySelector<HTMLElement>('[data-clear-zone]')!.getBoundingClientRect();
        const box = img.getBoundingClientRect();
        return { zoom, width: box.width, label: figure.innerText.includes('Minimum width 150px'), centre: Math.abs(box.left + box.width / 2 - (zone.left + zone.width / 2)) };
      }),
    );
    expect(samples).toHaveLength(NAMES.length);
    expect(Math.min(...samples.map((s) => s.zoom)), 'the fixture draws a slide smaller').toBeLessThan(1);
    for (const s of samples) {
      expect(s.width).toBeCloseTo(MIN_WIDTH, 0);
      expect(s.label).toBe(true);
      // the sample sits under the centred clear-space drawing, on its centre line
      expect(s.centre).toBeLessThan(1.5);
    }
  });
});
