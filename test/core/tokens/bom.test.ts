import { describe, it, expect } from 'vitest';
import { compileBlazonData } from '../../../src/core/index.js';
import { writeProject, TEST_CONFIG } from '../../support/helpers.js';

const BOM = '\uFEFF';
const BASE = { color: { $type: 'color', ink: { $value: '#000000' } } };

describe('a UTF-8 byte order mark', () => {
  it('does not break a token file', async () => {
    const root = writeProject({ 'tokens/base.json': BOM + JSON.stringify(BASE) });
    const data = await compileBlazonData({ ...TEST_CONFIG }, root);
    expect(data.findings.filter((f) => f.code === 'invalid-json')).toEqual([]);
    expect(data.tokens.byPath.get('color.ink')?.value).toBe('#000000');
  });

  it('does not break a resolver or the token files it names', async () => {
    const resolver = {
      version: '2025.10',
      sets: { base: { sources: [{ $ref: 'tokens/base.json' }] } },
      modifiers: { theme: { contexts: { light: [], dark: [{ $ref: 'tokens/dark.json' }] }, default: 'light' } },
      resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/modifiers/theme' }],
    };
    const root = writeProject({
      'blazon.resolver.json': BOM + JSON.stringify(resolver),
      'tokens/base.json': BOM + JSON.stringify(BASE),
      'tokens/dark.json': BOM + JSON.stringify({ color: { ink: { $value: '#ffffff' } } }),
    });
    const data = await compileBlazonData({ ...TEST_CONFIG }, root);
    expect(data.findings.filter((f) => f.code === 'invalid-json' || f.code === 'resolver-invalid')).toEqual([]);
    expect(data.tokens.contexts?.map((c) => c.context)).toEqual(['dark']);
  });
});
