import { describe, it, expect } from 'vitest';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from '../../support/spawn';
import { convertColor, sameColor } from '../../../src/shipped/shadcn/color.js';
import { formatShadcnCss, formatShadcnTheme } from '../../../src/shipped/shadcn/css.js';
import { parseOptions } from '../../../src/shipped/shadcn/options.js';
import { NAME } from '../../../src/shipped/shadcn/request.js';
import type { ShadcnMapping } from '../../../src/shipped/shadcn/derive.js';
import { ROOT_DIR } from '../support/spec.js';
import { tempDir } from '../../support/project';

// The shadcn v4 options (format, themeInline, chart) and the destructive-duplicate warning of blazon.shadcn, through the entry as blazon runs it.

const ENTRY = path.join(ROOT_DIR, 'src/shipped/shadcn/main.ts');
const TSX = pathToFileURL(path.join(ROOT_DIR, 'node_modules/tsx/dist/esm/index.mjs')).href;
const FIXTURES = path.join(ROOT_DIR, 'test/plugins/shipped/fixtures/tokens-plugins');

const item = (tokenPath: string, value: string) => ({ path: tokenPath, type: 'color', value });

/** A small brand with an oklch value, a value that is no color, a dark context under `.dark` and a group of colors for charts. */
function acmeBrand(extra: ReturnType<typeof item>[] = []) {
  return {
    format: 'blazon-brand',
    version: 2,
    theme: {
      roles: { background: '#ffffff', text: '#111111', accent: 'oklch(0.6 0.2 30)', accentText: '#ffffff', radius: '8px' },
      tokens: { background: 'surface.bg', text: 'text.body', accent: 'brand.main', accentText: 'surface.bg', radius: 'radius.base' },
    },
    tokens: [
      item('surface.bg', '#ffffff'),
      item('text.body', '#111111'),
      item('brand.main', 'oklch(0.6 0.2 30)'),
      item('brand.hex', '#ee0000'),
      item('brand.short', '#E00'),
      item('brand.other', '#0a7'),
      item('brand.fancy', 'var(--acme-fancy)'),
      { path: 'radius.base', type: 'dimension', value: '8px' },
      ...extra,
    ],
    groups: [],
    contexts: [
      {
        modifier: 'theme',
        context: 'dark',
        selector: '[data-theme="dark"]',
        tokens: [item('surface.bg', '#000000'), item('brand.main', 'oklch(0.8 0.1 250)')],
      },
    ],
  };
}

function run(request: object) {
  const out = tempDir('blazon-shadcn-v4-');
  const input = JSON.stringify({ v: 2, type: 'build', out_dir: out, options: {}, ...request });
  const ran = spawnSync(process.execPath, ['--import', TSX, ENTRY], { input, encoding: 'utf-8', env: { PATH: '/usr/bin:/bin', HOME: os.homedir() } });
  const files: Record<string, string> = {};
  for (const name of fs.readdirSync(out)) files[name] = fs.readFileSync(path.join(out, name), 'utf-8');
  return { status: ran.status, answer: ran.status === 0 ? JSON.parse(ran.stdout) : ran.stdout, files };
}

function check(brand: object, options: object) {
  const input = JSON.stringify({ v: 1, type: 'check', options, brand });
  const ran = spawnSync(process.execPath, ['--import', TSX, ENTRY], { input, encoding: 'utf-8', env: { PATH: '/usr/bin:/bin', HOME: os.homedir() } });
  return { status: ran.status, answer: ran.status === 0 ? JSON.parse(ran.stdout) : ran.stdout };
}

const fixture = (name: string, file: string) => fs.readFileSync(path.join(FIXTURES, name, file), 'utf-8');

