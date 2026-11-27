import { normalizeColor } from '../../drift/compare.js';
import { alphaOf, parseColor } from '../../checker/contrast.js';

const hex2 = (n: number) =>
  Math.max(0, Math.min(255, Math.round(n)))
    .toString(16)
    .padStart(2, '0');

/**
 * A color value as hex, from any CSS color the core's parser reads: hex, rgb(), hsl(), hwb(), lab(), lch(), oklab(), oklch(), color() or a
 * name. A color outside sRGB is mapped into it. A color with alpha under 1 keeps it as an 8-digit hex. `exact` is false when a conversion
 * was needed, so the value as written is not the hex. Undefined for anything else (a `var()`, `currentColor`, a keyword).
 */
export function toHex(value: string): { hex: string; exact: boolean } | undefined {
  const text = value.trim();
  if (/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(text)) return { hex: normalizeColor(text), exact: true };
  if (/var\(|^currentcolor$|^(inherit|initial|unset|revert|none)$/i.test(text)) return undefined;
  const color = parseColor(text);
  if (!color) return undefined;
  const srgb = color.to('srgb').toGamut({ space: 'srgb' });
  const [r, g, b] = srgb.coords.map((c) => (c === null || Number.isNaN(c) ? 0 : c * 255));
  let hex = `#${hex2(r!)}${hex2(g!)}${hex2(b!)}`;
  const alpha = alphaOf(color);
  if (alpha < 1) hex += hex2(alpha * 255);
  return { hex, exact: false };
}
