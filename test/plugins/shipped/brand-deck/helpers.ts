import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect } from 'vitest';
import { pathToFileURL } from 'node:url';
import { PDFDocument } from 'pdf-lib';
import { spawnSync } from '../../../support/spawn';
import { ROOT_DIR } from '../../support/spec.js';
import { tempDir } from '../../../support/project';

// blazon.brand-deck, the plugin blazon ships to draw the brand as a PDF deck. Seams: the pure helpers (the request, the text
// measure, the images, the HTML a slide becomes), and the entry, run as blazon runs it, in a real browser. The plan itself is
// tested in test/deck/brand-deck-plan/, and the fonts in test/deck/brand-deck-fonts.test.ts.

const ENTRY = path.join(ROOT_DIR, 'src/shipped/brand-deck/main.ts');
const TSX = pathToFileURL(path.join(ROOT_DIR, 'node_modules/tsx/dist/esm/index.mjs')).href;
const MAC_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const CHROME = process.env.BLAZON_CHROME || (fs.existsSync(MAC_CHROME) ? MAC_CHROME : '');
export const POPPLER = spawnSync('pdftotext', ['-v'], { encoding: 'utf-8' }).error === undefined;

interface Ran {
  status: number | null;
  out: string;
  err: string;
}
export const plugin = (input: string, env: Record<string, string> = {}, args: string[] = []): Ran => {
  const result = spawnSync(process.execPath, ['--import', TSX, ENTRY, ...args], { input, encoding: 'utf-8', env: { PATH: '/usr/bin:/bin', HOME: os.homedir(), ...env } });
  return { status: result.status, out: result.stdout, err: result.stderr };
};
export const browser = { BLAZON_CHROME: CHROME };

