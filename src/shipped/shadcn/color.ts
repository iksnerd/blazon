import Color from 'colorjs.io';

// The color work of blazon.shadcn: reading any CSS color colorjs.io knows (as blazon.platform-tokens does), writing it as OKLCH or hex, and
// telling whether two values are the same color. A value that is not a color (a var(), a gradient, `currentcolor`) is undefined.

/** How the plugin writes a color: as authored (untouched), as `oklch(L C H)` or as hex. */
export type ColorFormat = 'as-authored' | 'oklch' | 'hex';

function read(value: string): Color | undefined {
  if (value.trim() === '') return undefined;
  try {
    return new Color(value.trim());
  } catch {
    return undefined;
  }
}

/** A color sRGB cannot show is brought into sRGB by CSS gamut mapping, the way a browser draws it. */
const inSrgb = (color: Color): Color => color.clone().toGamut({ space: 'srgb', method: 'css' }).to('srgb');

const byte = (unit: number | null): number => (unit === null || Number.isNaN(unit) ? 0 : Math.max(0, Math.min(255, Math.round(unit * 255))));

/** The color as sRGB bytes with alpha, or undefined when the value is not a color. */
function bytesOf(value: string): number[] | undefined {
  const color = read(value);
  if (!color) return undefined;
  const srgb = inSrgb(color);
  return [...srgb.coords.map(byte), byte(srgb.alpha)];
}

/** Whether two CSS values are the same color (`#E00`, `#ee0000` and the same OKLCH are), or undefined when either is not a color. */
export function sameColor(a: string, b: string): boolean | undefined {
  const left = bytesOf(a);
  const right = bytesOf(b);
  if (!left || !right) return undefined;
  return left.every((channel, index) => channel === right[index]);
}

const trim = (n: number, places: number): string => String(Number(n.toFixed(places)));

/** The value in the format, or undefined when it is not a color. `as-authored` returns the value unchanged. */
export function convertColor(value: string, format: ColorFormat): string | undefined {
  if (format === 'as-authored') return value;
  const color = read(value);
  if (!color) return undefined;
  if (format === 'hex') {
    const srgb = inSrgb(color);
    const hex = (channel: number | null) => byte(channel).toString(16).padStart(2, '0');
    const alpha = byte(srgb.alpha);
    return `#${srgb.coords.map(hex).join('')}${alpha === 255 ? '' : hex(srgb.alpha)}`;
  }
  const [lightness, chroma, hue] = color.to('oklch').coords;
  const alpha = Number.isNaN(color.alpha) ? 1 : color.alpha;
  const channels = `${trim(lightness ?? 0, 4)} ${trim(chroma ?? 0, 4)} ${trim(Number.isNaN(hue ?? NaN) ? 0 : hue!, 2)}`;
  return `oklch(${channels}${alpha < 1 ? ` / ${trim(alpha, 3)}` : ''})`;
}
