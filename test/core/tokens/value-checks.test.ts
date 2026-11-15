import { describe, it, expect } from 'vitest';
import { compileTokens } from '../../support/helpers.js';

// `blazon check` says a brand's tokens are sound, so a value that is not a value of its type must not pass. A dimension of "abc" and an
// oklch lightness of 60 (written as if it were a percentage; CSS clamps it to white) both used to pass without a word.

const problems = async (token: Record<string, unknown>) => {
  const data = await compileTokens({ 'a.json': { t: token } });
  return data.tokens.problems.filter((p) => p.code === 'invalid-value').map((p) => [p.path, p.message]);
};

describe('a dimension', () => {
  it.each(['16px', '1.5rem', '-4px', '+2px', '.5em', '100%', '50vw', '100dvh', '0', 'auto', 'calc(100% - 4px)', 'clamp(1rem, 2vw, 3rem)', 'var(--gap)'])(
    'accepts %s',
    async (value) => {
      expect(await problems({ $type: 'dimension', d: { $value: value } })).toEqual([]);
    },
  );

  it.each(['abc', '12', '12 px', 'px', '1.2.3px', '4pixels', ''])('refuses %j and says what a dimension is', async (value) => {
    const found = await problems({ $type: 'dimension', d: { $value: value } });
    expect(found).toHaveLength(1);
    expect(found[0]![0]).toBe('t.d');
    expect(found[0]![1]).toMatch(/dimension/);
  });

  it('refuses an object with a unit that is not one', async () => {
    expect(await problems({ $type: 'dimension', d: { $value: { value: 4, unit: 'abc' } } })).toHaveLength(1);
  });

  it('accepts the object form with px and rem', async () => {
    expect(await problems({ $type: 'dimension', a: { $value: { value: 4, unit: 'px' } }, b: { $value: { value: 1, unit: 'rem' } } })).toEqual([]);
  });
});

describe('a duration', () => {
  it.each(['200ms', '0.2s', '0s'])('accepts %s', async (value) => {
    expect(await problems({ $type: 'duration', d: { $value: value } })).toEqual([]);
  });

  it.each(['fast', '200', '200px'])('refuses %j', async (value) => {
    expect(await problems({ $type: 'duration', d: { $value: value } })).toHaveLength(1);
  });
});

describe('a cubicBezier', () => {
  it.each([[[0, 0, 1, 1]], [[0.25, -0.5, 0.75, 1.5]], [[1, 2, 0, -3]]])('accepts %j', async (value) => {
    expect(await problems({ $type: 'cubicBezier', e: { $value: value } })).toEqual([]);
  });

  it.each([[[2, 0, 3, 1]], [[-0.1, 0, 0.5, 1]], [[0, 0, 1.01, 1]]])('refuses %j, whose x values must be within 0 and 1', async (value) => {
    const found = await problems({ $type: 'cubicBezier', e: { $value: value } });
    expect(found).toHaveLength(1);
    expect(found[0]![1]).toMatch(/cubicBezier/);
  });
});

describe('an oklch or oklab color', () => {
  it.each(['oklch(0.6 0.2 250)', 'oklch(60% 0.2 250)', 'oklch(0.6 0.2 250 / 50%)', 'oklab(0.5 0.1 -0.1)', 'oklch(none 0 0)'])('accepts %s', async (value) => {
    expect(await problems({ $type: 'color', c: { $value: value } })).toEqual([]);
  });

  it.each(['oklch(5 5 5)', 'oklch(60 0.2 250)', 'oklab(2 0 0)', 'oklch(-0.1 0.2 250)'])('refuses %s: the lightness is a number between 0 and 1, or a percentage', async (value) => {
    const found = await problems({ $type: 'color', c: { $value: value } });
    expect(found).toHaveLength(1);
    expect(found[0]![1]).toMatch(/lightness/);
  });
});
