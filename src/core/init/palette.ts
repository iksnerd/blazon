// Color math for the guided start: contrast. Pure functions, no output.

export const WHITE = '#ffffff';
export const NEAR_BLACK = '#0b1120';

type Rgb = [number, number, number];

/** #rgb or #rrggbb (the # optional) as channels 0 to 1; undefined for anything else. */
export function hexToRgb(hex: string): Rgb | undefined {
  const m = hex.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return undefined;
  const full = m[1]!.length === 3 ? [...m[1]!].map((c) => c + c).join('') : m[1]!;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255) as Rgb;
}

const toLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

function must(hex: string): Rgb {
  const rgb = hexToRgb(hex);
  if (!rgb) throw new Error(`not a hex color: ${hex}`);
  return rgb;
}

export function luminance(hex: string): number {
  const [r, g, b] = must(hex).map(toLinear) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, 1 to 21. */
export function contrast(a: string, b: string): number {
  const [la, lb] = [luminance(a), luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export type Level = 'AAA' | 'AA' | 'AA-large' | 'fail';
export const level = (ratio: number): Level => (ratio >= 7 ? 'AAA' : ratio >= 4.5 ? 'AA' : ratio >= 3 ? 'AA-large' : 'fail');

export interface Contrast {
  onWhite: { ratio: number; level: Level };
  onNearBlack: { ratio: number; level: Level };
  /** True when white button text on this color reaches 4.5:1 */
  carriesWhiteText: boolean;
}

export function contrastOf(hex: string): Contrast {
  const w = contrast(hex, WHITE);
  const b = contrast(hex, NEAR_BLACK);
  return { onWhite: { ratio: w, level: level(w) }, onNearBlack: { ratio: b, level: level(b) }, carriesWhiteText: w >= 4.5 };
}

/** Blazon's two inks, the colors of `text.onSignal` a new book can choose between: graphite and bone. */
export const GRAPHITE = '#1E1F21';
export const BONE = '#F2F0EB';

/** Which of blazon's inks reads best as a label on this color, and whether it reaches AA (4.5:1). */
export function labelOn(hex: string): { ink: 'graphite' | 'bone'; ratio: number; aa: boolean } {
  const g = contrast(hex, GRAPHITE);
  const b = contrast(hex, BONE);
  return g >= b ? { ink: 'graphite', ratio: g, aa: g >= 4.5 } : { ink: 'bone', ratio: b, aa: b >= 4.5 };
}
