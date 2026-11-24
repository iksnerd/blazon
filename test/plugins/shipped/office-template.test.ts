import { describe, it, expect } from 'vitest';
import { pathToFileURL } from 'node:url';
import { inflateRawSync } from 'node:zlib';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from '../../support/spawn';
import { readBrand as readBrandRaw } from '../../../src/shipped/office-template/brand.js';
import { contrast, luminance, mix, parseColor, toHex } from '../../../src/shipped/shared/color.js';
import { FALLBACK_LINE_HEIGHT, fontOf, planFonts, planHeading } from '../../../src/shipped/office-template/fonts.js';
import { chooseLogos, sizeLogo } from '../../../src/shipped/office-template/logo.js';
import { parseOptions } from '../../../src/shipped/office-template/options.js';
import { slug } from '../../../src/shipped/shared/slug.js';
import { planPalette } from '../../../src/shipped/office-template/palette.js';
import { keepOut, overlaps, planLayouts, W } from '../../../src/shipped/office-template/plan.js';
import { NAME } from '../../../src/shipped/office-template/request.js';
import { MARGIN as DECK_MARGIN, PAGE as DECK_PAGE } from '../../../src/shipped/brand-deck/plan/constants.js';
import { pathSegments, readSvg } from '../../../src/shipped/office-template/svg.js';
import { crc32, zipOf } from '../../../src/shipped/shared/zip.js';
import { ROOT_DIR } from '../support/spec.js';
import { tempDir } from '../../support/project';

// A brand.json always carries its format and version (RFC 0001); a fixture that is only a piece of one gets them here
const readBrand = (brand: object) => readBrandRaw({ format: 'blazon-brand', version: 2, ...brand });

// blazon.office-template, the plugin blazon ships to write an editable PowerPoint template. Seams: the pure parts (colors, the palette
// mapping, the font fallback, the options, where the logo and the placeholders go, the SVG as shapes), and the entry, run as blazon
// runs it, whose files are unzipped and read.

const ENTRY = path.join(ROOT_DIR, 'src/shipped/office-template/main.ts');
const TSX = pathToFileURL(path.join(ROOT_DIR, 'node_modules/tsx/dist/esm/index.mjs')).href;

const roles = { background: '#F2F0EB', canvas: '#D9D6CF', text: '#1E1F21', muted: '#54585D', accent: '#FF5A1F', inverse: '#1E1F21', fontDisplay: "'Big Shoulders Display', sans-serif", fontBody: 'Arial, sans-serif' };
const LIGHT_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 40" width="200" height="80"><path fill-rule="evenodd" d="M0 0H60V40H0ZM10 10H20V20H10Z" fill="#1E1F21"/><path d="M70 0L100 0L100 40Z" fill="#FF5A1F"/></svg>';
const DARK_SVG = LIGHT_SVG.replace('#1E1F21', '#F2F0EB');
const asset = (id: string, extra: object = {}) => ({ id, file: `brand-assets/${id}.svg`, format: 'svg', width: 200, height: 80, ...extra });
const LOGOS = [
  asset('logos/mark-light', { meta: { background: 'light', clearSpace: { value: 20, unit: 'px' }, minSize: { width: { value: 100, unit: 'px' } } } }),
  asset('logos/mark-dark', { meta: { background: 'dark', clearSpace: { value: 20, unit: 'px' } } }),
];
const brandOf = (over: object = {}) => ({
  format: 'blazon-brand',
  version: 2,
  brand: { title: 'Acme Co' },
  theme: { roles },
  tokens: [{ path: 'color.hazard', type: 'color', value: '#F2C230' }, { path: 'color.alias', type: 'color', value: '#FF5A1F', aliasOf: 'color.hazard' }],
  assets: LOGOS,
  logo: { onLight: 'brand-assets/logos/mark-light.svg', onDark: 'brand-assets/logos/mark-dark.svg' },
  ...over,
});

describe('colors', () => {
  it('reads hex and rgb() and nothing else', () => {
    expect(parseColor('#f2c')).toEqual([255, 34, 204]);
    expect(parseColor('#FF5A1F')).toEqual([255, 90, 31]);
    expect(parseColor('#FF5A1F80')).toEqual([255, 90, 31]);
    expect(parseColor('rgb(255 90 31 / 0.5)')).toEqual([255, 90, 31]);
    expect(parseColor('rgba(100%, 0%, 0%, 1)')).toEqual([255, 0, 0]);
    for (const odd of ['oklch(0.7 0.1 30)', 'red', 'var(--x)', '#12', 7, undefined]) expect(parseColor(odd)).toBeUndefined();
  });

  it('writes hex in capitals, and measures luminance, contrast and mixes', () => {
    expect(toHex([255, 90, 31])).toBe('FF5A1F');
    expect(luminance([255, 255, 255])).toBeCloseTo(1);
    expect(contrast([0, 0, 0], [255, 255, 255])).toBeCloseTo(21);
    expect(mix([0, 0, 0], [255, 255, 255], 0.5)).toEqual([128, 128, 128]);
  });
});

