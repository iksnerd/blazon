import { describe, it, expect } from 'vitest';
import { contextItems } from '../../../src/core/tokens/contexts.js';
import type { TokenItem } from '../../../src/types/index.js';

// A context is stored as what it changes. contextItems puts a whole context back together from the default and those changes.

const token = (path: string, value: string, description?: string): TokenItem =>
  ({
    path,
    group: path.split('.')[0]!,
    name: path.split('.').pop()!,
    file: 'tokens/a.json',
    rawValue: value,
    resolvedValue: value,
    value,
    type: 'color',
    ...(description && { description }),
    blazon: {},
    cssVariable: `--${path.replace('.', '-')}`,
  }) as TokenItem;

const base = [token('color.ink', '#000', 'Base ink'), token('color.paper', '#fff'), token('color.accent', '#f00')];

describe('contextItems', () => {
  it('returns the default as it is for no context, and for a context that changes nothing', () => {
    expect(contextItems(base, [])).toEqual(base);
    expect(contextItems(base, [{ tokens: [] }])).toEqual(base);
  });

  it("puts a changed value in the default's place and keeps the default's order", () => {
    const items = contextItems(base, [{ tokens: [token('color.paper', '#eee')] }]);
    expect(items.map((t) => [t.path, t.value])).toEqual([
      ['color.ink', '#000'],
      ['color.paper', '#eee'],
      ['color.accent', '#f00'],
    ]);
  });

  it('takes a token that only says something else, which has no CSS value of its own to change', () => {
    const items = contextItems(base, [{ tokens: [], metadataChanges: [token('color.ink', '#000', 'Ink in this context')] }]);
    expect(items.find((t) => t.path === 'color.ink')).toMatchObject({ value: '#000', description: 'Ink in this context' });
    expect(items).toHaveLength(3);
  });

  it("appends a token only the context has, after the default's", () => {
    const items = contextItems(base, [{ tokens: [token('color.ja-only', '#0f0')] }]);
    expect(items.map((t) => t.path)).toEqual(['color.ink', 'color.paper', 'color.accent', 'color.ja-only']);
  });

  it('lets a later context win where two change the same token, as the brand book does with two modifiers chosen', () => {
    const items = contextItems(base, [
      { tokens: [token('color.paper', '#111')] },
      { tokens: [token('color.paper', '#222')], metadataChanges: [token('color.accent', '#f00', 'Later')] },
    ]);
    expect(items.find((t) => t.path === 'color.paper')!.value).toBe('#222');
    expect(items.find((t) => t.path === 'color.accent')!.description).toBe('Later');
  });

  it('leaves the default alone', () => {
    const before = JSON.stringify(base);
    contextItems(base, [{ tokens: [token('color.paper', '#eee'), token('color.new', '#abc')] }]);
    expect(JSON.stringify(base)).toBe(before);
  });

  it('combines contexts by field: one changes the value, another only the description, and neither undoes the other', () => {
    const value = { tokens: [token('color.ink', '#fff', 'Base ink')] };
    const words = { tokens: [], metadataChanges: [token('color.ink', '#000', 'Ink for Japanese')] };
    for (const order of [
      [value, words],
      [words, value],
    ]) {
      expect(contextItems(base, order).find((t) => t.path === 'color.ink')).toMatchObject({ value: '#fff', description: 'Ink for Japanese' });
    }
  });

  it('takes away a description a context removes', () => {
    const without = token('color.ink', '#000');
    expect(contextItems(base, [{ tokens: [], metadataChanges: [without] }]).find((t) => t.path === 'color.ink')).not.toHaveProperty('description');
  });
});
