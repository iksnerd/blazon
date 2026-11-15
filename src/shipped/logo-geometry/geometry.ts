// The shapes and errors the parts of this plugin pass between them.

export type Point = [number, number];

/** The logo uses something this reader does not draw, or has nothing to measure; the message says what. */
export class Unsupported extends Error {}

/** One filled shape, in the order shapes paint: its outlines, the points the author placed, its fill as written and its fill rule. */
export interface Shape {
  polygons: Point[][];
  anchors: Point[];
  fill: string;
  rule: 'nonzero' | 'evenodd';
}

/** x, y, width, height */
export type Box = [number, number, number, number];

/** A grid of cells: 0 is nothing, 1 and up is a fill, in the order fills first appear. */
export type Labels = number[][];
