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

// A figure taller than a slide, in a real browser. The web book frames a figure at its image's real ratio, so its height
// grows with its width, and the print book's "draw the frame smaller" widened it again: a 2400x2160 overview printed
// only its first rows and nothing said so. The jsdom tests cannot see it (they measure every block as 0px high).

const MAC_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CHROME = process.env.BLAZON_CHROME || (fs.existsSync(MAC_CHROME) ? MAC_CHROME : '');
if (!CHROME) {
  if (process.env.BLAZON_REQUIRE_CHROME) throw new Error('BLAZON_REQUIRE_CHROME is set, and there is no Chrome to print with');
  console.warn('print-book tall figure test: skipped, no Chrome to print with (set BLAZON_CHROME)');
}

const SLIDE = { width: 1280, height: 720 };
/** A slide's margins are 72px above and below its content, and 112px at the sides (src/viewer/pages/print/) */
const CONTENT = { top: 72, bottom: SLIDE.height - 72, left: 112, right: SLIDE.width - 112 };

const svg = (width: number, height: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="#36c"/></svg>`;

let site: Awaited<ReturnType<typeof serve>>;
let browser: Browser;

beforeAll(async () => {
  if (!CHROME) return;
  const root = await starterProject();
  fs.mkdirSync(path.join(root, 'assets/overview'), { recursive: true });
  fs.writeFileSync(path.join(root, 'assets/overview/tall.svg'), svg(2400, 2160));
  fs.writeFileSync(path.join(root, 'assets/overview/wide.svg'), svg(2400, 600));
  fs.writeFileSync(path.join(root, 'docs/09-overview.md'), '---\ntitle: Overview\nsection: overview\norder: 9\n---\n\n## The overview\n\n<!-- blazon:assets overview tall -->\n\n## The band\n\n<!-- blazon:assets overview wide -->\n');
  const out = tempDir('blazon-tall-figure-');
  // The fixture brand is made to print one thing, not to pass blazon check: it builds although it has findings
  await buildSite({ ...(await loadConfig(root)), outDir: out }, root, { allowErrors: true });
  site = await serve(out);
  browser = await launchBrowser(CHROME);
}, 120_000);

afterAll(async () => {
  await browser?.close();
  await site?.close();
}, 30_000);

/** Each figure's image on the printed slides, as the box it is drawn in, in slide coordinates. */
async function drawn(): Promise<Record<string, { top: number; bottom: number; left: number; right: number }>> {
  const page = await browser.newPage({ viewport: SLIDE });
  try {
    await page.emulateMedia({ media: 'print' });
    await page.goto(`${site.origin}/index.html#print/pages=doc/overview`);
    await page.waitForFunction(() => (window as { __blazonPrint?: { ready?: unknown } }).__blazonPrint?.ready === true, undefined, { timeout: 30_000 });
    return await page.evaluate(() => {
      const out: Record<string, { top: number; bottom: number; left: number; right: number }> = {};
      for (const slide of document.querySelectorAll<HTMLElement>('[data-print-deck] [data-print-slide]')) {
        const origin = slide.getBoundingClientRect();
        // a slide is drawn smaller with CSS zoom: its boxes are read in the slide's own pixels
        for (const img of slide.querySelectorAll<HTMLImageElement>('figure img')) {
          const box = img.getBoundingClientRect();
          out[img.alt] = { top: box.top - origin.top, bottom: box.bottom - origin.top, left: box.left - origin.left, right: box.right - origin.left };
        }
      }
      return out;
    });
  } finally {
    await page.close();
  }
}

describe.skipIf(!CHROME)('a figure taller than a slide, printed', () => {
  it('is drawn whole inside the slide\'s margins, at its real proportions, not cut off at the foot', async () => {
    const { Tall } = await drawn();
    expect(Tall, 'the tall figure is on a slide').toBeDefined();
    expect(Tall!.top).toBeGreaterThanOrEqual(CONTENT.top);
    expect(Tall!.bottom).toBeLessThanOrEqual(CONTENT.bottom);
    expect(Tall!.left).toBeGreaterThanOrEqual(CONTENT.left);
    expect(Tall!.right).toBeLessThanOrEqual(CONTENT.right);
    expect((Tall!.right - Tall!.left) / (Tall!.bottom - Tall!.top)).toBeCloseTo(2400 / 2160, 1);
  });

  it('leaves a wide figure as wide as the slide\'s content allows', async () => {
    const { Wide } = await drawn();
    expect(Wide, 'the wide figure is on a slide').toBeDefined();
    expect(Wide!.right - Wide!.left).toBeGreaterThan(900);
    expect((Wide!.right - Wide!.left) / (Wide!.bottom - Wide!.top)).toBeCloseTo(4, 1);
  });
});
