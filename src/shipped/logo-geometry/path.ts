import { Unsupported, type Point } from './geometry.js';

// The `d` of a <path> as polygons: curves and arcs flattened into short lines, and the points the author placed (a curve's ends, not its
// control points), which are what a grid is about.

const CURVE_STEPS = 24;
const ARC_STEPS_PER_TURN = 96;

export interface Subpath {
  points: Point[];
  anchors: Point[];
}

/** Points along a cubic or quadratic curve, not including its start. */
function bezier(start: Point, controls: Point[], steps = CURVE_STEPS): Point[] {
  const points: Point[] = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    let level: Point[] = [start, ...controls];
    while (level.length > 1) level = level.slice(1).map((b, k) => [(1 - t) * level[k]![0] + t * b[0], (1 - t) * level[k]![1] + t * b[1]] as Point);
    points.push(level[0]!);
  }
  return points;
}

const angleBetween = (ux: number, uy: number, vx: number, vy: number): number => {
  const sign = ux * vy - uy * vx < 0 ? -1 : 1;
  const dot = (ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy));
  return sign * Math.acos(Math.max(-1, Math.min(1, dot)));
};

/**
 * Points along an elliptical arc from (x1, y1) to (x2, y2), not including the start, the last of them exactly (x2, y2). The endpoint form
 * of the SVG arc command, turned into a center and swept in equal angle steps (SVG 1.1, appendix F.6).
 */
