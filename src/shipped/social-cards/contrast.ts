export type RGB = readonly [number, number, number];

/** Text must reach this ratio against the picture (WCAG AA for normal text) */
export const MIN_CONTRAST = 4.5;
/** A logo must reach this ratio against the picture under it (WCAG non-text contrast, for graphical objects) */
export const MIN_LOGO_CONTRAST = 3;
/** Logo pixels at least this opaque (0 to 255) count as the logo; the soft edge of the artwork does not */
const LOGO_INK = 200;
/** The strongest scrim the plugin draws: past this the picture is not the picture any more */
export const MAX_SCRIM = 0.75;
const SCRIM_STEP = 0.05;
/** The share of the worst pixels the measure looks past, so one stray pixel does not decide a card */
const TAIL = 0.02;

/** A color as red, green and blue from 0 to 255: `#rgb`, `#rrggbb`, `#rrggbbaa` (the alpha is ignored) or `rgb(…)`. Undefined for anything else. */
export function parseColor(css: string): RGB | undefined {
  const text = css.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(text)?.[1];
  if (hex) {
    const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex;
    return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
  }
  const rgb = /^rgba?\(\s*(\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)/i.exec(text);
  return rgb ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])] : undefined;
}

/** WCAG relative luminance */
export function luminance([r, g, b]: RGB): number {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio, from 1 to 21 */
export function ratio(a: RGB, b: RGB): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** A pixel under a scrim of `alpha`, blended in sRGB as a browser does */
export function blend(pixel: RGB, scrim: RGB, alpha: number): RGB {
  return [0, 1, 2].map((i) => Math.round(pixel[i]! * (1 - alpha) + scrim[i]! * alpha)) as unknown as RGB;
}

/**
 * The contrast of `text` against flat `pixels` ([r, g, b, r, g, b, …]) under a scrim of `alpha`: the ratio at the worst
 * `tail` share of them, so a card is judged by its hardest spot and not by its average.
 */
export function worstRatio(pixels: readonly number[], text: RGB, alpha: number, scrim: RGB, tail = TAIL): number {
  const ratios: number[] = [];
  for (let i = 0; i + 2 < pixels.length; i += 3) ratios.push(ratio(text, blend([pixels[i]!, pixels[i + 1]!, pixels[i + 2]!], scrim, alpha)));
  if (ratios.length === 0) return 21;
  ratios.sort((a, b) => a - b);
  return ratios[Math.min(ratios.length - 1, Math.floor(ratios.length * tail))]!;
}

export interface Scrim {
  alpha: number;
  /** The ratio at that alpha */
  ratio: number;
  /** Whether it reaches MIN_CONTRAST */
  ok: boolean;
}

/** The weakest scrim, in steps of 0.05 and no stronger than MAX_SCRIM, that brings `text` to MIN_CONTRAST; else the strongest, not ok. */
export function solveScrim(pixels: readonly number[], text: RGB, scrim: RGB): Scrim {
  const steps = Math.round(MAX_SCRIM / SCRIM_STEP);
  let last: Scrim = { alpha: 0, ratio: 0, ok: false };
  for (let i = 0; i <= steps; i++) {
    const alpha = Math.round(i * SCRIM_STEP * 100) / 100;
    last = { alpha, ratio: worstRatio(pixels, text, alpha, scrim), ok: false };
    last.ok = last.ratio >= MIN_CONTRAST;
    if (last.ok) return last;
  }
  return last;
}

/** Which candidate text color to use: the one that is ok with the weakest scrim (the first on a tie), else the one that gets closest. */
export function chooseText(pixels: readonly number[], candidates: readonly RGB[], scrim: RGB): Scrim & { index: number } {
  const solved = candidates.map((text, index) => ({ ...solveScrim(pixels, text, scrim), index }));
  const ok = solved.filter((s) => s.ok).sort((a, b) => a.alpha - b.alpha || a.index - b.index);
  return ok[0] ?? [...solved].sort((a, b) => b.ratio - a.ratio || a.index - b.index)[0]!;
}

/**
 * The contrast of a logo against the picture under it, at the worst `tail` share of its pixels. `logo` is the artwork alone
 * ([r, g, b, a, …]) and `under` the picture beneath it ([r, g, b, …]), pixel for pixel; only the logo's solid pixels count.
 */
export function logoRatio(logo: readonly number[], under: readonly number[], tail = TAIL): number {
  const ratios: number[] = [];
  for (let i = 0; i < logo.length / 4 && i * 3 + 2 < under.length; i++) {
    if (logo[i * 4 + 3]! < LOGO_INK) continue;
    ratios.push(ratio([logo[i * 4]!, logo[i * 4 + 1]!, logo[i * 4 + 2]!], [under[i * 3]!, under[i * 3 + 1]!, under[i * 3 + 2]!]));
  }
  if (ratios.length === 0) return 21;
  ratios.sort((a, b) => a - b);
  return ratios[Math.min(ratios.length - 1, Math.floor(ratios.length * tail))]!;
}

/** Which of the measured logos to use: the one with the higher contrast, the first on a tie. */
export function bestLogo<T extends { ratio: number }>(measured: readonly T[]): T {
  return measured.reduce((best, m) => (m.ratio > best.ratio ? m : best));
}
