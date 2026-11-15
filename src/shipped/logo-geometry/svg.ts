import { Unsupported, type Box, type Point, type Shape } from './geometry.js';
import { pathSubpaths } from './path.js';
import { apply, compose, IDENTITY, parseTransform, type Matrix } from './transform.js';
import { parseXml, XmlError, type XmlElement } from './xml.js';

// An SVG logo as the shapes it paints, in the order it paints them. Read: rect (rounded too), polygon, polyline, circle, ellipse and path
// (M L H V C S Q T A Z, absolute or relative), with transforms, groups, and a fill from an attribute, a style or a group. Not read, and
// named when they matter: strokes, a stylesheet, text, <use>, embedded images and masks. Their absence shows in `notes`.

const ELLIPSE_STEPS = 96;
const SKIPPED = new Set(['defs', 'clipPath', 'mask', 'symbol', 'title', 'desc', 'metadata', 'style', 'linearGradient', 'radialGradient', 'pattern', 'filter', 'marker']);
const REFUSED: Record<string, string> = {
  text: '<text> is live text: convert it to outlines in the design tool first',
  tspan: '<tspan> is live text: convert it to outlines in the design tool first',
  use: '<use> points at another element: expand it in the design tool first',
  image: '<image> is a picture inside the logo: measure the logo, not a wrapper around a picture',
  foreignObject: '<foreignObject> is not artwork',
};

export interface Svg {
  viewBox: Box;
  shapes: Shape[];
  /** What this reader did not look at, and so what the numbers may not account for. Empty for a logo it read whole */
  notes: string[];
}

