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

// The logo colorway figures, printed in a real browser: each colorway is a whole figure with its name and its result in words, on a slide.

const MAC_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CHROME = process.env.BLAZON_CHROME || (fs.existsSync(MAC_CHROME) ? MAC_CHROME : '');
if (!CHROME) {
  if (process.env.BLAZON_REQUIRE_CHROME) throw new Error('BLAZON_REQUIRE_CHROME is set, and there is no Chrome to print with');
  console.warn('print-book logo colorways test: skipped, no Chrome to print with (set BLAZON_CHROME)');
}

const SLIDE = { width: 1280, height: 720 };
const svg = (fill: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 40" width="100" height="40"><rect width="100" height="40" fill="${fill}"/></svg>`;

let site: Awaited<ReturnType<typeof serve>>;
let browser: Browser;

beforeAll(async () => {
  if (!CHROME) return;
  const root = await starterProject();
  const logos = path.join(root, 'assets/logos');
  fs.writeFileSync(path.join(logos, 'acme-dark.svg'), svg('#1E1F21'));
  fs.writeFileSync(path.join(logos, 'acme-light.svg'), svg('#F2F0EB'));
  fs.writeFileSync(path.join(logos, 'acme-light.json'), JSON.stringify({ title: 'Acme logo, light', ink: '#F2F0EB' }));
  fs.writeFileSync(
    path.join(logos, 'acme-dark.json'),
    JSON.stringify({
      title: 'Acme logo',
      ink: '#1E1F21',
      colorways: [
        { name: 'Acme on Paper', on: '{color.base.bone}' },
        { name: 'Acme light on Signal', on: '{color.signal.orange}', variant: 'logos/acme-light' },
      ],
    }),
  );
  fs.writeFileSync(
    path.join(root, 'docs/09-colorways.md'),
    ['---\ntitle: Colorways\nsection: overview\norder: 9\n---\n', '## Logo colorways\n', '<!-- blazon:logo-colorways logos/acme-dark -->\n'].join('\n'),
  );
  const out = tempDir('blazon-colorways-');
  // The fixture brand has a colorway below its level on purpose, so it builds although it has an error
  await buildSite({ ...(await loadConfig(root)), outDir: out }, root, { allowErrors: true });
  site = await serve(out);
  browser = await launchBrowser(CHROME);
}, 120_000);

afterAll(async () => {
  await browser?.close();
  await site?.close();
}, 30_000);

describe.skipIf(!CHROME)('a page with logo colorways, printed', () => {
  it('prints each colorway once, whole, with its name and its result in words', async () => {
    const page = await browser.newPage({ viewport: SLIDE });
    try {
      await page.emulateMedia({ media: 'print' });
      await page.goto(`${site.origin}/index.html#print/pages=doc/colorways`);
      await page.waitForFunction(() => (window as { __blazonPrint?: { ready?: unknown } }).__blazonPrint?.ready === true, undefined, { timeout: 30_000 });
      const slides = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('[data-print-deck] [data-print-slide="content"]')].map((slide) => {
          const body = slide.querySelector<HTMLElement>('[data-print-slide-body]')!;
          const box = body.getBoundingClientRect();
          const figures = [...slide.querySelectorAll<HTMLElement>('figure[data-logo-colorway]')];
          return {
            names: figures.map((f) => f.dataset.logoColorway!),
            text: body.innerText,
            clipped: figures.filter((f) => f.getBoundingClientRect().bottom > box.bottom + 1).length,
          };
        }),
      );
      expect(slides.flatMap((s) => s.names).sort()).toEqual(['Acme light on Signal', 'Acme on Paper']);
      expect(slides.reduce((n, s) => n + s.clipped, 0)).toBe(0);
      const text = slides.map((s) => s.text).join('\n');
      expect(text).toMatch(/Passes AA-large: \d+\.\d\d:1/);
      expect(text).toMatch(/Fails AA-large: \d+\.\d\d:1, needs 3:1/);
    } finally {
      await page.close();
    }
  });
});
