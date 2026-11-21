import { describe, it, expect } from 'vitest';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from '../../support/spawn';
import { readBrand as readBrandRaw } from '../../../src/shipped/press-kit/brand.js';
import { colorsCss, colorsText, planColors, type KitColor } from '../../../src/shipped/press-kit/colors.js';
import { kitPage, type Kit } from '../../../src/shipped/press-kit/html.js';
import { contrast, parseColor } from '../../../src/shipped/shared/color.js';
import { pageHtml, pickSwatches } from '../../../src/shipped/press-kit/pdf.js';
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
const readBrand = (brand: object) => readBrandRaw({ format: 'blazon-brand', version: 2, ...brand });

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
  version: 2,
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

describe('the company and note options', () => {
  const known = new Set<string>();
  const bad = (raw: object) => parseOptions(raw, known);

  it('takes a company with a description, a boilerplate and ordered facts, and a note', () => {
    const company = { description: 'Acme is a bank.', boilerplate: 'About Acme.\n\nSecond paragraph.', facts: [{ label: 'Legal name', value: 'Acme Ltd' }, { label: 'Registration', value: '123' }] };
    const { options, findings } = bad({ company, note: 'The colours are proposed.' });
    expect(findings).toEqual([]);
    expect(options).toMatchObject({ company, note: 'The colours are proposed.' });
  });

  it('has neither option by default', () => {
    expect(bad({}).options).toEqual({ name: 'press-kit', pdf: true, unreviewed: false });
  });

  it.each([
    [{ company: 'x' }, 'options.company'],
    [{ company: { bogus: 1 } }, 'options.company'],
    [{ company: { description: 3 } }, 'options.company.description'],
    [{ company: { description: '  ' } }, 'options.company.description'],
    [{ company: { description: 'x'.repeat(1001) } }, 'options.company.description'],
    [{ company: { boilerplate: '' } }, 'options.company.boilerplate'],
    [{ company: { boilerplate: 'x'.repeat(2001) } }, 'options.company.boilerplate'],
    [{ company: { facts: 'x' } }, 'options.company.facts'],
    [{ company: { facts: [] } }, 'options.company.facts'],
    [{ company: { facts: Array.from({ length: 21 }, () => ({ label: 'a', value: 'b' })) } }, 'options.company.facts'],
    [{ company: { facts: [{ label: '', value: 'b' }] } }, 'options.company.facts[0].label'],
    [{ company: { facts: [{ label: 'a', value: 7 }] } }, 'options.company.facts[0].value'],
    [{ company: { facts: [{ label: 'a', value: 'x'.repeat(301) }] } }, 'options.company.facts[0].value'],
    [{ company: { facts: [{ label: 'a\nb', value: 'v' }] } }, 'options.company.facts[0].label'],
    [{ company: { facts: [{ label: 'a', value: 'v', extra: 1 }] } }, 'options.company.facts[0]'],
    [{ note: 3 }, 'options.note'],
    [{ note: ' ' }, 'options.note'],
    [{ note: 'x'.repeat(281) }, 'options.note'],
    [{ note: 'two\nlines' }, 'options.note'],
  ])('refuses %j with one option-invalid finding at %s and leaves the option unset', (raw, at) => {
    const { options, findings } = bad(raw);
    expect(findings.map((f) => [f.code, f.path])).toEqual([[`${NAME}/option-invalid`, at]]);
    expect(findings[0]!.message).toContain(at.replace('options.', ''));
    expect(options.note).toBeUndefined();
    expect(options.company?.facts).toBeUndefined();
  });

  it('keeps the good facts and drops only the bad one', () => {
    const r = bad({ company: { facts: [{ label: 'a', value: 'b' }, { label: '', value: 'b' }] } });
    expect(r.options.company?.facts).toEqual([{ label: 'a', value: 'b' }]);
    expect(r.findings.map((f) => f.path)).toEqual(['options.company.facts[1].label']);
  });

  it('accepts exactly the caps', () => {
    const company = { description: 'x'.repeat(1000), boilerplate: 'y'.repeat(2000), facts: Array.from({ length: 20 }, () => ({ label: 'l'.repeat(60), value: 'v'.repeat(300) })) };
    expect(bad({ company, note: 'n'.repeat(280) }).findings).toEqual([]);
  });
});

describe('the text with company and note', () => {
  const base = { title: 'Acme Brand Book', named: true, description: 'A book of the brand.' };
  const company = { description: 'Acme is a bank.', boilerplate: 'About Acme.', facts: [{ label: 'Legal name', value: 'Acme Ltd' }, { label: 'Registration', value: '123' }] };

  it('puts the company description in place of the brand description, then the boilerplate, the facts in order, and the note', () => {
    const { text, findings } = aboutText(base, { company, note: 'The colours are proposed.' });
    expect(text).toBe('Acme Brand Book\n\nAcme is a bank.\n\nAbout Acme.\n\nLegal name: Acme Ltd\nRegistration: 123\n\nNote: The colours are proposed.\n');
    expect(findings).toEqual([]);
  });

  it('keeps the brand description when the company has none, and the no-description line when neither has', () => {
    expect(aboutText(base, { company: { boilerplate: 'B' } }).text).toBe('Acme Brand Book\n\nA book of the brand.\n\nB\n');
    expect(aboutText({ ...base, description: undefined }, { company: { description: 'D' } }).findings).toEqual([]);
    expect(aboutText({ ...base, description: undefined }, { note: 'N' }).text).toBe('Acme Brand Book\n\nNo description is set in blazon.json.\n\nNote: N\n');
  });

  it('writes the note in README.txt after the title, and in colors.txt before the colors', () => {
    expect(readmeText('Acme Co', ['about.txt'], 'press-kit', 'Proposed.').split('\n').slice(0, 4)).toEqual(['Acme Co: press kit', '', 'Note: Proposed.', '']);
    expect(colorsText(planColors(readBrand(BRAND)).colors, 'Proposed.').split('\n').slice(0, 3)).toEqual(['Colors', '', 'Note: Proposed.']);
  });

  it('is byte-identical to the old output with no option', () => {
    expect(aboutText(base).text).toBe('Acme Brand Book\n\nA book of the brand.\n');
    expect(readmeText('Acme Co', ['about.txt'], 'press-kit')).toBe(
      "Acme Co: press kit\n\nWhat is in this folder\n\n  about.txt       The brand name and a short description, to quote.\n\npress-kit.zip holds the same files.\n\nThe logos are the brand's own files, not redrawn.\n",
    );
  });
});