describe('the default output', () => {
  it.each(['example', 'starter'])('is unchanged for the %s brand when the new options are set to their defaults', (name) => {
    const brand = JSON.parse(fixture(name, 'brand.json'));
    const options = JSON.parse(fixture(name, 'shadcn-options.json'));
    const plain = run({ brand, options });
    const explicit = run({ brand, options: { ...options, format: 'as-authored', themeInline: false } });
    expect(Object.keys(plain.files).sort()).toEqual(['shadcn.css', 'shadcn.json']);
    expect(explicit.files).toEqual(plain.files);
    expect(plain.answer).toEqual({ findings: [] });
  });

  it('writes shadcn.css through formatShadcnCss as it did, and the build says nothing about colors', () => {
    const { files, answer } = run({ brand: acmeBrand() });
    const mapping = JSON.parse(files['shadcn.json']!) as ShadcnMapping;
    expect(files['shadcn.css']).toBe(
      formatShadcnCss(mapping, [{ modifier: 'theme', context: 'dark', selector: '[data-theme="dark"]', tokens: [item('surface.bg', '#000000'), item('brand.main', 'oklch(0.8 0.1 250)')] }]),
    );
    expect(files['shadcn.css']).toContain('--primary: oklch(0.6 0.2 30);');
    expect(answer).toEqual({ findings: [] });
  });
});

