import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, it, expect, beforeAll } from 'vitest';
import { loadConfig } from '../../src/core/config/index.js';
import { buildSite } from '../../src/builder/site-builder.js';
import { readBrand } from '../../src/shipped/brand-deck/brand.js';
import { Images } from '../../src/shipped/brand-deck/images.js';
import { FontTable } from '../../src/shipped/brand-deck/fonts.js';
import { Measure } from '../../src/shipped/brand-deck/measure.js';
import { Painter } from '../../src/shipped/brand-deck/paint/index.js';
import { plan } from '../../src/shipped/brand-deck/plan/index.js';
import { PDFDocument } from 'pdf-lib';
import { REPO } from '../support/paths';
import { hasReference, referencePath } from '../support/reference';
import { spawnSync } from '../support/spawn';
import { starterProject, tempDir } from '../support/project';

// The deck of the real brands: the starter `blazon init` writes, and Auth0's, which has pages, sections, grids, print values and
// 78 slides. These are the cases of test/deck/brand-deck.test.ts that read the PDF of a real brand, which tested the Python deck
// before it was ported: the plugin, as blazon starts it, in a real browser.

const ENTRY = path.join(REPO, 'src/shipped/brand-deck/main.ts');
const TSX = pathToFileURL(path.join(REPO, 'node_modules/tsx/dist/esm/index.mjs')).href;
const MAC_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CHROME = process.env.BLAZON_CHROME || (fs.existsSync(MAC_CHROME) ? MAC_CHROME : '');
const POPPLER = spawnSync('pdftotext', ['-v'], { encoding: 'utf-8' }).error === undefined;
if (!CHROME) console.warn('brand-deck examples test: PDF tests skipped, no Chrome to draw with (set BLAZON_CHROME)');

interface Site {
  siteDir: string;
  brand: any;
}

/** The project built to a site, from a copy so the example's own dist/ is not touched */
async function built(root: string): Promise<Site> {
  const { siteOutDir } = await buildSite(await loadConfig(root), root);
  return { siteDir: siteOutDir, brand: JSON.parse(fs.readFileSync(path.join(siteOutDir, 'brand.json'), 'utf-8')) };
}

/** The deck as blazon's plugin draws it, read back as the text of each page */
function deckOf(site: Site, brand: any = site.brand): { pages: string[]; file: string } {
  const outDir = tempDir('blazon-deck-real-out-');
  const request = JSON.stringify({ v: 1, type: 'build', options: {}, brand, site_dir: site.siteDir, out_dir: outDir });
  const ran = spawnSync(process.execPath, ['--import', TSX, ENTRY], {
    input: request,
    encoding: 'utf-8',
    env: { PATH: '/usr/bin:/bin', HOME: os.homedir(), BLAZON_CHROME: CHROME },
  });
  expect(ran.status, ran.stdout + ran.stderr).toBe(0);
  const file = path.join(outDir, 'brand-deck.pdf');
  const text = spawnSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf-8' });
  expect(text.status, 'pdftotext (poppler) reads the PDF').toBe(0);
  return { pages: text.stdout.split('\f').slice(0, -1), file };
}

const HAS_AUTH0 = hasReference('examples/auth0');

