// A logo's SVG as native PowerPoint shapes, so the logo is vector in every program that opens the template and needs no picture file.
// Only the plain kind is read: paths, rectangles, polygons, circles and ellipses with a solid fill, in groups that change nothing.
// Anything else (a transform, a stroke, a gradient, a clip, a style sheet, text, an image) is not read, and `why` says which, so the
// logo is embedded as the SVG it is instead.

export interface Shape {
  /** A solid fill as a six-digit hex */
  fill: string;
  /** Path commands in view box units: M, L, C and Z, all absolute */
  segments: Segment[];
}

export type Segment = ['M' | 'L', number, number] | ['C', number, number, number, number, number, number] | ['Z'];

export interface Vector {
  width: number;
  height: number;
  shapes: Shape[];
}

export type Read = { vector: Vector } | { why: string };

const NAMED: Record<string, string> = { black: '000000', white: 'FFFFFF' };
const ALLOWED = new Set(['svg', 'g', 'path', 'rect', 'polygon', 'circle', 'ellipse', 'title', 'desc']);
const REFUSED = ['transform', 'style', 'class', 'clip-path', 'mask', 'filter', 'opacity', 'fill-opacity', 'stroke-width'];

const num = (value: string | undefined, fallback = 0): number => {
  const parsed = Number.parseFloat(value ?? '');
  return Number.isFinite(parsed) ? parsed : fallback;
};

function fillOf(value: string): string | undefined | 'none' {
  const text = value.trim().toLowerCase();
  if (text === 'none') return 'none';
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(text)?.[1];
  if (hex) return (hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex).toUpperCase();
  return NAMED[text];
}

/** Path data as absolute segments; undefined when it is not path data. An arc becomes cubic curves. */
export function pathSegments(d: string): Segment[] | undefined {
  const out: Segment[] = [];
  let at = 0;
  const skip = () => {
    while (at < d.length && /[\s,]/.test(d[at]!)) at++;
  };
  const number = (): number | undefined => {
    skip();
    const match = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/.exec(d.slice(at));
    if (!match) return undefined;
    at += match[0].length;
    return Number(match[0]);
  };
  const flag = (): number | undefined => {
    skip();
    if (d[at] !== '0' && d[at] !== '1') return undefined;
    return Number(d[at++]);
  };
  let [x, y, startX, startY] = [0, 0, 0, 0];
  let previous = '';
  let control: [number, number] | undefined;
  let command = '';
  while (true) {
    skip();
    if (at >= d.length) break;
    if (/[MmLlHhVvCcSsQqTtAaZz]/.test(d[at]!)) command = d[at++]!;
    else if (!command || command === 'Z' || command === 'z') return undefined;
    else if (command === 'M') command = 'L';
    else if (command === 'm') command = 'l';
    const relative = command === command.toLowerCase();
    const upper = command.toUpperCase();
    const args = (count: number): number[] | undefined => {
      const values: number[] = [];
      for (let k = 0; k < count; k++) {
        const value = upper === 'A' && (k === 3 || k === 4) ? flag() : number();
        if (value === undefined) return undefined;
        values.push(value);
      }
      return values;
    };
    if (upper === 'Z') {
      out.push(['Z']);
      [x, y] = [startX, startY];
      previous = 'Z';
      control = undefined;
      continue;
    }
    const ox = relative ? x : 0;
    const oy = relative ? y : 0;
    let next: [number, number] | undefined;
    if (upper === 'M' || upper === 'L' || upper === 'T') {
      const v = args(2);
      if (!v) return undefined;
      const [nx, ny] = [v[0]! + ox, v[1]! + oy];
      if (upper === 'M') {
        out.push(['M', nx, ny]);
        [startX, startY] = [nx, ny];
      } else if (upper === 'L') out.push(['L', nx, ny]);
      else {
        const [cx, cy] = previous === 'Q' || previous === 'T' ? [2 * x - control![0], 2 * y - control![1]] : [x, y];
        out.push(quadratic(x, y, cx, cy, nx, ny));
        control = [cx, cy];
      }
      [x, y] = [nx, ny];
      next = control;
    } else if (upper === 'H' || upper === 'V') {
      const v = args(1);
      if (!v) return undefined;
      if (upper === 'H') x = v[0]! + (relative ? x : 0);
      else y = v[0]! + (relative ? y : 0);
      out.push(['L', x, y]);
    } else if (upper === 'C' || upper === 'S') {
      const v = args(upper === 'C' ? 6 : 4);
      if (!v) return undefined;
      let [x1, y1] = [x, y];
      if (upper === 'C') [x1, y1] = [v[0]! + ox, v[1]! + oy];
      else if (previous === 'C' || previous === 'S') [x1, y1] = [2 * x - control![0], 2 * y - control![1]];
      const rest = upper === 'C' ? v.slice(2) : v;
      const [x2, y2, nx, ny] = [rest[0]! + ox, rest[1]! + oy, rest[2]! + ox, rest[3]! + oy];
      out.push(['C', x1, y1, x2, y2, nx, ny]);
      control = [x2, y2];
      [x, y] = [nx, ny];
    } else if (upper === 'Q') {
      const v = args(4);
      if (!v) return undefined;
      const [cx, cy, nx, ny] = [v[0]! + ox, v[1]! + oy, v[2]! + ox, v[3]! + oy];
      out.push(quadratic(x, y, cx, cy, nx, ny));
      control = [cx, cy];
      [x, y] = [nx, ny];
    } else {
      const v = args(7);
      if (!v) return undefined;
      const [nx, ny] = [v[5]! + ox, v[6]! + oy];
      out.push(...arc(x, y, v[0]!, v[1]!, v[2]!, v[3] === 1, v[4] === 1, nx, ny));
      [x, y] = [nx, ny];
    }
    void next;
    if (upper !== 'C' && upper !== 'S' && upper !== 'Q' && upper !== 'T') control = undefined;
    previous = upper;
  }
  return out.length > 0 && out[0]![0] === 'M' ? out : undefined;
}

