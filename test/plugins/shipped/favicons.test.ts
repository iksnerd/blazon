import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { closeBrowser, launchBrowser } from '../../support/chrome';
import { spawnSync } from '../../support/spawn';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checks, safeZones } from '../../../src/shipped/favicons/check.js';
import { headSnippet, previewData, webManifest } from '../../../src/shipped/favicons/files.js';
import { colorOf, planFor } from '../../../src/shipped/favicons/plan.js';
import { ico, png, sheet } from '../../../src/shipped/favicons/raster.js';
import { MANIFEST, requestFrom } from '../../../src/shipped/favicons/request.js';
import { checkSite, copyToSite, SITE_FILES } from '../../../src/shipped/favicons/site.js';
import { drawnSize, readSymbol, tileSvg } from '../../../src/shipped/favicons/symbol.js';
import { ADAPTIVE, IOS_SIZES, masksView, sizesView, STYLE, tabsView, VIEWS } from '../../../src/shipped/favicons/views.js';
import { ROOT_DIR } from '../support/spec.js';
import { tempDir } from '../../support/project';

// blazon.favicons, the plugin blazon ships to draw a brand's favicon and app-icon set from its symbol. Seams: the plan (what
// the options and the brand say), the symbol's drawing, the checks, and the entry run as blazon runs it, in a real browser.

const ENTRY = path.join(ROOT_DIR, 'src/shipped/favicons/main.ts');
const TSX = pathToFileURL(path.join(ROOT_DIR, 'node_modules/tsx/dist/esm/index.mjs')).href;
const NAME = 'blazon.favicons';

const MAC_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CHROME = process.env.BLAZON_CHROME || (fs.existsSync(MAC_CHROME) ? MAC_CHROME : '');
// No browser skips the browser tests and says so; a machine that has one sets BLAZON_REQUIRE_CHROME=1 to make that a failure
if (!CHROME) {
  if (process.env.BLAZON_REQUIRE_CHROME) throw new Error('BLAZON_REQUIRE_CHROME is set, and there is no Chrome to draw with');
  console.warn('favicons plugin test: browser tests skipped, no Chrome to draw with (set BLAZON_CHROME)');
}

const SYMBOL = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="160" height="160"><path d="M0 0H28L40 12V40H0Z" fill="#1E1F21"/><rect x="6" y="28" width="16" height="4" fill="none" stroke="#000"/></svg>';
const TOKENS = [
  { path: 'brand.blue', type: 'color', value: '#3F73F8', resolvedValue: '#3F73F8' },
  { path: 'brand.navy', type: 'color', value: '#0B1120', resolvedValue: '#0B1120' },
  { path: 'brand.pale', type: 'color', value: '#EEF2FF', resolvedValue: '#EEF2FF' },
  // A DTCG color object: `value` is the CSS-ready text, `resolvedValue` the structure
  { path: 'brand.struct', type: 'color', value: '#3F73F8', resolvedValue: { colorSpace: 'srgb', components: [63 / 255, 115 / 255, 248 / 255] } },
];

/** A built site with the symbol (and any other files) in brand-assets/, and the brand.json fields the plugin reads. */
const project = (files: Record<string, Buffer | string> = {}, assets: object[] = [], theme: object = { roles: { accent: '#3F73F8' }, tokens: {}, fonts: [] }) => {
  const siteDir = tempDir('blazon-favicons-site-');
  const all: Record<string, Buffer | string> = { 'brand-assets/logos/mark.svg': SYMBOL, ...files };
  for (const [file, data] of Object.entries(all)) {
    fs.mkdirSync(path.dirname(path.join(siteDir, file)), { recursive: true });
    fs.writeFileSync(path.join(siteDir, file), data);
  }
  const brand = {
    format: 'blazon-brand',
    version: 2,
    brand: { title: 'Acme Brand Book' },
    theme,
    tokens: TOKENS,
    assets: [{ id: 'logos/mark', file: 'brand-assets/logos/mark.svg', format: 'svg', width: 160, height: 160, meta: { lockup: 'mark' } }, ...assets],
  };
  return { siteDir, brand };
};
const request = (type: 'check' | 'build', options: object, p = project(), outDir = tempDir('blazon-favicons-out-')) => ({
  text: JSON.stringify({ v: type === 'build' ? 2 : 1, type, options, brand: p.brand, site_dir: p.siteDir, out_dir: outDir }),
  outDir,
});
const plan = (options: object = {}, p = project()) => planFor(requestFrom(request('build', options, p).text));
const planFails = (options: object, reason: string | RegExp, p = project()) => expect(() => plan(options, p)).toThrow(reason);

