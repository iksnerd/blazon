import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Browser } from 'playwright-core';
import { launchBrowser } from '../../support/chrome';
import { loadConfig } from '../../../src/core/config/index.js';
import { buildSite } from '../../../src/builder/site-builder.js';
import { jobFor } from '../../../src/shipped/print-book/request.js';
import { serve } from '../../../src/shipped/print-book/site.js';
import { tempDir } from '../../support/project';
import { starterProject } from '../../support/init-project';

// The title and subtitle options of blazon.print-book, in a real browser: the request puts them in the viewer hash, the
// viewer reads them back, and the cover and the footer of a content slide show them as text, whatever characters they hold.

const MAC_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CHROME = process.env.BLAZON_CHROME || (fs.existsSync(MAC_CHROME) ? MAC_CHROME : '');
if (!CHROME) {
  if (process.env.BLAZON_REQUIRE_CHROME) throw new Error('BLAZON_REQUIRE_CHROME is set, and there is no Chrome to print with');
  console.warn('print-book title test: skipped, no Chrome to print with (set BLAZON_CHROME)');
}

const SLIDE = { width: 1280, height: 720 };
const TITLE = `Q&A <b>"Acme"</b> 'x' &amp; Бранд книга`;
const SUBTITLE = `Правила & <i>цветове</i> "2026"`;

let site: Awaited<ReturnType<typeof serve>>;
let browser: Browser;
let brandTitle = '';
let brandDescription = '';
let siteRoot = '';

beforeAll(async () => {
  if (!CHROME) return;
  const root = await starterProject();
  fs.writeFileSync(path.join(root, 'docs/09-title.md'), '---\ntitle: Titled\nsection: overview\norder: 9\n---\n\n## Words\n\nA paragraph on a content slide.\n');
  const config = await loadConfig(root);
  const out = tempDir('blazon-title-');
  // The fixture brand is made to print one thing, not to pass blazon check: it builds although it has findings
  await buildSite({ ...config, outDir: out }, root, { allowErrors: true });
  siteRoot = out;
  site = await serve(out);
  browser = await launchBrowser(CHROME);
  // What the brand itself says, from its config and not from the page: a book with no option must print exactly these
  brandTitle = config.title;
  brandDescription = config.description ?? '';
}, 180_000);

afterAll(async () => {
  await browser?.close();
  await site?.close();
}, 30_000);

/** Prints the fixture's chapter with these options, through the hash the plugin's own request builds. */
async function printed(options: object) {
  const request = JSON.stringify({ v: 2, type: 'build', options: { pages: ['doc/title'], ...options }, brand: {}, site_dir: siteRoot, out_dir: tempDir('o-') });
  const { hash } = jobFor(request);
  const page = await browser.newPage({ viewport: SLIDE });
  try {
    await page.emulateMedia({ media: 'print' });
    await page.goto(`${site.origin}/index.html${hash}`);
    await page.waitForFunction(() => (window as { __blazonPrint?: { ready?: unknown } }).__blazonPrint?.ready === true, undefined, { timeout: 90_000 });
    return await page.evaluate(() => {
      const cover = document.querySelector('[data-print-slide="cover"]')!;
      const footers = [...document.querySelectorAll<HTMLElement>('[data-print-deck] [data-print-footer], [data-print-slide="contents"] [data-print-footer]')];
      return {
        heading: cover.querySelector('h1')!.textContent,
        subtitle: cover.querySelector('p')?.textContent ?? null,
        footers: footers.map((f) => ({ text: f.firstElementChild!.textContent, height: f.getBoundingClientRect().height })),
        markup: cover.querySelectorAll('b, i').length + footers.reduce((n, f) => n + f.querySelectorAll('b, i').length, 0),
      };
    });
  } finally {
    await page.close();
  }
}

describe.skipIf(!CHROME)('the print book shows the title and subtitle it is given', () => {
  it('puts the title on the cover and in every footer, and the subtitle under the cover heading, verbatim', async () => {
    const shown = await printed({ title: TITLE, subtitle: SUBTITLE });
    expect(shown.heading).toBe(TITLE);
    expect(shown.subtitle).toBe(SUBTITLE);
    expect(shown.footers.length, 'the fixture prints a contents slide and a content slide').toBeGreaterThanOrEqual(2);
    for (const footer of shown.footers) expect(footer.text).toBe(TITLE);
    expect(shown.markup, 'markup in an option is text, never elements').toBe(0);
  });

  it('prints the brand title and description as before when there is no option', async () => {
    const shown = await printed({});
    expect(shown.heading).toBe(brandTitle);
    expect(shown.subtitle).toBe(brandDescription);
    expect(brandTitle).not.toBe('');
    expect(brandDescription).not.toBe('');
    for (const footer of shown.footers) expect(footer.text).toBe(brandTitle);
  });

  it('changes only what it is given: a title leaves the description, a subtitle leaves the title', async () => {
    const titled = await printed({ title: 'Acme Logo' });
    expect([titled.heading, titled.subtitle]).toEqual(['Acme Logo', brandDescription]);
    const sub = await printed({ subtitle: 'Only a line' });
    expect([sub.heading, sub.subtitle]).toEqual([brandTitle, 'Only a line']);
  });

  it('keeps the footer as high with a title of 120 characters as with the brand title', async () => {
    const plain = await printed({});
    const long = await printed({ title: 'WWWWWWWWWW '.repeat(11).trim() });
    expect(long.footers.map((f) => f.height)).toEqual(plain.footers.map((f) => f.height));
  });
});
