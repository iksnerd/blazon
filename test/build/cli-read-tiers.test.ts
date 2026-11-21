import { describe, it, expect, beforeAll } from 'vitest';
import { blazon } from '../support/blazon-src';
import { starterProject } from '../support/init-project';

// `list`, `get` and `can` with --tier, --theme, --pair and --no-verbose. Split from the read-command tests.

let root: string;
beforeAll(async () => {
  root = await starterProject();
}, 120_000);

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
