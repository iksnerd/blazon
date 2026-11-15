import { fail, isObject } from './shared.js';

/** CSS's absolute print units in px, at CSS's 96px to the inch. A screen token in one was copied from print. */
const PRINT_UNIT_PX: Record<string, number> = { pt: 96 / 72, pc: 16, in: 96, cm: 96 / 2.54, mm: 96 / 25.4, Q: 96 / 101.6 };

const round = (n: number): number => Number(n.toFixed(3));

const NUMBER = String.raw`[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?`;
/** The CSS lengths a dimension may be written in, and the time units of a duration. A DTCG dimension is px or rem; the rest are tolerated, as before. */
const LENGTH_UNITS = 'px|rem|em|%|ex|ch|cap|lh|rlh|vw|vh|vi|vb|vmin|vmax|svw|svh|lvw|lvh|dvw|dvh|cqw|cqh|cqi|cqb|cqmin|cqmax';
const LENGTH = new RegExp(`^${NUMBER}(?:${LENGTH_UNITS})$`, 'i');
const TIME = new RegExp(`^${NUMBER}(?:ms|s)$`, 'i');
/** A value the browser reads itself: a function (calc, clamp, var...) or a keyword. */
const BROWSER_READS = /^(?:[a-z-]+\(.*\)|auto|inherit|initial|unset|thin|medium|thick|min-content|max-content|fit-content)$/i;

/** True when `css` is a length or time the browser will read as one. A bare 0 is a length. */
function isMeasure(css: string, kind: string): boolean {
  if (BROWSER_READS.test(css)) return true;
  if (kind === 'dimension') return css === '0' || LENGTH.test(css);
  return TIME.test(css);
}

export function measure(value: unknown, kind: string): string {
  let css: string | undefined;
  if (typeof value === 'string' && value.trim()) css = value.trim();
  else if (isObject(value) && typeof value.value === 'number' && typeof value.unit === 'string') css = `${value.value}${value.unit}`;
  if (css === undefined) return fail(`${kind} must be {"value": number, "unit": string}, got ${JSON.stringify(value)}`);

  const print = kind === 'dimension' ? css.match(/^(-?[\d.]+)(pt|pc|in|cm|mm|Q)$/) : null;
  if (print) {
    const [, amount, unit] = print as [string, string, string];
    const px = PRINT_UNIT_PX[unit]!;
    fail(`${css} is a print unit; write ${round(Number(amount) * px)}px (1${unit} = ${round(px)}px). A DTCG dimension is px or rem`);
  }
  if (!isMeasure(css, kind)) {
    const want = kind === 'dimension' ? 'a number and a unit: 16px or 1.5rem' : 'a number and a unit: 200ms or 0.2s';
    fail(`${JSON.stringify(css)} is not a ${kind}; write ${want}`);
  }
  return css;
}
export function number(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) return Number(value);
  return fail(`Expected a number, got ${JSON.stringify(value)}`);
}
