import { describe, it, expect } from 'vitest';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from '../../support/spawn';
import { readBrand } from '../../../src/shipped/shadcn/brand.js';
import { deriveShadcn, SHADCN_FROM_ROLES, SHADCN_VARIABLES, type ShadcnMapping } from '../../../src/shipped/shadcn/derive.js';
import { formatShadcnCss } from '../../../src/shipped/shadcn/css.js';
import { parseOptions } from '../../../src/shipped/shadcn/options.js';
import { NAME } from '../../../src/shipped/shadcn/request.js';
import { ROOT_DIR } from '../support/spec.js';
import { tempDir } from '../../support/project';

// blazon.shadcn, the plugin blazon ships to write which token each shadcn/ui variable takes. The derivation is tested on its own; the entry is
// run as blazon runs it; and the mapping written for two real brands is compared with what blazon put in brand.json (`theme.shadcn`, version 1)
// before the plugin existed.

const ENTRY = path.join(ROOT_DIR, 'src/shipped/shadcn/main.ts');
const TSX = pathToFileURL(path.join(ROOT_DIR, 'node_modules/tsx/dist/esm/index.mjs')).href;
const FIXTURES = path.join(ROOT_DIR, 'test/plugins/shipped/fixtures/tokens-plugins');

const item = (tokenPath: string, value: string) => ({ path: tokenPath, type: 'color', value });
const items = [item('surface.bg', '#fff'), item('text.body', '#111'), item('brand.red', '#f00'), item('brand.pink', '#f9c'), item('brand.ink', '#000')];
const roles = { background: '#fff', text: '#111', accent: '#f00', accentText: '#fff' };
const roleTokens = { background: 'surface.bg', text: 'text.body', accent: 'brand.red', accentText: 'surface.bg' };

describe('deriveShadcn', () => {
  it('takes a variable from the role it reads, and says which role and token', () => {
    const { variables } = deriveShadcn(roles, roleTokens, undefined, items);
    expect(variables.primary).toEqual({ token: 'brand.red', value: '#f00', from: 'theme', role: 'accent' });
    expect(variables['card-foreground']).toEqual({ token: 'text.body', value: '#111', from: 'theme', role: 'text' });
    expect(variables['sidebar-ring']).toMatchObject({ token: 'brand.red', role: 'accent' });
  });

  it('lists what nothing supplies, in shadcn order', () => {
    const { variables, unsupplied } = deriveShadcn(roles, roleTokens, undefined, items);
    expect(unsupplied).toContain('destructive');
    expect(unsupplied).toContain('chart-1');
    // no canvas, muted, border or radius role was given
    expect(unsupplied).toContain('secondary');
    expect(unsupplied).toContain('border');
    expect(unsupplied).toEqual(SHADCN_VARIABLES.filter((name) => !variables[name]));
  });

  it('lets a pick fill a gap and win over a role', () => {
    const { variables, unsupplied } = deriveShadcn(roles, roleTokens, { destructive: 'brand.red', 'chart-1': 'brand.pink', ring: 'brand.ink' }, items);
    expect(variables.destructive).toEqual({ token: 'brand.red', value: '#f00', from: 'config' });
    expect(variables['chart-1']).toMatchObject({ value: '#f9c', from: 'config' });
    expect(variables.ring).toMatchObject({ token: 'brand.ink', from: 'config' });
    expect(variables['sidebar-ring']).toMatchObject({ from: 'theme' });
    expect(unsupplied).not.toContain('destructive');
    expect(unsupplied).toContain('chart-2');
  });

  it('ignores a pick of a token that does not exist, and falls back to the role', () => {
    const { variables, unsupplied } = deriveShadcn(roles, roleTokens, { primary: 'no.such', destructive: 'no.such' }, items);
    expect(variables.primary).toMatchObject({ token: 'brand.red', from: 'theme' });
    expect(unsupplied).toContain('destructive');
  });

  it('notes pairs only when the brand declares some, and says whether a rule covers each', () => {
    expect(deriveShadcn(roles, roleTokens, undefined, items).pairs).toBeUndefined();
    const { pairs } = deriveShadcn(roles, roleTokens, undefined, items, [{ fg: '{text.body}', bg: '{surface.bg}' }]);
    expect(pairs).toContainEqual({ background: 'background', foreground: 'foreground', backgroundToken: 'surface.bg', foregroundToken: 'text.body', declared: true });
    expect(pairs).toContainEqual({ background: 'primary', foreground: 'primary-foreground', backgroundToken: 'brand.red', foregroundToken: 'surface.bg', declared: false });
    // a pair with a variable nothing supplies is left out
    expect(pairs!.some((pair) => pair.background === 'secondary')).toBe(false);
  });

  it('counts a pair written on the token a shadcn token aliases', () => {
    const list = [
      item('color.orange', '#f00'),
      item('color.ink', '#000'),
      { ...item('interactive.primary', '#f00'), aliasOf: 'color.orange' },
      { ...item('text.onPrimary', '#000'), aliasOf: 'color.ink' },
    ];
    const { pairs } = deriveShadcn({ accent: '#f00', accentText: '#000' }, { accent: 'interactive.primary', accentText: 'text.onPrimary' }, undefined, list, [
      { fg: '{color.ink}', bg: '{color.orange}' },
    ]);
    expect(pairs).toContainEqual(expect.objectContaining({ background: 'primary', foreground: 'primary-foreground', declared: true }));
  });
});

