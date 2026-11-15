import { describe, it, expect } from 'vitest';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from '../../support/spawn';
import { readBrand as readBrandRaw } from '../../../src/shipped/press-kit/brand.js';
import { colorsCss, colorsText, planColors } from '../../../src/shipped/press-kit/colors.js';
import { pdfFallbacks, planFonts } from '../../../src/shipped/press-kit/fonts.js';
import { chooseLogos, logoIds, logosText } from '../../../src/shipped/press-kit/logos.js';
import { parseOptions } from '../../../src/shipped/press-kit/options.js';
import { NAME } from '../../../src/shipped/press-kit/request.js';
import { aboutText, readmeText } from '../../../src/shipped/press-kit/text.js';
import { crc32 } from '../../../src/shipped/shared/zip.js';
import { ROOT_DIR } from '../support/spec.js';
import { tempDir } from '../../support/project';
import { DEFAULT_CONFIG } from '../../../src/core/config/index.js';
import { formatBrandJson } from '../../../src/core/brand/export.js';
import { compileBlazonData } from '../../../src/core/index.js';
import { writeProject } from '../../support/helpers.js';

// A brand.json always carries its format and version (RFC 0001); a fixture that is only a piece of one gets them here
const readBrand = (brand: object) => readBrandRaw({ format: 'blazon-brand', version: 1, ...brand });

// blazon.press-kit, the plugin blazon ships to pack what an outsider needs from a brand. Seams: the pure parts (which logos go and why,
// the color files, the fonts, the text), and the entry, run as blazon runs it, whose folder and zip are read back.

const ENTRY = path.join(ROOT_DIR, 'src/shipped/press-kit/main.ts');
const TSX = pathToFileURL(path.join(ROOT_DIR, 'node_modules/tsx/dist/esm/index.mjs')).href;
const MAC_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CHROME = process.env.BLAZON_CHROME || (fs.existsSync(MAC_CHROME) ? MAC_CHROME : '');
if (!CHROME) {
  if (process.env.BLAZON_REQUIRE_CHROME) throw new Error('BLAZON_REQUIRE_CHROME is set, and there is no Chrome to draw with');
  console.warn('press-kit plugin test: the PDF test is skipped, no Chrome to draw with (set BLAZON_CHROME)');
}