describe('the palette', () => {
  const plan = (rolesIn: Record<string, string>, colors: { path: string; value: string }[] = []) => planPalette({ roles: rolesIn, colors });

  it('maps the roles to the theme slots', () => {
    const { palette, findings } = plan(roles, [{ path: 'color.hazard', value: '#F2C230' }, { path: 'color.dupe', value: '#FF5A1F' }]);
    expect(findings).toEqual([]);
    expect(palette).toMatchObject({ dk1: '1E1F21', lt1: 'F2F0EB', dk2: '1E1F21', lt2: 'D9D6CF', hlink: 'FF5A1F', folHlink: '54585D' });
    // accent1 is the accent; then muted, then the brand's colors the theme lacks, then tints; none twice
    expect(palette.accents.slice(0, 3)).toEqual(['FF5A1F', '54585D', 'F2C230']);
    expect(new Set(palette.accents).size).toBe(6);
    expect(palette.slots).toEqual({ background: 'lt1', text: 'dk1', inverse: 'dk2', canvas: 'lt2' });
  });

  it('puts a dark brand\'s background in dk1 and says where each role is', () => {
    const { palette } = plan({ ...roles, background: '#101010', text: '#F5F5F5', inverse: '#FAFAFA', canvas: '#202020' });
    expect(palette).toMatchObject({ dk1: '101010', lt1: 'F5F5F5', dk2: '202020', lt2: 'FAFAFA' });
    expect(palette.slots).toEqual({ background: 'dk1', text: 'lt1', inverse: 'lt2', canvas: 'dk2' });
  });

  it('uses a default and says so for a role that is missing or not a color it reads, and warns of low contrast', () => {
    const { palette, findings } = plan({ text: 'oklch(0.2 0 0)', background: '#FFFFFF', accent: '#777777' });
    expect(findings.map((f) => `${f.code} ${f.path}`)).toEqual([
      `${NAME}/color-role-missing theme.roles.text`,
      `${NAME}/color-role-missing theme.roles.inverse`,
      `${NAME}/color-role-missing theme.roles.canvas`,
    ]);
    expect(palette.dk1).toBe('111111');
    expect(plan({ ...roles, text: '#CCCCCC' }).findings.map((f) => f.code)).toEqual([`${NAME}/low-contrast`]);
  });

  it('always has six distinct accents, even from a gray accent and no tokens', () => {
    expect(new Set(plan({ ...roles, accent: '#808080' }).palette.accents).size).toBe(6);
  });
});

describe('the fonts', () => {
  it('takes the first named family of a stack, not a generic one', () => {
    expect(fontOf("'Big Shoulders Display', sans-serif")).toBe('Big Shoulders Display');
    expect(fontOf('"IBM Plex Sans",Arial')).toBe('IBM Plex Sans');
    expect(fontOf('sans-serif')).toBeUndefined();
    expect(fontOf('var(--font), Inter')).toBe('Inter');
    expect(fontOf(undefined)).toBeUndefined();
  });

  it('says a brand font is not embedded, and a system font nothing', () => {
    const { major, minor, findings } = planFonts(roles);
    expect([major, minor]).toEqual(['Big Shoulders Display', 'Arial']);
    expect(findings.map((f) => [f.code, f.severity])).toEqual([[`${NAME}/font-not-embedded`, 'info']]);
  });

  it('falls back to Arial with a warning when a role names no font', () => {
    const { major, minor, findings } = planFonts({ fontDisplay: 'sans-serif' });
    expect([major, minor]).toEqual(['Arial', 'Arial']);
    expect(findings.map((f) => [f.code, f.severity])).toEqual([[`${NAME}/font-fallback`, 'warning'], [`${NAME}/font-fallback`, 'warning']]);
  });
});