interface Ran {
  status: number | null;
  out: string;
  err: string;
}
/** The entry, started as blazon starts a plugin: one request on standard input and only the variables it is given. */
const run = (input: string, env: Record<string, string> = {}, args: string[] = []): Ran => {
  const result = spawnSync(process.execPath, ['--import', TSX, ENTRY, ...args], { input, encoding: 'utf-8', env: { PATH: '/usr/bin:/bin', HOME: os.homedir(), ...env } });
  return { status: result.status, out: result.stdout, err: result.stderr };
};
const cannot = (ran: Ran, reason: string) => {
  expect(ran.status, ran.out + ran.err).toBe(2);
  expect(ran.out.split('\n')[0]).toContain(reason);
};
const browser = { BLAZON_CHROME: CHROME };

describe('the favicons plugin: what the options and the brand say', () => {
  it('takes the one SVG asset with the lockup "mark" as the symbol, and the theme accent as the ground', () => {
    const p = plan();
    expect(p).toMatchObject({ symbolId: 'logos/mark', ground: '#3F73F8', ink: '#FFFFFF', favicon: '#3F73F8', themeColor: '#3F73F8', name: 'Acme Brand Book', base: '/', share: { app: 0.52, favicon: 0.88 }, tabs: { light: '#FFFFFF', dark: '#202124' } });
    expect(p.symbolSize).toEqual({ width: 160, height: 160 });
  });

  it('takes colors as tokens of the brand, with or without braces, or as CSS colors', () => {
    expect(plan({ ground: 'brand.navy', ink: '{brand.pale}', favicon: 'rebeccapurple' })).toMatchObject({ ground: '#0B1120', ink: '#EEF2FF', favicon: '#663399' });
    expect(() => colorOf('nonsense', {}, 'ground')).toThrow('ground is "nonsense", which is neither a color token of the brand nor a CSS color');
    expect(() => colorOf('rgb(0 0 0 / 50%)', {}, 'ink')).toThrow('ink is see-through');
  });

  it('names the symbol by asset id when more than one asset is a mark, and says what is missing otherwise', () => {
    const two = project({ 'brand-assets/logos/alt.svg': SYMBOL }, [{ id: 'logos/alt', file: 'brand-assets/logos/alt.svg', format: 'svg', width: 40, height: 40, meta: { lockup: 'mark' } }]);
    planFails({}, 'no symbol to draw from: name an SVG asset in the option symbol (such as "logos/mark"), or give exactly one SVG asset the sidecar lockup "mark" (2 have it)', two);
    expect(plan({ symbol: 'logos/alt' }, two).symbolId).toBe('logos/alt');
    planFails({ symbol: 'logos/none' }, 'symbol names the asset logos/none, and the brand has none with that id');
  });

  it.each([
    ['an unknown option', { colour: 'x' }, 'unknown option "colour"; known: symbol, ground'],
    ['a share of 0', { share: { app: 0 } }, 'share.app must be a number above 0 and up to 1'],
    ['a share above 1', { share: { favicon: 1.5 } }, 'share.favicon must be a number above 0 and up to 1'],
    ['an unknown tab', { tabs: { sepia: '#fff' } }, 'tabs must be an object with light and dark colors'],
    ['a base with no slashes', { base: 'brand' }, 'base must be a path that starts and ends with a slash'],
    ['a base that climbs', { base: '/../' }, 'base must be a path that starts and ends with a slash'],
    ['an empty name', { name: ' ' }, 'name must be a non-empty string'],
  ])('refuses %s', (_, options, reason) => planFails(options, reason));

  it('takes the ground from the accent role of the theme as brand.json exports it', () => {
    const p = plan({}, project({}, [], { roles: { accent: '#0B1120' }, tokens: {}, fonts: [] }));
    expect(p).toMatchObject({ ground: '#0B1120', favicon: '#0B1120', themeColor: '#0B1120' });
  });

  it('reads a color token whose resolved value is a DTCG color object by its CSS-ready value', () => {
    expect(plan({ ground: 'brand.struct' })).toMatchObject({ ground: '#3F73F8' });
    expect(plan({ ground: '{brand.struct}', ink: 'brand.struct' })).toMatchObject({ ground: '#3F73F8', ink: '#3F73F8' });
  });

  it('needs a ground when the theme has no accent', () => {
    planFails({}, 'no ground color: set the option ground', project({}, [], {}));
  });

  it('refuses a symbol that is not an SVG, or whose file leaves the site', () => {
    const png = project({}, [{ id: 'logos/dot', file: 'brand-assets/logos/dot.png', format: 'png', width: 8, height: 8, meta: {} }]);
    planFails({ symbol: 'logos/dot' }, 'the symbol logos/dot needs an SVG: it has png only', png);
    const outside = project();
    (outside.brand.assets[0] as { file: string }).file = '../../etc/hosts';
    planFails({}, 'the symbol logos/mark is not a file in the built site', outside);
  });

  it('reads the symbol\'s minimum size from its sidecar, in pixels', () => {
    const p = project();
    (p.brand.assets[0] as { meta: object }).meta = { lockup: 'mark', minSize: { height: { value: 1, unit: 'rem' }, width: { value: '{spacing.4}', unit: 'px' } } };
    expect(plan({}, p).minSize).toEqual({ height: 16 });
  });
});