const quadratic = (x0: number, y0: number, cx: number, cy: number, x: number, y: number): Segment => [
  'C',
  x0 + (2 / 3) * (cx - x0),
  y0 + (2 / 3) * (cy - y0),
  x + (2 / 3) * (cx - x),
  y + (2 / 3) * (cy - y),
  x,
  y,
];

/** An elliptical arc as cubic curves (SVG 1.1 appendix F.6), at most a quarter turn each */
function arc(x1: number, y1: number, rx0: number, ry0: number, degrees: number, large: boolean, sweep: boolean, x2: number, y2: number): Segment[] {
  if (x1 === x2 && y1 === y2) return [];
  let [rx, ry] = [Math.abs(rx0), Math.abs(ry0)];
  if (rx === 0 || ry === 0) return [['L', x2, y2]];
  const phi = (degrees * Math.PI) / 180;
  const [cos, sin] = [Math.cos(phi), Math.sin(phi)];
  const [dx, dy] = [(x1 - x2) / 2, (y1 - y2) / 2];
  const [x1p, y1p] = [cos * dx + sin * dy, -sin * dx + cos * dy];
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const numerator = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const denominator = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const factor = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, numerator / denominator));
  const [cxp, cyp] = [(factor * rx * y1p) / ry, (-factor * ry * x1p) / rx];
  const [cx, cy] = [cos * cxp - sin * cyp + (x1 + x2) / 2, sin * cxp + cos * cyp + (y1 + y2) / 2];
  const angle = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const start = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let delta = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  if (sweep && delta < 0) delta += 2 * Math.PI;
  const count = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 2) - 1e-9));
  const step = delta / count;
  const t = (4 / 3) * Math.tan(step / 4);
  const point = (a: number): [number, number] => [cx + rx * Math.cos(a) * cos - ry * Math.sin(a) * sin, cy + rx * Math.cos(a) * sin + ry * Math.sin(a) * cos];
  const slope = (a: number): [number, number] => [-rx * Math.sin(a) * cos - ry * Math.cos(a) * sin, -rx * Math.sin(a) * sin + ry * Math.cos(a) * cos];
  const out: Segment[] = [];
  for (let k = 0; k < count; k++) {
    const [a, b] = [start + k * step, start + (k + 1) * step];
    const [p, q, dp, dq] = [point(a), point(b), slope(a), slope(b)];
    out.push(['C', p[0] + t * dp[0], p[1] + t * dp[1], q[0] - t * dq[0], q[1] - t * dq[1], k === count - 1 ? x2 : q[0], k === count - 1 ? y2 : q[1]]);
  }
  return out;
}

const circle = (cx: number, cy: number, rx: number, ry: number): Segment[] => {
  const [kx, ky] = [rx * 0.5522847498, ry * 0.5522847498];
  return [
    ['M', cx + rx, cy],
    ['C', cx + rx, cy + ky, cx + kx, cy + ry, cx, cy + ry],
    ['C', cx - kx, cy + ry, cx - rx, cy + ky, cx - rx, cy],
    ['C', cx - rx, cy - ky, cx - kx, cy - ry, cx, cy - ry],
    ['C', cx + kx, cy - ry, cx + rx, cy - ky, cx + rx, cy],
    ['Z'],
  ];
};

/** The points of each subpath, for telling a hole from an overlap */
function subpaths(segments: Segment[]): [number, number][][] {
  const out: [number, number][][] = [];
  for (const segment of segments) {
    if (segment[0] === 'M') out.push([[segment[1], segment[2]]]);
    else if (segment[0] === 'L') out.at(-1)!.push([segment[1], segment[2]]);
    else if (segment[0] === 'C') out.at(-1)!.push([segment[1], segment[2]], [segment[3], segment[4]], [segment[5], segment[6]]);
  }
  return out;
}

