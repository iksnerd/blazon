import { describe, it, expect } from 'vitest';
import { compileTokens } from '../../support/helpers.js';

const problems = async (value: unknown) => {
  const data = await compileTokens({ 'a.json': { w: { $type: 'fontWeight', x: { $value: value } } } });
  return data.tokens.problems.filter((p) => p.code === 'token-value-invalid');
};

describe('a font weight', () => {
  it.each([1, 400, 1000, '1', '400', '1000', 'bold'])('accepts %j', async (value) => {
    expect(await problems(value)).toEqual([]);
  });

  it.each([0, 1001, '0', '1200', '1001', '00', 'bolder'])('refuses %j', async (value) => {
    expect(await problems(value)).toHaveLength(1);
  });
});