describe('the title style', () => {
  const style = (path: string, family: string, sizePx: number, over: object = {}) => ({ path, family, sizePx, ...over });

  it('prefers a display style, then h1, over a larger one that is not a headline, and takes the largest of a name', () => {
    const font = 'Acme Sans';
    const stat = style('type.marketing.stat', font, 96, { lineHeight: 1.0833 });
    const display = style('type.marketing.display', font, 72, { lineHeight: 1.1111, letterSpacingEm: -0.025 });
    const h1 = style('type.marketing.h1', font, 56, { lineHeight: 1.2 });
    expect(planHeading([stat, h1, display], font)).toEqual({ lineHeight: 1.1111, tracking: -0.025, from: 'type.marketing.display' });
    expect(planHeading([stat, h1], font)).toMatchObject({ from: 'type.marketing.h1' });
    expect(planHeading([stat, display, style('type.product.display', font, 80, { lineHeight: 1.05 })], font)).toMatchObject({ from: 'type.product.display' });
    expect(planHeading([stat, style('type.marketing.h2', font, 40)], font)).toMatchObject({ from: 'type.marketing.stat' });
  });

  it('takes the line height and tracking of the largest style in the heading font when none is named display or h1', () => {
    const styles = [
      style('type.body', 'Arial', 80, { lineHeight: 1.5 }),
      style('type.h2', 'Big Shoulders Display', 40, { lineHeight: 1.2 }),
      style('type.title', 'Big Shoulders Display', 96, { lineHeight: 1.15, letterSpacingEm: -0.02 }),
    ];
    expect(planHeading(styles, 'Big Shoulders Display')).toEqual({ lineHeight: 1.15, tracking: -0.02, from: 'type.title' });
  });

  it('falls back to a line height of 1.1 and no tracking, and says so in the manual, when the tokens give none', () => {
    expect(FALLBACK_LINE_HEIGHT).toBe(1.1);
    expect(planHeading(undefined, 'Acme Sans')).toEqual({ lineHeight: 1.1 });
    expect(planHeading([style('type.body', 'Arial', 16, { lineHeight: 1.5 })], 'Acme Sans')).toEqual({ lineHeight: 1.1 });
    expect(planHeading([style('type.h1', 'Acme Sans', 64)], 'Acme Sans')).toEqual({ lineHeight: 1.1, from: 'type.h1' });
  });

  it('reads the tokens from brand.json: px and rem sizes, em tracking, no aliases, no other unit', () => {
    const typed = (path: string, resolvedValue: object, extra: object = {}) => ({ path, type: 'typography', value: '', resolvedValue, ...extra });
    const read = readBrand({
      tokens: [
        typed('type.a', { fontFamily: ['Acme Sans', 'sans-serif'], fontSize: { value: 4, unit: 'rem' }, lineHeight: 1.2, letterSpacing: { value: -0.01, unit: 'em' } }),
        typed('type.b', { fontFamily: 'Acme Sans', fontSize: { value: 50, unit: 'px' }, lineHeight: 'normal', letterSpacing: { value: -1, unit: 'px' } }),
        typed('type.alias', { fontFamily: 'Acme Sans', fontSize: { value: 99, unit: 'px' } }, { aliasOf: 'type.a' }),
      ],
    });
    expect(read.typography).toEqual([
      { path: 'type.a', family: 'Acme Sans', sizePx: 64, lineHeight: 1.2, letterSpacingEm: -0.01 },
      { path: 'type.b', family: 'Acme Sans', sizePx: 50 },
    ]);
  });
});

describe('the accents option', () => {
  const colors = [{ path: 'color.hazard', value: '#F2C230' }, { path: 'color.teal', value: '#2A9D8F' }, { path: 'color.pink', value: '#E83E8C' }];

  it('puts the named tokens and colors in accent2 onward, ahead of muted, and fills the rest as before', () => {
    const { palette, findings } = planPalette({ roles, colors }, ['color.pink', 'color.teal', '#8E44AD']);
    expect(findings).toEqual([]);
    expect(palette.accents.slice(0, 4)).toEqual(['FF5A1F', 'E83E8C', '2A9D8F', '8E44AD']);
    expect(palette.accents).toHaveLength(6);
    expect(new Set(palette.accents).size).toBe(6);
  });

  it('takes an alias by its path, as the color it resolves to, and still leaves aliases out of the plugin\'s own pick', () => {
    const named = [...colors, { path: 'chart.mix.2', value: '#E83E8C' }];
    const { palette, findings } = planPalette({ roles, colors, named }, ['chart.mix.2']);
    expect(findings).toEqual([]);
    expect(palette.accents[1]).toBe('E83E8C');
    const read = readBrand({ tokens: [{ path: 'color.pink', type: 'color', value: '#E83E8C' }, { path: 'chart.mix.2', type: 'color', value: '#E83E8C', aliasOf: 'color.pink' }] });
    expect(read.colors.map((c) => c.path)).toEqual(['color.pink']);
    expect(read.named.map((c) => c.path)).toEqual(['color.pink', 'chart.mix.2']);
  });

  it('is the same as no option when the option names nothing', () => {
    expect(planPalette({ roles, colors }, []).palette).toEqual(planPalette({ roles, colors }).palette);
  });

  it('reports a name that is no token and no color, skips it, and keeps the rest', () => {
    const { palette, findings } = planPalette({ roles, colors }, ['color.nope', 'color.teal']);
    expect(findings.map((f) => f.code)).toEqual([`${NAME}/option-invalid`]);
    expect(findings[0]!.message).toContain('"color.nope"');
    expect(palette.accents[1]).toBe('2A9D8F');
  });

  it('skips a color the theme already has instead of using it twice', () => {
    const { palette } = planPalette({ roles, colors }, ['#FF5A1F', 'color.teal']);
    expect(palette.accents[1]).toBe('2A9D8F');
    expect(new Set(palette.accents).size).toBe(6);
  });

  it('is read as a list of one to five names', () => {
    const known = new Set<string>();
    expect(parseOptions({ accents: ['color.a', ' #fff '] }, known)).toEqual({ options: { formats: ['potx', 'pptx'], accents: ['color.a', '#fff'] }, findings: [] });
    for (const bad of [[], 'color.a', ['a', 'b', 'c', 'd', 'e', 'f'], [''], [3]]) {
      const { options, findings } = parseOptions({ accents: bad }, known);
      expect(findings.map((f) => f.code)).toEqual([`${NAME}/option-invalid`]);
      expect(options.accents).toBeUndefined();
    }
  });
});

