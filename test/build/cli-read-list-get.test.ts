import { describe, it, expect, beforeAll } from 'vitest';
import { blazon } from '../support/blazon-src';
import { starterProject } from '../support/project';

// The read commands `list` and `get`: the token listing, one token by path, and their refusals. Split from the read-command tests; each prints what the brand says and writes nothing.

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