/**
 * PowerPoint fills a shape's overlapping subpaths by the even-odd rule. An SVG path is filled by the nonzero rule unless it says
 * `fill-rule="evenodd"`; the two agree unless a subpath lies inside another and turns the same way. That is the case this finds.
 */
function nestsSameWay(segments: Segment[]): boolean {
  const boxes = subpaths(segments).map((points) => {
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    const area = points.reduce((sum, p, k) => sum + (points[(k + 1) % points.length]![0] - p[0]) * (points[(k + 1) % points.length]![1] + p[1]), 0);
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys), turn: Math.sign(area) };
  });
  return boxes.some((a, i) =>
    boxes.some(
      (b, j) => i !== j && a.turn === b.turn && a.x0 <= b.x0 && a.x1 >= b.x1 && a.y0 <= b.y0 && a.y1 >= b.y1 && !(a.x0 === b.x0 && a.x1 === b.x1 && a.y0 === b.y0 && a.y1 === b.y1),
    ),
  );
}

type Point = [number, number];

/** Each subpath as its segments, and as a polygon that follows it closely enough to say what lies inside what */
function split(segments: Segment[]): { segments: Segment[]; closed: boolean; polygon: Point[] }[] {
  const out: { segments: Segment[]; closed: boolean; polygon: Point[] }[] = [];
  for (const segment of segments) {
    if (segment[0] === 'M') out.push({ segments: [segment], closed: false, polygon: [[segment[1], segment[2]]] });
    else {
      const current = out.at(-1)!;
      if (segment[0] === 'Z') current.closed = true;
      else {
        const from = current.polygon.at(-1)!;
        if (segment[0] === 'C') {
          for (const t of [0.25, 0.5, 0.75]) {
            const u = 1 - t;
            current.polygon.push([
              u * u * u * from[0] + 3 * u * u * t * segment[1] + 3 * u * t * t * segment[3] + t * t * t * segment[5],
              u * u * u * from[1] + 3 * u * u * t * segment[2] + 3 * u * t * t * segment[4] + t * t * t * segment[6],
            ]);
          }
          current.polygon.push([segment[5], segment[6]]);
        } else current.polygon.push([segment[1], segment[2]]);
        current.segments.push(segment);
      }
    }
  }
  return out;
}

const turn = (polygon: Point[]): number =>
  Math.sign(polygon.reduce((sum, p, k) => sum + (polygon[(k + 1) % polygon.length]![0] - p[0]) * (polygon[(k + 1) % polygon.length]![1] + p[1]), 0));

function inside(point: Point, polygon: Point[]): boolean {
  let hit = false;
  for (let k = 0, j = polygon.length - 1; k < polygon.length; j = k++) {
    const [a, b] = [polygon[k]!, polygon[j]!];
    if (a[1] > point[1] !== b[1] > point[1] && point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]) hit = !hit;
  }
  return hit;
}

/** A subpath drawn the other way round: the same line, from its end to its start */
function reversed(segments: Segment[], closed: boolean): Segment[] {
  const ends: Point[] = segments.map((s) => [s[s.length - 2] as number, s[s.length - 1] as number]);
  const list = [...segments];
  if (closed && (ends.at(-1)![0] !== ends[0]![0] || ends.at(-1)![1] !== ends[0]![1])) {
    list.push(['L', ends[0]![0], ends[0]![1]]);
    ends.push(ends[0]!);
  }
  const out: Segment[] = [['M', ends.at(-1)![0], ends.at(-1)![1]]];
  for (let k = list.length - 1; k >= 1; k--) {
    const s = list[k]!;
    out.push(s[0] === 'C' ? ['C', s[3], s[4], s[1], s[2], ends[k - 1]![0], ends[k - 1]![1]] : ['L', ends[k - 1]![0], ends[k - 1]![1]]);
  }
  if (closed) out.push(['Z']);
  return out;
}

/**
 * An even-odd path with its subpaths turned so that a hole turns against what holds it. Then the nonzero rule, which Keynote and
 * every other program that is not PowerPoint may use for a custom shape, fills the same area as the even-odd one.
 */
function holesByDirection(segments: Segment[]): Segment[] {
  const parts = split(segments);
  return parts.flatMap((part, k) => {
    const depth = parts.filter((other, j) => j !== k && inside(part.polygon[0]!, other.polygon)).length;
    const wanted = depth % 2 === 0 ? 1 : -1;
    return turn(part.polygon) === wanted || turn(part.polygon) === 0 ? [...part.segments, ...(part.closed ? [['Z'] as Segment] : [])] : reversed(part.segments, part.closed);
  });
}

