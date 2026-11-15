import { chunkColumns } from '@/lib/paginate';
import { CONTENTS_COLUMNS, CONTENTS_ROWS } from './geometry';

/**
 * Packs the contents entries into slides and columns. `lines` is how many lines each entry takes (1, or more when its
 * title wraps). Each slide is a list of columns, each a `[start, end)` run of entries, read down the first column and
 * then the next; a column holds at most CONTENTS_ROWS lines (one entry that is taller takes a column of its own), and
 * the slides are as even as the lines allow. Always at least one slide.
 */
export function packContents(lines: readonly number[]): [number, number][][] {
  if (lines.length === 0) return [[]];
  return chunkColumns(lines, CONTENTS_ROWS, CONTENTS_ROWS, CONTENTS_COLUMNS);
}

/**
 * How many lines each probe entry takes, from their heights: `one` is the height of an entry that takes one line and
 * `two` of one that takes two, so a line is the difference.
 */
export function linesOf(heights: readonly number[], one: number, two: number): number[] {
  const step = two - one;
  return heights.map((height) => (step > 0 ? Math.max(1, Math.round((height - one) / step) + 1) : 1));
}
