import { Cannot } from './request.js';

/** A symbol drawing: its own coordinates, and its shapes with every fill taken off, so one color can be given. */
export interface Glyph {
  minX: number;
  minY: number;
  width: number;
  height: number;
  shapes: string;
}

/** Markup that could run code or fetch something. The plugin never renders such a file, and never uploads one. */
const UNSAFE = /<\s*(script|foreignObject|image|style|iframe|a)\b|\bon[a-z]+\s*=|\b(?:xlink:)?href\s*=|@import|url\(\s*['"]?\s*(?!#)/i;

const number = (text: string | undefined): number | undefined => {
  const value = text === undefined ? NaN : Number.parseFloat(text);
  return Number.isFinite(value) && value > 0 ? value : undefined;
};

/** The symbol in an SVG file: a single-color drawing, as its viewBox (else its width and height) and its shapes. */
export function readSymbol(markup: string, label: string): Glyph {
  const open = /<svg\b([^>]*)>/i.exec(markup);
  const close = markup.lastIndexOf('</svg>');
  if (!open || close < open.index) throw new Cannot(`${label} is not an SVG file`);
  const inner = markup.slice(open.index + open[0].length, close);
  if (UNSAFE.test(inner))
    throw new Cannot(`${label} holds markup the plugin will not render (script, style, image, link or event handler): use a plain drawing of paths and shapes`);
  const attrs = open[1]!;
  const attr = (name: string) => {
    const found = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(attrs);
    return found?.[1] ?? found?.[2];
  };
  const box = attr('viewBox')
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  let minX = 0;
  let minY = 0;
  let width = number(attr('width'));
  let height = number(attr('height'));
  if (box?.length === 4 && box.every(Number.isFinite) && box[2]! > 0 && box[3]! > 0) [minX, minY, width, height] = box as [number, number, number, number];
  if (!width || !height) throw new Cannot(`${label} has no viewBox and no width and height`);
  const shapes = inner
    .replace(/\sfill\s*=\s*(?:"(?!none")[^"]*"|'(?!none')[^']*')/gi, '')
    .replace(/\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/gi, (_, double: string | undefined, single: string | undefined) => {
      const kept = (double ?? single ?? '')
        .split(';')
        .filter((rule) => rule.trim() && !/^\s*fill\s*:/i.test(rule))
        .join(';');
      return kept ? ` style="${kept}"` : '';
    })
    .trim();
  if (!shapes) throw new Cannot(`${label} draws nothing`);
  return { minX, minY, width, height, shapes };
}

/** A number written the same way on every machine: at most 4 decimals, no trailing zeros. A small one, a scale for a huge drawing, keeps 6 significant digits so it does not round to 0. */
const num = (value: number): string => String(Number(Math.abs(value) >= 1 ? value.toFixed(4) : value.toPrecision(6)));

/**
 * The symbol centered on a square canvas, its height `share` of the canvas and never wider than that share of the
 * width, in `fill`, on `ground` when there is one (no ground leaves the canvas transparent).
 */
export function tileSvg(symbol: Glyph, size: number, share: number, fill: string, ground?: string): string {
  const scale = Math.min((size * share) / symbol.height, (size * share) / symbol.width);
  const x = (size - symbol.width * scale) / 2 - symbol.minX * scale;
  const y = (size - symbol.height * scale) / 2 - symbol.minY * scale;
  const back = ground ? `<rect width="${size}" height="${size}" fill="${ground}"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${back}<g transform="translate(${num(x)} ${num(y)}) scale(${num(scale)})" fill="${fill}">${symbol.shapes}</g></svg>`;
}

/** The symbol's size in pixels when it sits in a square tile of `size` pixels at `share`. */
export function drawnSize(symbol: { width: number; height: number }, size: number, share: number): { width: number; height: number } {
  const scale = Math.min((size * share) / symbol.height, (size * share) / symbol.width);
  return { width: symbol.width * scale, height: symbol.height * scale };
}
