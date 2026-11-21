import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Browser } from 'playwright-core';
import { launchBrowser } from '../../support/chrome';
import { loadConfig } from '../../../src/core/config/index.js';
import { buildSite } from '../../../src/builder/site-builder.js';
import { serve } from '../../../src/shipped/print-book/site.js';
import { starterProject, tempDir } from '../../support/project';

// A dense page printed through Chrome: a grid of thirty marks and a table of forty rows. The jsdom tests measure every
// block as 0px high, so only a browser shows what a slide is drawn at.

const MAC_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CHROME = process.env.BLAZON_CHROME || (fs.existsSync(MAC_CHROME) ? MAC_CHROME : '');
if (!CHROME) {
  if (process.env.BLAZON_REQUIRE_CHROME) throw new Error('BLAZON_REQUIRE_CHROME is set, and there is no Chrome to print with');
  console.warn('print-book scale test: skipped, no Chrome to print with (set BLAZON_CHROME)');
}

const SLIDE = { width: 1280, height: 720 };
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 120" width="400" height="120"><rect width="400" height="120" fill="#36c"/></svg>`;
const MARKS = Array.from({ length: 30 }, (_, i) => `mark-${String(i + 1).padStart(2, '0')}`);
const ROWS = Array.from({ length: 40 }, (_, i) => `Row${String(i + 1).padStart(2, '0')}`);

let site: Awaited<ReturnType<typeof serve>>;
let browser: Browser;

beforeAll(async () => {
  if (!CHROME) return;
  const root = await starterProject();
  const dir = path.join(root, 'assets/marks');
  fs.mkdirSync(dir, { recursive: true });
  for (const name of MARKS) {
    fs.writeFileSync(path.join(dir, `${name}.svg`), svg);
    fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify({ title: name, description: 'A mark for the shop.' }));
  }
  fs.writeFileSync(
    path.join(root, 'docs/09-dense.md'),
    [
      '---\ntitle: Dense\nsection: overview\norder: 9\n---\n',
      '## Marks\n',
      'Every mark of the shop, in the order it was drawn.\n',
      '<!-- blazon:assets marks -->\n',
      '## Rates\n',
      ['| Case | Share | Note |', '|---|---|---|', ...ROWS.map((r, i) => `| ${r} | ${i + 1}.5% | Applies to this case |`)].join('\n') + '\n',
      '## Notes\n',
      'A short closing note.\n',
    ].join('\n'),
  );
  // One tall mark: a figure that cannot be cut at a row, taller than a slide at 0.9 but not at 0.5
  const tall = path.join(root, 'assets/tall');
  fs.mkdirSync(tall, { recursive: true });
  fs.writeFileSync(path.join(tall, 'tall-1.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 300" width="200" height="300"><rect width="200" height="300" fill="#36c"/></svg>`);
  fs.writeFileSync(
    path.join(tall, 'tall-1.json'),
    JSON.stringify({ title: 'tall-1', background: 'light', unit: { value: 40, unit: 'px' }, clearSpace: { units: 1 }, minSize: { width: { value: 150, unit: 'px' } } }),
  );
  fs.writeFileSync(path.join(root, 'docs/10-tall.md'), '---\ntitle: Tall\nsection: overview\norder: 10\n---\n\n## Tall\n\n<!-- blazon:logo-space tall -->\n');
  // A code block of 150 lines: one block with no rows to cut at, taller than two slides
  const lines = Array.from({ length: 150 }, (_, i) => `line_${i + 1}();`).join('\n');
  fs.writeFileSync(path.join(root, 'docs/11-long.md'), `---\ntitle: Long\nsection: overview\norder: 11\n---\n\n## Long\n\n\`\`\`js\n${lines}\n\`\`\`\n`);
  // A heading too long for one line above a table that is cut over several slides
  const title = Array(4).fill('Every rate that applies to a case of the shop, by the kind of customer, the region and the season of the year').join(', ');
  fs.writeFileSync(
    path.join(root, 'docs/12-wide.md'),
    ['---\ntitle: Wide\nsection: overview\norder: 12\n---\n', `## ${title}\n`, ['| Case | Share |', '|---|---|', ...ROWS.map((r) => `| ${r} | 1% |`)].join('\n') + '\n'].join('\n'),
  );
  const out = tempDir('blazon-scale-');
  // The fixture brand is made to print one thing, not to pass blazon check: it builds although it has findings
  await buildSite({ ...(await loadConfig(root)), outDir: out }, root, { allowErrors: true });
  site = await serve(out);
  browser = await launchBrowser(CHROME);
}, 180_000);

afterAll(async () => {
  await browser?.close();
  await site?.close();
}, 30_000);

/** The label at the top of a continued slide, as drawn */
interface Label {
  text: string;
  fontSize: number;
  /** its computed colour, and the muted text colour of the book for comparison */
  color: string;
  muted: string;
  height: number;
  lineHeight: number;
  /** the heading is cut with an ellipsis, and the suffix is whole */
  truncated: boolean;
  suffixWhole: boolean;
  /** the label is the first thing in the slide's body */
  first: boolean;
}

interface Drawn {
  slides: { zoom: number; text: string; smallest: number; label: Label | null }[];
  clipped: number[];
  /** The page numbers in the footers of the slides marked clipped */
  footers: number[];
}

/** The dense page as printed: each content slide's zoom and the smallest text on it in pt (CSS px times zoom, at 0.75 pt per px). */
async function printed(pages = 'doc/dense'): Promise<Drawn> {
  const page = await browser.newPage({ viewport: SLIDE });
  try {
    await page.emulateMedia({ media: 'print' });
    await page.goto(`${site.origin}/index.html#print/pages=${pages}`);
    await page.waitForFunction(() => (window as { __blazonPrint?: { ready?: unknown } }).__blazonPrint?.ready === true, undefined, { timeout: 90_000 });
    return await page.evaluate(() => {
      const slides = [...document.querySelectorAll<HTMLElement>('[data-print-deck] [data-print-slide="content"]')].map((slide) => {
        const body = slide.querySelector<HTMLElement>('[data-print-slide-body]')!;
        const zoom = Number(body.style.zoom || 1);
        let smallest = Infinity;
        const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const el = node.parentElement!;
          if (!(node.textContent ?? '').trim() || el.closest('svg, script, style')) continue;
          smallest = Math.min(smallest, parseFloat(getComputedStyle(el).fontSize) * zoom * 0.75);
        }
        const el = body.querySelector<HTMLElement>('[data-print-continued-label]');
        let label: Label | null = null;
        if (el) {
          const [name, suffix] = [el.children[0] as HTMLElement, el.children[1] as HTMLElement];
          const probe = document.createElement('span');
          probe.style.color = 'var(--muted-foreground)';
          body.append(probe);
          const muted = getComputedStyle(probe).color;
          probe.remove();
          const style = getComputedStyle(el);
          label = {
            text: el.textContent ?? '',
            fontSize: parseFloat(style.fontSize),
            color: style.color,
            muted,
            height: el.getBoundingClientRect().height / zoom,
            lineHeight: parseFloat(style.lineHeight),
            truncated: name.scrollWidth > name.clientWidth,
            suffixWhole: suffix.scrollWidth <= suffix.clientWidth && suffix.getBoundingClientRect().right <= el.getBoundingClientRect().right + 1,
            first: body.firstElementChild === el,
          };
        }
        return { zoom, text: body.textContent ?? '', smallest, label };
      });
      const footers = [...document.querySelectorAll<HTMLElement>('[data-print-deck] [data-print-slide="content"]')].filter((s) => s.dataset.printClipped !== undefined).map((s) => Number(s.querySelector('[data-print-footer] span:last-child')!.textContent));
      return { footers, slides, clipped: (window as { __blazonPrint?: { clipped?: number[] } }).__blazonPrint?.clipped ?? [] };
    });
  } finally {
    await page.close();
  }
}