describe('options', () => {
  const known = new Set(['logos/mark-light']);

  it('has defaults: both formats, the title for a name, the brand\'s own logo', () => {
    expect(parseOptions({}, known)).toEqual({ options: { formats: ['potx', 'pptx'] }, findings: [] });
  });

  it('reports each wrong option as option-invalid, and keeps the rest', () => {
    const { options, findings } = parseOptions({ bogus: 1, name: '../x', logo: 'logos/nope', formats: ['key'] }, known);
    expect(findings.map((f) => f.code)).toEqual(Array(4).fill(`${NAME}/option-invalid`));
    expect(options).toEqual({ formats: ['potx', 'pptx'] });
    expect(parseOptions([], known).findings).toHaveLength(1);
    expect(parseOptions({ logo: 3 }, known).findings).toHaveLength(1);
  });

  it('takes a good name, logo and formats', () => {
    expect(parseOptions({ name: 'acme.v2', logo: 'logos/mark-light', formats: ['pptx', 'pptx'] }, known)).toEqual({ options: { name: 'acme.v2', logo: 'logos/mark-light', formats: ['pptx'] }, findings: [] });
  });

  it('makes a file name of a title that cannot leave out_dir', () => {
    expect(slug('Acme Co.')).toBe('acme-co');
    expect(slug('../../etc/passwd')).toBe('etc-passwd');
    expect(slug('///', 'brand-template')).toBe('brand-template');
  });
});

describe('the logo', () => {
  const read = readBrand(brandOf());
  const light = read.assets.get('logos/mark-light')!;

  it('chooses the logo made for each surface, and the named one first', () => {
    const chosen = chooseLogos(read, {});
    expect([chosen.light?.id, chosen.dark?.id]).toEqual(['logos/mark-light', 'logos/mark-dark']);
    const only = readBrand(brandOf({ assets: [LOGOS[0]], logo: {} }));
    expect(chooseLogos(only, {}).dark).toBeUndefined();
    const named = readBrand(brandOf({ logo: {} }));
    expect(chooseLogos(named, { logo: 'logos/mark-dark' }).dark?.id).toBe('logos/mark-dark');
  });

  it('judges a logo with no background by brand.json\'s own pairing', () => {
    const bare = readBrand(brandOf({ assets: [asset('logos/a'), asset('logos/b', { file: 'brand-assets/b.svg' })], logo: { onDark: 'brand-assets/b.svg' } }));
    expect([chooseLogos(bare, {}).light?.id, chooseLogos(bare, {}).dark?.id]).toEqual(['logos/a', 'logos/b']);
  });

  it('sizes the logo within the sidecar\'s smallest and largest, with its clear space scaled with it', () => {
    // 200 px wide artwork, clear space 20 px: drawn 1,143,000 EMU (1.25 in) wide, the space is a tenth of it
    expect(sizeLogo(light, 1143000)).toEqual({ width: 1143000, height: 457200, clear: 114300, defaulted: false });
    // minSize.width is 100 px = 952,500 EMU, so a smaller target is raised to it
    expect(sizeLogo(light, 500000)!.width).toBe(952500);
    const capped = { ...light, meta: { ...light.meta, maxSize: { width: { value: 50, unit: 'px' as const } }, minSize: undefined } };
    expect(sizeLogo(capped, 5000000)!.width).toBe(476250);
  });

  it('keeps a quarter of the height clear when the sidecar states none, and cannot place a logo with no size', () => {
    const bare = { ...light, meta: {} };
    expect(sizeLogo(bare, 2000000)).toMatchObject({ clear: 200000, defaulted: true });
    expect(sizeLogo({ ...light, size: undefined }, 1)).toBeUndefined();
  });
});

