import fs from 'node:fs';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Browser } from 'playwright-core';
import { launchBrowser } from '../../support/chrome';
import { loadConfig } from '../../../src/core/config/index.js';
import { buildSite } from '../../../src/builder/site-builder.js';
import { jobFor } from '../../../src/shipped/print-book/request.js';
import { serve } from '../../../src/shipped/print-book/site.js';
import { tempDir } from '../../support/project';
import { starterProject } from '../../support/init-project';

// The page count of a printed book is a property of the brand and the options, not of how fast the computer is. The same
// book is laid out with the processor slowed down (Chrome DevTools Protocol, not a busy loop), so a measurement that
// is taken before the fonts or pictures are in shows up on a quiet machine too.

const MAC_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CHROME = process.env.BLAZON_CHROME || (fs.existsSync(MAC_CHROME) ? MAC_CHROME : '');
if (!CHROME) {
  if (process.env.BLAZON_REQUIRE_CHROME) throw new Error('BLAZON_REQUIRE_CHROME is set, and there is no Chrome to print with');
  console.warn('print-book load test: skipped, no Chrome to print with (set BLAZON_CHROME)');
}

const SLIDE = { width: 1280, height: 720 };
let site: Awaited<ReturnType<typeof serve>>;
let browser: Browser;
let siteRoot = '';

beforeAll(async () => {
  if (!CHROME) return;
  const root = await starterProject();
  const out = tempDir('blazon-load-');
  await buildSite({ ...(await loadConfig(root)), outDir: out }, root, { allowErrors: true });
  siteRoot = out;
  site = await serve(out);
  browser = await launchBrowser(CHROME);
}, 180_000);

afterAll(async () => {
  await browser?.close();
  await site?.close();
}, 30_000);

/** The book as the page says it laid out, and the first heading on each of its frames, with the CPU slowed by `throttle`. */
async function laidOut(options: object, throttle: number): Promise<{ pages: number; clipped: number[]; headings: string[] }> {
  const request = JSON.stringify({ v: 2, type: 'build', options, brand: {}, site_dir: siteRoot, out_dir: tempDir('o-') });
  const page = await browser.newPage({ viewport: SLIDE });
  try {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
    await page.emulateMedia({ media: 'print' });
    await page.goto(`${site.origin}/index.html${jobFor(request).hash}`);
    await page.waitForFunction(() => (window as { __blazonPrint?: { ready?: unknown } }).__blazonPrint?.ready === true, undefined, { timeout: 120_000 });
    return await page.evaluate(() => {
      const laid = (window as unknown as { __blazonPrint: { pages: number; clipped: number[] } }).__blazonPrint;
      const headings = [...document.querySelectorAll('[data-print-deck] > [data-print-slide]')].map((f) => f.querySelector('h1, h2, h3, h4')?.textContent?.trim() ?? '');
      return { pages: laid.pages, clipped: laid.clipped, headings };
    });
  } finally {
    await page.close();
  }
}

describe.skipIf(!CHROME)('the print book does not depend on how fast the computer is', () => {
  for (const layout of ['compact', 'roomy']) {
    it(`lays the starter out the same at 1x and at 6x CPU slowdown, ${layout}`, async () => {
      const [quick, slow] = [await laidOut({ layout }, 1), await laidOut({ layout }, 6)];
      console.info(`print-book load ${layout}: 1x ${quick.pages} pages, 6x ${slow.pages} pages`);
      expect(slow.pages).toBe(quick.pages);
      expect(slow.headings).toEqual(quick.headings);
      expect(slow.clipped).toEqual(quick.clipped);
    }, 240_000);
  }
});
