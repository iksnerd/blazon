import type { TokenType } from '../../../types/index.js';
import { color } from './color.js';
import { fontFamily, fontWeight } from './font.js';
import { fail, isObject } from './shared.js';
import { measure, number } from './units.js';

function cubicBezier(value: unknown): string {
  if (Array.isArray(value) && value.length === 4 && value.every((n) => typeof n === 'number')) {
    const [x1, , x2] = value as number[];
    if (!Number.isFinite(value[1]) || !Number.isFinite(value[3]) || x1! < 0 || x1! > 1 || x2! < 0 || x2! > 1) {
      return fail('cubicBezier x values (the first and third) must be within 0 and 1, and all four must be finite');
    }
    return `cubic-bezier(${value.join(', ')})`;
  }
  if (typeof value === 'string') return value;
  return fail('cubicBezier must be an array of four numbers');
}

function strokeStyle(value: unknown): string {
  if (typeof value === 'string') return value;
  // Object form (dashArray + lineCap) has no CSS border-style equivalent.
  if (isObject(value)) return 'dashed';
  return fail('strokeStyle must be a string or an object');
}

export function simple(type: TokenType, value: unknown): string | number {
  switch (type) {
    case 'color':
      return color(value);
    case 'dimension':
      return measure(value, 'dimension');
    case 'duration':
      return measure(value, 'duration');
    case 'fontFamily':
      return fontFamily(value);
    case 'fontWeight':
      return fontWeight(value);
    case 'number':
      return number(value);
    case 'cubicBezier':
      return cubicBezier(value);
    case 'strokeStyle':
      return strokeStyle(value);
    default:
      return fail(`${type} is not a simple type`);
  }
}