describe('format', () => {
  it('writes oklch, in :root and in the dark context, and leaves shadcn.json as authored', () => {
    const plain = run({ brand: acmeBrand() });
    const { files, answer } = run({ brand: acmeBrand(), options: { format: 'oklch' } });
    expect(answer).toEqual({ findings: [] });
    expect(files['shadcn.css']).toContain('--background: oklch(1 0 0);');
    expect(files['shadcn.css']).toContain('--foreground: oklch(0.1776 0 0);');
    expect(files['shadcn.css']).toContain('--primary: oklch(0.6 0.2 30);');
    expect(files['shadcn.css']).toContain('--radius: 8px;');
    const dark = files['shadcn.css']!.slice(files['shadcn.css']!.indexOf('[data-theme="dark"] {'));
    expect(dark).toContain('  --background: oklch(0 0 0);');
    expect(dark).toContain('  --primary: oklch(0.8 0.1 250);');
    expect(files['shadcn.json']).toBe(plain.files['shadcn.json']);
  });

  it('writes hex, with the oklch value brought into sRGB', () => {
    const { files } = run({ brand: acmeBrand(), options: { format: 'hex' } });
    expect(files['shadcn.css']).toContain('--background: #ffffff;');
    expect(files['shadcn.css']).toMatch(/--primary: #[0-9a-f]{6};/);
    expect(files['shadcn.css']).not.toContain('oklch(');
  });

  it('keeps a value it cannot convert as authored and says so in a warning, once', () => {
    const brand = acmeBrand();
    const { files, answer } = run({ brand, options: { format: 'oklch', variables: { ring: 'brand.fancy', 'sidebar-ring': 'brand.fancy' } } });
    expect(files['shadcn.css']).toContain('--ring: var(--acme-fancy);');
    expect(answer.findings).toEqual([
      { code: `${NAME}/format-unconverted`, severity: 'warning', path: 'ring', message: '--ring is var(--acme-fancy), which is not a color oklch can write: the authored value is kept' },
    ]);
  });

  it('converts and compares as colors: hex short and long, and oklch of the same color, are equal', () => {
    expect(convertColor('#E00', 'hex')).toBe('#ee0000');
    expect(convertColor('#ee000080', 'oklch')).toMatch(/^oklch\(.* \/ 0\.502\)$/);
    expect(convertColor('#E00', 'as-authored')).toBe('#E00');
    expect(sameColor('#E00', '#ee0000')).toBe(true);
    expect(sameColor('#E00', convertColor('#ee0000', 'oklch')!)).toBe(true);
    expect(sameColor('#E00', '#0a7')).toBe(false);
    expect(sameColor('#E00', 'var(--x)')).toBeUndefined();
  });
});

describe('themeInline', () => {
  it('writes shadcn-theme.css with the dark variant, a --color line for each color variable written and the radius steps, and leaves shadcn.css as it was', () => {
    const plain = run({ brand: acmeBrand() });
    const { files } = run({ brand: acmeBrand(), options: { themeInline: true } });
    expect(Object.keys(files).sort()).toEqual(['shadcn-theme.css', 'shadcn.css', 'shadcn.json']);
    expect(files['shadcn.css']).toBe(plain.files['shadcn.css']);
    const theme = files['shadcn-theme.css']!;
    expect(theme).toContain('@custom-variant dark (&:is(.dark *));');
    expect(theme).toContain('@theme inline {');
    const mapping = JSON.parse(files['shadcn.json']!) as ShadcnMapping;
    for (const name of Object.keys(mapping.variables).filter((n) => n !== 'radius')) expect(theme).toContain(`  --color-${name}: var(--${name});`);
    expect(theme).not.toContain('--color-radius');
    expect(theme).not.toContain('--color-chart-1');
    for (const line of ['--radius-sm: calc(var(--radius) * 0.6);', '--radius-md: calc(var(--radius) * 0.8);', '--radius-lg: var(--radius);', '--radius-xl: calc(var(--radius) * 1.4);'])
      expect(theme).toContain(`  ${line}`);
  });

  it('is written for the starter brand too, with a line for every supplied color variable', () => {
    const brand = JSON.parse(fixture('starter', 'brand.json'));
    const { files } = run({ brand, options: { ...JSON.parse(fixture('starter', 'shadcn-options.json')), themeInline: true } });
    expect(files['shadcn-theme.css']).toContain('--color-chart-5: var(--chart-5);');
    expect(files['shadcn-theme.css']).toContain('--color-sidebar-ring: var(--sidebar-ring);');
    expect(formatShadcnTheme(JSON.parse(files['shadcn.json']!))).toBe(files['shadcn-theme.css']);
  });
});

describe('chart', () => {
  const colors = ['c.one', 'c.two', 'c.three', 'c.four', 'c.five', 'c.six'].map((p, i) => item(p, `#0${i}0${i}0${i}`));

  it('fills chart-1 to chart-5 from the first five color tokens of the group, in source order', () => {
    const { files, answer } = run({ brand: acmeBrand(colors), options: { chart: 'c' } });
    expect(answer).toEqual({ findings: [] });
    const mapping = JSON.parse(files['shadcn.json']!) as ShadcnMapping;
    expect(mapping.variables['chart-1']).toMatchObject({ token: 'c.one', from: 'config' });
    expect(mapping.variables['chart-5']).toMatchObject({ token: 'c.five' });
    expect(mapping.unsupplied).not.toContain('chart-3');
  });

  it('warns when the group has fewer than five, and fills what it can', () => {
    const { files, answer } = run({ brand: acmeBrand(colors.slice(0, 3)), options: { chart: 'c' } });
    expect(answer.findings).toEqual([{ code: `${NAME}/chart-group-short`, severity: 'warning', path: 'c', message: 'chart "c" has 3 color tokens, so chart-4, chart-5 are not supplied by it' }]);
    const mapping = JSON.parse(files['shadcn.json']!) as ShadcnMapping;
    expect(mapping.variables['chart-3']).toMatchObject({ token: 'c.three' });
    expect(mapping.unsupplied).toContain('chart-4');
  });

  it('lets a variables entry for the same name win', () => {
    const { files } = run({ brand: acmeBrand(colors), options: { chart: 'c', variables: { 'chart-2': 'brand.other' } } });
    const mapping = JSON.parse(files['shadcn.json']!) as ShadcnMapping;
    expect(mapping.variables['chart-2']).toMatchObject({ token: 'brand.other' });
    expect(mapping.variables['chart-3']).toMatchObject({ token: 'c.three' });
  });
});

describe('destructive-duplicate (the check role)', () => {
  const pick = (variables: object, more: object = {}) => ({ variables, ...more });
  const partners = (answer: { findings: { message: string }[] }) => [...new Set(answer.findings.map((f) => /same color as `(\w+)`/.exec(f.message)![1]))];
  const codes = (answer: { findings: { code: string }[] }) => answer.findings.map((f) => f.code);

  it('warns when destructive is the same color as primary in another notation, and names token, value, partner and context', () => {
    const brand = acmeBrand();
    brand.theme.roles.accent = '#ee0000';
    brand.tokens[2] = item('brand.main', '#ee0000');
    brand.contexts[0]!.tokens = [item('surface.bg', '#000000')];
    const { status, answer } = check(brand, pick({ destructive: 'brand.short', ring: 'brand.other' }));
    expect(status).toBe(0);
    // the same in the default context and in dark, where nothing changes it
    expect(answer.findings).toHaveLength(2);
    expect(answer.findings[1].message).toContain('in the dark context');
    expect(answer.findings[0]).toEqual({
      code: `${NAME}/destructive-duplicate`,
      severity: 'warning',
      path: 'brand.short',
      message:
        '`destructive` ({brand.short}, #E00) is the same color as `primary` ({brand.main}) in the default context: an error looks like a main action. Point `variables.destructive` at a color that differs from primary, or list the pair in `allowSame`.',
    });
  });

  it('compares an oklch value with its hex form, and checks every context', () => {
    const brand = acmeBrand();
    // dark: primary becomes the color destructive has there
    brand.contexts[0]!.tokens = [item('brand.main', '#0a7')];
    const { answer } = check(brand, pick({ destructive: 'brand.other', ring: 'text.body' }));
    expect(codes(answer)).toEqual([`${NAME}/destructive-duplicate`]);
    expect(answer.findings[0].message).toContain('in the dark context');
    expect(answer.findings[0].message).toContain('({brand.other}, #0a7)');
  });

  it('does not warn for different colors, or when destructive is not supplied', () => {
    expect(check(acmeBrand(), pick({ destructive: 'brand.other' })).answer).toEqual({ findings: [] });
    expect(check(acmeBrand(), {}).answer).toEqual({ findings: [] });
  });

  it('also compares with accent and ring', () => {
    const brand = acmeBrand();
    const { answer } = check(brand, pick({ destructive: 'brand.other', ring: 'brand.other', accent: 'brand.other' }));
    expect(partners(answer)).toEqual(['accent', 'ring']);
  });

  it('is silenced by allowSame for exactly the pair named, so a later change to ring still warns', () => {
    const variables = { destructive: 'brand.other', ring: 'brand.other', accent: 'brand.other' };
    const silenced = check(acmeBrand(), pick(variables, { allowSame: { destructive: 'accent' } }));
    expect(partners(silenced.answer)).toEqual(['ring']);
    expect(check(acmeBrand(), pick(variables, { allowSame: { destructive: ['accent', 'ring'] } })).answer).toEqual({ findings: [] });
  });

  it('is not said by the build, so a blazon build does not print it twice', () => {
    expect(run({ brand: acmeBrand(), options: pick({ destructive: 'brand.main' }) }).answer).toEqual({ findings: [] });
  });
});

describe('the new options are validated', () => {
  it('reads format, themeInline, chart and allowSame', () => {
    expect(parseOptions({ format: 'hex', themeInline: true, chart: 'chart.set', allowSame: { destructive: ['primary', 'ring'] } })).toEqual({
      options: { variables: {}, format: 'hex', themeInline: true, chart: 'chart.set', allowSame: ['primary', 'ring'] },
      findings: [],
    });
  });

  it.each([
    ['a format that is not one', { format: 'rgb' }, 'format must be one of "as-authored", "oklch", "hex"'],
    ['themeInline that is not a boolean', { themeInline: 'yes' }, 'themeInline must be true or false'],
    ['an empty chart', { chart: '' }, 'chart must be a token group path (a string)'],
    ['allowSame that is not an object', { allowSame: 'primary' }, 'allowSame must be an object'],
    ['an allowSame variable that is not destructive', { allowSame: { ring: 'primary' } }, 'allowSame has unknown variable "ring"; the only one is destructive'],
    ['an allowSame partner that is not compared', { allowSame: { destructive: 'border' } }, 'allowSame.destructive must be primary, accent, ring or a list of them'],
  ])('says %s in an option-invalid finding', (_, raw, message) => {
    const { findings } = parseOptions(raw);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ code: `${NAME}/option-invalid`, severity: 'error', path: 'options' });
    expect(findings[0]!.message).toContain(message);
  });
});
