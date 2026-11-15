import { Unsupported, type Point } from './geometry.js';

// The `transform` attribute: a list of matrix, translate, scale, rotate, skewX and skewY, applied to the points of a shape when it is
// read, so everything after that works in the artwork's own space.

/** a, b, c, d, e, f: x' = a·x + c·y + e, y' = b·x + d·y + f */
export type Matrix = [number, number, number, number, number, number];

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** `outer` applied after `inner`. */
export const compose = (outer: Matrix, inner: Matrix): Matrix => [
  outer[0] * inner[0] + outer[2] * inner[1],
  outer[1] * inner[0] + outer[3] * inner[1],
  outer[0] * inner[2] + outer[2] * inner[3],
  outer[1] * inner[2] + outer[3] * inner[3],
  outer[0] * inner[4] + outer[2] * inner[5] + outer[4],
  outer[1] * inner[4] + outer[3] * inner[5] + outer[5],
];

export const apply = (m: Matrix, [x, y]: Point): Point => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

const FUNCTION = /\s*,?\s*([a-zA-Z]+)\s*\(([^)]*)\)/y;

/** The matrix a `transform` attribute stands for, or Unsupported saying what in it is not understood. */
export function parseTransform(text: string, tag: string): Matrix {
  let matrix = IDENTITY;
  let at = 0;
  const source = text.trim();
  while (at < source.length) {
    FUNCTION.lastIndex = at;
    const found = FUNCTION.exec(source);
    if (!found) throw new Unsupported(`transform on <${tag}> is not one this reader understands: ${JSON.stringify(text.slice(0, 60))}`);
    at = FUNCTION.lastIndex;
    const args = (found[2]!.match(/[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) ?? []).map(Number);
    const need = (counts: number[]) => {
      if (!counts.includes(args.length)) throw new Unsupported(`${found[1]}() in the transform on <${tag}> takes ${counts.join(' or ')} numbers, not ${args.length}`);
    };
    let next: Matrix;
    switch (found[1]) {
      case 'matrix':
        need([6]);
        next = args as Matrix;
        break;
      case 'translate':
        need([1, 2]);
        next = [1, 0, 0, 1, args[0]!, args[1] ?? 0];
        break;
      case 'scale':
        need([1, 2]);
        next = [args[0]!, 0, 0, args[1] ?? args[0]!, 0, 0];
        break;
      case 'rotate': {
        need([1, 3]);
        const angle = (args[0]! * Math.PI) / 180;
        const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
        next = [cos, sin, -sin, cos, 0, 0];
        if (args.length === 3) next = compose(compose([1, 0, 0, 1, args[1]!, args[2]!], next), [1, 0, 0, 1, -args[1]!, -args[2]!]);
        break;
      }
      case 'skewX':
        need([1]);
        next = [1, 0, Math.tan((args[0]! * Math.PI) / 180), 1, 0, 0];
        break;
      case 'skewY':
        need([1]);
        next = [1, Math.tan((args[0]! * Math.PI) / 180), 0, 1, 0, 0];
        break;
      default:
        throw new Unsupported(`transform on <${tag}> has ${found[1]}(), which is not an SVG transform`);
    }
    matrix = compose(matrix, next);
  }
  return matrix;
}
