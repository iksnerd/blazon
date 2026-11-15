import { type Brand, has, isObject, type Token } from '../brand.js';
import { COLORS_HEADING, COLORS_LINE, COLORS_MIN_SWATCH, COLORS_ROOM, GRADIENTS_PER_SLIDE, GROUPS_PER_SLIDE, SWATCHES_PER_SLIDE } from './constants.js';
import { humanize, lastName, number, parentOf, parseHex } from './format.js';
import { paged, titled } from './paging.js';
import { type ColorGroup, type ColorsSlide, type Gradient, type GradientsSlide, type GradientStop, type Swatch } from './types.js';

function groupNote(brand: Brand, path: string): string | null {
  for (const group of brand.groups) if (group.path === path) return group.description ?? null;
  return null;
}

/**
 * A title for each group path: its last name made readable, and where two groups end in the same name, the name before it
 * too ("Hue yellow", "Product yellow"), and the whole path for a group that is still told apart by nothing else.
 */
function groupTitles(parents: string[]): Map<string, string> {
  const titles = new Map<string, string>();
  for (const depth of [1, 2]) {
    const names = new Map(parents.map((parent) => [parent, humanize(parent.split('.').slice(-depth).join(' '))]));
    for (const [parent, name] of names) {
      if (!titles.has(parent) && [...names.values()].filter((other) => other === name).length === 1) titles.set(parent, name);
    }
  }
  return new Map(parents.map((parent) => [parent, titles.get(parent) ?? humanize(parent.split('.').join(' '))]));
}

function swatchOf(token: Token): Swatch {
  const rgb = parseHex(token.value);
  const print = isObject(token.blazon?.print) ? token.blazon.print : {};
  const value = String(token.value);
  return {
    name: lastName(token.path),
    path: token.path,
    hex: rgb ? value.toUpperCase() : value,
    rgb: rgb ? [rgb[0], rgb[1], rgb[2]] : null,
    cmyk: Array.isArray(print.cmyk) ? (print.cmyk as number[]) : null,
    pms: typeof print.pms === 'string' ? print.pms : null,
    ral: typeof print.ral === 'string' ? print.ral : null,
    description: token.description ?? null,
  };
}

/** The lines of values a swatch has under its name and hex: RGB, CMYK, Pantone and RAL, each when it states one. */
export function printLines(swatch: Swatch): number {
  return [swatch.rgb, swatch.cmyk, swatch.pms, swatch.ral].filter(has).length;
}

/** The room a group's row needs on a slide, in points, at the smallest the deck draws it: heading, a low swatch, name and hex, each line of values, and a gap. */
function groupHeight(group: ColorGroup): number {
  return COLORS_HEADING + COLORS_MIN_SWATCH + 31 + COLORS_LINE * Math.max(...group.swatches.map(printLines)) + 10;
}

function colorsSlideOf(title: string, groups: ColorGroup[]): ColorsSlide {
  return { kind: 'colors', title, note: groups.length === 1 ? groups[0]!.note : null, groups, swatches: groups.flatMap((group) => group.swatches) };
}

/**
 * The palette in groups, by the parent of each color's path. A group of up to eight is one row that is never split, and up to
 * three groups share a slide in order, as many as the room allows: a group with CMYK, Pantone and RAL values needs more than one
 * with a hex and RGB. A bigger group has slides of its own, eight swatches on each.
 */
export function paletteSlides(brand: Brand): ColorsSlide[] {
  const parents = new Map<string, Token[]>();
  for (const token of brand.tokens) {
    if (token.type === 'color' && !has(token.aliasOf)) {
      const parent = parentOf(token.path);
      parents.set(parent, [...(parents.get(parent) ?? []), token]);
    }
  }
  const titles = groupTitles([...parents.keys()]);
  const groups: ColorGroup[] = [...parents].map(([parent, tokens]) => ({ title: titles.get(parent)!, note: groupNote(brand, parent), swatches: tokens.map(swatchOf) }));

  const slides: ColorsSlide[] = [];
  let shared: ColorGroup[] = [];
  const flush = () => {
    if (shared.length > 0) {
      const title = shared.length === 1 ? shared[0]!.title : shared.length === 2 ? shared.map((group) => group.title).join(' and ') : 'Colors';
      slides.push(colorsSlideOf(title, shared));
    }
    shared = [];
  };

  for (const group of groups) {
    const size = group.swatches.length;
    if (size > SWATCHES_PER_SLIDE) {
      flush();
      const chunks: Swatch[][] = [];
      for (let i = 0; i < size; i += SWATCHES_PER_SLIDE) chunks.push(group.swatches.slice(i, i + SWATCHES_PER_SLIDE));
      for (const [title, chunk] of titled(group.title, chunks)) slides.push(colorsSlideOf(title, [{ ...group, swatches: chunk }]));
      continue;
    }
    if (shared.length > 0 && (shared.length === GROUPS_PER_SLIDE || shared.reduce((sum, member) => sum + groupHeight(member), 0) + groupHeight(group) > COLORS_ROOM)) flush();
    shared.push(group);
  }
  flush();
  return slides;
}

function gradientAngle(value: unknown): number {
  const text = String(value);
  const degrees = /linear-gradient\(\s*(-?[\d.]+)deg/.exec(text);
  if (degrees) return number(Number(degrees[1]));
  const corner = /linear-gradient\(\s*to (top|right|bottom|left)\b/.exec(text);
  return corner ? { top: 0, right: 90, bottom: 180, left: 270 }[corner[1] as 'top'] : 180;
}

export function gradientSlides(brand: Brand): GradientsSlide[] {
  const gradients: Gradient[] = brand.tokens
    .filter((token) => token.type === 'gradient' && !has(token.aliasOf) && Array.isArray(token.resolvedValue))
    .map((token) => ({ name: lastName(token.path), path: token.path, angle: gradientAngle(token.value), stops: token.resolvedValue as GradientStop[] }));
  return paged('Gradients', GRADIENTS_PER_SLIDE, gradients).map(([title, chunk]) => ({ kind: 'gradients', title, gradients: chunk }));
}