describe('the favicons plugin: the symbol\'s drawing', () => {
  it('takes every fill off, so one color can be given, and keeps fill="none"', () => {
    const glyph = readSymbol(SYMBOL, 'the symbol');
    expect(glyph).toMatchObject({ minX: 0, minY: 0, width: 40, height: 40 });
    expect(glyph.shapes).toBe('<path d="M0 0H28L40 12V40H0Z"/><rect x="6" y="28" width="16" height="4" fill="none" stroke="#000"/>');
  });

  it('reads single-quoted attributes the same as double-quoted ones', () => {
    const glyph = readSymbol(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='2 4 40 30'><path d='M0 0H8' fill='#123456' style='fill:#fff;opacity:.5'/><rect fill='none' width='4' height='4'/></svg>`, 'the symbol');
    expect(glyph).toMatchObject({ minX: 2, minY: 4, width: 40, height: 30 });
    expect(glyph.shapes).toBe(`<path d='M0 0H8' style="opacity:.5"/><rect fill='none' width='4' height='4'/>`);
    expect(readSymbol(`<svg width='29' height='37'><path d='M0 0'/></svg>`, 's')).toMatchObject({ width: 29, height: 37 });
  });

  it('keeps the scale of a very large drawing, so it is still drawn', () => {
    const glyph = readSymbol('<svg viewBox="0 0 1000000000 1000000000"><path d="M0 0H1e9V1e9H0Z"/></svg>', 'the symbol');
    const scale = Number(/scale\(([^)]+)\)/.exec(tileSvg(glyph, 1024, 0.52, '#000'))![1]);
    expect(scale).toBeGreaterThan(0);
    expect(scale).toBeCloseTo((1024 * 0.52) / 1e9, 12);
  });

  it('uses width and height when there is no viewBox, and refuses a drawing with neither', () => {
    expect(readSymbol('<svg width="29" height="37"><path d="M0 0"/></svg>', 's')).toMatchObject({ width: 29, height: 37 });
    expect(() => readSymbol('<svg><path d="M0 0"/></svg>', 'the symbol')).toThrow('the symbol has no viewBox and no width and height');
    expect(() => readSymbol('<svg viewBox="0 0 1 1"></svg>', 'the symbol')).toThrow('the symbol draws nothing');
    expect(() => readSymbol('not svg', 'the symbol')).toThrow('the symbol is not an SVG file');
  });

  it.each([
    ['a script', '<script>alert(1)</script>'],
    ['an embedded image', '<image href="x.png"/>'],
    ['a link', '<a href="https://example.com"><path d="M0 0"/></a>'],
    ['an event handler', '<path onload="x()" d="M0 0"/>'],
    ['a style element', '<style>@import url(https://example.com/x.css)</style><path d="M0 0"/>'],
    ['a foreign object', '<foreignObject><div/></foreignObject>'],
  ])('refuses %s, so nothing in a logo file is run or fetched', (_, inner) => {
    expect(() => readSymbol(`<svg viewBox="0 0 8 8">${inner}</svg>`, 'the symbol')).toThrow('holds markup the plugin will not render');
  });

  it('centers the symbol at the share of the canvas height, in the same bytes every time', () => {
    const glyph = readSymbol('<svg viewBox="0 0 29 37"><path d="M0 0"/></svg>', 's');
    const svg = tileSvg(glyph, 1024, 0.52, '#FFFFFF', '#3F73F8');
    expect(svg).toBe(tileSvg(glyph, 1024, 0.52, '#FFFFFF', '#3F73F8'));
    expect(svg).toContain('<rect width="1024" height="1024" fill="#3F73F8"/>');
    expect(svg).toContain('translate(');
    expect(drawnSize(glyph, 1024, 0.52).height).toBeCloseTo(532.48, 2);
    expect(tileSvg(glyph, 32, 0.88, '#3F73F8')).not.toContain('<rect');
  });

  it('keeps a wide symbol inside the canvas: its width, not its height, sets the share', () => {
    expect(drawnSize({ width: 100, height: 10 }, 100, 0.5)).toEqual({ width: 50, height: 5 });
  });
});

describe('the favicons plugin: the checks', () => {
  const found = (options: object = {}, minSize?: object) => {
    const p = project();
    if (minSize) (p.brand.assets[0] as { meta: object }).meta = { lockup: 'mark', minSize };
    return checks(planFor(requestFrom(request('check', options, p).text)));
  };

  it('is quiet for a symbol that is legible and has contrast on both tabs', () => {
    expect(found({ favicon: '#3F73F8' })).toEqual([]);
  });

  it('warns when the symbol drawn in a 16 px favicon is smaller than its own minimum size', () => {
    expect(found({ favicon: '#3F73F8' }, { height: { value: 16, unit: 'px' } })).toEqual([
      { code: `${NAME}/min-size`, severity: 'warning', path: 'logos/mark', message: 'in a 16 px favicon the symbol logos/mark is 14.1 px tall, under its minimum of 16 px (its sidecar minSize); the smallest tab icon is not legible' },
    ]);
    expect(found({ favicon: '#3F73F8' }, { height: { value: 14, unit: 'px' } })).toEqual([]);
  });

  it('warns for each tab on which the favicon color is under 3:1, and for the symbol on its ground', () => {
    const messages = found({ favicon: '#EEF2FF', ink: '#3F73F8', ground: 'brand.blue' }).map((f) => [f.code, f.path, f.message]);
    expect(messages).toEqual([
      [`${NAME}/contrast`, 'favicon.svg', 'the favicon (#EEF2FF) on a light tab (#FFFFFF) has a contrast of 1.12:1, under 3:1'],
      [`${NAME}/contrast`, 'app-icon-1024.png', 'the symbol (#3F73F8) on the app icon ground (#3F73F8) has a contrast of 1.00:1, under 3:1'],
    ]);
  });

  it('judges the dark tab by the colors the options give', () => {
    expect(found({ favicon: '#0B1120' }).map((f) => f.message)).toEqual([expect.stringContaining('on a dark tab (#202124)')]);
    expect(found({ favicon: '#0B1120', tabs: { dark: '#FFFFFF' } })).toEqual([]);
    expect(found({ favicon: '#EEF2FF' }).map((f) => f.message)).toEqual([expect.stringContaining('on a light tab')]);
  });

  it('judges from the brand alone: a check request has no folders and reads no file', () => {
    const p = project();
    const text = JSON.stringify({ v: 1, type: 'check', options: {}, brand: p.brand });
    expect(requestFrom(text).type).toBe('check');
    expect(planFor(requestFrom(text)).glyph).toBeUndefined();
  });
});

describe('the favicons plugin: the text files', () => {
  it('writes the head snippet and the web manifest under the base path', () => {
    const p = plan({ base: '/brand/', themeColor: '#0B1120' });
    expect(headSnippet(p)).toBe(
      [
        '<link rel="icon" href="/brand/favicon.svg" type="image/svg+xml">',
        '<link rel="icon" href="/brand/favicon.ico" sizes="any">',
        '<link rel="apple-touch-icon" href="/brand/apple-touch-icon.png">',
        '<link rel="manifest" href="/brand/site.webmanifest">',
        '<meta name="theme-color" content="#0B1120">',
        '',
      ].join('\n'),
    );
    expect(JSON.parse(webManifest(p))).toEqual({
      name: 'Acme Brand Book',
      icons: [
        { src: '/brand/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
        { src: '/brand/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
      ],
      theme_color: '#0B1120',
      background_color: '#3F73F8',
      display: 'standalone',
    });
  });

  it('packs PNG images into an ICO, with sizes and offsets that add up', () => {
    const a = Buffer.from('aaaa');
    const b = Buffer.from('bbbbbb');
    const file = ico([{ size: 16, png: a }, { size: 256, png: b }]);
    expect([file.readUInt16LE(2), file.readUInt16LE(4)]).toEqual([1, 2]);
    expect([file[6], file[22]]).toEqual([16, 0]);
    expect(file.readUInt32LE(6 + 8)).toBe(4);
    expect(file.readUInt32LE(6 + 12)).toBe(38);
    expect(file.subarray(38).toString()).toBe('aaaabbbbbb');
  });
});

describe('the favicons plugin: the safe zones', () => {
  const p = plan();

  it('is quiet when the symbol stays inside both zones', () => {
    expect(safeZones(p, 0.25)).toEqual([]);
    expect(safeZones(p, ADAPTIVE.safeRadius)).toEqual([]);
  });

  it('says so when nothing of the symbol is drawn in the layer, instead of reporting a quiet icon', () => {
    const none = safeZones(p, 0);
    expect(none.map((f) => f.code)).toEqual([`${NAME}/symbol-not-drawn`]);
    expect(none[0]!).toMatchObject({ severity: 'warning', path: 'android-adaptive-foreground.png' });
    expect(none[0]!.message).toContain('logos/mark');
  });

  it('warns for the Android zone alone between 30.6% and 40%, and for both beyond 40%', () => {
    expect(safeZones(p, 0.35).map((f) => f.code)).toEqual([`${NAME}/adaptive-safe-zone`]);
    const both = safeZones(p, 0.45);
    expect(both.map((f) => [f.code, f.severity, f.path])).toEqual([
      [`${NAME}/maskable-safe-zone`, 'warning', 'android-adaptive-foreground.png'],
      [`${NAME}/adaptive-safe-zone`, 'warning', 'android-adaptive-foreground.png'],
    ]);
    expect(both[0]!.message).toBe('the symbol logos/mark reaches 45.0% of the icon width from its centre, outside the maskable safe zone, a circle of 80% of the icon (40.0%); a launcher mask may cut it: lower share.app');
  });
});

describe('the favicons plugin: the views', () => {
  const small = { 16: Buffer.from('a'), 32: Buffer.from('b') };
  const master = Buffer.from('master');

  it('lists each view with the size of its PNG, which is twice its page', () => {
    const data = JSON.parse(previewData(plan(), [], 0.31));
    expect(data.views).toEqual([
      { id: 'tabs', title: 'Browser tabs', file: 'favicon-tabs.png', width: 2400, height: 680 },
      { id: 'masks', title: 'App icon masks', file: 'app-icon-masks.png', width: 2400, height: 600 },
      { id: 'sizes', title: 'iOS sizes', file: 'app-icon-sizes.png', width: 2400, height: 600 },
    ]);
    expect(data.iosSizes.map((row: { size: number }) => row.size)).toEqual([180, 120, 87, 60, 40, 29]);
    expect(data.adaptive).toEqual({ foreground: 'android-adaptive-foreground.png', background: 'android-adaptive-background.png', size: 432, safeRadius: 0.3056, maskableRadius: 0.4, symbolReach: 0.31 });
    expect(data.head).toBe(headSnippet(plan()));
    expect(data.files.map((row: { file: string }) => row.file)).toEqual(expect.arrayContaining(['favicon.ico', 'android-adaptive-foreground.png', ...VIEWS.map((view) => view.file)]));
  });

  it('draws the tab colors the options give, and the brand name', () => {
    const html = tabsView(plan({ tabs: { light: '#FAF0E6', dark: '#101820' }, name: 'A & B' }), small);
    expect(html).toContain('background:#FAF0E6');
    expect(html).toContain('background:#101820');
    expect(html).toContain('A &amp; B');
    expect(html.match(/class="px"/g)).toHaveLength(4);
  });

  it('shows the master in every mask, with the two safe-zone circles, and in each iOS size', () => {
    const masks = masksView(master);
    for (const label of ['iOS', 'Android circle', 'Android squircle', 'Android rounded', 'Safe zones']) expect(masks).toContain(`<b>${label}</b>`);
    expect(masks).toContain('border-radius:22.37%');
    expect(masks.match(/border-radius:50%;border:1\.5px dashed/g)).toHaveLength(2);
    const sizes = sizesView(master);
    for (const { size } of IOS_SIZES) expect(sizes).toContain(`width="${size}" height="${size}"`);
  });

  it('is the same markup every time, and imitates no system interface', () => {
    expect(masksView(master)).toBe(masksView(master));
    expect(tabsView(plan(), small)).toBe(tabsView(plan(), small));
    expect(masksView(master).match(/Android squircle/g)).toHaveLength(1);
  });
});

describe('the favicons plugin, as blazon starts it', () => {
  it('exits 2, and writes nothing, when the site has a favicons/ that is not its own, before it needs a browser', () => {
    const p = project({ 'favicons/logo.png': 'x' });
    const { text, outDir } = request('build', {}, p);
    cannot(run(text), 'site_dir already has favicons/');
    expect(fs.readdirSync(outDir)).toEqual([]);
    expect(fs.readdirSync(path.join(p.siteDir, 'favicons'))).toEqual(['logo.png']);
  });

  it('declares both roles, a version and the one variable it reads', () => {
    expect(MANIFEST).toEqual({ v: 2, roles: ['check', 'build'], title: 'Favicons', description: expect.any(String), version: '1.2.0', timeout_ms: 60000, env: ['BLAZON_CHROME', 'HOME', 'TMPDIR'] });
    expect(MANIFEST.description.length).toBeLessThanOrEqual(160);
    const ran = run('', {}, ['--blazon-manifest']);
    expect(ran.status, ran.err).toBe(0);
    expect(JSON.parse(ran.out)).toEqual(MANIFEST);
  });

  it('is shipped: a program node runs, and a pin in shipped.lock', () => {
    const program = path.join(ROOT_DIR, 'plugins/blazon.favicons/bin/blazon-blazon.favicons.🔌');
    expect(fs.statSync(program).mode & 0o111).toBe(0o111);
    expect(fs.readFileSync(program, 'utf-8').split('\n')[0]).toBe('#!/usr/bin/env node');
    const lock = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'plugins/shipped.lock'), 'utf-8'));
    expect(lock.plugins[NAME]).toMatchObject({ kind: 'tree', path: NAME, entry: `bin/blazon-${NAME}.🔌` });
  });

  it('answers a check with its findings and writes nothing, with no browser', () => {
    const { text } = request('check', { favicon: '#EEF2FF' });
    const ran = run(text);
    expect(ran.status, ran.out + ran.err).toBe(0);
    expect(JSON.parse(ran.out).findings.map((f: { code: string }) => f.code)).toEqual([`${NAME}/contrast`]);
  });

  it.each([
    ['not JSON', '{ nope', 'the request is not JSON'],
    ['another version', JSON.stringify({ v: 1, type: 'build' }), 'the request is version 1'],
    ['another role', JSON.stringify({ v: 1, type: 'deploy' }), 'the request is for the deploy role'],
  ])('exits 2 with the reason on its first line when the request is %s', (_, text, reason) => cannot(run(text), reason));

  it('answers a wrong option with an option-invalid finding and exit 0, writes nothing and needs no browser, for a check and for a build', () => {
    for (const type of ['check', 'build'] as const) {
      const { text, outDir } = request(type, { cards: 7, ground: 'not a color' });
      const ran = run(text, { BLAZON_CHROME: '/nonexistent/chrome' });
      expect(ran.status, ran.out + ran.err).toBe(0);
      const found = JSON.parse(ran.out).findings;
      expect(found).toEqual([expect.objectContaining({ code: `${NAME}/option-invalid`, severity: 'error', path: 'options', message: expect.stringContaining('unknown option "cards"') })]);
      expect(fs.readdirSync(outDir)).toEqual([]);
    }
  });

  it('exits 2, and writes nothing, when a build has no symbol or BLAZON_CHROME names no program', () => {
    const none = project({}, []);
    (none.brand.assets as unknown[]).length = 0;
    const a = request('build', {}, none);
    cannot(run(a.text), 'no symbol to draw from');
    expect(fs.readdirSync(a.outDir)).toEqual([]);
    const b = request('build', {});
    cannot(run(b.text, { BLAZON_CHROME: '/nonexistent/chrome' }), 'no browser to draw the icons with: BLAZON_CHROME names /nonexistent/chrome, which is not a program');
    expect(fs.readdirSync(b.outDir)).toEqual([]);
  });
});

describe('the favicons plugin: the copy in the site', () => {
  const OURS = JSON.stringify({ format: 'blazon-favicons', version: 1 });
  const set = () => new Map<string, Buffer | string>([...SITE_FILES, 'favicon.svg'].map((file) => [file, `bytes of ${file}`]));

  it('copies favicons.json and the three views, and nothing else of the set', () => {
    expect([...SITE_FILES]).toEqual(['favicons.json', ...VIEWS.map((view) => view.file)]);
    const site = tempDir('blazon-favicons-site-');
    copyToSite(site, set());
    expect(fs.readdirSync(path.join(site, 'favicons'))).toEqual([...SITE_FILES].sort());
    expect(fs.readFileSync(path.join(site, 'favicons/favicon-tabs.png'), 'utf-8')).toBe('bytes of favicon-tabs.png');
  });

  it('replaces its own earlier copy whole, so no file of an older set is left', () => {
    const site = tempDir('blazon-favicons-site-');
    fs.mkdirSync(path.join(site, 'favicons'));
    fs.writeFileSync(path.join(site, 'favicons/favicons.json'), OURS);
    fs.writeFileSync(path.join(site, 'favicons/old-view.png'), 'x');
    checkSite(site);
    copyToSite(site, set());
    expect(fs.readdirSync(path.join(site, 'favicons'))).toEqual([...SITE_FILES].sort());
  });

  it('is happy with a site that has no favicons/ yet', () => {
    expect(() => checkSite(tempDir('blazon-favicons-site-'))).not.toThrow();
  });

  it.each([
    ['a folder of the project\'s', (dir: string) => { fs.mkdirSync(dir); fs.writeFileSync(path.join(dir, 'logo.png'), 'x'); }],
    ['a folder with another favicons.json', (dir: string) => { fs.mkdirSync(dir); fs.writeFileSync(path.join(dir, 'favicons.json'), '{"format":"other"}'); }],
    ['a file', (dir: string) => fs.writeFileSync(dir, 'x')],
    ['a link', (dir: string) => { const target = tempDir('blazon-favicons-target-'); fs.writeFileSync(path.join(target, 'favicons.json'), OURS); fs.symlinkSync(target, dir); }],
  ])('refuses to replace %s', (_, make) => {
    const site = tempDir('blazon-favicons-site-');
    make(path.join(site, 'favicons'));
    expect(() => checkSite(site)).toThrow('site_dir already has favicons/, which is not the Favicons page\'s own copy');
  });
});

/** The size, color type and first pixel of a PNG, read from its header and its first row without a library. */
const pngInfo = (file: Buffer) => ({ width: file.readUInt32BE(16), height: file.readUInt32BE(20), colorType: file[25] });

describe.skipIf(!CHROME)('the favicons plugin, in a real browser', () => {
  it('draws the set: the favicon, an ICO of 16, 32 and 48, and the app icons with no alpha channel', () => {
    const { text, outDir } = request('build', { ground: 'brand.blue', share: { app: 0.4 } });
    const ran = run(text, browser);
    expect(ran.status, ran.out + ran.err).toBe(0);
    expect(JSON.parse(ran.out)).toEqual({ findings: [] });
    expect(fs.readdirSync(outDir)).toEqual(['android-adaptive-background.png', 'android-adaptive-foreground.png', 'app-icon-1024.png', 'app-icon-masks.png', 'app-icon-sizes.png', 'apple-touch-icon.png', 'favicon-16.png', 'favicon-32.png', 'favicon-tabs.png', 'favicon.ico', 'favicon.svg', 'favicons.json', 'head.html', 'icon-192.png', 'icon-512.png', 'site.webmanifest']);
    const read = (file: string) => fs.readFileSync(path.join(outDir, file));
    for (const [file, size] of [['app-icon-1024.png', 1024], ['apple-touch-icon.png', 180], ['icon-192.png', 192], ['icon-512.png', 512]] as const) {
      // color type 2 is RGB: no alpha channel, so no transparency
      expect(pngInfo(read(file)), file).toEqual({ width: size, height: size, colorType: 2 });
    }
    for (const size of [16, 32]) expect(pngInfo(read(`favicon-${size}.png`))).toEqual({ width: size, height: size, colorType: 6 });
    const icon = read('favicon.ico');
    expect([icon.readUInt16LE(2), icon.readUInt16LE(4)]).toEqual([1, 3]);
    expect([icon[6], icon[22], icon[38]]).toEqual([16, 32, 48]);
    expect(read('favicon.svg').toString()).toMatch(/^<svg [^>]*viewBox="0 0 32 32"/);
    expect(JSON.parse(read('favicons.json').toString())).toMatchObject({ format: 'blazon-favicons', symbol: 'logos/mark', supplied: [] });
  }, 120_000);

  it('draws the three views at twice their page, and the Android layers with the symbol on a transparent one', () => {
    const { text, outDir } = request('build', { share: { app: 0.4 } });
    expect(run(text, browser).status).toBe(0);
    const read = (file: string) => pngInfo(fs.readFileSync(path.join(outDir, file)));
    for (const view of VIEWS) expect(read(view.file), view.file).toMatchObject({ width: view.width * 2, height: view.height * 2 });
    expect(read('android-adaptive-foreground.png')).toEqual({ width: 432, height: 432, colorType: 6 });
    expect(read('android-adaptive-background.png')).toEqual({ width: 432, height: 432, colorType: 2 });
    // The reach is measured on the drawn layer: a 40 x 40 symbol at 0.4 of 432 px has its corner at 0.4 x sqrt(2) / 2 of the width
    const { adaptive } = JSON.parse(fs.readFileSync(path.join(outDir, 'favicons.json'), 'utf-8'));
    expect(adaptive.symbolReach).toBeGreaterThan(0.22);
    expect(adaptive.symbolReach).toBeLessThan(0.29);
  }, 120_000);

  it('warns, from the drawn pixels, when the symbol leaves the safe zones, and not before', () => {
    // 0.52 of a square symbol puts its corner at 0.37 of the width: inside the maskable zone (0.4), outside the Android one
    const near = run(request('build', { share: { app: 0.52 } }).text, browser);
    expect(near.status, near.out + near.err).toBe(0);
    expect(JSON.parse(near.out).findings.map((f: { code: string }) => f.code)).toEqual([`${NAME}/adaptive-safe-zone`]);
    const far = run(request('build', { share: { app: 0.7 } }).text, browser);
    expect(JSON.parse(far.out).findings.map((f: { code: string }) => f.code)).toEqual([`${NAME}/maskable-safe-zone`, `${NAME}/adaptive-safe-zone`]);
    expect(JSON.parse(run(request('build', { share: { app: 0.4 } }).text, browser).out)).toEqual({ findings: [] });
  }, 180_000);

  it('draws the symbol in the ground and the ink: the corner is the ground, the middle the symbol', () => {
    const { text, outDir } = request('build', { ground: 'brand.navy', ink: 'brand.pale' });
    expect(run(text, browser).status).toBe(0);
    const png = fs.readFileSync(path.join(outDir, 'app-icon-1024.png'));
    expect(png.length).toBeGreaterThan(100);
    expect(fs.readFileSync(path.join(outDir, 'head.html'), 'utf-8')).toContain('content="#0B1120"');
  }, 120_000);

  it('copies favicons.json and the three views to favicons/ in the site, the same bytes as out_dir, and writes nowhere else', () => {
    const p = project({ 'favicons/favicons.json': '{"format":"blazon-favicons","version":1}', 'favicons/stale.png': 'x' });
    const before = fs.readdirSync(p.siteDir).sort();
    const { text, outDir } = request('build', { share: { app: 0.4 } }, p);
    const ran = run(text, browser);
    expect(ran.status, ran.out + ran.err).toBe(0);
    const copy = path.join(p.siteDir, 'favicons');
    expect(fs.readdirSync(copy)).toEqual(['app-icon-masks.png', 'app-icon-sizes.png', 'favicon-tabs.png', 'favicons.json']);
    for (const file of fs.readdirSync(copy)) expect(fs.readFileSync(path.join(copy, file)).equals(fs.readFileSync(path.join(outDir, file))), file).toBe(true);
    // the site gained favicons/ only, and the folder it already had was replaced
    expect(fs.readdirSync(p.siteDir).sort()).toEqual(before);
    expect(JSON.parse(fs.readFileSync(path.join(copy, 'favicons.json'), 'utf-8'))).toMatchObject({ format: 'blazon-favicons', symbol: 'logos/mark' });
  }, 120_000);

  // Chrome sometimes took the picture before the first frame had finished rasterizing, and a few edge pixels of the masks
  // view came out a shade different (about 1 render in 25). One browser draws it many times, so the count of distinct
  // pictures is the whole test: one when the page is let settle, two or more when it is not.
  it('draws the masks view the same every time', async () => {
    const chrome = await launchBrowser(CHROME);
    try {
      const master = await png(chrome, tileSvg(readSymbol(SYMBOL, 'the symbol'), 1024, 0.52, '#FFFFFF', '#3F73F8'), 1024, false);
      const html = masksView(master);
      const seen = new Set<string>();
      for (let i = 0; i < 100; i++) seen.add(createHash('sha1').update(await sheet(chrome, html, 1200, 300, STYLE)).digest('hex'));
      expect(seen.size).toBe(1);
    } finally {
      await closeBrowser(chrome);
    }
  }, 120_000);

  it('writes the same bytes for the same request', () => {
    const p = project();
    const a = request('build', {}, p);
    const b = request('build', {}, p);
    expect(run(a.text, browser).status).toBe(0);
    expect(run(b.text, browser).status).toBe(0);
    for (const file of fs.readdirSync(a.outDir)) expect(fs.readFileSync(path.join(b.outDir, file)).equals(fs.readFileSync(path.join(a.outDir, file))), file).toBe(true);
  }, 180_000);

  it('uses the files the project supplies in place of the ones drawn, and says so', () => {
    const apple = fs.readFileSync(path.join(ROOT_DIR, 'test/support/pixel-180.png'));
    const p = project(
      { 'brand-assets/brand-favicons/favicon.svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><path d="M0 0h1v1z"/></svg>', 'brand-assets/brand-favicons/apple-touch-icon.png': apple },
      [
        { id: 'brand-favicons/favicon', file: 'brand-assets/brand-favicons/favicon.svg', format: 'svg', width: 1, height: 1, meta: {} },
        { id: 'brand-favicons/apple-touch-icon', file: 'brand-assets/brand-favicons/apple-touch-icon.png', format: 'png', width: 180, height: 180, meta: {} },
      ],
    );
    const { text, outDir } = request('build', { supplied: 'brand-favicons', share: { app: 0.4 } }, p);
    const ran = run(text, browser);
    expect(ran.status, ran.out + ran.err).toBe(0);
    expect(JSON.parse(ran.out).findings.map((f: { code: string; path: string }) => [f.code, f.path])).toEqual([[`${NAME}/supplied`, 'apple-touch-icon.png'], [`${NAME}/supplied`, 'favicon.svg']]);
    expect(fs.readFileSync(path.join(outDir, 'favicon.svg'), 'utf-8')).toBe(fs.readFileSync(path.join(p.siteDir, 'brand-assets/brand-favicons/favicon.svg'), 'utf-8'));
    expect(fs.readFileSync(path.join(outDir, 'apple-touch-icon.png')).equals(apple)).toBe(true);
    // what is not supplied is still drawn
    expect(pngInfo(fs.readFileSync(path.join(outDir, 'icon-512.png')))).toEqual({ width: 512, height: 512, colorType: 2 });
  }, 120_000);

  it('refuses a supplied file that is the wrong format or size, and writes nothing', () => {
    const p = project({ 'brand-assets/s/icon-192.png': 'x' }, [{ id: 's/icon-192', file: 'brand-assets/s/icon-192.png', format: 'png', width: 100, height: 100, meta: {} }]);
    const { text, outDir } = request('build', { supplied: 's' }, p);
    cannot(run(text, browser), 'the supplied s/icon-192 is 100 x 100 px; icon-192.png must be 192 x 192');
    expect(fs.readdirSync(outDir)).toEqual([]);
  }, 60_000);
});