const SVG = (fill: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 40" width="100" height="40"><rect width="100" height="40" fill="${fill}"/></svg>`;
const asset = (id: string, extra: object = {}, meta: object = {}) => ({ id, name: id.split('/')[1], category: id.split('/')[0], file: `brand-assets/${id}.svg`, format: 'svg', meta, ...extra });
const token = (tokenPath: string, value: string, extra: object = {}) => ({ path: tokenPath, type: 'color', value, resolvedValue: value, cssVariable: `--${tokenPath.replace(/\./g, '-')}`, ...extra });
const BRAND = {
  format: 'blazon-brand',
  version: 1,
  brand: { title: 'Acme Co', description: 'Acme makes anvils.' },
  theme: { roles: { fontDisplay: "'Big Shoulders Display', sans-serif", fontBody: 'Arial, sans-serif' }, fonts: ['https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@800&display=swap'] },
  logo: { onLight: 'brand-assets/logos/mark-light.svg', onDark: 'brand-assets/logos/mark-dark.svg' },
  tokens: [
    token('color.ink', '#1E1F21', { description: 'Ink' }),
    token('color.signal', '#FF5A1F', { description: 'Signal Orange', blazon: { print: { cmyk: [0, 80, 100, 0], pms: '1665 C', ral: '2004' } } }),
    token('text.primary', '#1E1F21', { aliasOf: 'color.ink' }),
    token('color.draft', '#123456', { blazon: { review: { status: 'needs-review', note: 'not signed off' } } }),
    token('color.wide', 'oklch(0.7 0.1 30)'),
    { path: 'font.family.display', type: 'fontFamily', value: "'Big Shoulders Display', sans-serif", resolvedValue: ['Big Shoulders Display', 'sans-serif'] },
  ],
  assets: [
    asset('logos/mark-light', {}, { background: 'light', description: 'For light surfaces.', clearSpace: { value: 24, unit: 'px' }, lockup: 'horizontal' }),
    asset('logos/mark-dark', {}, { background: 'dark' }),
    asset('logos/draft', {}, { background: 'light', review: { status: 'needs-review', note: 'colors are wrong' } }),
    asset('logos/ai', {}, { background: 'dark', generated: { by: 'a model' } }),
    asset('logos/ai-ok', {}, { background: 'dark', generated: { by: 'a model' }, review: { status: 'ok' } }),
    asset('photos/team', {}, {}),
  ],
};
const brandOf = (over: object = {}) => ({ ...BRAND, ...over });

describe('options', () => {
  const known = new Set(['logos/mark-light', 'logos/mark-dark']);

  it('has defaults: the name press-kit, a PDF, every logo', () => {
    expect(parseOptions({}, known)).toEqual({ options: { name: 'press-kit', pdf: true, unreviewed: false }, findings: [] });
  });

  it('reports each wrong option as option-invalid and keeps the rest', () => {
    const { options, findings } = parseOptions({ bogus: 1, name: '../x', pdf: 'yes', unreviewed: 1, logos: ['logos/mark-light', 'logos/nope'] }, known);
    expect(findings.map((f) => f.code)).toEqual(Array(5).fill(`${NAME}/option-invalid`));
    expect(findings.map((f) => f.message).join('\n')).toMatch(/unknown option "bogus"[^]*name must be a file name[^]*pdf must be true or false[^]*unreviewed must be true or false[^]*"logos\/nope"/);
    expect(options).toEqual({ name: 'press-kit', pdf: true, unreviewed: false, logos: ['logos/mark-light'] });
  });

  it('takes a name, pdf: false, unreviewed: true and a list of logos', () => {
    expect(parseOptions({ name: 'acme-kit', pdf: false, unreviewed: true, logos: ['logos/mark-dark'] }, known).options).toEqual({ name: 'acme-kit', pdf: false, unreviewed: true, logos: ['logos/mark-dark'] });
  });

  it.each(['../x', 'a/b', '.hidden', '', 'a'.repeat(65), 'a b', 'x\\y', 7])('refuses the name %j with one option-invalid finding, and keeps press-kit', (name) => {
    const { options, findings } = parseOptions({ name }, known);
    expect(findings.map((f) => f.code)).toEqual([`${NAME}/option-invalid`]);
    expect(options.name).toBe('press-kit');
  });

  it.each(['a', 'acme-kit', 'Acme_Kit.2', '_x', 'a'.repeat(64)])('takes the name %j', (name) => {
    expect(parseOptions({ name }, known).options.name).toBe(name);
  });

  it('answers options that are not an object with one finding', () => {
    expect(parseOptions([], known).findings).toHaveLength(1);
  });
});

describe('the logos', () => {
  const brand = readBrand(BRAND);

  it('knows the logos from the other assets', () => {
    expect([...logoIds(brand)].sort()).toEqual(['logos/ai', 'logos/ai-ok', 'logos/draft', 'logos/mark-dark', 'logos/mark-light']);
  });

  it('leaves out a needs-review logo and an unreviewed generated one, and says why for each', () => {
    const { chosen, findings } = chooseLogos(brand, {});
    expect(chosen.map((item) => item.asset.id).sort()).toEqual(['logos/ai-ok', 'logos/mark-dark', 'logos/mark-light']);
    const left = findings.filter((f) => f.code === `${NAME}/logo-left-out`);
    expect(left.map((f) => f.path).sort()).toEqual(['logos/ai', 'logos/draft']);
    expect(left.find((f) => f.path === 'logos/draft')!.message).toMatch(/needs-review: colors are wrong/);
    expect(left.find((f) => f.path === 'logos/ai')!.message).toMatch(/generated by a model and nobody has confirmed it/);
  });

  it('puts each logo in the folder for its background, by the sidecar, else by the pair brand.json names, else apart', () => {
    const odd = readBrand({
      logo: { onDark: 'brand-assets/logos/b.svg' },
      assets: [asset('logos/a', {}, { background: 'light' }), asset('logos/b'), asset('logos/c')],
    });
    const { chosen, findings } = chooseLogos(odd, {});
    expect(Object.fromEntries(chosen.map((item) => [item.asset.id, item.kitPath]))).toEqual({
      'logos/a': 'logos/on-light-backgrounds/a.svg',
      'logos/b': 'logos/on-dark-backgrounds/b.svg',
      'logos/c': 'logos/background-not-stated/c.svg',
    });
    expect(findings.map((f) => f.code)).toEqual([`${NAME}/logo-background-unstated`]);
  });

  it('keeps two files of one name apart', () => {
    const twin = readBrand({ assets: [asset('logos/x', { file: 'brand-assets/a/m.svg' }, { background: 'light' }), asset('logos/y', { file: 'brand-assets/b/m.svg' }, { background: 'light' })] });
    expect(new Set(chooseLogos(twin, {}).chosen.map((item) => item.kitPath)).size).toBe(2);
  });

  it('takes only the logos the option names, and still holds one back that is not ready', () => {
    const { chosen, findings } = chooseLogos(brand, { logos: ['logos/mark-dark', 'logos/draft'] });
    expect(chosen.map((item) => item.asset.id)).toEqual(['logos/mark-dark']);
    expect(findings.map((f) => f.code)).toEqual([`${NAME}/logo-left-out`, `${NAME}/logo-no-variant`]);
  });

  it('never puts an experimental category in the kit: it is no logo, even one the sidecar calls ready (experimental categories are not the identity)', () => {
    const sketch = asset('experiments/sketch', {}, { background: 'light', review: { status: 'ok' } });
    const withSketch = readBrand({ ...BRAND, assets: [...BRAND.assets, sketch], categories: [{ category: 'experiments', label: 'Experiments', experimental: true }] });
    expect(logoIds(withSketch).has('experiments/sketch')).toBe(false);
    expect(chooseLogos(withSketch, {}).chosen.map((item) => item.asset.id)).not.toContain('experiments/sketch');
    expect(chooseLogos(withSketch, { logos: ['experiments/sketch'] }).chosen).toEqual([]);
  });

  it('says when there is nothing to put in the kit', () => {
    expect(chooseLogos(readBrand({}), {}).findings.map((f) => f.code)).toEqual([`${NAME}/logo-none`]);
  });

  it('writes only what the sidecar states about each logo', () => {
    const text = logosText(chooseLogos(brand, {}).chosen);
    expect(text).toContain('For light backgrounds (on-light-backgrounds/)');
    expect(text).toMatch(/mark-light\.svg\n {2}For light surfaces\.\n {2}Lockup: horizontal\n {2}Clear space on every side: 24 px\n/);
    expect(text).not.toMatch(/Smallest size|Largest size|Main color/);
  });
});

describe('the colors', () => {
  const { colors, findings } = planColors(readBrand(BRAND));

  it('lists the brand\'s own colors, with a token that is another name under the color it names', () => {
    expect(colors.map((c) => c.path)).toEqual(['color.ink', 'color.signal', 'color.wide']);
    expect(colors[0]).toMatchObject({ hex: '#1E1F21', rgb: [30, 31, 33], usedAs: ['text.primary'], cssVariable: '--color-ink' });
  });

  it('states print values only where a token does, and no hex for a value that is not a hex or rgb() color', () => {
    expect(colors[1]!.print).toEqual({ cmyk: [0, 80, 100, 0], pms: '1665 C', ral: '2004' });
    expect(colors[0]!.print).toBeUndefined();
    expect(colors[2]!.hex).toBeUndefined();
    expect(colors[2]!.rgb).toBeUndefined();
  });

  it('leaves out a color marked needs-review and says how to include it', () => {
    expect(colors.some((c) => c.path === 'color.draft')).toBe(false);
    expect(findings[0]!.message).toMatch(/not signed off; set the unreviewed option to true to include it/);
    expect(findings.map((f) => [f.code, f.path])).toEqual([
      [`${NAME}/color-left-out`, 'color.draft'],
      [`${NAME}/color-not-hex`, 'color.wide'],
    ]);
  });

  it('writes custom properties, and text that gives the name, hex and RGB', () => {
    expect(colorsCss(colors)).toBe(':root {\n  --color-ink: #1E1F21;\n  --color-signal: #FF5A1F;\n  --color-wide: oklch(0.7 0.1 30);\n}\n');
    const text = colorsText(colors);
    expect(text).toContain('Ink (color.ink)\n  HEX  #1E1F21\n  RGB  30, 31, 33\n  Also named  text.primary\n');
    expect(text).toContain('  CMYK  0, 80, 100, 0\n  Pantone  1665 C\n  RAL  2004\n');
    expect(text).toContain('  As written  oklch(0.7 0.1 30)\n');
  });

  it('includes a color marked needs-review when asked, labelled in the text and in the JSON', () => {
    const asked = planColors(readBrand(BRAND), { unreviewed: true });
    expect(asked.colors.map((c) => c.path)).toEqual(['color.ink', 'color.signal', 'color.draft', 'color.wide']);
    expect(asked.colors[2]).toMatchObject({ hex: '#123456', review: 'needs-review' });
    expect(asked.findings.map((f) => f.code)).toEqual([`${NAME}/color-not-hex`]);
    expect(colorsText(asked.colors)).toContain('color.draft (unreviewed)\n  HEX  #123456');
    expect(JSON.stringify(asked.colors[2])).toContain('"review":"needs-review"');
    expect(colorsText(asked.colors)).not.toMatch(/Ink \(color.ink\) \(unreviewed\)/);
  });

  it('says when there are none', () => {
    expect(planColors({ colors: [] }).findings.map((f) => f.code)).toEqual([`${NAME}/color-none`]);
  });
});

describe('the fonts', () => {
  const GOOGLE = 'https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@800&family=IBM+Plex+Sans:wght@400&display=swap';

  it('gives each family its own source, and sums up the missing licenses in one finding', () => {
    const { text, findings } = planFonts(readBrand({ ...BRAND, theme: { ...BRAND.theme, fonts: [GOOGLE] } }));
    expect(text).toContain('Big Shoulders Display\n  Used for: headings (the fontDisplay role), font.family.display\n  Source: Google Fonts, https://fonts.googleapis.com/css2?family=Big+Shoulders+Display\n  License: not stated\n');
    expect(text).toContain('IBM Plex Sans\n  Source: Google Fonts, https://fonts.googleapis.com/css2?family=IBM+Plex+Sans\n');
    expect(text).not.toContain('wght');
    expect(text).toContain('Arial\n  Used for: running text (the fontBody role)\n  Source: not stated\n  License: not stated\n');
    expect(findings).toEqual([{ code: `${NAME}/font-license-unstated`, severity: 'warning', path: 'fonts', message: expect.stringContaining('3 fonts have no license stated: Big Shoulders Display, Arial, IBM Plex Sans') }]);
  });

  it('says "1 font has" for one', () => {
    const one = planFonts(readBrand({ theme: { roles: { fontBody: 'Inter' } } }));
    expect(one.findings[0]!.message).toMatch(/^1 font has no license stated: Inter/);
  });

  it('gives a license only when the font token states one, and reads the family of an embedded font file', () => {
    const face = Buffer.from('@font-face{font-family:"Mono Sans";src:url(data:font/ttf;base64,AAAA)}').toString('base64');
    const brand = readBrand({
      theme: { roles: {}, fonts: [`data:text/css;base64,${face}`] },
      tokens: [{ path: 'font.family.mono', type: 'fontFamily', value: "'Mono Sans', monospace", extensions: { 'com.acme': { license: 'SIL OFL 1.1\nsee ofl.txt' } } }],
    });
    const { text, findings } = planFonts(brand);
    expect(text).toBe('Fonts\n\nMono Sans\n  Used for: font.family.mono\n  Source: a font file the brand embeds in its brand book; the file is not in this kit\n  License:\n    SIL OFL 1.1\n    see ofl.txt\n');
    expect(findings).toEqual([]);
  });

  it('prints the source and license a font token states, and counts a license address as a license', () => {
    const brand = readBrand({
      theme: { roles: {}, fonts: ['https://fonts.example/kinto.css'] },
      tokens: [
        { path: 'font.family.display', type: 'fontFamily', value: "'Kinto', sans-serif", blazon: { font: { source: 'https://kinto.example/fonts', license: 'OFL-1.1', licenseUrl: 'https://openfontlicense.org/' } } },
        { path: 'font.family.body', type: 'fontFamily', value: "'Mulish', sans-serif", blazon: { font: { licenseUrl: 'https://mulish.example/eula' } } },
        { path: 'font.family.mono', type: 'fontFamily', value: "'Plex Mono', monospace", extensions: { 'com.acme': { license: 'SIL OFL 1.1' } }, blazon: { font: { source: 'IBM' } } },
      ],
    });
    const { text, findings } = planFonts(brand);
    expect(text).toContain('Kinto\n  Used for: font.family.display\n  Source: https://kinto.example/fonts\n  License:\n    OFL-1.1\n  License text: https://openfontlicense.org/\n');
    expect(text).toContain('Mulish\n  Used for: font.family.body\n  Source: not stated\n  License: see https://mulish.example/eula\n');
    expect(text).toContain('Plex Mono\n  Used for: font.family.mono\n  Source: IBM\n  License:\n    SIL OFL 1.1\n');
    expect(findings).toEqual([]);
  });

  it('lets a stated source replace the one found in a stylesheet', () => {
    const brand = readBrand({
      theme: { roles: {}, fonts: [GOOGLE] },
      tokens: [{ path: 'font.family.display', type: 'fontFamily', value: "'IBM Plex Sans', sans-serif", blazon: { font: { source: 'IBM Plex, self-hosted', license: 'OFL-1.1' } } }],
    });
    expect(planFonts(brand).text).toContain('IBM Plex Sans\n  Used for: font.family.display\n  Source: IBM Plex, self-hosted\n  License:\n    OFL-1.1\n');
  });

  it('ignores a font fact of the wrong shape, as it ignores every field of the wrong shape', () => {
    const { text } = planFonts(readBrand({ tokens: [{ path: 'f', type: 'fontFamily', value: 'Kinto', blazon: { font: { source: 3, license: [], licenseUrl: {} } } }] }));
    expect(text).toContain('Kinto\n  Used for: f\n  Source: not stated\n  License: not stated\n');
  });

  it('reads a project end to end: a font file in the config is embedded so the PDF has no fallback for it, and the token facts reach fonts.txt', async () => {
    const root = writeProject({
      'tokens/type.json': {
        font: {
          $type: 'fontFamily',
          display: { $value: ['Kinto', 'sans-serif'], $extensions: { 'dev.blazon': { font: { source: 'Kinto Type Foundry', license: 'OFL-1.1', licenseUrl: 'https://openfontlicense.org/' } } } },
          body: { $value: ['Mulish', 'sans-serif'] },
        },
      },
      'fonts/Kinto.woff2': 'wOF2-not-really-a-font',
    });
    const config = { ...DEFAULT_CONFIG, fonts: [{ family: 'Kinto', file: 'fonts/Kinto.woff2' }] };
    const brand = readBrand(JSON.parse(formatBrandJson(await compileBlazonData(config, root), config, root)));
    expect(pdfFallbacks({ roles: { fontDisplay: "'Kinto', sans-serif", fontBody: "'Mulish', sans-serif" }, stylesheets: brand.stylesheets })).toEqual(['Mulish']);
    expect(planFonts(brand).text).toContain('Kinto\n  Used for: font.display\n  Source: Kinto Type Foundry\n  License:\n    OFL-1.1\n  License text: https://openfontlicense.org/\n');
  });

  it('writes no file when the brand names no font', () => {
    const { text, findings } = planFonts(readBrand({}));
    expect(text).toBeUndefined();
    expect(findings.map((f) => f.code)).toEqual([`${NAME}/font-none`]);
  });

  it('names the display and body families the PDF cannot set, which are those the brand does not embed', () => {
    const face = Buffer.from('@font-face{font-family:"Inter";src:url(data:font/ttf;base64,AAAA)}').toString('base64');
    const sheets = [`data:text/css;base64,${face}`, GOOGLE];
    expect(pdfFallbacks({ roles: { fontDisplay: 'Big Shoulders Display, sans-serif', fontBody: 'Inter' }, stylesheets: sheets })).toEqual(['Big Shoulders Display']);
    expect(pdfFallbacks({ roles: { fontDisplay: 'Inter', fontBody: 'Inter' }, stylesheets: sheets })).toEqual([]);
    expect(pdfFallbacks({ roles: { fontDisplay: 'sans-serif' }, stylesheets: [] })).toEqual([]);
  });
});

describe('the text', () => {
  it('writes the name and description as the boilerplate, and a plain line with a finding when there is no description', () => {
    expect(aboutText({ title: 'Acme Co', named: true, description: 'Acme makes anvils.' }).text).toBe('Acme Co\n\nAcme makes anvils.\n');
    const none = aboutText({ title: 'Acme Co', named: true });
    expect(none.text).toBe('Acme Co\n\nNo description is set in blazon.json.\n');
    expect(none.findings.map((f) => f.code)).toEqual([`${NAME}/about-no-description`]);
  });

  it('writes no about.txt for a brand with no name', () => {
    expect(aboutText({ title: 'Brand', named: false }).text).toBeUndefined();
  });

  it('lists only the parts that are in the kit, and holds no date', () => {
    const text = readmeText('Acme Co', ['logos/on-light-backgrounds/m.svg', 'colors/colors.txt', 'about.txt'], 'press-kit');
    expect(text).toMatch(/logos\/ +The logo files/);
    expect(readmeText('Acme Co', ['fonts.txt'], 'press-kit')).toContain('and under what license, where the brand states one.');
    expect(text).not.toMatch(/fonts\.txt|\.pdf/);
    expect(text).not.toMatch(/\d{4}/);
  });
});

/** The entries of a stored zip file by name, in the order they are in it */
function unzip(file: string): [string, Buffer][] {
  const data = fs.readFileSync(file);
  const end = data.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = data.readUInt16LE(end + 10);
  let at = data.readUInt32LE(end + 16);
  const out: [string, Buffer][] = [];
  for (let k = 0; k < count; k++) {
    const [size, nameLength, extraLength, commentLength, offset] = [data.readUInt32LE(at + 20), data.readUInt16LE(at + 28), data.readUInt16LE(at + 30), data.readUInt16LE(at + 32), data.readUInt32LE(at + 42)];
    const name = data.subarray(at + 46, at + 46 + nameLength).toString('ascii');
    const start = offset + 30 + data.readUInt16LE(offset + 26) + data.readUInt16LE(offset + 28);
    const body = data.subarray(start, start + size);
    if (data.readUInt32LE(at + 16) !== crc32(body)) throw new Error(`${name}: bad crc`);
    out.push([name, Buffer.from(body)]);
    at += 46 + nameLength + extraLength + commentLength;
  }
  return out;
}

/** Every file under a folder, by its path inside it */
const walk = (dir: string, base = ''): string[] =>
  fs.readdirSync(path.join(dir, base), { withFileTypes: true }).flatMap((item) => (item.isDirectory() ? walk(dir, `${base}${item.name}/`) : [`${base}${item.name}`]));

/** A built site with the logos' files, and a request for it */
function world(over: { brand?: object; options?: object } = {}) {
  const siteDir = tempDir('blazon-press-site-');
  const outDir = tempDir('blazon-press-out-');
  fs.mkdirSync(path.join(siteDir, 'brand-assets/logos'), { recursive: true });
  fs.writeFileSync(path.join(siteDir, 'index.html'), '<html></html>');
  for (const [name, fill] of [['mark-light', '#1E1F21'], ['mark-dark', '#F2F0EB'], ['draft', '#FF0000'], ['ai', '#00FF00'], ['ai-ok', '#0000FF']]) fs.writeFileSync(path.join(siteDir, `brand-assets/logos/${name}.svg`), SVG(fill!));
  const request = JSON.stringify({ v: 1, type: 'build', brand: brandOf(over.brand), options: over.options ?? {}, site_dir: siteDir, out_dir: outDir });
  return { siteDir, outDir, request };
}

const plugin = (input: string, env: Record<string, string> = {}) => {
  const result = spawnSync(process.execPath, ['--import', TSX, ENTRY], { input, encoding: 'utf-8', env: { PATH: '/usr/bin:/bin', HOME: os.homedir(), ...env } });
  return { status: result.status, out: result.stdout, err: result.stderr };
};
const findingsOf = (out: string) => (JSON.parse(out.split('\n')[0]!) as { findings: { code: string; severity: string; path: string }[] }).findings;

describe('the entry', () => {
  const NO_CHROME = { BLAZON_CHROME: '/nonexistent/chrome' };

  it('writes the folder and a zip of the same files, in sorted order, with the files as they are', () => {
    const made = world({ options: { pdf: false } });
    const ran = plugin(made.request);
    expect(ran.status, ran.out + ran.err).toBe(0);
    expect(fs.readdirSync(made.outDir).sort()).toEqual(['press-kit', 'press-kit.zip']);
    const folder = path.join(made.outDir, 'press-kit');
    expect(walk(folder)).toEqual(
      [
        'README.txt',
        'about.txt',
        'colors/colors.css',
        'colors/colors.json',
        'colors/colors.txt',
        'fonts.txt',
        'logos/logos.txt',
        'logos/on-dark-backgrounds/ai-ok.svg',
        'logos/on-dark-backgrounds/mark-dark.svg',
        'logos/on-light-backgrounds/mark-light.svg',
      ].sort(),
    );
    expect(fs.readFileSync(path.join(folder, 'logos/on-light-backgrounds/mark-light.svg'), 'utf-8')).toBe(SVG('#1E1F21'));
    const zipped = unzip(path.join(made.outDir, 'press-kit.zip'));
    expect(zipped.map(([name]) => name)).toEqual(walk(folder).map((name) => `press-kit/${name}`).sort());
    for (const [name, body] of zipped) expect(body.equals(fs.readFileSync(path.join(made.outDir, name))), name).toBe(true);
    expect(findingsOf(ran.out).map((f) => f.code)).toEqual([`${NAME}/logo-left-out`, `${NAME}/logo-left-out`, `${NAME}/color-left-out`, `${NAME}/color-not-hex`, `${NAME}/font-license-unstated`]);
  });

  it('writes the same bytes for the same request, and drops a file an earlier run left', () => {
    const made = world({ options: { pdf: false } });
    plugin(made.request);
    const first = fs.readFileSync(path.join(made.outDir, 'press-kit.zip'));
    fs.writeFileSync(path.join(made.outDir, 'press-kit/stale.txt'), 'old');
    plugin(made.request);
    expect(fs.readFileSync(path.join(made.outDir, 'press-kit.zip')).equals(first)).toBe(true);
    expect(fs.existsSync(path.join(made.outDir, 'press-kit/stale.txt'))).toBe(false);
  });

  it('writes into out_dir only, whatever the name option says', () => {
    for (const name of ['../escape', 'a/b', '/tmp/x', '.hidden']) {
      const made = world({ options: { pdf: false, name } });
      const ran = plugin(made.request);
      expect(ran.status).toBe(0);
      expect(fs.readdirSync(made.outDir).sort()).toEqual(['press-kit', 'press-kit.zip']);
      expect(fs.existsSync(path.join(path.dirname(made.outDir), 'escape'))).toBe(false);
    }
  }, 60_000);

  it('includes a color marked needs-review, labelled, when the unreviewed option is true', () => {
    const made = world({ options: { pdf: false, unreviewed: true } });
    expect(plugin(made.request).status).toBe(0);
    const folder = path.join(made.outDir, 'press-kit/colors');
    expect(fs.readFileSync(path.join(folder, 'colors.txt'), 'utf-8')).toContain('color.draft (unreviewed)');
    expect(JSON.parse(fs.readFileSync(path.join(folder, 'colors.json'), 'utf-8')).colors.find((c: { path: string }) => c.path === 'color.draft').review).toBe('needs-review');
  });

  it('names the folder and the zip by the name option, and takes the logos the option lists', () => {
    const made = world({ options: { pdf: false, name: 'acme-kit', logos: ['logos/mark-dark'] } });
    expect(plugin(made.request).status).toBe(0);
    expect(fs.readdirSync(made.outDir).sort()).toEqual(['acme-kit', 'acme-kit.zip']);
    expect(walk(path.join(made.outDir, 'acme-kit')).filter((file) => file.startsWith('logos/on-'))).toEqual(['logos/on-dark-backgrounds/mark-dark.svg']);
  });

  it('answers a wrong option with a finding, exit 0, and writes the kit', () => {
    const made = world({ options: { pdf: 'no', bogus: true } });
    const ran = plugin(made.request, NO_CHROME);
    expect(ran.status).toBe(0);
    expect(findingsOf(ran.out).filter((f) => f.code === `${NAME}/option-invalid`)).toHaveLength(2);
    expect(fs.existsSync(path.join(made.outDir, 'press-kit.zip'))).toBe(true);
  });

  it('leaves out a logo whose file is not in the site, with an error finding', () => {
    const made = world({ options: { pdf: false } });
    fs.rmSync(path.join(made.siteDir, 'brand-assets/logos/mark-dark.svg'));
    const ran = plugin(made.request);
    expect(ran.status).toBe(0);
    expect(findingsOf(ran.out)).toContainEqual({ code: `${NAME}/file-missing`, severity: 'error', path: 'logos/mark-dark', message: expect.any(String) });
    expect(walk(path.join(made.outDir, 'press-kit')).some((file) => file.endsWith('mark-dark.svg'))).toBe(false);
  });

  it('skips the PDF with a finding, never exit 2, when there is no browser, and writes the rest', () => {
    const made = world();
    const ran = plugin(made.request, NO_CHROME);
    expect(ran.status, ran.out + ran.err).toBe(0);
    const skipped = findingsOf(ran.out).filter((f) => f.code === `${NAME}/pdf-skipped`);
    expect(skipped).toHaveLength(1);
    expect(skipped[0]).toMatchObject({ severity: 'warning', message: expect.stringMatching(/no browser to draw the PDF with: BLAZON_CHROME names \/nonexistent\/chrome/) });
    expect(walk(path.join(made.outDir, 'press-kit')).some((file) => file.endsWith('.pdf'))).toBe(false);
    expect(fs.existsSync(path.join(made.outDir, 'press-kit.zip'))).toBe(true);
  });

  it('writes a kit with a brand that has no logo, no colors, no fonts and no description, and says so', () => {
    const made = world({ brand: { brand: { title: 'Bare' }, theme: {}, tokens: [], assets: [], logo: {} }, options: { pdf: false } });
    const ran = plugin(made.request);
    expect(ran.status, ran.out + ran.err).toBe(0);
    expect(findingsOf(ran.out).map((f) => f.code)).toEqual([`${NAME}/logo-none`, `${NAME}/color-none`, `${NAME}/font-none`, `${NAME}/about-no-description`]);
    expect(walk(path.join(made.outDir, 'press-kit'))).toEqual(['README.txt', 'about.txt']);
    expect(fs.readFileSync(path.join(made.outDir, 'press-kit/about.txt'), 'utf-8')).toBe('Bare\n\nNo description is set in blazon.json.\n');
  });
});

describe.skipIf(!CHROME)('the PDF, in a real browser', () => {
  it('draws one page, the same bytes every time, and puts it in the folder and the zip', () => {
    const made = world();
    const a = plugin(made.request, { BLAZON_CHROME: CHROME });
    expect(a.status, a.out + a.err).toBe(0);
    expect(findingsOf(a.out).some((f) => f.code === `${NAME}/pdf-skipped`)).toBe(false);
    expect(findingsOf(a.out).find((f) => f.code === `${NAME}/pdf-font-fallback`)).toMatchObject({ severity: 'info', message: expect.stringContaining('Big Shoulders Display or Arial') });
    const pdf = fs.readFileSync(path.join(made.outDir, 'press-kit/press-kit.pdf'));
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)).toHaveLength(1);
    const zipped = unzip(path.join(made.outDir, 'press-kit.zip')).find(([name]) => name === 'press-kit/press-kit.pdf')!;
    expect(zipped[1].equals(pdf)).toBe(true);
    const zip = fs.readFileSync(path.join(made.outDir, 'press-kit.zip'));
    expect(plugin(made.request, { BLAZON_CHROME: CHROME }).status).toBe(0);
    expect(fs.readFileSync(path.join(made.outDir, 'press-kit.zip')).equals(zip)).toBe(true);
  }, 120_000);
});
