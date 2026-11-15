import { describe, expect, it } from 'vitest';
import { contrast, contrastOf, labelOn, level } from '../../src/core/init/palette.js';

// The contrast math is pure: strings in, numbers and hex out.

describe('contrast', () => {
  it('is 21 for black on white and 1 for a color on itself', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrast('#2563eb', '#2563eb')).toBeCloseTo(1, 5);
  });
  it('matches a published value: #767676 on white is 4.54', () => {
    expect(contrast('#767676', '#ffffff')).toBeCloseTo(4.54, 2);
  });
  it('names the WCAG level', () => {
    expect([7, 4.5, 3, 2.9].map(level)).toEqual(['AAA', 'AA', 'AA-large', 'fail']);
  });
  it('says whether white text fits on a color', () => {
    expect(contrastOf('#2563eb').carriesWhiteText).toBe(true);
    expect(contrastOf('#ffd24a').carriesWhiteText).toBe(false);
    expect(contrastOf('#ffd24a').onNearBlack.level).toBe('AAA');
  });
});

describe('the ink on a color', () => {
  it("is blazon's graphite where it reaches AA, then bone, and says when neither does", () => {
    expect(labelOn('#ff5a1f')).toMatchObject({ ink: 'graphite', aa: true });
    expect(labelOn('#2563eb')).toMatchObject({ ink: 'bone', aa: true });
    expect(labelOn('#808080')).toMatchObject({ aa: false });
  });
});
