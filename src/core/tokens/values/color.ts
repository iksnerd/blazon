import Color from 'colorjs.io';
import { fail, isObject } from './shared.js';

const KEYWORDS = /^(transparent|currentcolor|inherit|initial|unset)$/i;
/** The color functions a value must parse as; any other function (var(), color-mix(), a gradient) is for the browser to read. */
const COLOR_FUNCTION = /^(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/i;
const OTHER_FUNCTION = /^[a-z-]+\(/i;

function isCssColor(text: string): boolean {
  if (KEYWORDS.test(text)) return true;
  if (OTHER_FUNCTION.test(text) && !COLOR_FUNCTION.test(text)) return true;
  try {
    new Color(text);
    return true;
  } catch {
    return false;
  }
}

/** The lightness of an oklch() or oklab() written in full: `oklch(60 0.2 250)` is white, as CSS clamps a number to 0-1, and 60% was meant. */
const OK_LIGHTNESS = /^ok(?:lch|lab)\(\s*([+-]?(?:\d+\.?\d*|\.\d+))(%?)[\s,)/]/i;

function checkLightness(text: string): void {
  const match = OK_LIGHTNESS.exec(text);
  if (!match) return;
  const amount = Number(match[1]);
  const percent = match[2] === '%';
  if (percent ? amount < 0 || amount > 100 : amount < 0 || amount > 1) {
    fail(
      `The lightness of ${text} is ${match[1]}${match[2]}: write a number from 0 to 1 or a percentage from 0% to 100%${percent ? '' : ` (${round(amount / 100)} or ${match[1]}%)`}`,
    );
  }
}

const round = (n: number): number => Number(n.toFixed(3));

export function color(value: unknown): string {
  if (typeof value === 'string' && value.trim()) {
    const text = value.trim();
    if (!isCssColor(text)) fail(`"${text}" is not a color: write hex (#2563eb), rgb(), hsl(), oklch() or a CSS color name`);
    checkLightness(text);
    return text;
  }
  if (!isObject(value)) fail(`Color must be a string or a DTCG color object, got ${JSON.stringify(value)}`);
  if (typeof value.hex === 'string' && (value.alpha === undefined || value.alpha === 1)) return value.hex;

  const space = value.colorSpace;
  const components = value.components;
  if (typeof space !== 'string' || !Array.isArray(components) || components.length !== 3) {
    fail(`Color object needs "colorSpace" and three "components"`);
  }
  const alpha = typeof value.alpha === 'number' && value.alpha !== 1 ? ` / ${value.alpha}` : '';
  const c = components.map((n) => (n === 'none' ? 'none' : String(n)));

  switch (space) {
    case 'srgb':
      return `rgb(${components.map((n) => (n === 'none' ? 'none' : String(Math.round(Number(n) * 255)))).join(' ')}${alpha})`;
    case 'hsl':
    case 'hwb':
      return `${space}(${c[0]} ${c[1]}% ${c[2]}%${alpha})`;
    case 'lab':
    case 'lch':
    case 'oklab':
    case 'oklch':
      return `${space}(${c.join(' ')}${alpha})`;
    default:
      return `color(${space} ${c.join(' ')}${alpha})`;
  }
}
