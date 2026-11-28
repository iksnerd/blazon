import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Browser } from 'playwright-core';
import { closeBrowser, launchBrowser } from '../../support/chrome';
import { loadConfig } from '../../../src/core/config/index.js';
import { buildSite } from '../../../src/builder/site-builder.js';
import { serve } from '../../../src/shipped/print-book/site.js';
import { tempDir } from '../../support/project';
import { starterProject } from '../../support/init-project';

// The logo misuse figures, printed in a real browser (the jsdom tests measure every block as 0px high): nine figures
// and a list of the author's own rules go over the slides of the page, every figure whole and none cut off at a foot.

const MAC_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CHROME = process.env.BLAZON_CHROME || (fs.existsSync(MAC_CHROME) ? MAC_CHROME : '');
if (!CHROME) {
  if (process.env.BLAZON_REQUIRE_CHROME) throw new Error('BLAZON_REQUIRE_CHROME is set, and there is no Chrome to print with');
  console.warn('print-book logo misuse test: skipped, no Chrome to print with (set BLAZON_CHROME)');
}

const SLIDE = { width: 1280, height: 720 };
const KINDS = ['stretch', 'squash', 'rotate', 'outline', 'recolor', 'shadow', 'crop', 'low-contrast', 'busy-background'];
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 40" width="100" height="40"><rect width="100" height="40" fill="#36c"/></svg>`;

let site: Awaited<ReturnType<typeof serve>>;
let browser: Browser;

beforeAll(async () => {
  if (!CHROME) return;
  const root = await starterProject();
  const logos = path.join(root, 'assets/logos');
  fs.writeFileSync(path.join(logos, 'acme-misuse.svg'), svg);
  fs.writeFileSync(
    path.join(logos, 'acme-misuse.json'),
    JSON.stringify({ title: 'Acme mark', background: 'light', ink: '#3366CC', dont: Array.from({ length: 6 }, (_, i) => `Acme rule number ${i + 1}`) }),
  );
  fs.writeFileSync(
    path.join(root, 'docs/09-misuse.md'),
    ['---\ntitle: Misuse\nsection: overview\norder: 9\n---\n', '## Logo misuse\n', 'The logo is never changed.\n', `<!-- blazon:logo-misuse logos/acme-misuse ${KINDS.join(' ')} -->\n`].join('\n'),
  );
  const out = tempDir('blazon-misuse-');
  // The fixture brand is made to print one thing, not to pass blazon check: it builds although it has findings
  await buildSite({ ...(await loadConfig(root)), outDir: out }, root, { allowErrors: true });
  site = await serve(out);
  browser = await launchBrowser(CHROME);
}, 120_000);

afterAll(async () => {
  await closeBrowser(browser);
  await site?.close();
}, 30_000);

async function slides(): Promise<{ zoom: number; text: string; figures: string[]; clipped: number }[]> {
  const page = await browser.newPage({ viewport: SLIDE });
  try {
    await page.emulateMedia({ media: 'print' });
    await page.goto(`${site.origin}/index.html#print/pages=doc/misuse`);
    await page.waitForFunction(() => (window as { __blazonPrint?: { ready?: unknown } }).__blazonPrint?.ready === true, undefined, { timeout: 30_000 });
    return await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('[data-print-deck] [data-print-slide="content"]')].map((slide) => {
        const body = slide.querySelector<HTMLElement>('[data-print-slide-body]')!;
        const box = body.getBoundingClientRect();
        const figures = [...slide.querySelectorAll<HTMLElement>('figure[data-misuse-kind]')];
        return {
          zoom: Number(body.style.zoom || 1),
          text: body.innerText,
          figures: figures.map((f) => f.dataset.misuseKind!),
          clipped: figures.filter((f) => f.getBoundingClientRect().bottom > box.bottom + 1).length,
        };
      }),
    );
  } finally {
    await page.close();
  }
}

describe.skipIf(!CHROME)('a page with the logo misuse figures, printed', () => {
  it('prints every figure once, whole, none cut off at the foot of its slide', async () => {
    const all = await slides();
    expect(all.flatMap((s) => s.figures).sort()).toEqual([...KINDS].sort());
    expect(all.reduce((n, s) => n + s.clipped, 0)).toBe(0);
    for (const slide of all) expect(slide.zoom).toBeGreaterThanOrEqual(0.25);
  });

  it("prints the captions and the author's own rules", async () => {
    const text = (await slides()).map((s) => s.text).join('\n');
    expect(text).toContain('Do not stretch the logo');
    expect(text).toContain('Do not place the logo on a busy background');
    expect(text).toContain('Acme rule number 6');
  });
});