describe('the brand book stylesheet', () => {
  it('derives its light-mode variables from the same roles as SHADCN_FROM_ROLES', () => {
    const css = fs.readFileSync(path.join(ROOT_DIR, 'src/viewer/index.css'), 'utf-8');
    const root = css.slice(css.indexOf(':root {'), css.indexOf('}', css.indexOf(':root {')));
    const blazonVar: Record<string, string> = { background: 'bg', canvas: 'canvas', text: 'text', muted: 'muted', border: 'border', accent: 'accent', accentText: 'accent-text' };
    for (const [name, role] of Object.entries(SHADCN_FROM_ROLES)) {
      if (role === 'radius') continue;
      expect(root, `--${name}`).toMatch(new RegExp(`\\n  --${name}: var\\(--blazon-${blazonVar[role]!}\\);`));
    }
  });
});

describe('the options', () => {
  it('takes a map of variables to token paths', () => {
    expect(parseOptions({ variables: { ring: 'text.primary' } })).toEqual({ options: { variables: { ring: 'text.primary' } }, findings: [] });
    expect(parseOptions({})).toEqual({ options: { variables: {} }, findings: [] });
  });

  it.each([
    ['options that are not an object', [], 'options must be an object'],
    ['an unknown option', { colors: {} }, 'unknown option "colors"; the option is variables'],
    ['variables that are not an object', { variables: ['ring'] }, 'variables must be an object of shadcn variable names to token paths'],
    ['a variable shadcn does not have', { variables: { glow: 'a.b' } }, 'variables has unknown variable "glow"; known: background,'],
    ['a pick that is not a path', { variables: { ring: 7 } }, 'variables.ring must be a token path (a string)'],
  ])('says %s in an option-invalid finding', (_, raw, message) => {
    const { findings } = parseOptions(raw);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ code: `${NAME}/option-invalid`, severity: 'error', path: 'options' });
    expect(findings[0]!.message).toContain(message);
  });
});

describe('shadcn.css', () => {
  const mapping: ShadcnMapping = {
    variables: { background: { token: 'a.bg', value: '#fff', from: 'theme', role: 'background' }, foreground: { token: 'a.fg', value: '#111', from: 'theme', role: 'text' } },
    unsupplied: ['destructive'],
  };

  it('writes :root, a block for each context that changes a variable, and names what is not supplied', () => {
    const css = formatShadcnCss(mapping, [
      { modifier: 'theme', context: 'dark', selector: '[data-theme="dark"]', tokens: [{ path: 'a.bg', type: 'color', value: '#000' }] },
      { modifier: 'locale', context: 'ja', selector: ':lang(ja)', tokens: [{ path: 'other', type: 'color', value: '#abc' }] },
    ]);
    expect(css).toBe(`/**
 * Blazon Design Tokens, as the variables shadcn/ui reads
 * Auto-generated by Blazon. Do not edit directly.
 *
 * Not supplied, so shadcn's own value stays: destructive.
 * Name a token for each in the plugin's \`variables\` option.
 */

:root {
  --background: #fff;
  --foreground: #111;
}

[data-theme="dark"] {
  --background: #000;
}
`);
  });
});