export function arcPoints(x1: number, y1: number, rxIn: number, ryIn: number, rotation: number, largeArc: boolean, sweep: boolean, x2: number, y2: number): Point[] {
  if (x1 === x2 && y1 === y2) return [];
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  if (rx === 0 || ry === 0) return [[x2, y2]];
  const phi = (rotation * Math.PI) / 180;
  const [cos, sin] = [Math.cos(phi), Math.sin(phi)];
  const [dx, dy] = [(x1 - x2) / 2, (y1 - y2) / 2];
  const x1p = cos * dx + sin * dy;
  const y1p = -sin * dx + cos * dy;
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const numerator = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const denominator = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const coefficient = (largeArc === sweep ? -1 : 1) * Math.sqrt(Math.max(0, numerator / denominator));
  const cxp = (coefficient * rx * y1p) / ry;
  const cyp = (-coefficient * ry * x1p) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const theta = angleBetween(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let delta = angleBetween((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  else if (sweep && delta < 0) delta += 2 * Math.PI;
  const steps = Math.max(2, Math.ceil((Math.abs(delta) / (2 * Math.PI)) * ARC_STEPS_PER_TURN));
  const points: Point[] = [];
  for (let i = 1; i < steps; i++) {
    const t = theta + (delta * i) / steps;
    points.push([cos * rx * Math.cos(t) - sin * ry * Math.sin(t) + cx, sin * rx * Math.cos(t) + cos * ry * Math.sin(t) + cy]);
  }
  points.push([x2, y2]);
  return points;
}

const NUMBER = /[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/y;
const COMMANDS = 'MmLlHhVvCcSsQqTtZzAa';

/** A path's subpaths, or Unsupported saying what in the data cannot be read. */
export function pathSubpaths(d: string): Subpath[] {
  const subpaths: Subpath[] = [];
  let points: Point[] = [];
  let anchors: Point[] = [];
  let [x, y, startX, startY] = [0, 0, 0, 0];
  let lastControl: Point | undefined;
  let command: string | undefined;
  let at = 0;

  const skip = () => {
    while (at < d.length && /[\s,]/.test(d[at]!)) at++;
  };
  const near = () => JSON.stringify(d.slice(at, at + 12).trim());
  const number = (): number => {
    skip();
    NUMBER.lastIndex = at;
    const match = NUMBER.exec(d);
    if (!match) throw new Unsupported(`path data is cut short near ${near()}`);
    at = NUMBER.lastIndex;
    return Number(match[0]);
  };
  // An arc's two flags are one character each, with nothing between them and the next number in minified data: "a1 1 0 011 1"
  const flag = (): boolean => {
    skip();
    const ch = d[at];
    if (ch !== '0' && ch !== '1') throw new Unsupported(`path data has an arc flag that is not 0 or 1 near ${near()}`);
    at++;
    return ch === '1';
  };
  const finish = () => {
    if (points.length > 1) subpaths.push({ points, anchors });
    points = [];
    anchors = [];
  };

  for (;;) {
    skip();
    if (at >= d.length) break;
    if (/[A-Za-z]/.test(d[at]!)) {
      if (!COMMANDS.includes(d[at]!)) throw new Unsupported(`path data has the command ${d[at]} near ${near()}`);
      command = d[at]!;
      at++;
    } else if (command === undefined) throw new Unsupported('path data does not start with a command');
    const relative = command === command.toLowerCase();
    const upper = command.toUpperCase();
    if (upper === 'Z') {
      if (points.length > 0) [x, y] = [startX, startY];
      finish();
      lastControl = undefined;
      // A number after a close is a mistake in the data, not a command repeated
      skip();
      if (at < d.length && !/[A-Za-z]/.test(d[at]!)) throw new Unsupported(`path data has numbers after a close near ${near()}`);
      continue;
    }
    if (upper === 'M') {
      const [nx, ny] = [number(), number()];
      [x, y] = relative ? [x + nx, y + ny] : [nx, ny];
      finish();
      [startX, startY] = [x, y];
      points = [[x, y]];
      anchors = [[x, y]];
      command = relative ? 'l' : 'L'; // extra pairs after a move are lines
      lastControl = undefined;
      continue;
    }
    if (upper === 'L') {
      const [nx, ny] = [number(), number()];
      [x, y] = relative ? [x + nx, y + ny] : [nx, ny];
      lastControl = undefined;
    } else if (upper === 'H') {
      const nx = number();
      x = relative ? x + nx : nx;
      lastControl = undefined;
    } else if (upper === 'V') {
      const ny = number();
      y = relative ? y + ny : ny;
      lastControl = undefined;
    } else if (upper === 'C' || upper === 'S') {
      let c1: Point;
      if (upper === 'C') {
        const [a, b] = [number(), number()];
        c1 = relative ? [x + a, y + b] : [a, b];
      } else c1 = lastControl ? [2 * x - lastControl[0], 2 * y - lastControl[1]] : [x, y];
      const [c, e] = [number(), number()];
      const [ex, ey] = [number(), number()];
      const c2: Point = relative ? [x + c, y + e] : [c, e];
      const end: Point = relative ? [x + ex, y + ey] : [ex, ey];
      points.push(...bezier([x, y], [c1, c2, end]));
      [x, y] = end;
      anchors.push(end);
      lastControl = c2;
      continue;
    } else if (upper === 'Q' || upper === 'T') {
      let c1: Point;
      if (upper === 'Q') {
        const [a, b] = [number(), number()];
        c1 = relative ? [x + a, y + b] : [a, b];
      } else c1 = lastControl ? [2 * x - lastControl[0], 2 * y - lastControl[1]] : [x, y];
      const [ex, ey] = [number(), number()];
      const end: Point = relative ? [x + ex, y + ey] : [ex, ey];
      points.push(...bezier([x, y], [c1, end]));
      [x, y] = end;
      anchors.push(end);
      lastControl = c1;
      continue;
    } else {
      // A
      const [rx, ry, rotation] = [number(), number(), number()];
      const [largeArc, sweep] = [flag(), flag()];
      const [ex, ey] = [number(), number()];
      const end: Point = relative ? [x + ex, y + ey] : [ex, ey];
      points.push(...arcPoints(x, y, rx, ry, rotation, largeArc, sweep, end[0], end[1]));
      [x, y] = end;
      anchors.push(end);
      lastControl = undefined;
      continue;
    }
    points.push([x, y]);
    anchors.push([x, y]);
  }
  finish();
  return subpaths;
}
