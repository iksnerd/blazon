import { spawnSync } from '../../support/spawn';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeAll } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { loadConfig } from '../../../src/core/config/index.js';
import { buildSite } from '../../../src/builder/site-builder.js';
import { ROOT_DIR } from '../support/spec.js';
import { tempDir } from '../../support/project';
import { hasReference, referencePath } from '../../support/reference';

// The real Auth0 brand book, printed end to end: the site as `blazon build` writes it, then the blazon.print-book plugin
// in a real browser. The viewer's slide layout is tested in jsdom (test/viewer/print-book.test.tsx) and its packing alone
// (test/viewer/paginate.test.ts); this is the one place the two meet with real fonts, images and measurements.

const ENTRY = path.join(ROOT_DIR, 'src/shipped/print-book/main.ts');
const TSX = pathToFileURL(path.join(ROOT_DIR, 'node_modules/tsx/dist/esm/index.mjs')).href;
const EXAMPLE = referencePath('examples/auth0');
const PRESENT = hasReference('examples/auth0');
/** The source deck, Auth0 Brand Guidelines, is 105 slides; the user asked the book not to run longer. */
const SOURCE_DECK_SLIDES = 105;

const MAC_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CHROME = process.env.BLAZON_CHROME || (fs.existsSync(MAC_CHROME) ? MAC_CHROME : '');
if (!CHROME && PRESENT) {
  if (process.env.BLAZON_REQUIRE_CHROME) throw new Error('BLAZON_REQUIRE_CHROME is set, and there is no Chrome to print with');
  console.warn('Auth0 print book test: skipped, no Chrome to print with (set BLAZON_CHROME)');
}

let dir = '';
let ran: { status: number | null; stdout: string; stderr: string };

beforeAll(async () => {
  if (!CHROME || !PRESENT) return;
  dir = tempDir();
  const config = await loadConfig(EXAMPLE);
  const site = path.join(dir, 'site');
  const out = path.join(dir, 'out');
  fs.mkdirSync(out);
  await buildSite({ ...config, outDir: site }, EXAMPLE);
  const brand = JSON.parse(fs.readFileSync(path.join(site, 'brand.json'), 'utf-8'));
  const request = JSON.stringify({ v: 2, type: 'build', options: {}, brand, site_dir: site, out_dir: out });
  ran = spawnSync(process.execPath, ['--import', TSX, ENTRY], { input: request, encoding: 'utf-8', env: { PATH: '/usr/bin:/bin', HOME: os.homedir(), BLAZON_CHROME: CHROME } });
}, 240_000);

const run = (args: string[]) => spawnSync(args[0]!, args.slice(1), { encoding: 'utf-8' });

describe.skipIf(!CHROME || !PRESENT)('the reference brand book, printed', () => {
  it('prints with no findings, so the PDF has as many pages as the book laid out', () => {
    expect(ran.status, ran.stdout + ran.stderr).toBe(0);
    expect(JSON.parse(ran.stdout)).toEqual({ findings: [] });
  });

  it('runs no longer than the source deck, and the PowerPoint file has the same slides', async () => {
    const pdf = path.join(dir, 'out/brand-book.pdf');
    const pages = (await PDFDocument.load(fs.readFileSync(pdf))).getPageCount();
    expect(pages).toBeGreaterThan(14);
    expect(pages).toBeLessThanOrEqual(SOURCE_DECK_SLIDES);
    const pptx = JSON.parse(run(['python3', '-I', path.join(ROOT_DIR, 'test/deck/python/pptx_info.py'), path.join(dir, 'out/brand-book.pptx')]).stdout);
    expect(pptx).toEqual({ slides: pages, size: '12192000x6858000' });
  });

  it('sets the book in the brand\'s own typefaces, Inter and Space Grotesk', () => {
    const fonts = run(['pdffonts', path.join(dir, 'out/brand-book.pdf')]).stdout;
    expect(fonts).toMatch(/Inter/);
    expect(fonts).toMatch(/SpaceGrotesk/);
  });
});
