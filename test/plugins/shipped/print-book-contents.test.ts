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

// The contents of a book of forty chapters, as a real book has: they run over more than one slide, clear the footer, and
// each number is the page its chapter starts on, which the second contents slide moves down by one. A title that does not
// fit a column of 320 px wraps to a second line and is never cut, and counts as two rows.

const MAC_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CHROME = process.env.BLAZON_CHROME || (fs.existsSync(MAC_CHROME) ? MAC_CHROME : '');
if (!CHROME) {
  if (process.env.BLAZON_REQUIRE_CHROME) throw new Error('BLAZON_REQUIRE_CHROME is set, and there is no Chrome to print with');
  console.warn('print-book contents test: skipped, no Chrome to print with (set BLAZON_CHROME)');
}

const SLIDE = { width: 1280, height: 720 };
const COUNT = 40;
const ids = Array.from({ length: COUNT }, (_, i) => `c${String(i + 1).padStart(2, '0')}`);
/** The title of a chapter: unique words, so a slide that opens it can be found */
const title = (id: string) => (id.startsWith('long') ? `Spacing, radius and elevation ${id}` : `Chapter ${id.toUpperCase()} of the shop's guidelines`);
/** Thirty entries of which two are too long for one line: they take 32 lines, so they need two slides, where thirty one-line entries need one */
const WRAPPED = [...ids.slice(0, 28), 'long1', 'long2'];

let site: Awaited<ReturnType<typeof serve>>;
let browser: Browser;

beforeAll(async () => {
  if (!CHROME) return;
  const root = await starterProject();
  [...ids, 'long1', 'long2'].forEach((id, i) => fs.writeFileSync(path.join(root, `docs/${20 + i}-${id}.md`), `---\ntitle: ${title(id)}\nsection: overview\norder: ${20 + i}\n---\n\n## Part\n\nA short paragraph for ${id}.\n`));
  const out = tempDir('blazon-contents-');
  await buildSite({ ...(await loadConfig(root)), outDir: out }, root, { allowErrors: true });
  site = await serve(out);
  browser = await launchBrowser(CHROME);
}, 180_000);

afterAll(async () => {
  await browser?.close();
  await site?.close();
}, 30_000);

interface Drawn {
  slides: { lowest: number; footerTop: number; page: number }[];
  entries: { id: string; number: number; title: string; cut: boolean; wide: boolean; lines: number; numberTop: number; titleTop: number; numberRight: number; rowRight: number }[];
  deck: string[];
  pages: number;
}

async function printed(chapters: string[]): Promise<Drawn> {
  const page = await browser.newPage({ viewport: SLIDE });
  try {
    await page.emulateMedia({ media: 'print' });
    await page.goto(`${site.origin}/index.html#print/pages=${chapters.map((id) => `doc/${id}`).join(',')}`);
    await page.waitForFunction(() => (window as { __blazonPrint?: { ready?: unknown } }).__blazonPrint?.ready === true, undefined, { timeout: 120_000 });
    return await page.evaluate(() => {
      const slides = [...document.querySelectorAll<HTMLElement>('[data-print-contents]')].map((slide) => {
        const top = slide.getBoundingClientRect().top;
        const footer = slide.querySelector('[data-print-footer] span')!.getBoundingClientRect();
        const rows = [...slide.querySelectorAll('li')].map((li) => li.getBoundingClientRect().bottom - top);
        return { lowest: Math.max(...rows), footerTop: footer.top - top, page: Number(slide.querySelector('[data-print-footer] span:last-child')!.textContent) };
      });
      const entries = [...document.querySelectorAll<HTMLElement>('[data-print-contents] li')].map((li) => {
        const name = li.querySelector<HTMLElement>('span')!;
        const number = li.querySelector<HTMLElement>('[data-page]')!;
        const lineHeight = parseFloat(getComputedStyle(name).lineHeight);
        return {
          id: li.dataset.chapter!,
          number: Number(number.textContent),
          title: name.textContent ?? '',
          cut: getComputedStyle(name).textOverflow === 'ellipsis' || getComputedStyle(name).whiteSpace === 'nowrap',
          wide: name.scrollWidth > name.clientWidth,
          lines: Math.round(name.getBoundingClientRect().height / lineHeight),
          numberTop: number.getBoundingClientRect().top,
          titleTop: name.getBoundingClientRect().top,
          numberRight: number.getBoundingClientRect().right,
          rowRight: li.getBoundingClientRect().right,
        };
      });
      const deck = [...document.querySelectorAll<HTMLElement>('[data-print-deck] > [data-print-slide]')].map((slide) => slide.textContent ?? '');
      return { slides, entries, deck, pages: (window as { __blazonPrint?: { pages: number } }).__blazonPrint!.pages };
    });
  } finally {
    await page.close();
  }
}

const PT = 4 / 3;

describe.skipIf(!CHROME)('the contents of a book of forty chapters', () => {
  it('end above the footer on every contents slide, and each number is the page its chapter starts on', async () => {
    const drawn = await printed(ids);
    expect(drawn.slides.length).toBeGreaterThan(1);
    for (const slide of drawn.slides) expect(slide.footerTop - slide.lowest, `contents page ${slide.page}`).toBeGreaterThanOrEqual(24 * PT);
    // the contents are pages 2 to 1 + n, the cover is page 1, and the first chapter follows them
    expect(drawn.slides.map((s) => s.page)).toEqual(drawn.slides.map((_, i) => 2 + i));
    const first = 2 + drawn.slides.length;
    expect(drawn.entries.map((e) => e.id)).toEqual(ids.map((id) => `doc/${id}`));
    drawn.entries.forEach((entry, i) => {
      const opener = drawn.deck.findIndex((text) => text.includes(title(ids[i]!)));
      expect(entry.number, entry.id).toBe(first + opener);
    });
    expect(drawn.pages).toBe(first - 1 + drawn.deck.length);
  }, 180_000);
});

describe.skipIf(!CHROME)('a contents entry whose title does not fit a column', () => {
  it('wraps to a second line and is shown whole, the number on its first line, and the packing counts the second line', async () => {
    const drawn = await printed(WRAPPED);
    const long = drawn.entries.filter((e) => e.id.startsWith('doc/long'));
    expect(long).toHaveLength(2);
    for (const entry of drawn.entries) {
      expect(entry.title, entry.id).toBe(title(entry.id.replace('doc/', '')));
      expect(entry.cut, `${entry.id} is set on one line or with an ellipsis`).toBe(false);
      expect(entry.wide, `${entry.id} runs past its column`).toBe(false);
      // the number is on the first line, flush right
      expect(Math.abs(entry.numberTop - entry.titleTop), entry.id).toBeLessThan(4);
      expect(entry.rowRight - entry.numberRight, entry.id).toBeLessThan(1);
    }
    for (const entry of long) expect(entry.lines, entry.id).toBe(2);
    // thirty entries of 32 lines do not fit one slide of 3 columns of 10: the second line is counted
    expect(drawn.slides).toHaveLength(2);
    for (const slide of drawn.slides) expect(slide.footerTop - slide.lowest, `contents page ${slide.page}`).toBeGreaterThanOrEqual(24 * PT);
    // each number is the page its chapter starts on, after the two contents slides
    const first = 2 + drawn.slides.length;
    drawn.entries.forEach((entry) => {
      const opener = drawn.deck.findIndex((text) => text.includes(title(entry.id.replace('doc/', ''))));
      expect(entry.number, entry.id).toBe(first + opener);
    });
    expect(drawn.pages).toBe(first - 1 + drawn.deck.length);
  }, 180_000);
});
