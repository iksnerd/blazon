import type { BlazonExtension, TokenType } from '../../../types/index.js';
import { css } from './composite.js';
import { InvalidValue } from './shared.js';

export interface CssResult {
  css: string | number;
  problem?: string;
}

function fallback(value: unknown): string | number {
  if (typeof value === 'string' || typeof value === 'number') return value;
  return JSON.stringify(value);
}

/** CSS-ready value for a resolved token value; invalid values come back as a problem, not an exception. */
export function toCssValue(type: TokenType | undefined, value: unknown, blazon: BlazonExtension): CssResult {
  if (!type) return { css: fallback(value) };
  try {
    return { css: css(type, value, blazon) };
  } catch (err) {
    if (err instanceof InvalidValue) return { css: fallback(value), problem: err.message };
    throw err;
  }
}

export { compositeParts, DEFAULT_GRADIENT_ANGLE } from './composite.js';
