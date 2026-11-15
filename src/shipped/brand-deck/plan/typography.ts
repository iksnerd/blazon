import { type Brand, has, isNumber, isObject, REM_PX } from '../brand.js';
import {
  BODY_BOTTOM,
  FONTS_GAP,
  FONTS_JOIN,
  FONTS_LEAD,
  FONTS_NAME,
  FONTS_NOTE_ROOM,
  FONTS_PT,
  FONTS_TOP,
  FONTS_WIDTH,
  PAGE,
  PX_TO_PT,
  SAMPLE_MAX_PT,
  SAMPLE_MIN_PT,
  TYPE_ROWS_BOTTOM,
  TYPE_ROWS_TOP,
} from './constants.js';
import { humanize, number } from './format.js';
import { balanced, titled } from './paging.js';
import { type FontFamily, type FontsSlide, type TypeScaleSlide, type TypeStyle, type Wrap } from './types.js';

/** The size a type sample is drawn at: half its pixel size, so large enough to read and no larger than a slide allows. */
export function samplePt(sizePx: number | null): number {
  return Math.min(Math.max((sizePx || 16) * PX_TO_PT, SAMPLE_MIN_PT), SAMPLE_MAX_PT);
}

function sampleRowHeight(sizePx: number | null): number {
  return samplePt(sizePx) * 1.3 + 22;
}

/**
 * The styles split over as few slides as their rows' heights need, and over those slides as evenly as the heights allow: the smallest
 * height a slide may fill that still needs no more slides than filling each to the brim would. Order is kept.
 */
export function packedByHeight(styles: TypeStyle[]): TypeStyle[][] {
  const room = PAGE.height - TYPE_ROWS_TOP - TYPE_ROWS_BOTTOM;
  const heights = styles.map((style) => sampleRowHeight(style.size_px));
  const pack = (limit: number): TypeStyle[][] => {
    const chunks: TypeStyle[][] = [];
    let used = limit;
    styles.forEach((style, index) => {
      if (used + heights[index]! > limit) {
        chunks.push([]);
        used = 0;
      }
      chunks.at(-1)!.push(style);
      used += heights[index]!;
    });
    return chunks;
  };
  const slides = pack(room).length;
  let low = Math.max(0, ...heights);
  let high = room;
  for (let round = 0; round < 40; round++) {
    const middle = (low + high) / 2;
    if (pack(middle).length <= slides) high = middle;
    else low = middle;
  }
  return pack(high);
}

/** What is said under a family's name, a paragraph each, in the order the slide draws them. */
export const familyText = (family: FontFamily): string[] => [family.stack, family.description, family.web_font].filter((text): text is string => Boolean(text));

/**
 * (from this family's name to the next one's, from its name to the baseline of its last line) in points, as the slide draws it: each
 * paragraph under the name is at most two lines. Without `wrap` a letter is half the size wide, as an unmeasured width is.
 */
export function familyDrop(family: FontFamily, wrap?: Wrap): [number, number] {
  const lines = familyText(family).map((text) => Math.min(2, wrap ? wrap(text, FONTS_PT, FONTS_WIDTH).length : Math.ceil(([...text].length * FONTS_PT * 0.5) / FONTS_WIDTH)));
  const below = FONTS_NAME + lines.reduce((sum, count) => sum + count * FONTS_LEAD, 0) + FONTS_JOIN * Math.max(lines.length - 1, 0);
  return [below + FONTS_GAP, below - FONTS_LEAD];
}

/** The families over as few slides as keep each family's last line above the note under them, and that note above BODY_BOTTOM. Order is kept; a family is never split, and when the slides can share the families evenly, they do (never three and a lone one). */
export function packedFamilies(families: FontFamily[], wrap?: Wrap): FontFamily[][] {
  const floor = BODY_BOTTOM + FONTS_NOTE_ROOM;
  const fits = (chunk: FontFamily[]): boolean => {
    let top = FONTS_TOP;
    for (const [index, family] of chunk.entries()) {
      const [drop, last] = familyDrop(family, wrap);
      if (top - last < floor) return false;
      if (index < chunk.length - 1) top -= drop;
    }
    return true;
  };
  const chunks: FontFamily[][] = [];
  for (const family of families) {
    const here = chunks.at(-1);
    if (here && fits([...here, family])) here.push(family);
    else chunks.push([family]);
  }
  const even = chunks.length > 1 ? balanced(families, Math.ceil(families.length / chunks.length)) : [];
  return even.length === chunks.length && even.every(fits) ? even : chunks;
}

/** A font size in px: a px dimension, or a rem as 16px. undefined for any other unit. */
export function sizePx(dimension: unknown): number | undefined {
  if (!isObject(dimension) || !isNumber(dimension.value)) return undefined;
  if (dimension.unit === 'px') return dimension.value;
  if (dimension.unit === 'rem') return dimension.value * REM_PX;
  return undefined;
}

const firstFamily = (family: unknown): string | null => (Array.isArray(family) && family.length > 0 ? String(family[0]) : typeof family === 'string' ? family : null);

export function typographySlides(brand: Brand, wrap?: Wrap): (FontsSlide | TypeScaleSlide)[] {
  const slides: (FontsSlide | TypeScaleSlide)[] = [];
  const families: FontFamily[] = [];
  for (const token of brand.tokens) {
    if (token.type !== 'fontFamily' || has(token.aliasOf)) continue;
    const resolved = token.resolvedValue;
    const first = Array.isArray(resolved)
      ? String(resolved[0])
      : String(resolved)
          .split(',')[0]!
          .replace(/^["'\s]+|["'\s]+$/g, '');
    const family: FontFamily = { name: first, path: token.path, stack: String(token.value), description: token.description ?? null };
    const webFont = token.blazon?.webFont;
    if (webFont !== undefined && webFont !== null) family.web_font = typeof webFont === 'string' ? webFont : 'Not loadable on the web';
    families.push(family);
  }
  for (const [title, chunk] of titled('Typefaces', packedFamilies(families, wrap))) slides.push({ kind: 'fonts', title, families: chunk });

  const styles: TypeStyle[] = [];
  for (const token of brand.tokens) {
    if (token.type !== 'typography' || has(token.aliasOf) || !isObject(token.resolvedValue)) continue;
    const parts = token.resolvedValue;
    const spacing = parts.letterSpacing;
    const px = sizePx(parts.fontSize);
    const segments = token.path.split('.').slice(1);
    const names = segments.length > 0 ? segments : token.path.split('.');
    styles.push({
      name: humanize(names.join('-')),
      path: token.path,
      family: firstFamily(parts.fontFamily),
      size_px: px !== undefined ? number(px) : null,
      weight: parts.fontWeight ?? null,
      line_height: parts.lineHeight ?? null,
      letter_spacing: isObject(spacing) && isNumber(spacing.value) ? `${number(spacing.value)}${String(spacing.unit)}` : null,
    });
  }
  for (const [title, chunk] of titled('Type scale', packedByHeight(styles))) slides.push({ kind: 'type-scale', title, styles: chunk });
  return slides;
}
