import { describe, it, expect } from 'vitest';
import { linesOf, packContents } from '../../src/viewer/pages/print/contents';

describe('packContents', () => {
  it('sets a short list in columns on one slide, and an empty one as one empty slide', () => {
    expect(packContents(Array(5).fill(1))).toEqual([
      [
        [0, 2],
        [2, 4],
        [4, 5],
      ],
    ]);
    expect(packContents([])).toEqual([[]]);
  });

  it('counts a wrapped entry as the lines it takes: thirty entries of 32 lines need a second slide', () => {
    const lines = Array.from({ length: 30 }, (_, i) => (i === 3 || i === 20 ? 2 : 1));
    expect(packContents(Array(30).fill(1))).toHaveLength(1);
    const slides = packContents(lines);
    expect(slides).toHaveLength(2);
    for (const slide of slides) for (const [from, to] of slide) expect(lines.slice(from, to).reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(10);
    // every entry once, in order
    expect(slides.flat().flatMap(([from, to]) => Array.from({ length: to - from }, (_, i) => from + i))).toEqual(lines.map((_, i) => i));
  });

  it('gives an entry taller than a column a column of its own', () => {
    const slides = packContents([1, 12, 1]);
    expect(slides.flat().map(([from, to]) => to - from)).toEqual([1, 1, 1]);
  });
});

describe('linesOf', () => {
  it('reads the lines of an entry from its height, a line being what a two-line entry adds', () => {
    expect(linesOf([45, 76, 107, 45], 45, 76)).toEqual([1, 2, 3, 1]);
    expect(linesOf([45], 45, 45)).toEqual([1]);
  });
});
