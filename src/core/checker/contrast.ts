import Color from 'colorjs.io';
import type { ContrastLevel, ContrastPair, Finding, TokenItem } from '../../types/index.js';
import { aliasTarget } from '../tokens/alias.js';
import { finding } from './catalogue.js';

/** WCAG 2.2 SC 1.4.3 / 1.4.6 minimum ratios. */
export const CONTRAST_MINIMUM: Record<ContrastLevel, number> = { AA: 4.5, 'AA-large': 3, AAA: 7 };

/** Any CSS color (hex, rgb(), hsl(), lab(), oklch(), color(), a name), or undefined for anything else. The color keeps its alpha; `contrastBetween` blends it. */
export function parseColor(css: string): Color | undefined {
  try {
    return new Color(css.trim());
  } catch {
    return undefined;
  }
}

/** The WCAG 2.x contrast ratio of two colors, from their relative luminance. */
export function contrastRatio(a: Color, b: Color): number {
  return Color.contrast(a, b, 'WCAG21');
}

/** A color's opacity, 0 to 1; a color with no alpha is opaque. */
export const alphaOf = (color: Color): number => {
  const alpha = color.alpha;
  return typeof alpha === 'number' && !Number.isNaN(alpha) ? alpha : 1;
};

/**
 * `top` shown at `alpha` (default: its own opacity) over the opaque `base`: source-over in sRGB with straight alpha, and the result is opaque.
 * A missing channel (`none`) takes the base's. This is the one blend: `contrastBetween` (so `blazon check` and `blazon can`) and the read
 * command `blazon contrast` all use it.
 */
export function blendOver(top: Color, base: Color, alpha: number = alphaOf(top)): Color {
  const [f, b] = [top.to('srgb').coords, base.to('srgb').coords];
  const mixed = f.map((c, i) => (c === null || Number.isNaN(c) ? b[i]! : c * alpha + b[i]! * (1 - alpha)));
  return new Color('srgb', mixed as [number, number, number]);
}

/**
 * The ratio of a foreground over a background, or undefined when the backdrop is not known. WCAG measures what is seen, so a
 * translucent foreground is blended over the background first. A translucent background shows whatever is behind it, which a
 * pair does not name, so it has no ratio.
 */
export function contrastBetween(fg: Color, bg: Color): number | undefined {
  if (alphaOf(bg) < 1) return undefined;
  const a = alphaOf(fg);
  if (a >= 1) return contrastRatio(fg, bg);
  return contrastRatio(blendOver(fg, bg, a), bg);
}

/** A ratio as the message prints it: floored to two decimals, so a failing 4.496 never reads as the 4.50 it misses. */
export const ratioMessage = (ratio: number): string => (Math.floor(ratio * 100 + 1e-9) / 100).toFixed(2);

/** Expands "{a.b}" to that token and "{a.*}" to every color token under a. */
export function expand(ref: string, items: TokenItem[]): TokenItem[] {
  const target = aliasTarget(ref);
  if (!target) return [];
  if (target.endsWith('.*')) {
    const prefix = target.slice(0, -1);
    return items.filter((t) => t.path.startsWith(prefix) && t.type === 'color');
  }
  return items.filter((t) => t.path === target);
}

/** The token's path, then the path of each token it aliases in turn. */
export function aliasChain(items: TokenItem[], path: string): string[] {
  const byPath = new Map(items.map((item) => [item.path, item]));
  const found: string[] = [];
  for (let at = byPath.get(path); at && !found.includes(at.path); at = at.aliasOf ? byPath.get(at.aliasOf) : undefined) found.push(at.path);
  return found;
}

/**
 * The listed pairs that name this foreground on this background. A pair written on a token that the foreground or the
 * background aliases counts, because the alias is the same color: `blazon check`, `blazon can` and the plugins that note a pair all use this one rule.
 */
export function matchingPairs<T extends { fg: string; bg: string }>(items: TokenItem[], listed: T[], fgPath: string, bgPath: string): T[] {
  const fgChain = aliasChain(items, fgPath);
  const bgChain = aliasChain(items, bgPath);
  return listed.filter((pair) => expand(pair.fg, items).some((t) => fgChain.includes(t.path)) && expand(pair.bg, items).some((t) => bgChain.includes(t.path)));
}

export function contrastFindings(pair: ContrastPair, rulePath: string, items: TokenItem[], unresolved: ReadonlySet<string> = new Set()): Finding[] {
  const minimum = CONTRAST_MINIMUM[pair.min];
  const fgs = expand(pair.fg, items);
  const bgs = expand(pair.bg, items);
  if (minimum === undefined || fgs.length === 0 || bgs.length === 0) {
    return [finding('contrast-pair-invalid', { path: rulePath, message: `Pair ${pair.fg} on ${pair.bg} (${pair.min}) matches no color tokens or has an unknown level` })];
  }

  const findings: Finding[] = [];
  for (const bg of bgs) {
    for (const fg of fgs) {
      // An alias that names no token is `alias-unresolved` already; a pair on it is not a second finding
      if (unresolved.has(fg.path) || unresolved.has(bg.path)) continue;
      const [fgColor, bgColor] = [parseColor(String(fg.value)), parseColor(String(bg.value))];
      if (!fgColor || !bgColor) {
        findings.push(finding('contrast-unknown', { path: bg.path, message: `Cannot measure ${fg.value} on ${bg.value}: not a color blazon can read` }));
        continue;
      }
      const ratio = contrastBetween(fgColor, bgColor);
      if (ratio === undefined) {
        findings.push(
          finding('contrast-unknown', { path: bg.path, message: `Cannot measure ${fg.value} on ${bg.value}: the background is translucent, so what is behind it is not known` }),
        );
      } else if (ratio < minimum) {
        findings.push(finding('contrast-insufficient', { path: bg.path, message: `{${fg.path}} on {${bg.path}} is ${ratioMessage(ratio)}:1; ${pair.min} needs ${minimum}:1` }));
      }
    }
  }
  return findings;
}

const PAINT_STOP = /#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/gi;

/** The average relative luminance of the color stops a paint (a color or a gradient) holds; undefined when it holds none blazon can read. */
export function paintLuminance(paint: string): number | undefined {
  const stops = (paint.match(PAINT_STOP) ?? []).map(parseColor).filter((color): color is Color => color !== undefined);
  return stops.length === 0 ? undefined : stops.reduce((sum, color) => sum + color.luminance, 0) / stops.length;
}

/**
 * The contrast of one paint on another, where a paint is a color or a gradient. Two plain colors are measured by `contrastBetween`, the one measure
 * (a translucent foreground is blended, a translucent background has no ratio). A gradient is judged by the average luminance of its stops.
 * Undefined when either holds no color blazon can read.
 */
export function paintContrast(fg: string, bg: string): number | undefined {
  const [cf, cb] = [parseColor(fg), parseColor(bg)];
  if (cf && cb) return contrastBetween(cf, cb);
  const [lf, lb] = [paintLuminance(fg), paintLuminance(bg)];
  if (lf === undefined || lb === undefined) return undefined;
  return (Math.max(lf, lb) + 0.05) / (Math.min(lf, lb) + 0.05);
}

/** Black or white, whichever reads better on a paint (a color or a gradient, judged by the average luminance of its stops); undefined when the paint holds no readable color. */
export function inkForPaint(paint: string): '#000' | '#fff' | undefined {
  const l = paintLuminance(paint);
  return l === undefined ? undefined : 1.05 / (l + 0.05) >= (l + 0.05) / 0.05 ? '#fff' : '#000';
}
