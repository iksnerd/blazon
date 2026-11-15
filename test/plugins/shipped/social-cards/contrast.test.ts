import { describe, it, expect } from 'vitest';
import { bestLogo, blend, chooseText, logoRatio, luminance, parseColor, ratio, solveScrim, worstRatio, MAX_SCRIM } from '../../../../src/shipped/social-cards/contrast.js';
import { fitHeadline, typeSteps } from '../../../../src/shipped/social-cards/fit.js';

// blazon.social-cards, the plugin blazon ships to compose marketing images from a brand's tokens, logo and a background.
// Seam: the pure helpers for contrast, scrim and fit.

const WHITE = [255, 255, 255] as const;
const BLACK = [0, 0, 0] as const;
const BONE = parseColor('#F2F0EB')!;
const GRAPHITE = parseColor('#1E1F21')!;
const flat = (...pixels: (readonly number[])[]): number[] => pixels.flat();

describe('contrast', () => {
  it('parses hex and rgb colors, and refuses what it cannot read', () => {
    expect(parseColor('#fff')).toEqual([255, 255, 255]);
    expect(parseColor('#1E1F21')).toEqual([30, 31, 33]);
    expect(parseColor('rgb(10, 20, 30)')).toEqual([10, 20, 30]);
    expect(parseColor('oklch(0.5 0.1 20)')).toBeUndefined();
  });

  it('measures the WCAG ratio: 21 for black on white, 1 for the same color', () => {
    expect(ratio(WHITE, BLACK)).toBeCloseTo(21, 5);
    expect(ratio(BONE, BONE)).toBe(1);
    expect(luminance(BLACK)).toBe(0);
  });

  it('blends a scrim over a pixel in sRGB', () => {
    expect(blend([200, 100, 0], [0, 0, 0], 0.5)).toEqual([100, 50, 0]);
    expect(blend([200, 100, 0], [0, 0, 0], 0)).toEqual([200, 100, 0]);
  });

  it('takes the worst of the pixels, not the average, ignoring only the extreme tail', () => {
    const pixels = flat(...Array.from({ length: 99 }, () => BLACK), WHITE);
    expect(worstRatio(pixels, WHITE, 0, GRAPHITE, 0)).toBe(1);
    expect(worstRatio(pixels, WHITE, 0, GRAPHITE, 0.02)).toBeGreaterThan(15);
  });

  it('adds no scrim when the picture already reads, and the least that reaches 4.5 when it does not', () => {
    const dark = flat(...Array.from({ length: 50 }, () => [20, 20, 20]));
    expect(solveScrim(dark, BONE, GRAPHITE)).toMatchObject({ alpha: 0, ok: true });
    const mid = flat(...Array.from({ length: 50 }, () => [170, 170, 170]));
    const solved = solveScrim(mid, BONE, GRAPHITE);
    expect(solved.ok).toBe(true);
    expect(solved.alpha).toBeGreaterThan(0);
    expect(solved.ratio).toBeGreaterThanOrEqual(4.5);
    // one step less would not have been enough
    expect(worstRatio(mid, BONE, solved.alpha - 0.05, GRAPHITE)).toBeLessThan(4.5);
  });

  it('never goes past the maximum scrim, and says it did not reach 4.5', () => {
    const gray = parseColor('#808080')!;
    const bright = flat(...Array.from({ length: 50 }, () => [250, 250, 250]));
    const solved = solveScrim(bright, gray, GRAPHITE);
    expect(MAX_SCRIM).toBe(0.75);
    expect(solved).toMatchObject({ alpha: 0.75, ok: false });
    expect(solved.ratio).toBeLessThan(4.5);
  });

  it('chooses the text color that needs the least scrim, the first when they tie', () => {
    const light = flat(...Array.from({ length: 50 }, () => [235, 235, 235]));
    // graphite text reads on a light picture with no scrim; bone needs a heavy one
    expect(chooseText(light, [BONE, GRAPHITE], GRAPHITE)).toMatchObject({ index: 1, alpha: 0, ok: true });
    const dark = flat(...Array.from({ length: 50 }, () => [10, 10, 10]));
    expect(chooseText(dark, [BONE, GRAPHITE], GRAPHITE)).toMatchObject({ index: 0, alpha: 0, ok: true });
  });
});

describe('the logo contrast', () => {
  const white = [255, 255, 255, 255, 255, 255, 255, 255];
  const black = [0, 0, 0, 255, 0, 0, 0, 255];
  it('measures the logo\'s solid pixels against the picture under them, at the worst', () => {
    expect(logoRatio(white, [0, 0, 0, 0, 0, 0])).toBeCloseTo(21, 5);
    expect(logoRatio(white, [255, 255, 255, 255, 255, 255])).toBeCloseTo(1, 5);
    expect(logoRatio(white, [0, 0, 0, 255, 255, 255])).toBeCloseTo(1, 5);
  });
  it('ignores the transparent and soft pixels of the artwork, and says 21 when none is left', () => {
    expect(logoRatio([255, 255, 255, 0, 255, 255, 255, 120], [255, 255, 255, 255, 255, 255])).toBe(21);
    expect(logoRatio([], [])).toBe(21);
  });
  it('takes the logo that reads best, the first on a tie', () => {
    expect(bestLogo([{ id: 'a', ratio: 1.1 }, { id: 'b', ratio: 8 }]).id).toBe('b');
    expect(bestLogo([{ id: 'a', ratio: 4 }, { id: 'b', ratio: 4 }]).id).toBe('a');
    expect(logoRatio(black, [20, 20, 20, 20, 20, 20])).toBeLessThan(3);
  });
});

describe('fit', () => {
  it('steps the type down from the start to the floor, each step smaller, ending on the floor', () => {
    const steps = typeSteps(96, 40);
    expect(steps[0]).toBe(96);
    expect(steps.at(-1)).toBe(40);
    expect(steps.length).toBeGreaterThan(4);
    for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeLessThan(steps[i - 1]!);
    expect(typeSteps(40, 40)).toEqual([40]);
  });

  it('takes the first step that fits, and reports the floor when none does', async () => {
    const steps = typeSteps(96, 40);
    expect(await fitHeadline(steps, (size) => size <= 70)).toEqual({ size: steps.find((s) => s <= 70), fits: true });
    expect(await fitHeadline(steps, () => false)).toEqual({ size: 40, fits: false });
    expect(await fitHeadline(steps, () => true)).toEqual({ size: 96, fits: true });
  });
});