describe('the README.txt separator', () => {
  it.each(['press-kit', 'acme-press-kit-2026', 'a-very-long-kit-name-indeed-yes'])('keeps two spaces after the longest name, for the name %s', (name) => {
    const text = readmeText('Acme', ['logos/a.svg', 'colors/colors.txt', 'fonts.txt', 'about.txt', `${name}.pdf`], name);
    const rows = text.split('\n').filter((line) => /^ {2}\S/.test(line));
    expect(rows).toHaveLength(5);
    for (const row of rows) expect(row).toMatch(/^ {2}\S+ {2,}[A-Z]/);
    expect(new Set(rows.map((row) => row.search(/ [A-Z]/))).size).toBe(1);
    expect(text).not.toMatch(/\.pdf[A-Z]/);
  });

  it('keeps the old width of 16 for names that fit', () => {
    expect(readmeText('A', ['fonts.txt', 'press-kit.pdf'], 'press-kit')).toContain('  fonts.txt       The fonts');
  });
});

describe('the PDF swatches', () => {
  const c = (path: string, hex: string | undefined = '#112233', description?: string): KitColor => ({
    path,
    hex,
    value: hex ?? '',
    cssVariable: '--x',
    usedAs: [],
    ...(description && { description }),
  });

  it("takes whole groups in the brand's order, labelled group and step, up to ten", () => {
    const six = (group: string) => [100, 200, 300, 400, 500, 600].map((n) => c(`color.${group}.${n}`));
    const { swatches, more } = pickSwatches([...six('blue'), ...six('red'), c('color.green.500')]);
    expect(swatches.map((s) => s.label)).toEqual(['blue 100', 'blue 200', 'blue 300', 'blue 400', 'blue 500', 'blue 600']);
    expect(more).toBe(7);
  });

  it('gathers a group whose tokens are apart, and cuts a first group over ten at ten', () => {
    const mixed = [c('color.blue.100'), c('color.red.100'), c('color.blue.200'), c('color.red.200')];
    expect(pickSwatches(mixed).swatches.map((s) => s.label)).toEqual(['blue 100', 'blue 200', 'red 100', 'red 200']);
    expect(pickSwatches(Array.from({ length: 12 }, (_, i) => c(`color.grey.${i}`))).swatches).toHaveLength(10);
  });

  it('labels a flat token as before: its short description, else its last segment', () => {
    expect(pickSwatches([c('color.ink', '#111111', 'Ink'), c('color.signal')]).swatches.map((s) => s.label)).toEqual(['Ink', 'signal']);
  });

  it('leaves out a color with no hex', () => {
    expect(pickSwatches([{ ...c('color.blue.100'), hex: undefined }, c('color.blue.200')]).swatches.map((s) => s.label)).toEqual(['blue 200']);
  });
});

describe('the PDF page with company and note', () => {
  it('shows the company description, the boilerplate, the facts and the note, and not the brand description', () => {
    const html = pageHtml({
      brand: { title: 'T', description: 'BRANDDESC', roles: {}, stylesheets: [] },
      colors: [],
      company: { description: 'COMPANYDESC', boilerplate: 'BOILER', facts: [{ label: 'Legal name', value: 'Acme Ltd' }] },
      note: 'NOTE <b>',
    });
    expect(html).toContain('COMPANYDESC');
    expect(html).not.toContain('BRANDDESC');
    expect(html).toContain('BOILER');
    expect(html).toContain('Legal name');
    expect(html).toContain('Acme Ltd');
    expect(html).toContain('NOTE &#60;b&#62;');
  });

  it('is the same page as before with neither option', () => {
    const html = pageHtml({ brand: { title: 'T', description: 'D', roles: {}, stylesheets: [] }, colors: [] });
    expect(html).toContain('<h1>T</h1><p>D</p></div>');
    expect(html).not.toContain('class="facts"');
  });
});

