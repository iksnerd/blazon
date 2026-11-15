import type { TokenType } from '../../types/index.js';

// What `blazon drift` compares: the custom properties a stylesheet declares, and a token's value against one.

const HEX = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const DIMENSION = /^(-?(?:\d+\.?\d*|\.\d+))(px|rem)$/i;

const squash = (value: string): string => value.trim().toLowerCase().replace(/\s+/g, ' ');

/** A color as lowercase hex with 3 and 4-digit forms expanded and the alpha of an 8-digit form kept; anything else as a lowercase string. */
export function normalizeColor(value: string): string {
  const text = value.trim();
  if (!HEX.test(text)) return squash(text);
  const digits = text.slice(1).toLowerCase();
  const full = digits.length <= 4 ? [...digits].map((c) => c + c).join('') : digits;
  return `#${full}`;
}

/** A dimension as its number and unit, so `1.0rem` and `1rem` are the same; rem and px are never converted into each other. */
export function normalizeDimension(value: string): string {
  const match = value.trim().match(DIMENSION);
  return match ? `${Number(match[1])}${match[2]!.toLowerCase()}` : squash(value);
}

/** The form two values of this type are compared in. */
export function normalizeValue(type: TokenType | undefined, value: string): string {
  if (type === 'color') return normalizeColor(value);
  if (type === 'dimension') return normalizeDimension(value);
  return squash(value);
}

export function compareValues(type: TokenType | undefined, tokenValue: string, cssValue: string): boolean {
  return normalizeValue(type, tokenValue) === normalizeValue(type, cssValue);
}

const COMMENT = /\/\*[\s\S]*?\*\//g;
const RULE = /([^{}]*)\{([^{}]*)\}/g;
const DECLARATION = /(--[A-Za-z0-9_-]+)\s*:\s*([^;]*?)\s*(?:;|$)/g;
const ROOT_SELECTOR = /(^|,)\s*(:root|html)\s*(,|$)/;
const VAR = /^var\(\s*(--[A-Za-z0-9_-]+)\s*\)$/;

/**
 * The custom properties a stylesheet declares. A name declared in a `:root` or `html` rule beats one declared anywhere
 * else, and the last declaration wins within each kind. Selectors, media queries and the cascade are not modeled. A
 * value that is exactly `var(--other)` is replaced by the value of `--other`.
 */
export function customProperties(css: string): Map<string, string> {
  const root = new Map<string, string>();
  const other = new Map<string, string>();
  for (const rule of css.replace(COMMENT, '').matchAll(RULE)) {
    const into = ROOT_SELECTOR.test(rule[1]!.trim()) ? root : other;
    for (const declaration of rule[2]!.matchAll(DECLARATION)) into.set(declaration[1]!, declaration[2]!);
  }
  const vars = new Map([...other, ...root]);
  for (const [name, raw] of vars) {
    let value = raw;
    const seen = new Set([name]);
    for (let ref = value.match(VAR); ref && vars.has(ref[1]!) && !seen.has(ref[1]!); ref = value.match(VAR)) {
      seen.add(ref[1]!);
      value = vars.get(ref[1]!)!;
    }
    vars.set(name, value);
  }
  return vars;
}

export type DriftStatus = 'ok' | 'drift' | 'missing';

export interface DriftFinding {
  path: string;
  cssVar: string;
  status: DriftStatus;
  /** The token's value, in the form it was compared in */
  expected: string;
  /** The variable's value, in the form it was compared in; absent when the variable is missing */
  actual?: string;
}

export function driftFinding(token: { path: string; type: TokenType | undefined; value: string | number }, cssVar: string, vars: Map<string, string>): DriftFinding {
  const expected = normalizeValue(token.type, String(token.value));
  const found = vars.get(cssVar);
  if (found === undefined) return { path: token.path, cssVar, status: 'missing', expected };
  const actual = normalizeValue(token.type, found);
  return { path: token.path, cssVar, status: actual === expected ? 'ok' : 'drift', expected, actual };
}
