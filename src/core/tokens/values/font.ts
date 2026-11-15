import { fail } from './shared.js';

const FONT_WEIGHT_NAMES: Record<string, number> = {
  thin: 100,
  hairline: 100,
  'extra-light': 200,
  'ultra-light': 200,
  light: 300,
  normal: 400,
  regular: 400,
  book: 400,
  medium: 500,
  'semi-bold': 600,
  'demi-bold': 600,
  bold: 700,
  'extra-bold': 800,
  'ultra-bold': 800,
  black: 900,
  heavy: 900,
  'extra-black': 950,
  'ultra-black': 950,
};

export function fontFamily(value: unknown): string {
  const quote = (name: string): string => (/^['"]/.test(name) || !/\s/.test(name) ? name : `'${name}'`);
  if (typeof value === 'string' && value.trim()) {
    return value.includes(',') ? value : quote(value.trim());
  }
  if (Array.isArray(value) && value.every((v) => typeof v === 'string')) {
    return (value as string[]).map(quote).join(', ');
  }
  return fail(`fontFamily must be a string or an array of strings`);
}

export function fontWeight(value: unknown): number {
  if (typeof value === 'number' && value >= 1 && value <= 1000) return value;
  if (typeof value === 'string') {
    const named = FONT_WEIGHT_NAMES[value.toLowerCase()];
    if (named) return named;
    if (/^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 1000) return Number(value);
  }
  return fail(`fontWeight must be 1-1000 or a DTCG weight name, got ${JSON.stringify(value)}`);
}