describe('the layouts', () => {
  const read = readBrand(brandOf());
  const { palette } = planPalette(read);
  const plan = planLayouts(palette, chooseLogos(read, {}));

  it('has the five layouts, each with a title', () => {
    expect(plan.layouts.map((l) => l.name)).toEqual(['Cover', 'Section divider', 'Title and content', 'Two columns', 'Closing']);
    for (const layout of plan.layouts) expect(layout.placeholders.some((p) => p.kind === 'title' || p.kind === 'ctrTitle'), layout.name).toBe(true);
    expect(plan.layouts.find((l) => l.name === 'Two columns')!.placeholders.filter((p) => p.kind === 'content')).toHaveLength(2);
  });

  it('puts the logo made for the surface on it: dark on the cover and the closing, light on the master', () => {
    expect(plan.master.logo!.asset.id).toBe('logos/mark-light');
    expect(plan.layouts.filter((l) => l.surface === 'inverse').map((l) => [l.name, l.logo!.asset.id])).toEqual([['Cover', 'logos/mark-dark'], ['Section divider', 'logos/mark-dark'], ['Closing', 'logos/mark-dark']]);
    expect(plan.layouts.filter((l) => l.showMaster).every((l) => !l.logo)).toBe(true);
  });

  it('uses the side margin of the brand deck, as the same share of the slide\'s width', () => {
    const share = DECK_MARGIN / DECK_PAGE.width;
    for (const layout of [plan.master, ...plan.layouts]) {
      for (const p of layout.placeholders.filter((p) => p.kind !== 'sldNum' && !p.half)) {
        expect(p.box.x / W, p.name).toBeCloseTo(share, 5);
        expect((W - p.box.x - p.box.width) / W, p.name).toBeCloseTo(share, 5);
      }
    }
  });

  it('sets the section divider on the inverse surface like the cover, with the master\'s shapes hidden', () => {
    const divider = plan.layouts.find((l) => l.name === 'Section divider')!;
    expect(divider.surface).toBe('inverse');
    expect(divider.showMaster).toBe(false);
  });

  it('keeps every placeholder out of the logo\'s clear space, and the logo clear of the slide\'s edge', () => {
    for (const layout of plan.layouts) {
      const logo = layout.logo ?? (layout.showMaster ? plan.master.logo : undefined);
      expect(logo, layout.name).toBeDefined();
      for (const p of layout.placeholders.filter((p) => p.kind !== 'sldNum')) expect(overlaps(p.box, keepOut(logo!)), `${layout.name}: ${p.name}`).toBe(false);
      expect(logo!.box.x).toBeGreaterThanOrEqual(logo!.clear);
    }
    for (const p of plan.master.placeholders.filter((p) => p.kind !== 'sldNum')) expect(overlaps(p.box, keepOut(plan.master.logo!)), p.name).toBe(false);
  });

  it('puts a light logo on a dark brand\'s primary surface', () => {
    const dark = planPalette({ roles: { ...roles, background: '#101010', text: '#F5F5F5', inverse: '#FAFAFA', canvas: '#202020' }, colors: [] }).palette;
    const darkPlan = planLayouts(dark, chooseLogos(read, {}));
    expect(darkPlan.master.logo!.asset.id).toBe('logos/mark-dark');
    expect(darkPlan.layouts[0]!.logo!.asset.id).toBe('logos/mark-light');
  });

  it('leaves the logo off a surface with no logo made for it', () => {
    const light = planLayouts(palette, { light: chooseLogos(read, {}).light });
    expect(light.layouts[0]!.logo).toBeUndefined();
    expect(light.master.logo).toBeDefined();
  });
});

