import { describe, it, expect } from 'vitest';
import { compileTokens } from '../../support/helpers.js';

// DTCG names cannot contain ".", "{" or "}". "a.b" beside a group a holding b would be the same path, and the later value would replace the earlier with no word.

describe('token names that would collide in a path', () => {
  it('refuses a name with a dot instead of letting it shadow the nested token', async () => {
    const { tokens } = await compileTokens({ 'a.json': { color: { $type: 'color', 'a.b': { $value: '#111111' }, a: { b: { $value: '#222222' } } } } });
    expect(tokens.problems.map((f) => `${f.path}:${f.code}`)).toEqual(['color.a.b:invalid-token']);
    expect(tokens.items.filter((t) => t.path === 'color.a.b').map((t) => t.value)).toHaveLength(1);
  });

  it.each(['{x}', 'x{', 'x}'])('refuses the name %s', async (name) => {
    const { tokens } = await compileTokens({ 'a.json': { color: { $type: 'color', [name]: { $value: '#111111' } } } });
    expect(tokens.problems.map((f) => f.code)).toEqual(['invalid-token']);
    expect(tokens.items).toHaveLength(0);
  });
});
