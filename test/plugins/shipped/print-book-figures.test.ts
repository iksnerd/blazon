import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Browser } from 'playwright-core';
import { closeBrowser, launchBrowser } from '../../support/chrome';
import { loadConfig } from '../../../src/core/config/index.js';
import { buildSite } from '../../../src/builder/site-builder.js';
import { serve } from '../../../src/shipped/print-book/site.js';
import { tempDir } from '../../support/project';
import { starterProject } from '../../support/init-project';

// A page that places four wide pictures with one directive, under a heading and a paragraph of five lines: the list of
// figures is taller than a slide, so each figure goes on a slide of its own (or as many as fit), and none is out of frame.

const MAC_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CHROME = process.env.BLAZON_CHROME || (fs.existsSync(MAC_CHROME) ? MAC_CHROME : '');
if (!CHROME) {
  if (process.env.BLAZON_REQUIRE_CHROME) throw new Error('BLAZON_REQUIRE_CHROME is set, and there is no Chrome to print with');
  console.warn('print-book figures test: skipped, no Chrome to print with (set BLAZON_CHROME)');
}

const SLIDE = { width: 1280, height: 720 };
const COLOURS: [number, number, number][] = [
  [200, 60, 60],
  [60, 90, 200],
  [30, 40, 90],
  [90, 160, 120],
];
const NAMES = ['chart-money', 'chart-blue', 'chart-navy', 'chart-mix'];

/** A solid PNG of the given size and colour: wide pictures need a real image, since a figure's height is its picture's */
function png(width: number, height: number, [r, g, b]: [number, number, number]): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, 'ascii');
    const tail = Buffer.alloc(4);
    tail.writeUInt32BE(crc(Buffer.concat([head.subarray(4), data])), 0);
    return Buffer.concat([head, data, tail]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: width }, () => [r, g, b]).flat())]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

let site: Awaited<ReturnType<typeof serve>>;
let browser: Browser;

beforeAll(async () => {
  if (!CHROME) return;
  const root = await starterProject();
  const dir = path.join(root, 'assets/charts');
  fs.mkdirSync(dir, { recursive: true });
  NAMES.forEach((name, i) => {
    fs.writeFileSync(path.join(dir, `${name}.png`), png(2400, 740, COLOURS[i]!));
    fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify({ title: name, description: 'A chart palette in both themes.' }));
  });
  const paragraph = 'Each palette is shown in both themes, the light theme on a white card and the dark theme on a navy card, with every colour, its contrast on the card and the colour it comes from. '.repeat(2);
  fs.writeFileSync(
    path.join(root, 'docs/09-charts.md'),
    `---\ntitle: Charts\nsection: overview\norder: 9\n---\n\n## The palettes\n\n${paragraph}\n\n<!-- blazon:assets charts ${NAMES.join(' ')} -->\n`,
  );
  const out = tempDir('blazon-figures-');
  await buildSite({ ...(await loadConfig(root)), outDir: out }, root, { allowErrors: true });
  site = await serve(out);
  browser = await launchBrowser(CHROME);
}, 180_000);

afterAll(async () => {
  await closeBrowser(browser);
  await site?.close();
}, 30_000);

interface Drawn {
  clipped: number[];
  slides: { zoom: number; text: string; clipped: boolean; figures: { name: string; inFrame: boolean }[] }[];
}

async function printed(): Promise<Drawn> {
  const page = await browser.newPage({ viewport: SLIDE });
  try {
    await page.emulateMedia({ media: 'print' });
    await page.goto(`${site.origin}/index.html#print/pages=doc/charts`);
    await page.waitForFunction(() => (window as { __blazonPrint?: { ready?: unknown } }).__blazonPrint?.ready === true, undefined, { timeout: 90_000 });
    return await page.evaluate(() => ({
      clipped: (window as { __blazonPrint?: { clipped?: number[] } }).__blazonPrint?.clipped ?? [],
      slides: [...document.querySelectorAll<HTMLElement>('[data-print-deck] [data-print-slide="content"]')].map((slide) => {
        const body = slide.querySelector<HTMLElement>('[data-print-slide-body]')!;
        const frame = slide.getBoundingClientRect();
        return {
          zoom: Number(body.style.zoom || 1),
          text: body.textContent ?? '',
          clipped: slide.dataset.printClipped !== undefined,
          figures: [...body.querySelectorAll<HTMLElement>('figure')].map((figure) => {
            const box = figure.querySelector('img')!.getBoundingClientRect();
            return { name: figure.querySelector('img')!.getAttribute('alt') ?? '', inFrame: box.top >= frame.top && box.bottom <= frame.bottom + 1 };
          }),
        };
      }),
    }));
  } finally {
    await page.close();
  }
}

describe.skipIf(!CHROME)('a list of wide figures taller than a slide', () => {
  it('is split by whole figures, every picture is in its frame, and nothing is cut off', async () => {
    const { slides, clipped } = await printed();
    expect(clipped).toEqual([]);
    expect(slides.flatMap((s) => s.figures).map((f) => f.name.toLowerCase().replace(/ /g, '-'))).toEqual(NAMES);
    for (const slide of slides) for (const figure of slide.figures) expect(figure.inFrame, figure.name).toBe(true);
    expect(slides.length).toBeGreaterThan(1);
    // a figure is drawn smaller than 1 only to fit, never below the last resort
    expect(Math.min(...slides.map((s) => s.zoom))).toBeGreaterThanOrEqual(0.5);
  }, 120_000);
});
