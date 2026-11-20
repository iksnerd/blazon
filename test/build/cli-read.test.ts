import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from '../support/spawn';
import { REPO } from '../support/paths';
import { starterProject } from '../support/project';

// The read commands print what the brand says and write nothing. Each takes --json, with `command` and `passed` first, as `check --json` does.

const blazon = (...args: string[]) =>
  spawnSync(process.execPath, ['--import', 'tsx', path.join(REPO, 'scripts/blazon-src.ts'), ...args], {
    encoding: 'utf-8',
    cwd: REPO,
    env: { ...process.env, NO_COLOR: '1' },
    input: '',
  });

let root: string;
beforeAll(async () => {
  root = await starterProject();
}, 120_000);

describe('blazon list', () => {
  it('lists the tokens a line each, under a header for each top-level group', () => {
    const ran = blazon('list', root);
    expect(ran.status, ran.stderr).toBe(0);
    expect(ran.stdout).toMatch(/^ {2}color$/m);
    expect(ran.stdout).toMatch(/^ {2}text.primary +color +#1E1F21 +-> color\.ink\.graphite$/m);
    expect(ran.stdout).toMatch(/^ {2}\d+ tokens;/m);
    const colors = blazon('list', 'color', root, '--type', 'color');
    expect(colors.stdout).toContain('color.base.bone');
    expect(colors.stdout).not.toContain('text.primary');
  }, 120_000);

  it('prints the list as JSON, with the group and the type when they were given', () => {
    const all = JSON.parse(blazon('list', root, '--json').stdout);
    expect(all).toMatchObject({ command: 'list', passed: true });
    expect(all.group).toBeUndefined();
    expect(all.tokens).toContainEqual({ path: 'text.primary', type: 'color', value: '#1E1F21', aliasOf: 'color.ink.graphite', tier: 'semantic' });
    const some = JSON.parse(blazon('list', 'radius', root, '--type', 'dimension', '--json').stdout);
    expect(some).toMatchObject({ group: 'radius', type: 'dimension' });
    expect(some.tokens.every((t: { path: string }) => t.path.startsWith('radius.'))).toBe(true);
  }, 120_000);

  it('exits 2 and prints nothing on standard output for an unknown group or type', () => {
    for (const args of [
      ['list', 'colr', root],
      ['list', root, '--type', 'colour'],
    ]) {
      const ran = blazon(...args);
      expect(ran.status, args.join(' ')).toBe(2);
      expect(ran.stdout).toBe('');
      expect(ran.stderr).toMatch(/^blazon list: /);
    }
  }, 120_000);
});

describe('blazon get, without a token path', () => {
  it('exits 2 with no path and says to use blazon list', () => {
    const ran = blazon('get');
    expect(ran.status).toBe(2);
    expect(ran.stdout).toBe('');
    expect(ran.stderr).toMatch(/^blazon get: give a token path.*blazon list shows the token paths/);
    const json = blazon('get', '--json');
    expect(json.status).toBe(2);
    expect(JSON.parse(json.stdout)).toMatchObject({ command: 'get', passed: false });
  }, 120_000);

  it('exits 2 for a group path and names blazon list with the group', () => {
    const ran = blazon('get', 'color', root);
    expect(ran.status).toBe(2);
    expect(ran.stdout).toBe('');
    expect(ran.stderr).toMatch(/^blazon get: "color" is a group of tokens, not one token; `blazon list color` lists its tokens\./);
  }, 120_000);

  it('has no --type', () => {
    const ran = blazon('get', 'text.primary', root, '--type', 'color');
    expect(ran.status).toBe(2);
    expect(ran.stdout).toBe('');
    expect(ran.stderr).toMatch(/unknown option "--type"/);
  }, 120_000);
});

describe('blazon get', () => {
  it('prints the token and its CSS name, as text and as JSON', () => {
    const text = blazon('get', 'text.primary', root);
    expect(text.status, text.stderr).toBe(0);
    expect(text.stdout).toMatch(/theme\.css\s+--text-primary/);
    const json = blazon('get', 'text.primary', root, '--json');
    expect(JSON.parse(json.stdout)).toMatchObject({
      command: 'get',
      passed: true,
      token: {
        path: 'text.primary',
        type: 'color',
        names: { theme: { variable: '--text-primary' } },
        sourceFile: 'tokens/colors.json',
      },
    });
  }, 120_000);

  it('exits 2 for a token that is not there, with the closest one, and says it as JSON too', () => {
    const ran = blazon('get', 'text.primry', root, '--json');
    expect(ran.status).toBe(2);
    expect(ran.stderr).toContain('did you mean "text.primary"');
    expect(JSON.parse(ran.stdout)).toMatchObject({ command: 'get', passed: false, error: { message: expect.stringContaining('no token') } });
  }, 120_000);
});

describe('blazon rules', () => {
  it('lists the rules of a group, of the whole brand, and of a folder given as the only argument', () => {
    const group = JSON.parse(blazon('rules', 'text', root, '--json').stdout);
    expect(group).toMatchObject({ command: 'rules', kind: 'group', entries: [{ at: 'text', kind: 'group', role: 'text' }] });
    const all = JSON.parse(blazon('rules', root, '--json').stdout);
    expect(all.kind).toBe('brand');
    expect(all.entries.map((e: { at: string }) => e.at)).toEqual(expect.arrayContaining(['text', 'color.signal']));
    expect(blazon('rules', 'nothing-here', root).status).toBe(2);
  }, 120_000);
});

describe('blazon can', () => {
  it('exits 0 for a pair the brand lists, 1 for a denied one, 2 for an unknown token', () => {
    const allowed = blazon('can', 'text.primary', 'surface.canvas', root);
    expect(allowed.status, allowed.stderr).toBe(0);
    expect(allowed.stdout).toContain('allowed');
    const denied = blazon('can', 'color.signal.orange', 'surface.canvas', root, '--json');
    expect(denied.status).toBe(1);
    expect(JSON.parse(denied.stdout)).toMatchObject({ command: 'can', passed: false, allowed: false, reason: expect.stringContaining('denies "text"') });
    expect(blazon('can', 'text.primary', 'surface.nope', root).status).toBe(2);
  }, 120_000);

  it('--role ui judges a non-text pair by 3:1, and refuses an unknown role', () => {
    const ui = blazon('can', 'color.signal.orange', 'surface.canvas', root, '--role', 'ui', '--json');
    expect(JSON.parse(ui.stdout)).toMatchObject({ command: 'can', role: 'ui', contrast: { threshold: 3 } });
    const text = blazon('can', 'text.primary', 'surface.canvas', root, '--role', 'ui');
    expect(text.status, text.stderr).toBe(0);
    expect(text.stdout).toContain('as a non-text element (--role ui)');
    expect(blazon('can', 'text.primary', 'surface.canvas', root, '--role', 'icon').status).toBe(2);
  }, 120_000);

  it('--theme judges the pair in a resolver context, and an unknown theme exits 2 with the valid ones', () => {
    const dark = blazon('can', 'text.primary', 'surface.canvas', root, '--theme', 'dark', '--json');
    expect(dark.status, dark.stderr).toBe(0);
    expect(JSON.parse(dark.stdout)).toMatchObject({ command: 'can', allowed: true, theme: 'dark' });
    const ring = JSON.parse(blazon('can', 'color.signal.orange', 'surface.background', root, '--role', 'ui', '--theme', 'dark', '--json').stdout);
    expect(ring).toMatchObject({ theme: 'dark', contrast: { ratio: 5.29 } });
    const unknown = blazon('can', 'text.primary', 'surface.canvas', root, '--theme', 'sepia');
    expect(unknown.status).toBe(2);
    expect(unknown.stderr).toContain('"light", "dark"');
  }, 120_000);
});

describe('blazon fonts and blazon logo', () => {
  it('print the fonts the brand loads and the logo variants with their sidecar rules', () => {
    const fonts = JSON.parse(blazon('fonts', root, '--json').stdout);
    expect(fonts).toMatchObject({ command: 'fonts', passed: true });
    expect(fonts.stylesheets.length).toBeGreaterThan(0);
    expect(fonts.families.map((f: { family: string }) => f.family)).toContain('IBM Plex Sans');
    const logo = JSON.parse(blazon('logo', root, '--json').stdout);
    expect(logo).toMatchObject({ command: 'logo', passed: true, variants: [{ variant: 'onLight' }, { variant: 'onDark' }] });
    expect(logo.assets[0].rules).toHaveProperty('clearSpace');
    const wordmark = logo.assets.find((a: { id: string }) => a.id === 'logos/blazon-graphite');
    expect(wordmark.rules.minSize).toEqual({ height: { value: 32, unit: 'px' } });
    const text = blazon('logo', root).stdout;
    expect(text).toContain('Variants');
    expect(text).toContain('min size      height 32px');
  }, 120_000);

  it('--css prints the @font-face rule of the font file, --base moves its path, and --json carries the text', () => {
    const ran = blazon('fonts', root, '--css', '--base', '/fonts/');
    expect(ran.status, ran.stderr).toBe(0);
    expect(ran.stdout).toMatch(/@font-face \{\n {2}font-family: "IBM Plex Mono";\n {2}src: url\("\/fonts\/IBMPlexMono[^"]*\.woff2"\) format\("woff2"\);/);
    expect(ran.stdout).toContain('font-display: swap');
    expect(ran.stdout).toMatch(/^\/\* Stylesheet, not fetched by blazon: https:\/\/fonts\.googleapis\.com/m);
    expect(blazon('fonts', root, '--css').stdout).toMatch(/url\("fonts\/IBMPlexMono/);
    const json = JSON.parse(blazon('fonts', root, '--css', '--json').stdout);
    expect(json.fontFace).toContain('@font-face');
    expect(json.files.length).toBeGreaterThan(0);
    expect(blazon('fonts', root, '--base', '/f/').status).toBe(2);
  }, 120_000);

  it('exit 2 for a folder with no brand book in it', () => {
    expect(blazon('fonts', '/nonexistent-blazon-folder').status).toBe(2);
  }, 120_000);
});

describe('blazon brand', () => {
  it('prints the compiled brand.json, or one part of it, and writes nothing', () => {
    const whole = blazon('brand', root);
    expect(whole.status, whole.stderr).toBe(0);
    expect(JSON.parse(whole.stdout)).toMatchObject({ format: 'blazon-brand', version: 2 });
    const part = blazon('brand', root, '--key', 'theme.roles');
    expect(part.status, part.stderr).toBe(0);
    expect(JSON.parse(part.stdout).accent).toBe('#FF5A1F');
    expect(fs.existsSync(path.join(root, 'dist'))).toBe(false);
  });

  it('exits 2 for a key the document does not have, and prints nothing on standard output', () => {
    const missing = blazon('brand', root, '--key', 'theme.nope');
    expect(missing.status).toBe(2);
    expect(missing.stdout).toBe('');
    expect(missing.stderr).toMatch(/no "theme\.nope"/);
  });
});

describe('blazon list, get and can: tier, theme, pairs and quiet', () => {
  it('list --tier keeps to one tier and --theme lists the values a theme resolves, with the themes named', () => {
    const semantic = JSON.parse(blazon('list', root, '--tier', 'semantic', '--json').stdout);
    expect(semantic).toMatchObject({ tier: 'semantic', themes: ['light', 'dark'] });
    expect(semantic.tokens.every((t: { tier?: string }) => t.tier === 'semantic')).toBe(true);
    const dark = JSON.parse(blazon('list', 'surface', root, '--theme', 'dark', '--json').stdout);
    expect(dark.theme).toBe('dark');
    expect(dark.tokens.find((t: { path: string }) => t.path === 'surface.canvas')).toMatchObject({ value: '#101113', defaultValue: '#D9D6CF' });
    const bad = blazon('list', root, '--tier', 'atom');
    expect(bad.status).toBe(2);
    expect(bad.stderr).toContain('the tiers are primitive, semantic, component');
    expect(blazon('list', root, '--theme', 'sepia').stderr).toContain('"light", "dark"');
  }, 120_000);

  it('get --theme reads the value in a theme and the default value, and an unknown theme exits 2', () => {
    const dark = JSON.parse(blazon('get', 'surface.canvas', root, '--theme', 'dark', '--json').stdout);
    expect(dark.token).toMatchObject({ value: '#101113', defaultValue: '#D9D6CF', theme: 'dark' });
    const unknown = blazon('get', 'surface.canvas', root, '--theme', 'sepia');
    expect(unknown.status).toBe(2);
    expect(unknown.stderr).toContain('"light", "dark"');
  }, 120_000);

  it('can --pair judges each pair in order, exits 1 when one is denied, and --no-verbose drops the checks of an allowed one', () => {
    const ran = blazon('can', root, '--pair', 'text.primary:surface.canvas', '--pair', 'text.primary:surface.inverse', '--no-verbose', '--json');
    expect(ran.status).toBe(1);
    const body = JSON.parse(ran.stdout);
    expect(body).toMatchObject({ command: 'can', passed: false, allowed: false });
    expect(body.results.map((r: { allowed: boolean }) => r.allowed)).toEqual([true, false]);
    expect(body.results[0].checks).toBeUndefined();
    expect(body.results[1].checks.length).toBeGreaterThan(1);
    expect(body.results[1].reason).toContain('Component tokens are not read for pairs');
    const all = blazon('can', root, '--pair', 'text.primary:surface.canvas');
    expect(all.status, all.stderr).toBe(0);
    const single = JSON.parse(blazon('can', 'text.primary', 'surface.canvas', root, '--no-verbose', '--json').stdout);
    expect(single.checks).toBeUndefined();
  }, 120_000);

  it('can wants fg and bg or --pair, exactly one of the two, and a pair written fg:bg', () => {
    for (const args of [[], ['text.primary'], ['text.primary', 'surface.canvas', '--pair', 'a:b'], ['--pair', 'nocolon'], ['--pair', 'text.primary:surface.nope']]) {
      const ran = blazon('can', root, ...args);
      expect(ran.status, args.join(' ')).toBe(2);
    }
  }, 120_000);
});
