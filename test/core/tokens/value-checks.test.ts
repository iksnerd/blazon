import { describe, it, expect } from 'vitest';
import { compileTokens } from '../../support/helpers.js';

// `blazon check` says a brand's tokens are sound, so a value that is not a value of its type must not pass. A dimension of "abc" and an
// oklch lightness of 60 (written as if it were a percentage; CSS clamps it to white) both used to pass without a word.

const problems = async (token: Record<string, unknown>) => {
  const data = await compileTokens({ 'a.json': { t: token } });
  return data.tokens.problems.filter((p) => p.code === 'token-value-invalid').map((p) => [p.path, p.message]);
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

describe('a typography lineHeight that is not a number', () => {
  const type = (lineHeight: unknown, fontSize: unknown = '16px') => ({ $type: 'typography', t: { $value: { fontFamily: 'Acme Sans', fontSize, fontWeight: 400, lineHeight } } });
  const message = async (lineHeight: unknown, fontSize?: unknown) => {
    const found = await problems(type(lineHeight, fontSize));
    expect(found).toHaveLength(1);
    return found[0]![1] as string;
  };

  it('says 38px at 16px is 2.375, from the string and from the object form', async () => {
    expect(await message('38px')).toContain('lineHeight is a number, a multiple of fontSize: 38px at fontSize 16px is 2.375 (38/16)');
    expect(await message({ value: 38, unit: 'px' }, { value: 16, unit: 'px' })).toContain('38px at fontSize 16px is 2.375 (38/16)');
    expect(await message('1.5rem', '1rem')).toContain('1.5rem at fontSize 1rem is 1.5 (1.5/1)');
  });
  it('names the rule without a ratio when the font size cannot be divided into it', async () => {
    const text = await message('38px', '1rem');
    expect(text).toContain('lineHeight is a number, a multiple of fontSize');
    expect(text).not.toContain('is 2.375');
  });
  it('says to divide a percentage by 100', async () => {
    expect(await message('150%')).toContain('150% is 1.5: divide by 100');
  });
  it('says normal is not DTCG and to write a number', async () => {
    expect(await message('normal')).toContain('write a number such as 1.2 because DTCG has no keyword');
  });
  it('keeps the original complaint and still takes a number', async () => {
    expect(await message('38px')).toContain('Expected a number, got "38px"');
    expect(await problems(type(1.5))).toEqual([]);
    expect(await problems(type('1.5'))).toEqual([]);
  });
});
