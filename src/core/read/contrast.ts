import type Color from 'colorjs.io';
import type { BlazonData, ContrastLevel, TokenItem } from '../../types/index.js';
import { alphaOf, blendOver, contrastBetween, matchingPairs, parseColor } from '../checker/contrast.js';
import { levelOf, NON_TEXT_MINIMUM } from './can.js';
import { findToken, LookupError } from './lookup.js';
import { allPairs, type PairRule } from './rules.js';
import { inTheme } from './theme.js';

/** What every answer says, word for word: the operation measures, and only `can_use` says whether the brand allows a pair. */
export const MEASURE_NOTE = 'a measurement, not a brand approval';

export interface ContrastMeasure {
  fg: string;
  bg: string;
  /** The token blended over `bg`, when given */
  with?: string;
  /** The opacity of `with` over `bg`, 0 to 1 (multiplied with the token's own alpha) */
  withAlpha?: number;
  /** The foreground's own opacity, 0 to 1, when given: the same `alpha` as `blazon can` takes */
  alpha?: number;
  theme?: string;
  ratio: number;
  level: ContrastLevel | 'fail';
  /** Whether the ratio reaches 3:1, the WCAG 1.4.11 figure for a graphic or a control boundary */
  nonText: boolean;
  /** The two colors that were measured, as hex after the blend */
  seen: { fg: string; bg: string };
  /** The pairs the brand LISTS for `fg` on the BASE `bg` token. They say nothing about the blend. */
  brandPairs: PairRule[];
  note: string;
}

const hexOf = (color: Color): string => color.toString({ format: 'hex', collapse: false });

/**
 * The measure on colors, which is all the math: `over` (a color and its opacity) is blended over `bg`, then `fg` (at `alpha` times its own
 * opacity) is blended over that, and the ratio is `contrastBetween`'s, the one `blazon check` uses. Undefined when `bg` is translucent.
 * No gamut mapping: a color outside sRGB is measured as the library converts it; only the `seen` hex is mapped into sRGB for printing.
 */
export function measureColors(input: {
  fg: Color;
  bg: Color;
  over?: { color: Color; alpha: number };
  alpha?: number;
}): { ratio: number; seen: { fg: string; bg: string } } | undefined {
  if (alphaOf(input.bg) < 1) return undefined;
  const base = input.over ? blendOver(input.over.color, input.bg, alphaOf(input.over.color) * input.over.alpha) : input.bg;
  const fg = input.fg.clone();
  if (input.alpha !== undefined) fg.alpha = alphaOf(fg) * input.alpha;
  const ratio = contrastBetween(fg, base);
  if (ratio === undefined) return undefined;
  return { ratio, seen: { fg: hexOf(alphaOf(fg) < 1 ? blendOver(fg, base) : fg), bg: hexOf(base) } };
}

const unit = (name: string, value: unknown): number => {
  if (typeof value === 'number' && value >= 0 && value <= 1) return value;
  throw new LookupError(`${name} must be a number from 0 to 1; got ${String(value)}.`);
};

function colorOf(item: TokenItem, label: string): Color {
  const color = item.type === 'color' && typeof item.value === 'string' ? parseColor(item.value) : undefined;
  if (color) return color;
  const what =
    item.type === 'gradient' ? 'a gradient, which is not measured: pass the colour of its strongest point as `with` and its opacity as `withAlpha`' : `${item.type ?? 'untyped'}`;
  throw new LookupError(`{${item.path}} (${label}) is not a color blazon can read: it is ${what}.`);
}

/**
 * What contrast the foreground token has on the background token, with one translucent token optionally blended over the background first.
 * A measurement of what would be rendered; it carries no verdict. Only `canUse` says whether the brand allows a pair, and a blend is never a
 * listed pair. Refuses (LookupError) what it cannot measure rather than guessing: a translucent `bg`, a `with` that is not a readable color, an
 * unknown or theme-removed token, an alpha outside 0 to 1, `with` without `withAlpha` or the reverse.
 */
export function measureContrast(
  data: BlazonData,
  input: { fg: string; bg: string; with?: string; withAlpha?: number; alpha?: number; theme?: string },
  inThemeNamed?: string,
): ContrastMeasure {
  if (input.theme !== undefined) return { ...measureContrast(inTheme(data, input.theme), { ...input, theme: undefined }, input.theme), theme: input.theme };
  if ((input.with === undefined) !== (input.withAlpha === undefined)) throw new LookupError('with and withAlpha go together: give both, or neither.');
  const fg = findToken(data, input.fg, inThemeNamed);
  const bg = findToken(data, input.bg, inThemeNamed);
  const tint = input.with === undefined ? undefined : findToken(data, input.with, inThemeNamed);
  const withAlpha = input.withAlpha === undefined ? undefined : unit('withAlpha', input.withAlpha);
  const alpha = input.alpha === undefined ? undefined : unit('alpha', input.alpha);
  const fgColor = colorOf(fg, 'foreground');
  const bgColor = colorOf(bg, 'background');
  const over = tint && withAlpha !== undefined ? { color: colorOf(tint, 'with'), alpha: withAlpha } : undefined;
  const measured = measureColors({ fg: fgColor, bg: bgColor, over, alpha });
  if (!measured)
    throw new LookupError(
      `{${bg.path}} (background) is translucent (${String(bg.value)}), so what is behind it is not known and blazon cannot measure contrast on it. Use an opaque background token.`,
    );
  const { ratio } = measured;
  return {
    fg: fg.path,
    bg: bg.path,
    ...(tint && { with: tint.path }),
    ...(withAlpha !== undefined && { withAlpha }),
    ...(alpha !== undefined && { alpha }),
    ratio: Math.round(ratio * 100) / 100,
    level: levelOf(ratio),
    nonText: ratio >= NON_TEXT_MINIMUM,
    seen: measured.seen,
    brandPairs: matchingPairs(data.tokens.items, allPairs(data), fg.path, bg.path),
    note: MEASURE_NOTE,
  };
}
