import { Unsupported, type Box, type Labels, type Point, type Shape } from './geometry.js';
import { rasterize } from './labels.js';
import { readSvg } from './svg.js';
import { round } from './numbers.js';

// What is measured on a grid of labeled cells: how closely the logo matches itself mirrored, turned and flipped (symmetry), where its
// weight sits (balance), and, for an SVG, the grid its own points lie on. Every number is the same for the same input.

export const AXES = ['mirror-x', 'mirror-y', 'rot180', 'rot90'] as const;
export type Axis = (typeof AXES)[number];
export const TOLERANCE = 0.97;

export interface Score {
  /** The share of the logo's area that lands on ink when transformed, ignoring color. 1 is exact */
  silhouette: number;
  /** The same, also needing the fill to match */
  color: number;
}

export interface GridReport {
  /** The coarsest whole-number grid every point sits on; null when the points are not whole numbers */
  detected: number | null;
  stated: number | null;
  /** The points that are off the stated grid */
  off: { x: number; y: number }[];
}

export interface Measurement {
  /** The axes whose silhouette score is at least `tolerance` */
  axes: Axis[];
  symmetry: Record<Axis, Score | null>;
  /** How far the center of mass is from the center of the bounding box, as a share of its size. Negative x is left, negative y is up */
  balance: { x: number; y: number };
  /** The share of the bounding box that is ink */
  ink: number;
  /** Width over height of the bounding box */
  aspect: number;
  tolerance: number;
  /** An SVG only: its own grid */
  grid: GridReport | null;
  /** An SVG only: the ink's bounding box in the SVG's units */
  box?: { x: number; y: number; w: number; h: number };
}

/** The grid cut to the bounding box of its ink, or undefined when there is none. */
function trim(grid: Labels): Labels | undefined {
  let [top, bottom, left, right] = [Infinity, -1, Infinity, -1];
  grid.forEach((row, r) =>
    row.forEach((v, c) => {
      if (!v) return;
      top = Math.min(top, r);
      bottom = Math.max(bottom, r);
      left = Math.min(left, c);
      right = Math.max(right, c);
    }),
  );
  return bottom < 0 ? undefined : grid.slice(top, bottom + 1).map((row) => row.slice(left, right + 1));
}

/**
 * The silhouette and color agreement of two grids of one size: shared ink over all ink, and ink that also kept its label over all ink.
 * With `slack`, ink counts as shared when the other grid has ink within that many cells, which absorbs the anti-aliased edge of a raster.
 */
function compare(a: Labels, b: Labels, slack: number): Score {
  const [height, width] = [a.length, a[0]!.length];
  let [inkA, inkB, both, same] = [0, 0, 0, 0];
  for (let r = 0; r < height; r++)
    for (let c = 0; c < width; c++) {
      if (a[r]![c]) inkA++;
      if (b[r]![c]) inkB++;
    }
  for (let r = 0; r < height; r++)
    for (let c = 0; c < width; c++) {
      if (!a[r]![c]) continue;
      if (b[r]![c]) {
        both++;
        if (a[r]![c] === b[r]![c]) same++;
      } else if (slack > 0) {
        let near = false;
        for (let rr = Math.max(r - slack, 0); rr < Math.min(r + slack + 1, height) && !near; rr++)
          for (let cc = Math.max(c - slack, 0); cc < Math.min(c + slack + 1, width); cc++)
            if (b[rr]![cc]) {
              near = true;
              break;
            }
        if (near) both++;
      }
    }
  const union = inkA + inkB - both;
  return { silhouette: both / union, color: same / union };
}

/** The grid mirrored, flipped and turned, and for a square-ish grid the pair that rot90 compares. */
function transforms(grid: Labels): Record<Axis, Labels | { source: Labels; turned: Labels } | null> {
  const [height, width] = [grid.length, grid[0]!.length];
  const out: Record<Axis, Labels | { source: Labels; turned: Labels } | null> = {
    'mirror-x': grid.map((row) => [...row].reverse()),
    'mirror-y': [...grid].reverse(),
    rot180: [...grid].reverse().map((row) => [...row].reverse()),
    rot90: null,
  };
  if (Math.abs(width - height) <= Math.max(2, 0.03 * Math.max(width, height))) {
    const n = Math.min(width, height);
    const source = grid.slice(0, n).map((row) => row.slice(0, n));
    out.rot90 = { source, turned: source.map((_, r) => source.map((__, c) => source[n - 1 - c]![r]!)) };
  }
  return out;
}

