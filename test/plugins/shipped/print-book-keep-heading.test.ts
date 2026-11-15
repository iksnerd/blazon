import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser } from 'playwright-core';
import { loadConfig } from '../../../src/core/config/index.js';
import { buildSite } from '../../../src/builder/site-builder.js';
import { serve } from '../../../src/shipped/print-book/site.js';
import { starterProject, tempDir } from '../../support/project';

// A heading is never the last thing on a printed slide, in a real browser. A page's Markdown between directives is one
// block of the page, so a sub-heading at its end was never seen by the packer and was left at the foot of a slide with
// its figure on the next. The jsdom tests cannot see it (they measure every block as 0px high): here the text before the
// heading grows a line at a time, so that some page puts the heading at the foot of its slide whatever the fonts measure.

const MAC_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CHROME = process.env.BLAZON_CHROME || (fs.existsSync(MAC_CHROME) ? MAC_CHROME : '');
if (!CHROME) {
  if (process.env.BLAZON_REQUIRE_CHROME) throw new Error('BLAZON_REQUIRE_CHROME is set, and there is no Chrome to print with');
  console.warn('print-book keep-heading test: skipped, no Chrome to print with (set BLAZON_CHROME)');
}

const SLIDE = { width: 1280, height: 720 };
const PAGES = 14;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 500" width="1200" height="500"><rect width="1200" height="500" fill="#36c"/></svg>`;
const sentence = 'The grid keeps every post on the same margins, so a reader can tell the series at a glance.';

let site: Awaited<ReturnType<typeof serve>>;
let browser: Browser;

beforeAll(async () => {
  if (!CHROME) return;
  const root = await starterProject();
  fs.mkdirSync(path.join(root, 'assets/posts'), { recursive: true });
  fs.writeFileSync(path.join(root, 'assets/posts/wide.svg'), svg);
  for (let n = 1; n <= PAGES; n++) {
    // n paragraphs of two or three lines, then a sub-heading, a note and the figure it introduces
    const filler = Array.from({ length: n }, (_, i) => sentence.repeat(1 + ((i + n) % 2))).join('\n\n');
    const page = `---\ntitle: Posts ${n}\nsection: posts-${n}\norder: ${20 + n}\n---\n\n## Formats\n\n${filler}\n\n<!-- blazon:assets posts wide -->\n\n### Landscape ${n}\n\nThe plate keeps its symbol top right.\n\n<!-- blazon:assets posts wide -->\n\n### Square ${n}\n\n<!-- blazon:assets posts wide -->\n`;
    fs.writeFileSync(path.join(root, `docs/${20 + n}-posts-${n}.md`), page);
  }
  const out = tempDir('blazon-keep-heading-');
  // The fixture brand is made to print one thing, not to pass blazon check: it builds although it has findings
  await buildSite({ ...(await loadConfig(root)), outDir: out }, root, { allowErrors: true });
  site = await serve(out);
  browser = await chromium.launch({ executablePath: CHROME });
}, 180_000);

afterAll(async () => {
  await browser?.close();
  await site?.close();
}, 30_000);

/** For each printed slide, the heading its content ends with, if it ends with one, wherever it is nested. */
async function slides(): Promise<{ heading: string | null }[]> {
  const page = await browser.newPage({ viewport: SLIDE });
  try {
    await page.emulateMedia({ media: 'print' });
    await page.goto(`${site.origin}/index.html#print`);
    await page.waitForFunction(() => (window as { __blazonPrint?: { ready?: unknown } }).__blazonPrint?.ready === true, undefined, { timeout: 90_000 });
    return await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('[data-print-deck] [data-print-slide="content"]')].map((slide) => {
        const body = slide.querySelector('[data-print-slide-body]')!;
        let last: Element = body;
        while (last.lastElementChild) last = last.lastElementChild;
        const heading = last === body ? null : last.closest('h1, h2, h3, h4, h5, h6');
        return { heading: heading ? (heading.textContent ?? '').trim() : null };
      })
    );
  } finally {
    await page.close();
  }
}

describe.skipIf(!CHROME)('a heading in the printed book', () => {
  it('is never the last block of a slide: it moves on with the block it introduces', async () => {
    const all = await slides();
    expect(all.length).toBeGreaterThan(PAGES);
    expect(all.filter((s) => s.heading !== null).map((s) => s.heading)).toEqual([]);
  });
});
