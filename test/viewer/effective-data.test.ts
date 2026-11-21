import { describe, it, expect } from 'vitest';
import { effectiveData } from '../../src/viewer/lib/theme/contexts.js';
import type { BlazonData, TokenItem } from '../../src/types/index.js';

// The brand book with a context chosen shows that context's tokens: the ones whose value changed, and the ones that only say something else.

const token = (path: string, value: string, description: string): TokenItem =>
  ({
    path,
    group: 'color',
    name: path.split('.').pop()!,
    file: 'tokens/a.json',
    rawValue: value,
    resolvedValue: value,
    value,
    type: 'color',
    description,
    blazon: {},
    cssVariable: '--x',
  }) as TokenItem;

const data = {
  theme: { text: '#000' },
  themeTokens: { text: 'color.ink' },
  findings: [],
  tokens: {
    groupMeta: [],
    items: [token('color.ink', '#000', 'Base ink'), token('color.paper', '#fff', 'Base paper')],
    contexts: [
      {
        modifier: 'locale',
        context: 'ja',
        selector: ':lang(ja)',
        tokens: [token('color.ink', '#111', 'Ink')],
        metadataChanges: [token('color.paper', '#fff', 'Paper for Japanese')],
      },
    ],
  },
} as unknown as BlazonData;

describe('effectiveData', () => {
  it('shows the default for no context', () => {
    expect(effectiveData(data, {}).tokens.items.map((t) => t.description)).toEqual(['Base ink', 'Base paper']);
  });

  it('shows the changed values and the changed descriptions of the chosen context', () => {
    const shown = effectiveData(data, { locale: 'ja' });
    expect(shown.tokens.items.map((t) => [t.value, t.description])).toEqual([
      ['#111', 'Ink'],
      ['#fff', 'Paper for Japanese'],
    ]);
    expect(shown.theme.text).toBe('#111');
  });

  it("keeps one modifier's value when another modifier only describes the same token, and the theme follows what is shown", () => {
    const two = {
      theme: { text: '#ffffff' },
      themeTokens: { text: 'color.ink' },
      findings: [],
      tokens: {
        groupMeta: [],
        items: [token('color.ink', '#000000', 'Base ink')],
        contexts: [
          { modifier: 'theme', context: 'dark', selector: '[data-theme="dark"]', tokens: [token('color.ink', '#ffffff', 'Base ink')] },
          { modifier: 'locale', context: 'ja', selector: ':lang(ja)', tokens: [], metadataChanges: [token('color.ink', '#000000', 'Ink for Japanese')] },
        ],
      },
    } as unknown as BlazonData;
    for (const selected of [{ theme: 'dark', locale: 'ja' }]) {
      const shown = effectiveData(two, selected);
      expect(shown.tokens.items[0]).toMatchObject({ value: '#ffffff', description: 'Ink for Japanese' });
      expect(shown.theme.text).toBe('#ffffff');
    }
    // whichever order the contexts are listed in
    const reversed = { ...two, tokens: { ...two.tokens, contexts: [...(two.tokens.contexts ?? [])].reverse() } } as BlazonData;
    expect(effectiveData(reversed, { theme: 'dark', locale: 'ja' }).tokens.items[0]).toMatchObject({ value: '#ffffff', description: 'Ink for Japanese' });
  });
});
