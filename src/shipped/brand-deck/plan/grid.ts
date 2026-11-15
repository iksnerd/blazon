import { type Brand, type Directive, isNumber, type Page } from '../brand.js';
import { assetTitle, backgroundOf, membersOf } from './assets.js';
import { GRID_CAPTION, GRID_COLS, GRID_GAP, GRID_MAX, GRID_MIN_AREA, GRID_ROW_GAP, MARGIN, PAGE, PANEL_BOTTOM, PANEL_TOP } from './constants.js';
import { balanced } from './paging.js';
import { type Figure, type GridSlide } from './types.js';

// ---------------------------------------------------------------- a grid of figures
// A `blazon:assets` directive shows its assets as figures, several to a page of the book, so the deck shows several to a slide.
// The slide is titled by the heading the directive sits under, which brand.json does not record: it is read from the page's Markdown.

/**
 * The heading each of the page's directives sits under, in the order of page.directives: the nearest heading above it, or the
 * page's title when there is none. The Markdown is read as blazon reads it for the directives (a fence or a code span places none);
 * if what is found there is not the list brand.json carries, no heading is claimed and every directive falls back to the title.
 */
export function directiveHeadings(page: Page): string[] {
  let text = (page.markdown ?? '').replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, '');
  text = text.replace(/`[^`\n]*`/g, (span) => span.replace('<!--', '&lt;!--'));
  let heading = page.title;
  const found: string[] = [];
  const names: [string, string[]][] = [];
  for (const match of text.matchAll(/^#{1,6}[ \t]+(.+?)[ \t]*#*[ \t]*$|<!--\s*blazon:([\w-]+)(?:\s+([^>]*?))?\s*-->/gm)) {
    if (match[2] === undefined) {
      const plain = match[1]!
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/`/g, '')
        .replace(/\*/g, '')
        .trim();
      heading = plain || heading;
    } else {
      names.push([match[2], (match[3] ?? '').split(/\s+/).filter(Boolean)]);
      found.push(heading);
    }
  }
  const same =
    names.length === page.directives.length &&
    names.every(([name, args], index) => name === page.directives[index]!.name && args.join('\0') === (page.directives[index]!.args ?? []).join('\0'));
  return same ? found : page.directives.map(() => page.title);
}

/** The area, in points squared, of the smallest picture when pictures of these width/height ratios fill a grid of cols x rows. */
export function gridFit(ratios: number[], cols: number, rows: number): number {
  const cellW = (PAGE.width - 2 * MARGIN - GRID_GAP * (cols - 1)) / cols;
  const cellH = (PANEL_TOP - PANEL_BOTTOM - GRID_ROW_GAP * (rows - 1)) / rows - GRID_CAPTION;
  return Math.min(
    ...ratios.map((ratio) => {
      const width = Math.min(cellW, cellH * ratio);
      return (width * width) / ratio;
    }),
  );
}

/** (cols, rows) of the best grid for pictures of these ratios (the most room for the smallest), and that smallest area. */
function gridLayouts(ratios: number[]): { cols: number; rows: number; area: number } {
  const count = ratios.length;
  let best: { area: number; cols: number } | undefined;
  for (let cols = 1; cols <= Math.min(count, GRID_COLS); cols++) {
    const option = { area: gridFit(ratios, cols, Math.ceil(count / cols)), cols };
    if (!best || option.area > best.area || (option.area === best.area && option.cols < best.cols)) best = option;
  }
  return { cols: best!.cols, rows: Math.ceil(count / best!.cols), area: best!.area };
}

export type Candidate = Figure & { ratio: number };

/** The slides of figures, in their order: as many on each as keep every picture at GRID_MIN_AREA, up to GRID_MAX. The first is titled `title` and the ones after it "(continued)". */
export function gridSlides(title: string, all: Candidate[]): GridSlide[] {
  const roomy = (chunk: Candidate[]): boolean => chunk.length === 1 || gridLayouts(chunk.map((figure) => figure.ratio)).area >= GRID_MIN_AREA;
  // As many on each as keep every picture roomy, then the same figures shared evenly over that many slides when each slide of the
  // even split is roomy too, so the last slide is never a lone picture
  const greedy: Candidate[][] = [];
  for (let rest = all; rest.length > 0;) {
    let count = 1;
    for (let size = Math.min(GRID_MAX, rest.length); size > 1; size--) {
      if (roomy(rest.slice(0, size))) {
        count = size;
        break;
      }
    }
    greedy.push(rest.slice(0, count));
    rest = rest.slice(count);
  }
  const even = greedy.length > 0 ? balanced(all, Math.ceil(all.length / greedy.length)) : [];
  const chunks = even.length === greedy.length && even.every(roomy) ? even : greedy;
  const slides: GridSlide[] = [];
  for (const here of chunks) {
    const { cols, rows } = gridLayouts(here.map((figure) => figure.ratio));
    slides.push({ kind: 'grid', title: slides.length === 0 ? title : `${title} (continued)`, cols, rows, figures: here.map(({ ratio: _ratio, ...figure }) => figure) });
  }
  return slides;
}

/** The figures a `blazon:assets` directive lists, in its order. A category in `skip`, a name with no asset and an asset in `drawn` (a set of asset ids, which this adds to) give none. */
export function gridFigures(brand: Brand, directive: Directive, skip: readonly string[], drawn: Set<string>): Candidate[] {
  const key = directive.args![0]!;
  if (skip.includes(key)) return [];
  const category = brand.categories.find((candidate) => candidate.category === key);
  const figures: Candidate[] = [];
  for (const asset of membersOf(brand, directive)) {
    if (drawn.has(asset.id)) continue;
    drawn.add(asset.id);
    const { width, height } = asset;
    figures.push({
      title: assetTitle(asset),
      file: asset.file,
      format: asset.format,
      width,
      height,
      background: backgroundOf(asset),
      local: category?.local,
      ratio: isNumber(width) && isNumber(height) && width > 0 && height > 0 ? width / height : 1,
    });
  }
  return figures;
}