/** The SVG text as vector shapes, or why it is not plain enough to be one */
export function readSvg(source: string): Read {
  const tags = [
    ...source
      .replace(/<!--[^]*?-->/g, '')
      .replace(/<!\[CDATA\[[^]*?\]\]>/g, '')
      .matchAll(/<(\/?)([A-Za-z][\w:.-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g),
  ];
  const attributes = (raw: string): Record<string, string> => Object.fromEntries([...raw.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map((m) => [m[1]!, m[2] ?? m[3]!]));
  const stack: { name: string; fill?: string; evenodd?: boolean }[] = [];
  const shapes: Shape[] = [];
  let view: { x: number; y: number; width: number; height: number } | undefined;
  for (const [, closing, name, raw, selfClosing] of tags) {
    if (name!.includes(':') && !name!.startsWith('svg:')) return { why: `it has a ${name} element` };
    if (closing) {
      stack.pop();
      continue;
    }
    if (!ALLOWED.has(name!)) return { why: `it has a ${name} element` };
    const attrs = attributes(raw!);
    const refused = REFUSED.find((key) => key in attrs && !(key === 'opacity' && attrs[key] === '1'));
    if (refused) return { why: `it uses ${refused}` };
    if (attrs.stroke && attrs.stroke !== 'none') return { why: 'it has a stroke' };
    const parent = stack.at(-1);
    const own = attrs.fill === undefined ? undefined : fillOf(attrs.fill);
    if (attrs.fill !== undefined && own === undefined) return { why: `its fill is ${attrs.fill}, which is not a plain color` };
    const fill = own ?? parent?.fill ?? '000000';
    const evenodd = attrs['fill-rule'] ? attrs['fill-rule'] === 'evenodd' : (parent?.evenodd ?? false);
    if (name === 'svg') {
      if (view) return { why: 'it has an svg inside an svg' };
      const box = attrs.viewBox
        ?.trim()
        .split(/[\s,]+/)
        .map(Number);
      const [width, height] = [num(attrs.width, NaN), num(attrs.height, NaN)];
      if (box && box.length === 4 && box.every(Number.isFinite) && box[2]! > 0 && box[3]! > 0) view = { x: box[0]!, y: box[1]!, width: box[2]!, height: box[3]! };
      else if (width > 0 && height > 0) view = { x: 0, y: 0, width, height };
      else return { why: 'it has no view box or size' };
    } else if (!view) return { why: 'it does not start with an svg element' };
    if (!selfClosing) stack.push({ name: name!, fill, evenodd });
    if (fill === 'none') continue;

    let segments: Segment[] | undefined;
    if (name === 'path') {
      segments = pathSegments(attrs.d ?? '');
      if (!segments) return { why: 'it has path data that is not plain' };
    } else if (name === 'rect') {
      if (num(attrs.rx) || num(attrs.ry)) return { why: 'it has a rounded rect' };
      const [x, y, w, h] = [num(attrs.x), num(attrs.y), num(attrs.width), num(attrs.height)];
      segments = [['M', x, y], ['L', x + w, y], ['L', x + w, y + h], ['L', x, y + h], ['Z']];
    } else if (name === 'polygon') {
      const values = (attrs.points ?? '')
        .trim()
        .split(/[\s,]+/)
        .map(Number);
      if (values.length < 6 || values.length % 2 || values.some((v) => !Number.isFinite(v))) return { why: 'it has a polygon with no points' };
      segments = values.reduce<Segment[]>((list, v, k) => (k % 2 ? list : [...list, [k === 0 ? 'M' : 'L', v, values[k + 1]!]]), []);
      segments.push(['Z']);
    } else if (name === 'circle') segments = circle(num(attrs.cx), num(attrs.cy), num(attrs.r), num(attrs.r));
    else if (name === 'ellipse') segments = circle(num(attrs.cx), num(attrs.cy), num(attrs.rx), num(attrs.ry));
    if (!segments) continue;
    if (!evenodd && segments.filter((s) => s[0] === 'M').length > 1 && nestsSameWay(segments))
      return { why: 'a path has a shape inside another that turns the same way, which PowerPoint would fill differently' };
    shapes.push({ fill, segments: evenodd && segments.filter((s) => s[0] === 'M').length > 1 ? holesByDirection(segments) : segments });
  }
  if (!view) return { why: 'it has no svg element' };
  if (shapes.length === 0) return { why: 'it draws nothing' };
  const { x, y } = view;
  const moved = shapes.map((shape) => ({
    fill: shape.fill,
    segments: shape.segments.map((s): Segment =>
      s[0] === 'Z' ? s : s[0] === 'C' ? ['C', s[1] - x, s[2] - y, s[3] - x, s[4] - y, s[5] - x, s[6] - y] : [s[0], s[1] - x, s[2] - y],
    ),
  }));
  return { vector: { width: view.width, height: view.height, shapes: moved } };
}
