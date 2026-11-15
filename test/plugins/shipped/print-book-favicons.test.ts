import { spawnSync } from '../../support/spawn';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeAll } from 'vitest';
import { loadConfig } from '../../../src/core/config/index.js';
import { buildSite } from '../../../src/builder/site-builder.js';
import { ROOT_DIR } from '../support/spec.js';
import { starterProject, tempDir } from '../../support/project';

// The Favicons chapter of the printed book, with the real viewer in a real browser: the site as `blazon build` writes it, the
// copy blazon.favicons leaves in it, then the blazon.print-book plugin. The viewer asks the site for favicons/favicons.json
// and the print waits for the answer, so the chapter is in the PDF (and in its contents) only when the copy was there.

const ENTRY = path.join(ROOT_DIR, 'src/shipped/print-book/main.ts');
const TSX = pathToFileURL(path.join(ROOT_DIR, 'node_modules/tsx/dist/esm/index.mjs')).href;
const PIXEL = path.join(ROOT_DIR, 'test/support/pixel-180.png');

const MAC_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CHROME = process.env.BLAZON_CHROME || (fs.existsSync(MAC_CHROME) ? MAC_CHROME : '');
if (!CHROME) {
  if (process.env.BLAZON_REQUIRE_CHROME) throw new Error('BLAZON_REQUIRE_CHROME is set, and there is no Chrome to print with');
  console.warn('print book Favicons chapter test: skipped, no Chrome to print with (set BLAZON_CHROME)');
}

const FAVICONS = {
  format: 'blazon-favicons',
  version: 1,
  symbol: 'logos/mark',
  colors: { ground: '#2563EB', ink: '#FFFFFF', favicon: '#2563EB', themeColor: '#2563EB' },
  views: [
    { id: 'tabs', title: 'Browser tabs', file: 'favicon-tabs.png', width: 180, height: 180 },
    { id: 'masks', title: 'App icon masks', file: 'app-icon-masks.png', width: 180, height: 180 },
    { id: 'sizes', title: 'iOS sizes', file: 'app-icon-sizes.png', width: 180, height: 180 },
  ],
  files: [{ file: 'favicon.svg', size: 'vector, 32 x 32 viewBox', use: 'Browser tab icon, any size, transparent' }],
  head: '<link rel="icon" href="/favicon.svg" type="image/svg+xml">\n',
};

let site = '';
let tokens = '';

/** The book printed from `site`, as blazon calls the plugin: out_dir is <tokensOutDir>/blazon.print-book */
function print(siteDir: string): { findings: unknown[]; text: (page?: number) => string } {
  const outDir = path.join(tempDir('blazon-print-favicons-'), 'blazon.print-book');
  fs.mkdirSync(outDir);
  const brand = JSON.parse(fs.readFileSync(path.join(siteDir, 'brand.json'), 'utf-8'));
  const input = JSON.stringify({ v: 1, type: 'build', options: {}, brand, site_dir: siteDir, out_dir: outDir });
  const ran = spawnSync(process.execPath, ['--import', TSX, ENTRY], { input, encoding: 'utf-8', env: { PATH: '/usr/bin:/bin', HOME: os.homedir(), BLAZON_CHROME: CHROME } });
  expect(ran.status, ran.stdout + ran.stderr).toBe(0);
  const pdf = path.join(outDir, 'brand-book.pdf');
  return {
    findings: JSON.parse(ran.stdout).findings,
    text: (page) => spawnSync('pdftotext', [...(page ? ['-f', String(page), '-l', String(page)] : []), pdf, '-'], { encoding: 'utf-8' }).stdout,
  };
}

beforeAll(async () => {
  if (!CHROME) return;
  const root = await starterProject();
  tokens = tempDir('blazon-favicons-tokens-');
  site = path.join(tokens, 'site');
  await buildSite({ ...(await loadConfig(root)), outDir: site }, root);
}, 240_000);

describe.skipIf(!CHROME)('the printed book\'s Favicons chapter', () => {
  it('has no Favicons chapter, and no finding, when the site has no copy of the plugin\'s files', () => {
    const printed = print(site);
    expect(printed.findings).toEqual([]);
    expect(printed.text(2)).not.toContain('Favicons');
  }, 180_000);

  it('ends the book with the Favicons chapter, listed in the contents, when the site has the copy', () => {
    const copy = path.join(site, 'favicons');
    fs.mkdirSync(copy);
    fs.writeFileSync(path.join(copy, 'favicons.json'), JSON.stringify(FAVICONS));
    for (const view of FAVICONS.views) fs.copyFileSync(PIXEL, path.join(copy, view.file));
    const printed = print(site);
    expect(printed.findings).toEqual([]);
    expect(printed.text(2)).toContain('Favicons');
    // its slides carry the views' headings, the table of files and the head snippet, after the guideline pages
    const book = printed.text();
    for (const heading of ['Browser tabs', 'App icon masks', 'iOS sizes', 'Files', 'Head snippet']) expect(book, heading).toContain(heading);
    expect(book).toContain('vector, 32 x 32 viewBox');
    expect(book.lastIndexOf('Browser tabs')).toBeGreaterThan(book.indexOf('Start here'));
  }, 180_000);
});