export const numbers = (text: string | undefined): number[] => (text?.match(/[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) ?? []).map(Number);

function styleOf(element: XmlElement): Map<string, string> {
  const style = new Map<string, string>();
  for (const part of (element.attrs.get('style') ?? '').split(';')) {
    const colon = part.indexOf(':');
    if (colon > 0) style.set(part.slice(0, colon).trim(), part.slice(colon + 1).trim());
  }
  return style;
}

/** A property of an element: its style, then its attribute. */
const property = (element: XmlElement, style: Map<string, string>, name: string): string | undefined => style.get(name) ?? element.attrs.get(name);

interface Inherited {
  fill: string | undefined;
  rule: 'nonzero' | 'evenodd' | undefined;
  stroke: string | undefined;
  matrix: Matrix;
  invisible: boolean;
}

const length = (element: XmlElement, name: string): number => {
  const value = Number(numbers(element.attrs.get(name))[0] ?? 0);
  return Number.isFinite(value) ? value : 0;
};

/** The outline of a rectangle, with the corners rounded when rx or ry says so. */
function rectangle(element: XmlElement): { polygon: Point[]; anchors: Point[] } {
  const [x, y, w, h] = [length(element, 'x'), length(element, 'y'), length(element, 'width'), length(element, 'height')];
  const corners: Point[] = [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ];
  const rawX = element.attrs.has('rx') ? length(element, 'rx') : undefined;
  const rawY = element.attrs.has('ry') ? length(element, 'ry') : undefined;
  const rx = Math.min(Math.abs(rawX ?? rawY ?? 0), w / 2);
  const ry = Math.min(Math.abs(rawY ?? rawX ?? 0), h / 2);
  if (rx <= 0 || ry <= 0) return { polygon: corners, anchors: corners };
  const quarter = ELLIPSE_STEPS / 4;
  const polygon: Point[] = [];
  const corner = (cx: number, cy: number, from: number) => {
    for (let k = 0; k <= quarter; k++) {
      const t = ((from + (90 * k) / quarter) * Math.PI) / 180;
      polygon.push([cx + rx * Math.cos(t), cy + ry * Math.sin(t)]);
    }
  };
  corner(x + w - rx, y + ry, -90);
  corner(x + w - rx, y + h - ry, 0);
  corner(x + rx, y + h - ry, 90);
  corner(x + rx, y + ry, 180);
  return { polygon, anchors: corners };
}

function readViewBox(root: XmlElement): Box {
  const given = numbers(root.attrs.get('viewBox'));
  if (given.length >= 4) {
    const [vx, vy, vw, vh] = given as [number, number, number, number];
    if (vw > 0 && vh > 0) return [vx, vy, vw, vh];
  } else {
    const [w, h] = [numbers(root.attrs.get('width'))[0] ?? 0, numbers(root.attrs.get('height'))[0] ?? 0];
    if (w > 0 && h > 0) return [0, 0, w, h];
  }
  throw new Unsupported('the SVG has no viewBox or size');
}

/** The SVG's viewBox and shapes, or Unsupported saying what could not be read. */
export function readSvg(text: string): Svg {
  let root: XmlElement;
  try {
    root = parseXml(text);
  } catch (error) {
    if (error instanceof XmlError) throw new Unsupported(`not an SVG: ${error.message}`);
    throw error;
  }
  if (root.tag !== 'svg') throw new Unsupported(`not an SVG: the root element is ${root.tag}`);
  const viewBox = readViewBox(root);
  const shapes: Shape[] = [];
  let stroked = 0;
  let classed = false;
  let styled = false;

  const walk = (element: XmlElement, inherited: Inherited): void => {
    const tag = element.tag;
    if (tag === 'style') styled = true;
    if (SKIPPED.has(tag)) return;
    const refusal = REFUSED[tag];
    if (refusal) throw new Unsupported(refusal);
    const style = styleOf(element);
    if (property(element, style, 'display') === 'none') return;
    const own = element.attrs.get('transform');
    const matrix = own ? compose(inherited.matrix, parseTransform(own, tag)) : inherited.matrix;
    const fillText = property(element, style, 'fill');
    const fill = fillText === undefined ? inherited.fill : fillText.trim().toLowerCase();
    const strokeText = property(element, style, 'stroke');
    const stroke = strokeText === undefined ? inherited.stroke : strokeText.trim().toLowerCase();
    const ruleText = property(element, style, 'fill-rule');
    const rule = ruleText === 'evenodd' || ruleText === 'nonzero' ? ruleText : inherited.rule;
    const invisible =
      inherited.invisible ||
      property(element, style, 'visibility') === 'hidden' ||
      Number(property(element, style, 'opacity') ?? 1) === 0 ||
      Number(property(element, style, 'fill-opacity') ?? 1) === 0;
    if (element.attrs.has('class')) classed = true;

    let polygons: Point[][] = [];
    let anchors: Point[] = [];
    if (tag === 'rect') {
      const shape = rectangle(element);
      polygons = [shape.polygon];
      anchors = shape.anchors;
    } else if (tag === 'polygon' || tag === 'polyline') {
      const values = numbers(element.attrs.get('points'));
      const points: Point[] = [];
      for (let i = 0; i + 1 < values.length; i += 2) points.push([values[i]!, values[i + 1]!]);
      polygons = [points];
      anchors = [...points];
    } else if (tag === 'circle' || tag === 'ellipse') {
      const [cx, cy] = [length(element, 'cx'), length(element, 'cy')];
      const rx = element.attrs.has('r') ? length(element, 'r') : length(element, 'rx');
      const ry = element.attrs.has('r') ? length(element, 'r') : length(element, 'ry');
      polygons = [
        Array.from({ length: ELLIPSE_STEPS }, (_, k) => [cx + rx * Math.cos((2 * Math.PI * k) / ELLIPSE_STEPS), cy + ry * Math.sin((2 * Math.PI * k) / ELLIPSE_STEPS)] as Point),
      ];
      anchors = [
        [cx - rx, cy],
        [cx + rx, cy],
        [cx, cy - ry],
        [cx, cy + ry],
      ];
    } else if (tag === 'path') {
      const subpaths = pathSubpaths(element.attrs.get('d') ?? '');
      polygons = subpaths.map((s) => s.points);
      anchors = subpaths.flatMap((s) => s.anchors);
    }
    if (polygons.length > 0) {
      const painted = fill !== 'none' && fill !== 'transparent';
      if (stroke !== undefined && stroke !== 'none' && stroke !== 'transparent') stroked++;
      if (painted && !invisible) {
        const move = (p: Point): Point => apply(matrix, p);
        shapes.push({ polygons: polygons.map((poly) => poly.map(move)), anchors: anchors.map(move), fill: fill || '#000000', rule: rule ?? 'nonzero' });
      }
    }
    for (const child of element.children) walk(child, { fill, rule, stroke, matrix, invisible });
  };
  walk(root, { fill: undefined, rule: undefined, stroke: undefined, matrix: IDENTITY, invisible: false });

  const notes: string[] = [];
  if (classed && styled) notes.push('a <style> element colors shapes by class, which is not read: a shape it colors is measured in black, so the color scores may be off');
  if (stroked > 0) notes.push(`${stroked} shape${stroked === 1 ? ' is' : 's are'} drawn with a stroke, which is not measured: outline strokes in the design tool to measure them`);
  if (shapes.length === 0 && stroked > 0) throw new Unsupported('the logo is drawn with strokes only, which are not measured: outline them in the design tool first');
  return { viewBox, shapes, notes };
}