export const LOGO = (fill: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 182 40" width="364" height="80"><rect width="182" height="40" fill="${fill}"/><circle cx="20" cy="20" r="12" fill="#ffffff"/></svg>`;
export const PIXEL = path.join(ROOT_DIR, 'test/support/pixel-180.png');

const rule = (value: number) => ({ value, unit: 'px' });
export const token = (p: string, type: string, value: unknown, extra: object = {}) => ({ path: p, type, value: typeof value === 'object' ? '' : String(value), resolvedValue: value, ...extra });

/** A built site that is only the files the deck reads: brand-assets, and a brand as brand.json describes it. */
export function world(over: { fonts?: string[]; categories?: object[]; assets?: object[]; pages?: object[]; assetFiles?: Record<string, string | Buffer> } = {}) {
  const siteDir = tempDir('blazon-deck-site-');
  const write = (file: string, data: string | Buffer) => {
    fs.mkdirSync(path.dirname(path.join(siteDir, file)), { recursive: true });
    fs.writeFileSync(path.join(siteDir, file), data);
  };
  write('brand-assets/logos/onlight.svg', LOGO('#1E1F21'));
  write('brand-assets/logos/ondark.svg', LOGO('#F2F0EB'));
  write('brand-assets/usage/clear.svg', LOGO('#2563EB'));
  write('brand-assets/usage/photo.png', fs.readFileSync(PIXEL));
  for (const [file, data] of Object.entries(over.assetFiles ?? {})) write(file, data);
  const asset = (id: string, extra: object = {}) => ({
    id,
    name: id.split('/')[1],
    category: id.split('/')[0],
    file: `brand-assets/${id}.svg`,
    format: 'svg',
    mediaType: 'image/svg+xml',
    bytes: 1,
    width: 364,
    height: 80,
    ...extra,
  });
  const brand = {
    format: 'blazon-brand',
    version: 2,
    brand: { title: 'Acme Brand Book', description: 'How Acme looks.' },
    theme: { roles: { inverse: '#1E1F21', inverseText: '#F2F0EB', text: '#1E1F21', accent: '#FF5A1F', background: '#FFFFFF' }, tokens: {}, fonts: over.fonts ?? [] },
    logo: { onLight: 'brand-assets/logos/onlight.svg', onDark: 'brand-assets/logos/ondark.svg' },
    tokens: [
      token('color.base.ink', 'color', '#1E1F21', { blazon: { print: { cmyk: [10, 20, 30, 40], pms: '426 C', ral: '7016' } } }),
      token('color.base.signal', 'color', '#FF5A1F'),
      token('font.family.display', 'fontFamily', 'Georgia', { resolvedValue: ['Georgia', 'serif'], value: 'Georgia, serif' }),
      token('type.display', 'typography', '', { resolvedValue: { fontFamily: ['Georgia', 'serif'], fontSize: rule(72), fontWeight: 700, lineHeight: 1.1 } }),
      token('type.body', 'typography', '', { resolvedValue: { fontFamily: ['Georgia', 'serif'], fontSize: rule(16), fontWeight: 400, lineHeight: 1.5 } }),
    ],
    groups: [],
    pages: over.pages ?? [
      {
        slug: 'usage',
        sourceFile: 'usage.md',
        title: 'Usage',
        order: 1,
        meta: { description: 'How to use the logo.' },
        sections: ['logo'],
        markdown: '',
        directives: [{ name: 'section', args: ['usage', 'clear'] }],
      },
    ],
    assets: [
      asset('logos/onlight', { meta: { clearSpace: { value: 24, unit: 'px' }, placement: ['top-left'], description: 'On light grounds.' } }),
      asset('logos/ondark', { meta: { background: 'dark' } }),
      asset('usage/clear', { meta: { title: 'Clear space', description: 'Keep it clear.', do: ['Keep the space free'], dont: ['Crowd it'], source: { doc: 'guidelines', locator: 'page 4' } } }),
      ...(over.assets ?? []),
    ],
    categories: [{ category: 'usage', label: 'Usage', notSpecified: ['Print sizes'] }, ...(over.categories ?? [])],
  };
  return { siteDir, brand };
}

export const run = (w: ReturnType<typeof world>, options: object = {}, env: Record<string, string> = browser, outDir = tempDir('blazon-deck-out-')) => {
  const ran = plugin(JSON.stringify({ v: 2, type: 'build', options, brand: w.brand, site_dir: w.siteDir, out_dir: outDir }), env);
  return { ran, outDir, findings: ran.status === 0 ? (JSON.parse(ran.out).findings as { code: string; severity: string; path: string; message: string }[]) : [] };
};
export const pdfOf = (outDir: string) => path.join(outDir, 'brand-deck.pdf');
export const pages = async (file: string) => (await PDFDocument.load(fs.readFileSync(file))).getPages().map((p) => p.getSize());
export const text = (file: string): string[] => {
  const words = spawnSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf-8' });
  expect(words.status, 'pdftotext (poppler) reads the PDF').toBe(0);
  return words.stdout.split('\f');
};
export const fontsOf = (file: string): string[] => spawnSync('pdffonts', [file], { encoding: 'utf-8' }).stdout.split('\n').slice(2).map((line) => line.split(/\s+/)[0]!).filter(Boolean);

/**
 * A brand that crowds its slides: four typefaces with a description each, ten type styles, a slide of three groups of one color, an asset
 * with long lists and a source, a grid of six figures and a long list of what the guidelines leave open.
 */
export function crowded() {
  const svg = (fill: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100"><rect width="100" height="100" fill="${fill}"/></svg>`;
  const tile = (n: number) => `brand-assets/shop/t${n}.svg`;
  const long = (n: number) => `Do not place the icon on a busy photograph or crop it, item ${n}, because the mark loses its outline and reads as noise on small screens`;
  const w = world({
    categories: [{ category: 'shop', label: 'Shop' }],
    assets: [
      { id: 'usage/icon', name: 'icon', category: 'usage', file: 'brand-assets/usage/icon.svg', format: 'svg', width: 100, height: 100, meta: { title: 'The icon', do: [1, 2, 3].map(long), dont: [1, 2, 3].map(long), source: { doc: 'guidelines', locator: 'page 4' } } },
      ...[0, 1, 2, 3, 4, 5].map((n) => ({ id: `shop/t${n}`, name: `t${n}`, category: 'shop', file: tile(n), format: 'svg', width: 100, height: 100, meta: { title: `Tile ${n}` } })),
    ],
    assetFiles: { 'brand-assets/usage/icon.svg': svg('#2563EB'), ...Object.fromEntries([0, 1, 2, 3, 4, 5].map((n) => [tile(n), svg('#228B22')])) },
  });
  const brand = w.brand as any;
  for (const group of ['one', 'two', 'three']) brand.tokens.push(token(`color.${group}.a`, 'color', '#336699'));
  for (let i = 0; i < 4; i++) {
    brand.tokens.push(
      token(`font.family.f${i}`, 'fontFamily', ['Georgia', 'serif'], { value: 'Georgia, serif', description: 'A family for the most important words in headings and on covers.', blazon: { webFont: 'Loaded from the brand stylesheet' } }),
    );
  }
  [72, 56, 40, 32, 24, 20, 16, 14, 12, 11].forEach((px, i) =>
    brand.tokens.push(token(`type.s${i}`, 'typography', '', { resolvedValue: { fontFamily: ['Georgia', 'serif'], fontSize: rule(px), fontWeight: i % 2 ? 700 : 400, lineHeight: 1.4 } })),
  );
  brand.pages[0].directives = [{ name: 'section', args: ['usage'] }, { name: 'assets', args: ['shop'] }];
  brand.pages[0].markdown = '# Usage\n\n## Tiles\n\n<!-- blazon:assets shop -->\n';
  brand.categories[0].notSpecified = Array.from({ length: 8 }, (_, i) => `Print sizes for the icon on packaging, number ${i + 1}, which the guidelines do not give`);
  return w;
}
