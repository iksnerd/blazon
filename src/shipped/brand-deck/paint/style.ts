import { type Brand } from '../brand.js';
import { type Face } from '../fonts.js';
import { type Spec } from '../measure.js';
import { PAGE, parseHex } from '../plan/index.js';

const FALLBACK = "Helvetica, Arial, 'Liberation Sans', sans-serif";
export const MONO = "Courier, 'Courier New', 'Liberation Mono', monospace";
/** A text box is this tall above its baseline: the baseline sits at the bottom of a strut this high, whatever the font */
export const STRUT = 200;
export const PW = PAGE.width;
export const PH = PAGE.height;

export const escape = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const fmt = (value: number): string => String(Math.round(value * 100) / 100);

export type Rgba = [number, number, number, number];
export const css = ([r, g, b, a]: Rgba): string => (a < 1 ? `rgb(${r} ${g} ${b} / ${fmt(a)})` : `rgb(${r} ${g} ${b})`);

export interface Colors {
  ink: Rgba;
  muted: Rgba;
  accent: Rgba;
  border: Rgba;
  dark: Rgba;
  light: Rgba;
  onDark: Rgba;
}

export function paletteOf(brand: Brand): Colors {
  const roles = brand.theme.roles;
  const role = (name: string, fallback: string): Rgba => {
    const found = parseHex(typeof roles[name] === 'string' ? roles[name] : '');
    return found ? [found[0], found[1], found[2], 1] : (parseHex(fallback) as Rgba);
  };
  return {
    ink: role('text', '#111111'),
    muted: role('muted', '#555555'),
    accent: role('accent', '#2563EB'),
    border: role('border', '#CCCCCC'),
    dark: role('inverse', '#111111'),
    light: role('background', '#FFFFFF'),
    onDark: role('inverseText', '#FFFFFF'),
  };
}

/** The fallback faces, which the browser finds on the computer */
export const fallback = (weight: number, extra: Partial<Spec> = {}): Spec => ({ family: FALLBACK, weight, ...extra });
export const specOf = (face: Face): Spec => ({ family: `'${face.css}', ${FALLBACK}`, weight: face.weight });

/** A face the drawing code names: the body text, the bold body text, the titles, or a built-in face that stays whatever the body is set in ("!" before the name) */
export type FontName = 'Helvetica' | 'Helvetica-Bold' | 'Title' | 'Helvetica-Oblique' | '!Helvetica' | '!Helvetica-Bold' | '!Courier' | Spec;

export interface Options {
  color?: Rgba;
  align?: 'left' | 'right' | 'center';
}