describe('the SVG as shapes', () => {
  it('reads plain paths, and moves them by the view box', () => {
    const read = readSvg('<svg viewBox="10 20 100 40"><rect x="10" y="20" width="50" height="40" fill="#fff"/></svg>');
    expect(read).toEqual({ vector: { width: 100, height: 40, shapes: [{ fill: 'FFFFFF', segments: [['M', 0, 0], ['L', 50, 0], ['L', 50, 40], ['L', 0, 40], ['Z']] }] } });
  });

  it('turns every command into absolute M, L, C and Z', () => {
    expect(pathSegments('M1 2 h3 v4 l-1-1 z')).toEqual([['M', 1, 2], ['L', 4, 2], ['L', 4, 6], ['L', 3, 5], ['Z']]);
    const quad = pathSegments('M0 0 Q 10 0 10 10')!.at(-1) as number[];
    expect([quad[0], ...quad.slice(1).map((n) => Math.round(n * 1000) / 1000)]).toEqual(['C', 6.667, 0, 10, 3.333, 10, 10]);
    expect(pathSegments('M0 0 1 1 2 0')).toEqual([['M', 0, 0], ['L', 1, 1], ['L', 2, 0]]);
    const arc = pathSegments('M10 0 a10 10 0 0 1 -10 10')!;
    expect(arc[0]).toEqual(['M', 10, 0]);
    expect(arc.slice(1).every((s) => s[0] === 'C')).toBe(true);
    const end = arc.at(-1) as number[];
    expect([end[5], end[6]]).toEqual([0, 10]);
    expect(pathSegments('nonsense')).toBeUndefined();
    expect(pathSegments('L 1 1')).toBeUndefined();
  });

  it('reads a flag of an arc written with no space after it', () => {
    expect(pathSegments('M0 0a1 1 0 011 1')).toHaveLength(2);
  });

  it('turns the hole of an even-odd path against its outline, so every fill rule agrees', () => {
    const read = readSvg(LIGHT_SVG);
    if (!('vector' in read)) throw new Error(read.why);
    const [dark] = read.vector.shapes;
    const [outline, hole] = dark!.segments.reduce<number[][][]>((list, seg) => (seg[0] === 'M' ? [...list, [[seg[1], seg[2]]]] : seg[0] === 'L' ? (list.at(-1)!.push([seg[1], seg[2]]), list) : list), []);
    const turn = (points: number[][]) => Math.sign(points.reduce((sum, p, k) => sum + (points[(k + 1) % points.length]![0]! - p[0]!) * (points[(k + 1) % points.length]![1]! + p[1]!), 0));
    expect(turn(outline!)).not.toBe(0);
    expect(turn(hole!)).toBe(-turn(outline!));
    // the hole is still the square 10..20, and the outline the rectangle 0..60 by 0..40
    expect(new Set(hole!.map((p) => p.join()))).toEqual(new Set(['10,10', '20,10', '20,20', '10,20']));
    expect(new Set(outline!.map((p) => p.join()))).toEqual(new Set(['0,0', '60,0', '60,40', '0,40']));
  });

  it.each([
    ['a transform', '<svg viewBox="0 0 1 1"><path d="M0 0H1V1Z" transform="scale(2)"/></svg>', /transform/],
    ['a stroke', '<svg viewBox="0 0 1 1"><path d="M0 0H1V1Z" stroke="#000"/></svg>', /stroke/],
    ['a gradient', '<svg viewBox="0 0 1 1"><path d="M0 0H1V1Z" fill="url(#g)"/></svg>', /url\(#g\)/],
    ['text', '<svg viewBox="0 0 1 1"><text>a</text></svg>', /text element/],
    ['a style', '<svg viewBox="0 0 1 1"><style>p{}</style></svg>', /style element/],
    ['a script', '<svg viewBox="0 0 1 1"><script>x</script></svg>', /script element/],
    ['an image', '<svg viewBox="0 0 1 1"><image href="data:,x"/></svg>', /image element/],
    ['nothing drawn', '<svg viewBox="0 0 1 1"></svg>', /nothing/],
    ['no size', '<svg><path d="M0 0H1V1Z"/></svg>', /view box or size/],
    ['an island turning the same way as its hole\'s outline', '<svg viewBox="0 0 10 10"><path d="M0 0H10V10H0ZM2 2H8V8H2Z"/></svg>', /inside another/],
  ])('refuses %s, and says why', (_, svg, why) => {
    const read = readSvg(svg);
    expect('why' in read && read.why).toMatch(why);
  });
});

describe('the zip', () => {
  it('has the standard check value for crc32', () => {
    expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926);
  });

  it('is read back by an unzip tool, in the order given', () => {
    const dir = tempDir('blazon-office-zip-');
    fs.writeFileSync(path.join(dir, 'a.zip'), zipOf([['x/a.txt', 'hello'], ['b.bin', Buffer.from([0, 1, 2, 255])]]));
    expect(unzip(path.join(dir, 'a.zip'))).toEqual(new Map([['x/a.txt', Buffer.from('hello')], ['b.bin', Buffer.from([0, 1, 2, 255])]]));
  });
});

/** The entries of a zip file by name: the central directory read, stored and deflated entries both. */
function unzip(file: string): Map<string, Buffer> {
  const data = fs.readFileSync(file);
  const end = data.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = data.readUInt16LE(end + 10);
  let at = data.readUInt32LE(end + 16);
  const out = new Map<string, Buffer>();
  for (let k = 0; k < count; k++) {
    const [method, size, nameLength, extraLength, commentLength, offset] = [data.readUInt16LE(at + 10), data.readUInt32LE(at + 20), data.readUInt16LE(at + 28), data.readUInt16LE(at + 30), data.readUInt16LE(at + 32), data.readUInt32LE(at + 42)];
    const name = data.subarray(at + 46, at + 46 + nameLength).toString('ascii');
    const start = offset + 30 + data.readUInt16LE(offset + 26) + data.readUInt16LE(offset + 28);
    const body = data.subarray(start, start + size);
    if (data.readUInt32LE(at + 16) !== crc32(method === 8 ? inflateRawSync(body) : body)) throw new Error(`${name}: bad crc`);
    out.set(name, Buffer.from(method === 8 ? inflateRawSync(body) : body));
    at += 46 + nameLength + extraLength + commentLength;
  }
  return out;
}

interface Ran {
  status: number | null;
  out: string;
}
const plugin = (input: string, env: Record<string, string> = {}): Ran => {
  const result = spawnSync(process.execPath, ['--import', TSX, ENTRY], { input, encoding: 'utf-8', env: { PATH: '/usr/bin:/bin', HOME: os.homedir(), ...env } });
  return { status: result.status, out: result.stdout };
};

/** A built site with the two logos, and a request for it */
function world(over: { brand?: object; options?: object } = {}) {
  const siteDir = tempDir('blazon-office-site-');
  const outDir = tempDir('blazon-office-out-');
  fs.mkdirSync(path.join(siteDir, 'brand-assets/logos'), { recursive: true });
  fs.writeFileSync(path.join(siteDir, 'index.html'), '<html></html>');
  fs.writeFileSync(path.join(siteDir, 'brand-assets/logos/mark-light.svg'), LIGHT_SVG);
  fs.writeFileSync(path.join(siteDir, 'brand-assets/logos/mark-dark.svg'), DARK_SVG);
  const request = JSON.stringify({ v: 2, type: 'build', brand: brandOf(over.brand), options: over.options ?? {}, site_dir: siteDir, out_dir: outDir });
  return { siteDir, outDir, request };
}

describe('the entry', () => {
  const made = world();
  const ran = plugin(made.request);
  const answer = JSON.parse(ran.out.split('\n')[0]!) as { findings: { code: string; severity: string }[] };
  const files = (name: string) => unzip(path.join(made.outDir, name));
  const text = (parts: Map<string, Buffer>, name: string) => parts.get(name)!.toString('utf-8');

  it('answers with the findings, writes the .potx and the .pptx, and nothing else', () => {
    expect(ran.status).toBe(0);
    expect(answer.findings.map((f) => f.code)).toEqual([`${NAME}/font-not-embedded`]);
    expect(fs.readdirSync(made.outDir).sort()).toEqual(['acme-co.potx', 'acme-co.pptx']);
  });

  it('gives the theme the brand\'s palette and fonts', () => {
    const theme = text(files('acme-co.potx'), 'ppt/theme/theme1.xml');
    for (const [slot, hex] of [['dk1', '1E1F21'], ['lt1', 'F2F0EB'], ['dk2', '1E1F21'], ['lt2', 'D9D6CF'], ['accent1', 'FF5A1F'], ['accent2', '54585D'], ['accent3', 'F2C230'], ['hlink', 'FF5A1F'], ['folHlink', '54585D']])
      expect(theme).toContain(`<a:${slot}><a:srgbClr val="${hex}"/></a:${slot}>`);
    expect(theme).toMatch(/accent6><a:srgbClr/);
    expect(theme).toContain('<a:majorFont><a:latin typeface="Big Shoulders Display"/>');
    expect(theme).toContain('<a:minorFont><a:latin typeface="Arial"/>');
  });

  it('has the master and five layouts with working placeholders, and the logo on the master', () => {
    const parts = files('acme-co.potx');
    const master = text(parts, 'ppt/slideMasters/slideMaster1.xml');
    expect(master.match(/<p:sldLayoutId /g)).toHaveLength(5);
    expect(master).toContain('<p:ph type="title"/>');
    expect(master).toContain('<p:ph type="body" idx="1"/>');
    expect(master).toMatch(/<p:grpSp>.*name="Logo logos\/mark-light".*<a:custGeom>/);
    const names = [1, 2, 3, 4, 5].map((n) => /<p:cSld name="([^"]+)"/.exec(text(parts, `ppt/slideLayouts/slideLayout${n}.xml`))![1]);
    expect(names).toEqual(['Cover', 'Section divider', 'Title and content', 'Two columns', 'Closing']);
    const cover = text(parts, 'ppt/slideLayouts/slideLayout1.xml');
    expect(cover).toContain('<p:ph type="ctrTitle"/>');
    expect(cover).toContain('<p:ph type="subTitle" idx="1"/>');
    expect(cover).toContain('showMasterSp="0"');
    expect(cover).toContain('name="Logo logos/mark-dark"');
    // the divider is drawn on the inverse color like the cover, with the text color the clrMapOvr gives it, and hides the master's logo
    const divider = text(parts, 'ppt/slideLayouts/slideLayout2.xml');
    expect(divider).toContain('showMasterSp="0"');
    expect(divider).toContain('<p:bg><p:bgPr><a:solidFill><a:schemeClr val="dk2"/></a:solidFill>');
    expect(divider).toContain('<a:overrideClrMapping bg1="dk2"');
    expect(divider).toContain('name="Logo logos/mark-dark"');
    expect(divider).not.toContain('name="Logo logos/mark-light"');
    expect(text(parts, 'ppt/slideLayouts/slideLayout4.xml').match(/<p:ph idx="[12]" sz="half"\/>/g)).toHaveLength(2);
    // every layout belongs to the master, and every part named in a relationship is in the file
    for (const [name, data] of parts) {
      if (!name.endsWith('.rels')) continue;
      const base = path.posix.dirname(path.posix.dirname(name));
      for (const [, target] of data.toString('utf-8').matchAll(/Target="([^"]+)"/g)) expect(parts.has(path.posix.normalize(path.posix.join(base, target!))), `${name} -> ${target}`).toBe(true);
    }
  });

  it('sets titles from the brand\'s typography tokens, scaled to each layout\'s size, and 110% with no tokens', () => {
    const typed = world({
      brand: {
        tokens: [
          { path: 'type.display', type: 'typography', value: '', resolvedValue: { fontFamily: ['Big Shoulders Display'], fontSize: { value: 72, unit: 'px' }, lineHeight: 1.25, letterSpacing: { value: -0.02, unit: 'em' } } },
          // larger than the display style, and not a headline
          { path: 'type.stat', type: 'typography', value: '', resolvedValue: { fontFamily: ['Big Shoulders Display'], fontSize: { value: 96, unit: 'px' }, lineHeight: 1 } },
        ],
      },
    });
    expect(plugin(typed.request).status).toBe(0);
    const parts = unzip(path.join(typed.outDir, 'acme-co.potx'));
    const master = parts.get('ppt/slideMasters/slideMaster1.xml')!.toString('utf-8');
    expect(master).toContain('<a:lnSpc><a:spcPct val="125000"/></a:lnSpc><a:defRPr sz="4000" spc="-80">');
    // the cover's title is 60 points: -0.02 em is -1.2 points there
    expect(parts.get('ppt/slideLayouts/slideLayout1.xml')!.toString('utf-8')).toContain('<a:defRPr sz="6000" spc="-120">');
    const plain = text(files('acme-co.potx'), 'ppt/slideMasters/slideMaster1.xml');
    expect(plain).toContain('<a:lnSpc><a:spcPct val="110000"/></a:lnSpc><a:defRPr sz="4000">');
    expect(plain).not.toContain('90000');
  });

  it('sets each bullet in the text\'s own font, not in Arial', () => {
    const master = text(files('acme-co.potx'), 'ppt/slideMasters/slideMaster1.xml');
    expect(master.match(/<a:buFontTx\/><a:buChar char="&#8226;"\/>/g)).toHaveLength(5);
    expect(master).not.toContain('<a:buFont ');
  });

  it('makes the .potx a template with no slides and the .pptx a presentation with a slide for each layout', () => {
    const [potx, pptx] = [files('acme-co.potx'), files('acme-co.pptx')];
    expect(text(potx, '[Content_Types].xml')).toContain('presentationml.template.main+xml');
    expect(potx.has('ppt/slides/slide1.xml')).toBe(false);
    expect(text(pptx, '[Content_Types].xml')).toContain('presentationml.presentation.main+xml');
    expect([...pptx.keys()].filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k))).toHaveLength(5);
    expect(text(pptx, 'ppt/slides/slide1.xml')).toContain('<p:ph type="ctrTitle"/>');
    expect(text(pptx, 'ppt/slides/_rels/slide2.xml.rels')).toContain('slideLayout2.xml');
  });

  it('writes the same bytes again, in any time zone', () => {
    const again = world();
    plugin(again.request, { TZ: 'Pacific/Auckland' });
    for (const file of ['acme-co.potx', 'acme-co.pptx']) expect(fs.readFileSync(path.join(again.outDir, file)).equals(fs.readFileSync(path.join(made.outDir, file)))).toBe(true);
  });

  it('writes only the formats asked for, under the name asked for', () => {
    const one = world({ options: { name: 'deck', formats: ['pptx'] } });
    expect(JSON.parse(plugin(one.request).out).findings.map((f: { code: string }) => f.code)).toEqual([`${NAME}/font-not-embedded`]);
    expect(fs.readdirSync(one.outDir)).toEqual(['deck.pptx']);
  });

  it('embeds an SVG it cannot turn into shapes, and says so', () => {
    const odd = world();
    fs.writeFileSync(path.join(odd.siteDir, 'brand-assets/logos/mark-light.svg'), LIGHT_SVG.replace('<path d="M70', '<path transform="scale(1)" d="M70'));
    const got = JSON.parse(plugin(odd.request).out) as { findings: { code: string; message: string }[] };
    expect(got.findings.find((f) => f.code === `${NAME}/logo-not-vector`)!.message).toMatch(/transform/);
    const parts = unzip(path.join(odd.outDir, 'acme-co.potx'));
    expect([...parts.keys()].filter((k) => k.startsWith('ppt/media/')).sort()).toEqual(['ppt/media/logo1.svg', 'ppt/media/logo2.png']);
    expect(text(parts, 'ppt/slideMasters/slideMaster1.xml')).toContain('asvg:svgBlip');
    expect(text(parts, '[Content_Types].xml')).toContain('Extension="svg" ContentType="image/svg+xml"');
  });

  it('embeds a PNG logo as it is', () => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAHnOcQAAAAABJRU5ErkJggg==', 'base64');
    const raster = world({ brand: { assets: LOGOS.map((l) => ({ ...l, format: 'png', file: l.file.replace('.svg', '.png') })) , logo: {} } });
    for (const name of ['mark-light', 'mark-dark']) fs.writeFileSync(path.join(raster.siteDir, `brand-assets/logos/${name}.png`), png);
    expect(plugin(raster.request).status).toBe(0);
    const parts = unzip(path.join(raster.outDir, 'acme-co.potx'));
    expect(parts.get('ppt/media/logo1.png')!.equals(png)).toBe(true);
    expect(text(parts, 'ppt/slideMasters/slideMaster1.xml')).toContain('<p:pic>');
  });

  it('says what is wrong with a logo it cannot place, and still writes the template', () => {
    const bad = world({ brand: { assets: [{ ...LOGOS[0], file: 'brand-assets/logos/gone.svg' }, { ...LOGOS[1], width: undefined, height: undefined }] } });
    const got = JSON.parse(plugin(bad.request).out) as { findings: { code: string }[] };
    expect(got.findings.map((f) => f.code)).toEqual(expect.arrayContaining([`${NAME}/file-missing`, `${NAME}/logo-no-size`]));
    expect(fs.readdirSync(bad.outDir)).toHaveLength(2);
    expect(text(unzip(path.join(bad.outDir, 'acme-co.potx')), 'ppt/slideMasters/slideMaster1.xml')).not.toContain('Logo logos');
  });

  it('writes a template for a brand with nothing in it, with findings', () => {
    const empty = world({ brand: { theme: {}, assets: [], tokens: [], logo: {}, brand: {} } });
    const got = JSON.parse(plugin(empty.request).out) as { findings: { code: string }[] };
    expect(got.findings.map((f) => f.code)).toEqual(expect.arrayContaining([`${NAME}/color-role-missing`, `${NAME}/font-fallback`, `${NAME}/logo-none`]));
    expect(fs.readdirSync(empty.outDir).sort()).toEqual(['brand.potx', 'brand.pptx']);
  });

  it('answers a wrong option with a finding and exit 0', () => {
    const wrong = world({ options: { formats: ['key'] } });
    const got = plugin(wrong.request);
    expect(got.status).toBe(0);
    expect(JSON.parse(got.out).findings.map((f: { code: string }) => f.code)).toContain(`${NAME}/option-invalid`);
  });
});
