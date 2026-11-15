// Colors as the plugins that write files need them: a six-digit hex in capitals, and the measures the office template uses to pick a text
// color and a logo for a surface.

export type Rgb = [number, number, number];

const channel = (text: string, scale: number): number => Math.max(0, Math.min(255, Math.round(text.endsWith('%') ? (parseFloat(text) / 100) * 255 : parseFloat(text) * scale)));

/** A hex or rgb() color as `[r, g, b]`; undefined for anything else (a named color, oklch, a var()). Any alpha is dropped. */
export function parseColor(value: unknown): Rgb | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(text)?.[1];
  if (hex) {
    const full = hex.length <= 4 ? [...hex].map((c) => c + c).join('') : hex;
    return [0, 2, 4].map((at) => parseInt(full.slice(at, at + 2), 16)) as Rgb;
  }
  const rgb = /^rgba?\(\s*([\d.]+%?)[\s,]+([\d.]+%?)[\s,]+([\d.]+%?)\s*(?:[,/]\s*[\d.]+%?\s*)?\)$/i.exec(text);
  if (rgb) return [channel(rgb[1]!, 1), channel(rgb[2]!, 1), channel(rgb[3]!, 1)];
  return undefined;
}

export const toHex = ([r, g, b]: Rgb): string =>
  [r, g, b]
    .map((part) => part.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();

/** WCAG relative luminance, 0 (black) to 1 (white) */
export function luminance([r, g, b]: Rgb): number {
  const [lr, lg, lb] = [r, g, b].map((part) => {
    const v = part / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }) as Rgb;
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

/** WCAG contrast ratio, 1 to 21 */
export function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** `from` moved `amount` (0 to 1) of the way to `to` */
export const mix = (from: Rgb, to: Rgb, amount: number): Rgb => from.map((part, at) => Math.round(part + (to[at]! - part) * amount)) as Rgb;
