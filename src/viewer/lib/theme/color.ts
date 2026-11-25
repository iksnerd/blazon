// Color helpers for the viewer's own rendering (ink on a swatch, RGB labels).

import { inkForPaint, paintContrast } from '../../../core/checker/contrast';

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

/** Black or white, whichever has more contrast on the given color (core's `inkForPaint`). */
export const inkOn = (color: string): string => inkForPaint(color) ?? 'currentColor';

/** The contrast ratio a graphic, such as a logo, needs against its background (WCAG 1.4.11). */
export const GRAPHIC_CONTRAST = 3;

/** The contrast ratio of white on a color or a gradient: core's `paintContrast`, which judges a gradient by the average luminance of its stops. */
export const whiteContrast = (paint: string): number | undefined => paintContrast('#ffffff', paint);

/** The contrast ratio of black on a color or a gradient, measured as whiteContrast is. */
export const blackContrast = (paint: string): number | undefined => paintContrast('#000000', paint);

/** The WCAG contrast ratio between two paints (colors or gradients): core's `paintContrast`, the one measure. */
export const contrastBetween = paintContrast;

/** Black or white, whichever reads better on a color or a gradient (judged by its average luminance). */
export const inkOnPaint = (paint: string): '#000' | '#fff' | 'currentColor' => inkForPaint(paint) ?? 'currentColor';

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
