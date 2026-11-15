import { describe, it, expect } from 'vitest';
import { balanced, gridSlides } from '../../../src/shipped/brand-deck/plan/index.js';
import { brand, type J, ofKind, planOf } from './helpers.js';

describe('a long run is shared evenly over its slides', () => {
  it('balanced shares items over as few slides as the limit allows, in order', () => {
    expect(balanced([1, 2, 3, 4, 5, 6, 7], 6).map((c) => c.length)).toEqual([4, 3]);
    expect(
      balanced(
        Array.from({ length: 13 }, (_, i) => i),
        6,
      ).map((c) => c.length),
    ).toEqual([5, 4, 4]);
    expect(
      balanced(
        Array.from({ length: 12 }, (_, i) => i),
        6,
      ).map((c) => c.length),
    ).toEqual([6, 6]);
    expect(balanced([1, 2, 3, 4, 5, 6, 7], 6).flat()).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
  it('a list that fits stays whole and an empty list is no slides', () => {
    expect(balanced([1, 2, 3], 6)).toEqual([[1, 2, 3]]);
    expect(balanced([], 6)).toEqual([]);
  });
  it('seven gradients are four and three and not six and one', () => {
    const stops = [
      { color: '#000000', position: 0 },
      { color: '#FFFFFF', position: 1 },
    ];
    const tokens = Array.from({ length: 7 }, (_, i): J => ({
      path: `gradient.g${i}`,
      type: 'gradient',
      value: 'linear-gradient(180deg, #000 0%, #FFF 100%)',
      resolvedValue: stops,
      rawValue: stops,
    }));
    expect(ofKind(planOf(brand(tokens)), 'gradients').map((s) => [s.title, s.gradients.length])).toEqual([
      ['Gradients (1 of 2)', 4],
      ['Gradients (2 of 2)', 3],
    ]);
  });
  it('a grid of tall figures shares seven as three, two and two', () => {
    const figures = Array.from({ length: 7 }, (_, i) => ({ title: `F${i}`, file: `f${i}.png`, format: 'png', width: 500, height: 1000, ratio: 0.5 })) as unknown as Parameters<
      typeof gridSlides
    >[1];
    const slides = gridSlides('Grid', figures);
    expect(slides.map((s) => s.figures.length)).toEqual([3, 2, 2]);
    expect(slides.map((s) => s.title)).toEqual(['Grid', 'Grid (continued)', 'Grid (continued)']);
  });
  it('a grid that fits one slide is one slide', () => {
    const figures = Array.from({ length: 4 }, (_, i) => ({ title: `F${i}`, file: `f${i}.png`, format: 'png', width: 1500, height: 1000, ratio: 1.5 })) as unknown as Parameters<
      typeof gridSlides
    >[1];
    expect(gridSlides('Grid', figures).map((s) => s.figures.length)).toEqual([4]);
  });
});