const MIN_PT = 8;
/** Body text of a printed slide is at least 14 pt (a 960 pt wide slide: 18.67 CSS px at 0.75 pt per px) */
const BODY_PT = 14;
const PX_PT = 0.75;
const MIN_ZOOM = 0.9;
const marks = (text: string) => [...text.matchAll(/Mark \d\d/g)].map((m) => m[0]);
const rows = (text: string) => [...text.matchAll(/Row\d\d/g)].map((m) => m[0]);

/** The sizes of the text the page sets in the book, in CSS px of the 1280 px slide */
async function sized(): Promise<{ paragraph: number; cell: number; heading: number; caption: number }> {
  const page = await browser.newPage({ viewport: SLIDE });
  try {
    await page.emulateMedia({ media: 'print' });
    await page.goto(`${site.origin}/index.html#print/pages=doc/dense`);
    await page.waitForFunction(() => (window as { __blazonPrint?: { ready?: unknown } }).__blazonPrint?.ready === true, undefined, { timeout: 90_000 });
    return await page.evaluate(() => {
      const px = (selector: string) => parseFloat(getComputedStyle(document.querySelector(`[data-print-deck] ${selector}`)!).fontSize);
      return { paragraph: px('.blazon-prose p'), cell: px('td'), heading: px('[data-print-slide="content"] h2'), caption: px('figure a') };
    });
  } finally {
    await page.close();
  }
}