describe('the fonts a brand ships', () => {
  const MONO = '-apple-system, BlinkMacSystemFont, SFMono-Regular, ui-monospace, monospace';

  it('lists a system family as a fallback line, not as a brand font with License: not stated', () => {
    const brand = readBrand({
      theme: { roles: { fontBody: "'Inter', system-ui, sans-serif" }, fonts: ['https://fonts.googleapis.com/css2?family=Inter:wght@400'] },
      tokens: [{ path: 'font.family.mono', type: 'fontFamily', value: MONO, resolvedValue: MONO.split(', ') }],
    });
    const { text, findings } = planFonts(brand);
    expect(text).toBe(
      'Fonts\n\nInter\n  Used for: running text (the fontBody role)\n  Source: Google Fonts, https://fonts.googleapis.com/css2?family=Inter\n  License: not stated\n\nFallback fonts, not shipped: system-ui, sans-serif, -apple-system, BlinkMacSystemFont, SFMono-Regular, ui-monospace, monospace\n',
    );
    expect(text).not.toMatch(/SFMono-Regular\n/);
    expect(findings.map((f) => f.message).join()).toContain('1 font has no license stated: Inter');
  });

  it('reads a quoted family after a comma without its quotes', () => {
    const { text } = planFonts(readBrand({ theme: { roles: { fontBody: "'Big Shoulders Display', 'Helvetica Neue', sans-serif" } } }));
    expect(text).toContain('Fallback fonts, not shipped: Helvetica Neue, sans-serif\n');
  });

  it('keeps a family a stylesheet or a font token states as a brand font, even when it is also a common system name', () => {
    const brand = readBrand({
      theme: { roles: {}, fonts: ['https://fonts.googleapis.com/css2?family=Roboto:wght@400'] },
      tokens: [{ path: 'font.family.mono', type: 'fontFamily', value: 'Menlo, monospace', blazon: { font: { license: 'OFL-1.1' } } }],
    });
    const { text } = planFonts(brand);
    expect(text).toContain('Roboto\n  Source: Google Fonts');
    expect(text).toContain('Menlo\n  Used for: font.family.mono\n  Source: not stated\n  License:\n    OFL-1.1\n');
    expect(text).toContain('Fallback fonts, not shipped: monospace\n');
  });

  it('writes no fonts.txt, and says the brand names no font it ships, when the stacks hold only system families', () => {
    const { text, findings } = planFonts(readBrand({ theme: { roles: { fontBody: 'Arial, sans-serif', fontDisplay: 'system-ui' } } }));
    expect(text).toBeUndefined();
    expect(findings.map((f) => f.code)).toEqual([`${NAME}/font-none`]);
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
    expect(text).not.toContain('\nArial\n');
    expect(text).toContain('Fallback fonts, not shipped: sans-serif, Arial\n');
    expect(findings).toEqual([{ code: `${NAME}/font-license-unstated`, severity: 'warning', path: 'fonts', message: expect.stringContaining('2 fonts have no license stated: Big Shoulders Display, IBM Plex Sans') }]);
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
    expect(text).toBe('Fonts\n\nMono Sans\n  Used for: font.family.mono\n  Source: a font file the brand embeds in its brand book; the file is not in this kit\n  License:\n    SIL OFL 1.1\n    see ofl.txt\n\nFallback fonts, not shipped: monospace\n');
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

  describe('the license file of a font, carried by brand.json as theme.fontLicenses', () => {
    const OFL_TEXT = 'Copyright 2017 IBM Corp. All rights reserved.\n\nThis Font Software is licensed under the SIL Open Font License, Version 1.1.\n\nPREAMBLE\n';
    const withLicense = (fontLicenses: object[], font: object = {}) =>
      readBrand({
        theme: { roles: { fontDisplay: "'Plex Mono', monospace" }, fonts: [], fontLicenses },
        tokens: [{ path: 'font.mono', type: 'fontFamily', value: "'Plex Mono', monospace", resolvedValue: ['Plex Mono', 'monospace'], blazon: { font } }],
      });
    const entry = { family: 'Plex Mono', licenseFile: 'fonts/OFL.txt', licenseText: OFL_TEXT };

    it('prints the license sentence of the file and its path when the token states no license', () => {
      expect(planFonts(withLicense([entry])).text).toContain(
        'Plex Mono\n  Used for: headings (the fontDisplay role), font.mono\n  Source: not stated\n  License: This Font Software is licensed under the SIL Open Font License, Version 1.1.\n  License file: fonts/OFL.txt (in the brand project, not in this kit)\n',
      );
      expect(planFonts(withLicense([entry])).findings.map((f) => f.code)).toEqual([]);
    });

    it('prefers an SPDX-License-Identifier line, and says see the file when no line reads as a name', () => {
      const spdx = { ...entry, licenseText: 'Copyright A\nSPDX-License-Identifier: OFL-1.1\n' };
      expect(planFonts(withLicense([spdx])).text).toContain('  License: OFL-1.1\n  License file: fonts/OFL.txt');
      const bare = { ...entry, licenseText: `Copyright ${'x'.repeat(200)}\n` };
      expect(planFonts(withLicense([bare])).text).toContain('  License: see fonts/OFL.txt\n');
    });

    it('lets the token license and licenseUrl win over the file', () => {
      expect(planFonts(withLicense([entry], { license: 'OFL-1.1' })).text).toContain('  License:\n    OFL-1.1\n');
      expect(planFonts(withLicense([entry], { license: 'OFL-1.1' })).text).not.toContain('License file');
      expect(planFonts(withLicense([entry], { licenseUrl: 'https://x.example/l' })).text).toContain('  License: see https://x.example/l\n');
    });

    it('ignores an entry that is the wrong shape, and says not stated without one', () => {
      expect(planFonts(withLicense([{ family: 'Plex Mono', licenseFile: 3, licenseText: 'x' }, {}])).text).toContain('License: not stated');
    });
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
  const request = JSON.stringify({ v: 2, type: 'build', brand: brandOf(over.brand), options: over.options ?? {}, site_dir: siteDir, out_dir: outDir });
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
        'index.html',
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

  it('prints the company and the note in about.txt, README.txt and colors.txt, and names a wrong company key without losing the kit', () => {
    const company = { description: 'Acme is a bank.', boilerplate: 'About Acme.', facts: [{ label: 'Legal name', value: 'Acme Ltd' }] };
    const made = world({ options: { pdf: false, company: { ...company, bogus: 1 }, note: 'The colours are proposed.' } });
    const ran = plugin(made.request);
    expect(ran.status, ran.out + ran.err).toBe(0);
    const folder = path.join(made.outDir, 'press-kit');
    expect(fs.readFileSync(path.join(folder, 'about.txt'), 'utf-8')).toBe(
      'Acme Co\n\nAcme is a bank.\n\nAbout Acme.\n\nLegal name: Acme Ltd\n\nNote: The colours are proposed.\n',
    );
    expect(fs.readFileSync(path.join(folder, 'README.txt'), 'utf-8')).toContain('Acme Co: press kit\n\nNote: The colours are proposed.\n\n');
    expect(fs.readFileSync(path.join(folder, 'colors/colors.txt'), 'utf-8')).toMatch(/^Colors\n\nNote: The colours are proposed\.\n\n/);
    const invalid = findingsOf(ran.out).filter((f) => f.code === `${NAME}/option-invalid`);
    expect(invalid.map((f) => f.path)).toEqual(['options.company']);
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
    expect(walk(path.join(made.outDir, 'press-kit'))).toEqual(['README.txt', 'about.txt', 'index.html']);
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

// Contact, terms and the page (index.html). The contact and the terms are the brand's words; blazon writes no wording of its own.

describe('the company.contact option', () => {
  const none = new Set<string>();
  const contact = { name: 'Ada Example', role: 'Press lead', email: 'press@acme.example', phone: '+44 20 0000 0000', url: 'https://acme.example/press' };

  it('takes every key, or any one of them', () => {
    expect(parseOptions({ company: { contact } }, none)).toMatchObject({ options: { company: { contact } }, findings: [] });
    expect(parseOptions({ company: { contact: { email: 'a@b.example' } } }, none).options.company?.contact).toEqual({ email: 'a@b.example' });
  });

  it('trims the values', () => {
    expect(parseOptions({ company: { contact: { name: '  Ada  ' } } }, none).options.company?.contact).toEqual({ name: 'Ada' });
  });

  it.each([
    [{ contact: 'x' }, 'options.company.contact'],
    [{ contact: [] }, 'options.company.contact'],
    [{ contact: {} }, 'options.company.contact'],
    [{ contact: { bogus: 'x' } }, 'options.company.contact'],
    [{ contact: { name: 3 } }, 'options.company.contact.name'],
    [{ contact: { name: ' ' } }, 'options.company.contact.name'],
    [{ contact: { name: 'x'.repeat(81) } }, 'options.company.contact.name'],
    [{ contact: { name: 'two\nlines' } }, 'options.company.contact.name'],
    [{ contact: { role: '' } }, 'options.company.contact.role'],
    [{ contact: { role: 'x'.repeat(81) } }, 'options.company.contact.role'],
    [{ contact: { phone: 'x'.repeat(41) } }, 'options.company.contact.phone'],
    [{ contact: { phone: 5 } }, 'options.company.contact.phone'],
    [{ contact: { email: 'no-at-sign' } }, 'options.company.contact.email'],
    [{ contact: { email: 'a@b@c.example' } }, 'options.company.contact.email'],
    [{ contact: { email: 'a b@c.example' } }, 'options.company.contact.email'],
    [{ contact: { email: `${'x'.repeat(115)}@b.example` } }, 'options.company.contact.email'],
    [{ contact: { email: 7 } }, 'options.company.contact.email'],
    [{ contact: { url: 'ftp://acme.example' } }, 'options.company.contact.url'],
    [{ contact: { url: 'javascript:alert(1)' } }, 'options.company.contact.url'],
    [{ contact: { url: 'acme.example/press' } }, 'options.company.contact.url'],
    [{ contact: { url: `https://acme.example/${'x'.repeat(300)}` } }, 'options.company.contact.url'],
    [{ contact: { url: 'https://acme.example/a b' } }, 'options.company.contact.url'],
  ])('refuses %j with one option-invalid finding at %s and leaves the contact unset', (company, at) => {
    const { options, findings } = parseOptions({ company }, none);
    expect(findings.map((f) => [f.code, f.path])).toEqual([[`${NAME}/option-invalid`, at]]);
    expect(findings[0]!.message).toContain(at.replace('options.', ''));
    expect(options.company?.contact).toBeUndefined();
  });

  it('keeps the good keys and names only the bad one', () => {
    const r = parseOptions({ company: { contact: { name: 'Ada', email: 'nope' } } }, none);
    expect(r.options.company?.contact).toEqual({ name: 'Ada' });
    expect(r.findings.map((f) => f.path)).toEqual(['options.company.contact.email']);
  });

  it('accepts exactly the caps', () => {
    const edge = { name: 'n'.repeat(80), role: 'r'.repeat(80), phone: '1'.repeat(40), email: `${'x'.repeat(110)}@b.example`, url: `https://acme.example/${'x'.repeat(279)}` };
    expect(edge.email).toHaveLength(120);
    expect(edge.url).toHaveLength(300);
    expect(parseOptions({ company: { contact: edge } }, none).findings).toEqual([]);
  });
});

describe('the terms option', () => {
  const none = new Set<string>();

  it('takes text, a url, or both, and text may span lines', () => {
    expect(parseOptions({ terms: { text: 'Use the logos as they are.\nDo not recolor them.', url: 'https://acme.example/terms' } }, none)).toMatchObject({
      options: { terms: { text: 'Use the logos as they are.\nDo not recolor them.', url: 'https://acme.example/terms' } },
      findings: [],
    });
    expect(parseOptions({ terms: { url: 'http://acme.example/terms' } }, none).options.terms).toEqual({ url: 'http://acme.example/terms' });
    expect(parseOptions({ terms: { text: 'x'.repeat(1000) } }, none).findings).toEqual([]);
  });

  it('is unset by default', () => {
    expect(parseOptions({}, none).options.terms).toBeUndefined();
  });

  it.each([
    [{ terms: 'x' }, 'options.terms'],
    [{ terms: {} }, 'options.terms'],
    [{ terms: { bogus: 1 } }, 'options.terms'],
    [{ terms: { text: 3 } }, 'options.terms.text'],
    [{ terms: { text: '  ' } }, 'options.terms.text'],
    [{ terms: { text: 'x'.repeat(1001) } }, 'options.terms.text'],
    [{ terms: { url: 'mailto:a@b.example' } }, 'options.terms.url'],
    [{ terms: { url: 'not a url' } }, 'options.terms.url'],
    [{ terms: { url: 7 } }, 'options.terms.url'],
  ])('refuses %j with one option-invalid finding at %s and leaves terms unset', (raw, at) => {
    const { options, findings } = parseOptions(raw, none);
    expect(findings.map((f) => [f.code, f.path])).toEqual([[`${NAME}/option-invalid`, at]]);
    expect(findings[0]!.message).toContain(at.replace('options.', ''));
    expect(options.terms).toBeUndefined();
  });

  it('names terms among the known options', () => {
    expect(parseOptions({ bogus: 1 }, none).findings[0]!.message).toContain('terms');
  });
});

describe('contact and terms in about.txt and README.txt', () => {
  const base = { title: 'Acme Brand Book', named: true, description: 'A book.' };
  const company = { facts: [{ label: 'Legal name', value: 'Acme Ltd' }], contact: { name: 'Ada Example', role: 'Press lead', email: 'press@acme.example', phone: '+44 20 0000 0000', url: 'https://acme.example/press' } };
  const terms = { text: 'Use the logos as supplied.\nNo recoloring.', url: 'https://acme.example/terms' };

  it('prints a Contact block after the facts and a Terms of use block after it, before the note', () => {
    expect(aboutText(base, { company, terms, note: 'N' }).text).toBe(
      [
        'Acme Brand Book',
        '',
        'A book.',
        '',
        'Legal name: Acme Ltd',
        '',
        'Contact:',
        '  Name: Ada Example',
        '  Role: Press lead',
        '  Email: press@acme.example',
        '  Phone: +44 20 0000 0000',
        '  Web: https://acme.example/press',
        '',
        'Terms of use:',
        'Use the logos as supplied.',
        'No recoloring.',
        'Full terms: https://acme.example/terms',
        '',
        'Note: N',
        '',
      ].join('\n'),
    );
  });

  it('prints only the contact keys that are set, and terms with only a url', () => {
    expect(aboutText(base, { company: { contact: { email: 'a@b.example' } }, terms: { url: 'https://acme.example/t' } }).text).toBe(
      'Acme Brand Book\n\nA book.\n\nContact:\n  Email: a@b.example\n\nTerms of use:\nFull terms: https://acme.example/t\n',
    );
  });

  it('lists index.html first in README.txt, and the terms line only when terms are set', () => {
    const paths = ['index.html', 'about.txt'];
    const plain = readmeText('Acme Co', paths, 'press-kit');
    expect(plain).toContain('What is in this folder\n\n  index.html      ');
    expect(plain.indexOf('index.html')).toBeLessThan(plain.indexOf('about.txt'));
    expect(plain).not.toContain('Terms of use');
    expect(readmeText('Acme Co', paths, 'press-kit', 'Proposed.', true).split('\n').slice(0, 6)).toEqual([
      'Acme Co: press kit',
      '',
      'Note: Proposed.',
      '',
      'Terms of use: see about.txt',
      '',
    ]);
    expect(readmeText('Acme Co', paths, 'press-kit', undefined, true).split('\n').slice(0, 4)).toEqual(['Acme Co: press kit', '', 'Terms of use: see about.txt', '']);
  });
});

describe('the PDF page with contact and terms', () => {
  it('shows the contact and the terms, escaped, and a short block for long terms', () => {
    const html = pageHtml({
      brand: { title: 'T', description: 'D', roles: {}, stylesheets: [] },
      colors: [],
      company: { contact: { name: 'CONTACTNAME <i>', email: 'press@acme.example' } },
      terms: { text: 'TERMS '.repeat(200), url: 'https://acme.example/terms' },
    });
    expect(html).toContain('CONTACTNAME &#60;i&#62;');
    expect(html).toContain('press@acme.example');
    expect(html).toContain('TERMS');
    expect(html).toContain('https://acme.example/terms');
    expect(html).toContain('about.txt');
    expect(html.length).toBeLessThan(6000);
  });
});

/** The kit the page is drawn from, with every section that BRAND has data for */
const kitOf = (over: Partial<Kit> = {}): Kit => {
  const brand = readBrand(BRAND);
  return {
    brand,
    logos: chooseLogos(brand, {}).chosen,
    colors: planColors(brand).colors,
    fonts: planFonts(brand).text,
    paths: ['colors/colors.css', 'colors/colors.json'],
    ...over,
  };
};
const headings = (html: string) => [...html.matchAll(/<h([1-6])[ >]/g)].map((m) => Number(m[1]));
const sections = (html: string) => [...html.matchAll(/<h2[^>]*>([^<]*)<\/h2>/g)].map((m) => m[1]);

describe('index.html: the page', () => {
  const full = (): Kit =>
    kitOf({
      company: {
        description: 'We make anvils.',
        boilerplate: 'Acme Ltd is an anvil maker.',
        facts: [{ label: 'Legal name', value: 'Acme Ltd' }],
        contact: { name: 'Ada', role: 'Press lead', email: 'press@acme.example', phone: '+44 1', url: 'https://acme.example/press' },
      },
      terms: { text: 'Use as supplied.', url: 'https://acme.example/terms' },
      note: 'Colors are proposed.',
    });

  it('is one semantic HTML5 document: lang, a title, one h1, headings that never skip a level', () => {
    const html = kitPage(full());
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toMatch(/<html lang="en">/);
    expect(html).toMatch(/<title>Acme Co: press kit<\/title>/);
    expect(html).toContain('<meta name="viewport"');
    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
    const levels = headings(html);
    expect(levels[0]).toBe(1);
    levels.forEach((level, at) => {
      if (at > 0) expect(level - levels[at - 1]!).toBeLessThanOrEqual(1);
    });
    expect(html).toMatch(/<main>[^]*<\/main>/);
  });

  it('has the sections in order when all the data is there', () => {
    expect(sections(kitPage(full()))).toEqual(['About', 'Facts', 'Contact', 'Logos', 'Colors', 'Fonts', 'Terms of use', 'Note']);
  });

  it('leaves a section out when its data is absent', () => {
    expect(sections(kitPage(kitOf()))).toEqual(['Logos', 'Colors', 'Fonts']);
    expect(sections(kitPage(kitOf({ logos: [], colors: [], fonts: undefined })))).toEqual([]);
    const some = kitPage(kitOf({ company: { contact: { email: 'a@b.example' } } }));
    expect(sections(some)).toEqual(['Contact', 'Logos', 'Colors', 'Fonts']);
    expect(some).not.toContain('>Facts<');
    expect(some).not.toContain('Terms of use');
  });

  it("is self-contained: no script, no remote font or image, no absolute src or href but the brand's own addresses", () => {
    const html = kitPage(full());
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<link\b/i);
    expect(html).not.toMatch(/@import|url\(/i);
    expect(html).not.toMatch(/\son[a-z]+=/i);
    const refs = [...html.matchAll(/\s(?:src|href)="([^"]*)"/g)].map((m) => m[1]!);
    const absolute = refs.filter((ref) => /^[a-z][a-z0-9+.-]*:/i.test(ref));
    expect(new Set(absolute)).toEqual(new Set(['https://acme.example/press', 'https://acme.example/terms', 'mailto:press@acme.example']));
    expect((html.match(/https?:\/\/[^\s"'<]+/g) ?? []).every((url) => url.startsWith('https://acme.example/') || url.startsWith('https://fonts.googleapis.com/'))).toBe(true);
  });

  it('refers to the logos by relative paths, with alt text and a download link for each', () => {
    const html = kitPage(full());
    const images = [...html.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
    expect(images).toHaveLength(3);
    for (const image of images) {
      expect(image).toMatch(/src="logos\/on-(light|dark)-backgrounds\/(mark-light|mark-dark|ai-ok)\.svg"/);
      expect(image).toMatch(/alt="[^"]+"/);
    }
    expect(images[0]).toContain('alt="For light surfaces."');
    expect(images.find((image) => image.includes('mark-dark'))).toContain('alt="mark-dark"');
    expect(html).toMatch(/<a href="logos\/on-light-backgrounds\/mark-light\.svg" download aria-label="Download mark-light\.svg">Download<\/a>/);
    expect(html).toMatch(/<a href="logos\/on-dark-backgrounds\/mark-dark\.svg" download aria-label="Download mark-dark\.svg">Download<\/a>/);
    expect(html).toContain('<dt>Clear space on every side</dt><dd>24 px</dd>');
    expect(html).toContain('For light backgrounds');
  });

  it("lists do and don't as short lists", () => {
    const brand = readBrand({ ...BRAND, assets: [asset('logos/mark-light', {}, { background: 'light', do: ['Keep the clear space'], dont: ['Stretch it'] })] });
    const html = kitPage(kitOf({ logos: chooseLogos(brand, {}).chosen }));
    expect(html).toMatch(/<h4>Do<\/h4><ul><li>Keep the clear space<\/li><\/ul>/);
    expect(html).toMatch(/<h4>Do not<\/h4><ul><li>Stretch it<\/li><\/ul>/);
  });

  it('shows each color with its hex, and CMYK, Pantone and RAL only where the token states them', () => {
    const html = kitPage(kitOf());
    expect(html).toContain('#FF5A1F');
    expect(html).toContain('0, 80, 100, 0');
    expect(html).toContain('1665 C');
    expect(html).toContain('2004');
    expect(html.match(/CMYK/g)).toHaveLength(1);
    expect(html.match(/Pantone/g)).toHaveLength(1);
  });

  it('shows the fonts as fonts.txt prints them: the license line and the fallback line', () => {
    const html = kitPage(kitOf());
    expect(html).toContain('Big Shoulders Display');
    expect(html).toContain('License');
    expect(html).toContain('not stated');
    expect(html).toContain('Fallback fonts, not shipped: sans-serif, Arial');
  });

  it('chooses a swatch label color that has at least 4.5:1 contrast with the swatch, whatever the color', () => {
    const swatch = (hex: string): KitColor => ({ path: `color.x${hex.slice(1)}`, hex, value: hex, rgb: parseColor(hex)!, cssVariable: '--x', usedAs: [] });
    const hexes = ['#000000', '#FFFFFF', '#777777', '#808080', '#767676', '#FF5A1F', '#FFD700', '#0000FF', '#00FF00', '#E5E5E5', '#1E1F21', '#949494', '#8A8A8A'];
    const html = kitPage(kitOf({ colors: hexes.map(swatch) }));
    for (const hex of hexes) {
      const row = html.match(new RegExp(`<div class="swatch" style="background:${hex};color:(#[0-9a-f]{3,6})">`, 'i'));
      expect(row, hex).not.toBeNull();
      expect(contrast(parseColor(hex)!, parseColor(row![1]!)!), hex).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('uses fixed neutral text colors that pass 4.5:1 on the page background', () => {
    const style = kitPage(full()).match(/<style>([^]*?)<\/style>/)![1]!;
    const background = style.match(/body\{[^}]*background:(#[0-9a-f]{6})/i)![1]!;
    const inks = new Set([...style.matchAll(/(?<![-a-z])color:(#[0-9a-f]{6})/gi)].map((m) => m[1]!));
    expect(inks.size).toBeGreaterThan(0);
    for (const ink of inks) expect(contrast(parseColor(ink)!, parseColor(background)!), ink).toBeGreaterThanOrEqual(4.5);
  });

  it('escapes every string that comes from the brand', () => {
    const evil = (label: string) => `<script>alert(1)</script>"${label}'&`;
    const brand = readBrand({
      ...BRAND,
      brand: { title: evil('title'), description: evil('desc') },
      tokens: [token('color.ink', '#1E1F21', { description: evil('cdesc') })],
      assets: [asset('logos/mark-light', {}, { background: 'light', description: evil('alt'), lockup: 'horizontal', do: [evil('do')], dont: [evil('dont')] })],
    });
    const html = kitPage({
      brand,
      logos: chooseLogos(brand, {}).chosen,
      colors: planColors(brand).colors,
      fonts: `Fonts\n\n${evil('family')}\n  Used for: ${evil('used')}\n  License: ${evil('license')}\n\nFallback fonts, not shipped: ${evil('fallback')}\n`,
      paths: [],
      company: {
        description: evil('companydesc'),
        boilerplate: evil('boiler'),
        facts: [{ label: evil('flabel'), value: evil('fvalue') }],
        contact: { name: evil('cname'), role: evil('crole'), email: evil('cemail'), phone: evil('cphone'), url: evil('curl') },
      },
      terms: { text: evil('tterms'), url: evil('turl') },
      note: evil('note'),
    });
    expect(html.match(/<script/gi)).toBeNull();
    for (const label of ['title', 'cdesc', 'alt', 'do', 'dont', 'family', 'used', 'license', 'fallback', 'companydesc', 'boiler', 'flabel', 'fvalue', 'cname', 'crole', 'cemail', 'cphone', 'curl', 'tterms', 'turl', 'note'])
      expect(html, label).toContain(`&#60;script&#62;alert(1)&#60;/script&#62;&#34;${label}&#39;&#38;`);
    // a quote in an attribute cannot end it
    expect(html).not.toMatch(/(?:src|href|alt)="[^"]*"[^>\s]*alert/);
  });
});

describe('the kit with no contact and no terms', () => {
  // The files as the plugin wrote them before the contact, the terms and index.html: every one is the same bytes now
  const OLD_SHA: Record<string, string> = {
    'about.txt': '826e13724b9ea087ae2c5674a432c47a36726bbc8580bdffc55f7861adc85d24',
    'colors/colors.css': '6c6030c2a25f4d9977aec1473cb3530813a8ece3b42fc81b63da7a3edd90df43',
    'colors/colors.json': 'c5cffec94a5f1ef326ceff8872c55ba9b49e6c74a3cc57ed7a142f882d3de677',
    'colors/colors.txt': '830b0a24a587d2f7790ee73bddc61f74c1157197f82c896ffe8b0e8d8ad9acd0',
    'fonts.txt': 'e0b10efcfac0987c98f81350ab919b2e66f5301835bbc5b18f39d96d07a90f4c',
    'logos/logos.txt': '17dec4cb055cc56947ae42bcd39fb3a908a0d187683ab9417be9593ffe5ad894',
    'logos/on-dark-backgrounds/mark-dark.svg': '47255e24108165e401cbe957ada22f3e80ef95cae7e7d3c940ef294dcaf45544',
    'logos/on-light-backgrounds/mark-light.svg': '60a29e6d75e78cd0097b9b6cbfbabeee9ad904b31046d34d6d116db388e12f86',
  };
  const OLD_README =
    "Acme Co: press kit\n\nWhat is in this folder\n\n  logos/          The logo files as they are. Use the ones in on-light-backgrounds/ on a light background and the ones in on-dark-backgrounds/ on a dark one. logos.txt says what the brand states about each.\n  colors/         The brand colors: colors.txt to read, colors.css for a web page, colors.json for a program.\n  fonts.txt       The fonts the brand uses, where each comes from, and under what license, where the brand states one.\n  about.txt       The brand name and a short description, to quote.\n\npress-kit.zip holds the same files.\n\nThe logos are the brand's own files, not redrawn.\n";
  const sha = (body: Buffer | string) => createHash('sha256').update(body).digest('hex');
  const trimmed = { tokens: BRAND.tokens.slice(0, 3), assets: BRAND.assets.slice(0, 2) };

  it('has the same bytes in every existing file, README.txt with one new line, and gains only index.html', () => {
    const made = world({ brand: trimmed, options: { pdf: false } });
    const ran = plugin(made.request);
    expect(ran.status, ran.out + ran.err).toBe(0);
    const folder = path.join(made.outDir, 'press-kit');
    const files = walk(folder);
    expect(files.filter((file) => !(file in OLD_SHA) && file !== 'README.txt')).toEqual(['index.html']);
    for (const [file, hash] of Object.entries(OLD_SHA)) expect(sha(fs.readFileSync(path.join(folder, file))), file).toBe(hash);
    const readme = fs.readFileSync(path.join(folder, 'README.txt'), 'utf-8');
    const line = readme.split('\n').find((row) => row.startsWith('  index.html'))!;
    expect(line).toMatch(/^ {2}index\.html {6}\S/);
    expect(readme.replace(`${line}\n`, '')).toBe(OLD_README);
    expect(readme.indexOf(line)).toBe(OLD_README.indexOf('  logos/'));
    expect(readme).not.toContain('Terms of use');
  });
});

describe('the entry with contact, terms and the page', () => {
  const options = {
    pdf: false,
    company: { contact: { name: 'Ada Example', email: 'press@acme.example' }, facts: [{ label: 'Legal name', value: 'Acme Ltd' }] },
    terms: { text: 'Use the logos as supplied.', url: 'https://acme.example/terms' },
  };

  it('writes index.html at the root of the folder and the zip, and the contact and terms into about.txt and README.txt', () => {
    const made = world({ options });
    const ran = plugin(made.request);
    expect(ran.status, ran.out + ran.err).toBe(0);
    const folder = path.join(made.outDir, 'press-kit');
    const page = fs.readFileSync(path.join(folder, 'index.html'), 'utf-8');
    expect(page).toContain('press@acme.example');
    expect(page).toContain('Use the logos as supplied.');
    const zipped = unzip(path.join(made.outDir, 'press-kit.zip')).find(([name]) => name === 'press-kit/index.html')!;
    expect(zipped[1].equals(fs.readFileSync(path.join(folder, 'index.html')))).toBe(true);
    const about = fs.readFileSync(path.join(folder, 'about.txt'), 'utf-8');
    expect(about).toContain('Contact:\n  Name: Ada Example\n  Email: press@acme.example\n');
    expect(about).toContain('Terms of use:\nUse the logos as supplied.\nFull terms: https://acme.example/terms\n');
    const readme = fs.readFileSync(path.join(folder, 'README.txt'), 'utf-8');
    expect(readme).toContain('Terms of use: see about.txt');
    expect(readme.indexOf('  index.html')).toBeLessThan(readme.indexOf('  logos/'));
    // every relative link of the page is a file of the kit
    const relative = [...page.matchAll(/\s(?:src|href)="([^"#:]+)"/g)].map((m) => m[1]!);
    expect(relative.length).toBeGreaterThan(0);
    for (const ref of relative) expect(fs.existsSync(path.join(folder, ref)), ref).toBe(true);
  });

  it('names a wrong contact key without losing the kit or the page', () => {
    const made = world({ options: { pdf: false, company: { contact: { email: 'nope' } } } });
    const ran = plugin(made.request);
    expect(ran.status).toBe(0);
    expect(findingsOf(ran.out).filter((f) => f.code === `${NAME}/option-invalid`).map((f) => f.path)).toEqual(['options.company.contact.email']);
    expect(fs.existsSync(path.join(made.outDir, 'press-kit/index.html'))).toBe(true);
  });
});

describe.skipIf(!CHROME)('the PDF with contact and terms, in a real browser', () => {
  it('has the contact and the terms in its text', () => {
    const made = world({ options: { company: { contact: { name: 'Ada Example', email: 'press@acme.example' } }, terms: { text: 'Use the logos as supplied.' } } });
    const ran = plugin(made.request, { BLAZON_CHROME: CHROME });
    expect(ran.status, ran.out + ran.err).toBe(0);
    const words = spawnSync('pdftotext', [path.join(made.outDir, 'press-kit/press-kit.pdf'), '-'], { encoding: 'utf-8' });
    expect(words.status, 'pdftotext (poppler) reads the PDF').toBe(0);
    expect(words.stdout).toContain('Ada Example');
    expect(words.stdout).toContain('press@acme.example');
    expect(words.stdout).toContain('Use the logos as supplied.');
  }, 120_000);
});