describe('the entry', () => {
  function run(request: object) {
    const out = tempDir('blazon-shadcn-out-');
    const input = JSON.stringify({ v: 2, type: 'build', out_dir: out, options: {}, ...request });
    const ran = spawnSync(process.execPath, ['--import', TSX, ENTRY], { input, encoding: 'utf-8', env: { PATH: '/usr/bin:/bin', HOME: os.homedir() } });
    const files: Record<string, string> = {};
    for (const name of fs.readdirSync(out)) files[name] = fs.readFileSync(path.join(out, name), 'utf-8');
    return { status: ran.status, answer: ran.status === 0 ? JSON.parse(ran.stdout) : ran.stdout, files };
  }
  const fixture = (name: string, file: string) => fs.readFileSync(path.join(FIXTURES, name, file), 'utf-8');

  it.each(['example', 'starter'])('writes, for the %s brand, the mapping brand.json held as theme.shadcn before the plugin existed, byte for byte', (name) => {
    const { status, answer, files } = run({ brand: JSON.parse(fixture(name, 'brand.json')), options: JSON.parse(fixture(name, 'shadcn-options.json')) });
    expect(status).toBe(0);
    expect(answer).toEqual({ findings: [] });
    expect(Object.keys(files).sort()).toEqual(['shadcn.css', 'shadcn.json']);
    expect(files['shadcn.json']).toBe(fixture(name, 'shadcn-old-mapping.json'));
  });

  it('writes shadcn.css from the same mapping, with the dark context under its selector', () => {
    const brand = JSON.parse(fixture('example', 'brand.json'));
    const { files } = run({ brand, options: JSON.parse(fixture('example', 'shadcn-options.json')) });
    const mapping = JSON.parse(files['shadcn.json']!) as ShadcnMapping;
    const root = files['shadcn.css']!.slice(files['shadcn.css']!.indexOf(':root {'), files['shadcn.css']!.indexOf('}'));
    for (const [name, entry] of Object.entries(mapping.variables)) expect(root).toContain(`  --${name}: ${entry.value};`);
    expect(files['shadcn.css']).toContain('[data-theme="dark"] {');
    expect(Object.keys(readBrand(brand).contexts.map((c) => c.selector))).not.toHaveLength(0);
  });

  it('reports a pick that names no token as an error finding and falls back to the role', () => {
    const brand = JSON.parse(fixture('starter', 'brand.json'));
    const { answer, files } = run({ brand, options: { variables: { primary: 'no.such.token' } } });
    expect(answer.findings).toEqual([
      { code: `${NAME}/token-missing`, severity: 'error', path: 'no.such.token', message: 'variables.primary points at {no.such.token}, which is not a token' },
    ]);
    expect((JSON.parse(files['shadcn.json']!) as ShadcnMapping).variables.primary).toMatchObject({ from: 'theme', role: 'accent' });
  });

  it('says what the starter leaves unsupplied when no pick is made, and supplies every variable when they all are', () => {
    const brand = JSON.parse(fixture('starter', 'brand.json'));
    const bare = JSON.parse(run({ brand }).files['shadcn.json']!) as ShadcnMapping;
    expect(bare.unsupplied).toEqual(['destructive', 'chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5']);
    const picked = JSON.parse(run({ brand, options: JSON.parse(fixture('starter', 'shadcn-options.json')) }).files['shadcn.json']!) as ShadcnMapping;
    expect(picked.unsupplied).toEqual([]);
    expect(picked.pairs).toContainEqual(expect.objectContaining({ background: 'primary', foreground: 'primary-foreground', declared: true }));
  });

  it('needs no site_dir, and refuses a request of version 1 or a brand of version 1', () => {
    const brand = { format: 'blazon-brand', version: 2 };
    expect(run({ brand }).status).toBe(0);
    expect(run({ v: 1, brand }).answer).toBe('the request is version 1; this plugin speaks version 2\n');
    expect(run({ brand: { ...brand, version: 1 } }).answer).toBe('the brand in the request is version 1; this reader understands version 2\n');
  });
});