describe('the HTML of the real brands', () => {
  let starter: Site;
  let auth0: Site;

  beforeAll(async () => {
    starter = await built(await starterProject());
    if (!HAS_AUTH0) return;
    const auth0Root = tempDir('blazon-deck-auth0-');
    fs.cpSync(referencePath('examples/auth0'), auth0Root, { recursive: true, filter: (src) => !/[\\/](dist|node_modules)$/.test(src) });
    auth0 = await built(auth0Root);
  }, 240_000);

  it('sets no text below 10 points and the footer at 10, in the starter and in Auth0', () => {
    for (const site of HAS_AUTH0 ? [starter, auth0] : [starter]) {
      const brand = readBrand(site.brand);
      const measure = new Measure();
      const painter = new Painter({ brand, measure, images: new Images(measure), table: FontTable.scan([]), siteDir: site.siteDir });
      for (const slide of plan(brand, null, painter.wrap)) painter.draw(slide);
      const html = painter.sections.join('\n');
      const sizes = [...html.matchAll(/font-size:([\d.]+)pt/g)].map((match) => Number(match[1]));
      expect(Math.min(...sizes)).toBeGreaterThanOrEqual(10);
      // Every slide has a footer: the brand's title at 10, and its number
      const footers = html
        .split('<section ')
        .slice(1)
        .map((section) => /font-size:(\d+)pt[^>]*><i><\/i>\d+<\/div>/.exec(section)?.[1]);
      expect(footers.every((size) => size === '10')).toBe(true);
    }
  }, 120_000);

  describe.skipIf(!CHROME || !POPPLER)('as a PDF', () => {
    it('is 16:9 slides: a cover, then contents naming the pages, then the pages (the starter)', async () => {
      const { pages, file } = deckOf(starter);
      for (const size of (await PDFDocument.load(fs.readFileSync(file))).getPages().map((p) => p.getSize())) expect([size.width, size.height]).toEqual([960, 540]);
      expect(pages[0]).toContain(starter.brand.brand.title);
      expect(pages[1]).toContain('Contents');
      for (const page of starter.brand.pages) expect(pages[1]).toContain(page.title);
      expect(pages.length).toBeGreaterThan(4);
    }, 240_000);

    it("states the starter's colors, its logo rules and its type scale", () => {
      const text = deckOf(starter).pages.join('\n');
      expect(text).toContain('#FF5A1F');
      expect(text).toContain('Clear space');
      expect(text).toContain('Type scale');
      expect(text).toMatch(/Signal|Orange|Graphite/);
    }, 240_000);

    it.skipIf(!HAS_AUTH0)(
      "draws the figures of Auth0's `blazon:assets` directives as grid slides: the heading above them, and each title under its picture",
      () => {
        const { pages } = deckOf(auth0);
        // docs/02-logo.md: "## The shield" holds `blazon:assets logo-usage shield shield-applications`
        expect(
          pages.find((page) => page.includes('The shield') && page.includes('Shield applications')),
          'a grid slide titled The shield with both captions',
        ).toBeDefined();
      },
      240_000,
    );

    it.skipIf(!HAS_AUTH0)(
      'states the Auth0 print values and logo rules on the right pages, and the whole palette',
      () => {
        const { pages } = deckOf(auth0);
        const colors = pages.filter((page) => page.includes('#635DFF'));
        expect(colors.length).toBeGreaterThan(0);
        expect(colors[0]).toContain('CMYK 84 70 0 0');
        expect(colors[0]).toContain('PMS 2726 C');
        const logo = pages.find((page) => page.includes('Clear space') && page.includes('579px'));
        expect(logo, 'a logo page with the 579px clear space').toBeDefined();
        expect(logo).toContain('top-left, bottom-left');
        // Every color of the palette is in the deck, on fewer slides than one for each group
        const palette = auth0.brand.tokens.filter((t: any) => t.type === 'color' && !t.aliasOf);
        for (const t of palette) expect(pages.join('\n'), t.path).toContain(String(t.value).toUpperCase());
        const groups = new Set(palette.map((t: any) => t.path.replace(/\.[^.]+$/, '')));
        expect(pages.filter((page) => palette.some((t: any) => page.includes(String(t.value).toUpperCase()) && page.includes('RGB'))).length).toBeLessThan(groups.size);
      },
      240_000,
    );

    it.skipIf(!HAS_AUTH0)(
      "draws the real Auth0 pages and the assets their sections list, in the brand's own display family name",
      () => {
        const { pages } = deckOf(auth0);
        for (const p of auth0.brand.pages)
          expect(
            pages.some((page) => page.includes(p.title)),
            p.title,
          ).toBe(true);
        const withSection = auth0.brand.pages.find((p: any) => p.directives.some((d: any) => d.name === 'section'))!;
        const [category, ...names] = withSection.directives.find((d: any) => d.name === 'section').args as string[];
        const first = auth0.brand.assets.find((a: any) => a.category === category && (names.length === 0 || a.name === names[0]));
        if (first.meta?.title)
          expect(
            pages.some((page) => page.includes(first.meta.title)),
            first.meta.title,
          ).toBe(true);
        expect(pages.some((page) => page.includes('Space Grotesk'))).toBe(true);
      },
      240_000,
    );

    it.skipIf(!HAS_AUTH0)(
      'has no more slides than the 78 it had when it was drawn with Python',
      () => {
        expect(deckOf(auth0).pages).toHaveLength(78);
      },
      240_000,
    );
  });
});