/** Symmetry, balance and ink share of a grid. Unsupported when the grid has no ink. */
export function measureLabels(grid: Labels, tolerance = TOLERANCE, slack = 0): Omit<Measurement, 'grid' | 'box'> {
  const box = trim(grid);
  if (!box) throw new Unsupported('the logo has nothing to measure: no ink in it');
  const [height, width] = [box.length, box[0]!.length];
  const symmetry = {} as Record<Axis, Score | null>;
  for (const [axis, other] of Object.entries(transforms(box)) as [Axis, ReturnType<typeof transforms>[Axis]][]) {
    if (other === null) {
      symmetry[axis] = null;
      continue;
    }
    const [source, turned] = Array.isArray(other) ? [box, other] : [other.source, other.turned];
    const score = compare(source, turned, slack);
    symmetry[axis] = { silhouette: round(score.silhouette, 4), color: round(score.color, 4) };
  }
  let [cells, sumX, sumY] = [0, 0, 0];
  box.forEach((row, r) =>
    row.forEach((v, c) => {
      if (!v) return;
      cells++;
      sumX += c + 0.5;
      sumY += r + 0.5;
    }),
  );
  return {
    axes: AXES.filter((axis) => symmetry[axis] && symmetry[axis]!.silhouette >= tolerance),
    symmetry,
    balance: { x: round((sumX / cells - width / 2) / width, 4), y: round((sumY / cells - height / 2) / height, 4) },
    ink: round(cells / (width * height), 4),
    aspect: round(width / height, 4),
    tolerance,
  };
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** The grid of an SVG's own points: the coarsest whole-number grid they all sit on, and the points off a stated grid. Only points inside `crop` count. */
export function gridReport(shapes: Shape[], crop: Box | undefined, stated: number | undefined): GridReport {
  const seen = new Set<string>();
  const points: Point[] = [];
  for (const shape of shapes)
    for (const [x, y] of shape.anchors) {
      if (crop && !(crop[0] - 1e-9 <= x && x <= crop[0] + crop[2] + 1e-9 && crop[1] - 1e-9 <= y && y <= crop[1] + crop[3] + 1e-9)) continue;
      const key = `${x},${y}`;
      if (!seen.has(key)) {
        seen.add(key);
        points.push([x, y]);
      }
    }
  const whole = points.flatMap(([x, y]) => [Math.abs(x), Math.abs(y)]);
  let detected: number | null = null;
  if (whole.length > 0 && whole.every((v) => Math.abs(v - Math.round(v)) < 1e-6)) detected = whole.map(Math.round).reduce(gcd, 0) || null;
  const off = stated
    ? points.filter(([x, y]) => ![x, y].every((v) => Math.abs(v / stated - Math.round(v / stated)) * stated < 1e-6)).map(([x, y]) => ({ x: round(x, 4), y: round(y, 4) }))
    : [];
  return { detected, stated: stated ?? null, off };
}

/** The ink's bounding box in the SVG's units. The grid covers `region`, so a cell is a fixed step. */
function boxOf(grid: Labels, region: Box): NonNullable<Measurement['box']> {
  const [vx, vy, vw, vh] = region;
  const [stepX, stepY] = [grid[0]!.length / vw, grid.length / vh];
  let [top, bottom, left, right] = [Infinity, -1, Infinity, -1];
  grid.forEach((row, r) =>
    row.forEach((v, c) => {
      if (!v) return;
      top = Math.min(top, r);
      bottom = Math.max(bottom, r);
      left = Math.min(left, c);
      right = Math.max(right, c);
    }),
  );
  return { x: round(vx + left / stepX, 3), y: round(vy + top / stepY, 3), w: round((right - left + 1) / stepX, 3), h: round((bottom - top + 1) / stepY, 3) };
}

/** An SVG logo measured. `crop` is x, y, width, height in the SVG's units. */
export function analyzeSvg(text: string, options: { crop?: Box; grid?: number; tolerance?: number } = {}): { measurement: Measurement; notes: string[] } {
  const { viewBox, shapes, notes } = readSvg(text);
  const { grid, region } = rasterize(viewBox, shapes, options.crop);
  const measurement: Measurement = { ...measureLabels(grid, options.tolerance ?? TOLERANCE), grid: gridReport(shapes, options.crop, options.grid), box: boxOf(grid, region) };
  return { measurement, notes };
}

/** A raster logo's grid measured, with a one-cell tolerance for its anti-aliased edge. It has no points, so no grid and no box. */
export function analyzeRaster(grid: Labels, options: { tolerance?: number } = {}): Measurement {
  return { ...measureLabels(grid, options.tolerance ?? TOLERANCE, 1), grid: null };
}
