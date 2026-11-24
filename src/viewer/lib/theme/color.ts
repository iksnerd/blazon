// Color helpers for the viewer's own rendering (ink on a swatch, RGB labels).

import { contrastBetween as coreContrast, parseColor } from '../../../core/checker/contrast';

type Rgb = [number, number, number];

function parseRgb(css: string): Rgb | undefined {
  const hex = css.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i)?.[1];
  if (hex) {
    const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex.slice(0, 6);
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as Rgb;
  }
  const rgb = css.trim().match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
  return rgb ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])] : undefined;
}

/** WCAG relative luminance. */
function luminance([r, g, b]: Rgb): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Black or white, whichever has more contrast on the given color. */
export function inkOn(color: string): string {
  const rgb = parseRgb(color);
  if (!rgb) return 'currentColor';
  const l = luminance(rgb);
  return (l + 0.05) / 0.05 >= 1.05 / (l + 0.05) ? '#000' : '#fff';
}

/** The average luminance of a paint's color stops; undefined when it holds no color blazon can read. */
function paintLuminance(paint: string): number | undefined {
  const stops = (paint.match(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/gi) ?? []).map(parseRgb).filter((rgb): rgb is Rgb => rgb !== undefined);
  if (stops.length === 0) return undefined;
  return stops.reduce((sum, rgb) => sum + luminance(rgb), 0) / stops.length;
}

/** The contrast ratio a graphic, such as a logo, needs against its background (WCAG 1.4.11). */
export const GRAPHIC_CONTRAST = 3;

/**
 * The contrast ratio of white on a color or a gradient, a gradient judged by the average luminance of
 * its stops. Undefined when the paint holds no color blazon can read.
 */
export function whiteContrast(paint: string): number | undefined {
  const l = paintLuminance(paint);
  return l === undefined ? undefined : 1.05 / (l + 0.05);
}

/** The contrast ratio of black on a color or a gradient, judged as whiteContrast is. */
export function blackContrast(paint: string): number | undefined {
  const l = paintLuminance(paint);
  return l === undefined ? undefined : (l + 0.05) / 0.05;
}

/**
 * The WCAG contrast ratio between two paints. Two plain colors are measured by core's `contrastBetween` (one measure: a translucent
 * foreground is blended over the background, and a translucent background has no ratio). A gradient is judged by the average
 * luminance of its stops. Undefined when either holds no color blazon can read.
 */
export function contrastBetween(a: string, b: string): number | undefined {
  const [ca, cb] = [parseColor(a), parseColor(b)];
  if (ca && cb) return coreContrast(ca, cb);
  const la = paintLuminance(a);
  const lb = paintLuminance(b);
  if (la === undefined || lb === undefined) return undefined;
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Black or white, whichever reads better on a color or a gradient (judged by its average luminance). */
export function inkOnPaint(paint: string): '#000' | '#fff' | 'currentColor' {
  const white = whiteContrast(paint);
  const black = blackContrast(paint);
  if (white === undefined || black === undefined) return 'currentColor';
  return white >= black ? '#fff' : '#000';
}

/**
 * What a badge says for a paint: a color is its own text; a gradient is its stops ("#FF4F40 → #FF44DD"),
 * since the CSS is too long for a pill. A gradient with fewer than two readable stops keeps its CSS.
 */
export function paintLabel(paint: string): string {
  if (!/gradient\(/i.test(paint)) return paint;
  const stops = paint.match(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/gi) ?? [];
  return stops.length >= 2 ? stops.join(' → ') : paint;
}

export function rgbText(color: string): string | undefined {
  return parseRgb(color)?.join(' ');
}
