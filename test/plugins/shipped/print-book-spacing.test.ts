import fs from 'node:fs';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser } from 'playwright-core';
import { loadConfig } from '../../../src/core/config/index.js';
import { buildSite } from '../../../src/builder/site-builder.js';
import { jobFor } from '../../../src/shipped/print-book/request.js';
import { serve } from '../../../src/shipped/print-book/site.js';
import { starterProject, tempDir } from '../../support/project';

// The `layout` option of blazon.print-book, in a real browser: `compact` (the default) squeezes pictures and sets the prose
// tighter, `roomy` is the book as it was before commit 9a41346. The page says which layout it used, and the page count of the
// starter brand under `roomy` is the count the code before 9a41346 gave it (81, measured at 9a41346^ with the same fixture).

const MAC_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CHROME = process.env.BLAZON_CHROME || (fs.existsSync(MAC_CHROME) ? MAC_CHROME : '');
if (!CHROME) {
  if (process.env.BLAZON_REQUIRE_CHROME) throw new Error('BLAZON_REQUIRE_CHROME is set, and there is no Chrome to print with');
  console.warn('print-book spacing test: skipped, no Chrome to print with (set BLAZON_CHROME)');
}

const SLIDE = { width: 1280, height: 720 };
/** The starter brand's book before 9a41346: the pre-squeeze code laid it out on this many pages */
const BEFORE_SQUEEZE_PAGES = 81;

let site: Awaited<ReturnType<typeof serve>>;
let browser: Browser;
let siteRoot = '';

beforeAll(async () => {
  if (!CHROME) return;
  const root = await starterProject();
  const out = tempDir('blazon-spacing-');
  await buildSite({ ...(await loadConfig(root)), outDir: out }, root, { allowErrors: true });
  siteRoot = out;
  site = await serve(out);
  browser = await chromium.launch({ executablePath: CHROME });
}, 180_000);

afterAll(async () => {
  await browser?.close();
  await site?.close();
}, 30_000);

/** The full book, printed through the hash the plugin's own request builds, and what the page says it laid out. */
async function laidOut(options: object): Promise<{ pages: number; layout: string; clipped: number[] }> {
  const request = JSON.stringify({ v: 1, type: 'build', options, brand: {}, site_dir: siteRoot, out_dir: tempDir('o-') });
  const page = await browser.newPage({ viewport: SLIDE });
  try {
    await page.emulateMedia({ media: 'print' });
    await page.goto(`${site.origin}/index.html${jobFor(request).hash}`);
    await page.waitForFunction(() => (window as { __blazonPrint?: { ready?: unknown } }).__blazonPrint?.ready === true, undefined, { timeout: 90_000 });
    return await page.evaluate(() => (window as unknown as { __blazonPrint: { pages: number; layout: string; clipped: number[] } }).__blazonPrint);
  } finally {
    await page.close();
  }
}

describe.skipIf(!CHROME)('the print book spaces its slides by the layout option', () => {
  it('lays the book out compactly with no option, and says so', async () => {
    const book = await laidOut({});
    expect(book.layout).toBe('compact');
    expect(book.pages).toBeGreaterThanOrEqual(70);
    expect(book.pages).toBeLessThanOrEqual(74);
  });

  it('lays it out as `compact` does when `compact` is named', async () => {
    const [named, absent] = [await laidOut({ layout: 'compact' }), await laidOut({})];
    expect(named).toEqual(absent);
  });

  it('lays it out on as many pages as before pictures were squeezed, with `roomy`', async () => {
    const book = await laidOut({ layout: 'roomy' });
    expect(book.layout).toBe('roomy');
    expect(book.pages).toBe(BEFORE_SQUEEZE_PAGES);
    expect(book.clipped).toEqual([]);
  });
});