describe.skipIf(!CHROME)('a dense page in the printed book is split over slides, not drawn small', () => {
  it('draws no slide below the floor, and cuts nothing off', async () => {
    const drawn = await printed();
    expect(Math.min(...drawn.slides.map((s) => s.zoom))).toBeGreaterThanOrEqual(MIN_ZOOM);
    expect(Math.min(...drawn.slides.map((s) => s.smallest))).toBeGreaterThanOrEqual(MIN_PT);
    expect(drawn.clipped).toEqual([]);
  }, 120_000);

  it('prints every mark and every row once, in order, over more than one slide each', async () => {
    const { slides } = await printed();
    const all = slides.map((s) => s.text).join('\n');
    expect(marks(all)).toEqual(MARKS.map((m) => m.replace('mark-', 'Mark ')));
    expect(rows(all)).toEqual(ROWS);
    expect(slides.filter((s) => marks(s.text).length > 0).length).toBeGreaterThan(1);
    expect(slides.filter((s) => rows(s.text).length > 0).length).toBeGreaterThan(1);
  }, 120_000);

  it('keeps a heading with the first piece of what it introduces, and repeats a table header on each piece', async () => {
    const { slides } = await printed();
    const first = (word: string) => slides.find((s) => s.text.includes(word))!;
    expect(first('Mark 01').text).toContain('Marks');
    expect(first('Row01').text).toContain('Rates');
    const tables = slides.filter((s) => rows(s.text).length > 0);
    for (const slide of tables) expect(slide.text).toMatch(/Case\s+Share\s+Note/);
    // a later piece has no heading of its own: it is a continued slide
    expect(tables[1]!.label?.text).toBe('Rates (continued)');
    expect(tables[1]!.text.replace('Rates (continued)', '')).not.toContain('Rates');
  }, 120_000);
});

describe.skipIf(!CHROME)('a continued slide says what it continues', () => {
  it('labels each later piece of a table and of a grid "<heading> (continued)", and never the first', async () => {
    const { slides } = await printed();
    for (const [heading, kind] of [
      ['Rates', rows],
      ['Marks', marks],
    ] as const) {
      const pieces = slides.filter((s) => kind(s.text).length > 0);
      expect(pieces.length).toBeGreaterThan(1);
      expect(pieces[0]!.label, `${heading}: the first piece has no label`).toBeNull();
      expect(pieces[0]!.text).not.toContain('(continued)');
      for (const piece of pieces.slice(1)) {
        expect(piece.label?.text).toBe(`${heading} (continued)`);
        expect(piece.label?.first).toBe(true);
      }
    }
  }, 120_000);

  it('draws the label at 12 px or more, in the muted colour, on one line, and the slide still fits', async () => {
    const { slides, clipped } = await printed();
    const labels = slides.flatMap((s) => (s.label ? [s.label] : []));
    expect(labels.length).toBeGreaterThan(1);
    for (const label of labels) {
      expect(label.fontSize).toBeGreaterThanOrEqual(12);
      expect(label.color).toBe(label.muted);
      expect(label.height).toBeLessThanOrEqual(label.lineHeight + 0.5);
    }
    // the packer left room for the label: a labelled slide is not drawn smaller to fit it
    expect(slides.filter((s) => s.label).map((s) => s.zoom)).toEqual(slides.filter((s) => s.label).map(() => 1));
    expect(clipped).toEqual([]);
  }, 120_000);

  it('cuts a heading that is too long with an ellipsis, on one line, and keeps "(continued)" whole', async () => {
    const { slides, clipped } = await printed('doc/wide');
    const labels = slides.flatMap((s) => (s.label ? [s.label] : []));
    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) {
      expect(label.truncated).toBe(true);
      expect(label.suffixWhole).toBe(true);
      expect(label.height).toBeLessThanOrEqual(label.lineHeight + 0.5);
      expect(label.text.endsWith(' (continued)')).toBe(true);
    }
    expect(clipped).toEqual([]);
  }, 120_000);
});

describe.skipIf(!CHROME)('the text of the printed book is set at slide size', () => {
  it('sets body text at 14 pt or more, a table at 12 pt, a heading above the body and a caption at 10 pt', async () => {
    const px = await sized();
    expect(px.paragraph * PX_PT).toBeGreaterThanOrEqual(BODY_PT);
    expect(px.cell * PX_PT).toBeGreaterThanOrEqual(12);
    expect(px.heading).toBeGreaterThan(px.paragraph * 1.5);
    expect(px.caption * PX_PT).toBeGreaterThanOrEqual(10);
  }, 120_000);
});

describe.skipIf(!CHROME)('a block that cannot be split', () => {
  it('is drawn smaller than 0.9 to fit, and not cut off, when it fits at 0.5', async () => {
    const { slides, clipped } = await printed('doc/tall');
    const zooms = slides.map((s) => s.zoom);
    expect(Math.min(...zooms)).toBeGreaterThanOrEqual(0.5);
    expect(Math.min(...zooms)).toBeLessThan(0.9);
    expect(clipped).toEqual([]);
  }, 120_000);

  it('is cut off, and its page reported, only when it is taller than a slide even at 0.5', async () => {
    const { clipped, footers, slides } = await printed('doc/long');
    expect(clipped).toHaveLength(1);
    expect(clipped).toEqual(footers);
    expect(slides.some((s) => s.zoom === 0.5)).toBe(true);
  }, 120_000);
});

