import fs from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { compileBlazonData } from '../../../src/core/index.js';
import { CHECKS } from '../../../src/core/checker/catalogue.js';
import { starterProject } from '../../support/init-project.js';
import { TEST_CONFIG, writeProject } from '../../support/helpers.js';

// A context that leaves a default token out cannot take its custom property away in CSS: theme.css keeps the default's value there.
// `context-css-unchanged` says so once per context, as an info note, and only when a context removes something.

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

const colors = (names: string[]) => ({ color: { $type: 'color', ...Object.fromEntries(names.map((name) => [name, { $value: '#111111' }])) } });

/** The default context has every name in `light`; the other context's file has only the names in `other`. */
function project(light: string[], other: string[], modifier = 'theme', context = 'dark'): string {
  const root = writeProject({
    'blazon.resolver.json': {
      version: '2025.10',
      modifiers: { [modifier]: { contexts: { light: [{ $ref: 'tokens/light.json' }], [context]: [{ $ref: 'tokens/other.json' }] }, default: 'light' } },
      resolutionOrder: [{ $ref: `#/modifiers/${modifier}` }],
    },
    'tokens/light.json': colors(light),
    'tokens/other.json': colors(other),
  });
  roots.push(root);
  return root;
}

const notes = async (root: string) => (await compileBlazonData({ ...TEST_CONFIG }, root)).findings.filter((f) => f.code === 'context-css-unchanged');

describe('context-css-unchanged', () => {
  it('is one info finding for a context that removes tokens, naming them and the context', async () => {
    const found = await notes(project(['ink', 'paper', 'accent'], ['ink']));
    expect(found).toHaveLength(1);
    const [note] = found;
    expect(note?.severity).toBe('info');
    expect(note?.context).toBe('theme=dark');
    expect(note?.path).toBe('blazon.resolver.json');
    expect(note?.file).toBe('blazon.resolver.json');
    expect(note?.message).toContain('dark context of the theme modifier');
    expect(note?.message).toContain('2 tokens');
    expect(note?.message).toContain('color.accent, color.paper');
    expect(note?.message).toContain('theme.css');
    expect(note?.message).toContain('default');
  });

  it('is one finding per context, not one per token, for a locale too', async () => {
    const found = await notes(project(['a', 'b', 'c', 'd'], ['a'], 'locale', 'ja'));
    expect(found).toHaveLength(1);
    expect(found[0]?.context).toBe('locale=ja');
  });

  it('says "1 token" for one, and lists five paths then "... and N more" for more', async () => {
    const one = await notes(project(['a', 'b'], ['a']));
    expect(one[0]?.message).toContain('1 token ');
    const many = await notes(project(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], ['a']));
    expect(many[0]?.message).toContain('7 tokens');
    expect(many[0]?.message).toContain('color.b, color.c, color.d, color.e, color.f ... and 2 more');
    const five = await notes(project(['a', 'b', 'c', 'd', 'e', 'f'], ['a']));
    expect(five[0]?.message).toContain('color.b, color.c, color.d, color.e, color.f');
    expect(five[0]?.message).not.toContain('more');
  });

  it('is silent for a context that edits tokens and removes none', async () => {
    const root = writeProject({
      'blazon.resolver.json': {
        version: '2025.10',
        sets: { base: { sources: [{ $ref: 'tokens/light.json' }] } },
        modifiers: { theme: { contexts: { light: [], dark: [{ $ref: 'tokens/other.json' }] }, default: 'light' } },
        resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/modifiers/theme' }],
      },
      'tokens/light.json': colors(['ink', 'paper']),
      'tokens/other.json': { color: { ink: { $value: '#ffffff' } } },
    });
    roots.push(root);
    expect(await notes(root)).toEqual([]);
  });

  it('is an info finding whose fix names both ways out', () => {
    expect(CHECKS['context-css-unchanged'].severity).toBe('info');
    const fix = CHECKS['context-css-unchanged'].fix;
    expect(fix).toContain('give the token a value in the context file');
    expect(fix).toContain('do not use');
  });

  it('is not raised for the starter, which removes nothing', async () => {
    const root = await starterProject();
    roots.push(root);
    expect(await notes(root)).toEqual([]);
  }, 120_000);
});
