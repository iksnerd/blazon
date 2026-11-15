import { type Brand, type Directive, has, type Page } from '../brand.js';
import { assetTitle, backgroundOf, membersOf } from './assets.js';
import { humanize, listOf, sourceLine, textOrNull } from './format.js';
import { type Candidate, directiveHeadings, gridFigures, gridSlides } from './grid.js';
import { fitted } from './guide-fit.js';
import { type GuidelineSlide, type OpenList, type Slide, type Wrap } from './types.js';

/**
 * The slides of one `blazon:section` directive: each listed asset with what its sidecar says. A category in `skip` draws nothing.
 * With `wrap` (the deck's way of breaking text into lines) each slide is fitted: it has its layout, and an asset whose text does
 * not fit one slide is followed by slides that continue it.
 */
function sectionDirectiveSlides(brand: Brand, directive: Directive, wrap: Wrap | undefined, skip: readonly string[]): GuidelineSlide[] {
  const key = directive.args![0]!;
  if (skip.includes(key)) return [];
  const category = brand.categories.find((candidate) => candidate.category === key);
  const slides: GuidelineSlide[] = [];
  for (const asset of membersOf(brand, directive)) {
    const meta = asset.meta ?? {};
    const slide: GuidelineSlide = {
      kind: 'guideline',
      title: assetTitle(asset),
      file: asset.file,
      format: asset.format,
      width: asset.width,
      height: asset.height,
      background: backgroundOf(asset),
      description: textOrNull(meta.description),
      traits: listOf(meta.traits),
      do: listOf(meta.do),
      dont: listOf(meta.dont),
      source: sourceLine(meta.source),
      local: category?.local,
    };
    slides.push(...(wrap ? fitted(slide, wrap) : [slide]));
  }
  return slides;
}

/**
 * The asset slides of a page, in the order of its directives: a slide for each asset of a `blazon:section`, and grid slides for
 * the assets of a `blazon:assets`, which share a slide with the directives next to them under the same heading. An asset a section
 * of the page draws is not drawn again in a grid of it (its slide says more), nor one an earlier grid of the page drew.
 */
export function pageSlides(brand: Brand, page: Page, wrap: Wrap | undefined, skip: readonly string[]): Slide[] {
  const drawn = new Set(
    page.directives
      .filter((directive) => directive.name === 'section' && has(directive.args) && !skip.includes(directive.args![0]!))
      .flatMap((directive) => membersOf(brand, directive).map((asset) => asset.id)),
  );
  const headings = page.directives.some((directive) => directive.name === 'assets') ? directiveHeadings(page) : [];
  const slides: Slide[] = [];
  let run: Candidate[] = [];
  let runTitle: string | undefined;
  const flush = () => {
    if (run.length > 0) slides.push(...gridSlides(runTitle!, run));
    run = [];
  };
  page.directives.forEach((directive, index) => {
    if (!has(directive.args) || (directive.name !== 'section' && directive.name !== 'assets')) return;
    if (directive.name === 'section') {
      flush();
      slides.push(...sectionDirectiveSlides(brand, directive, wrap, skip));
      return;
    }
    if (headings[index] !== runTitle) flush();
    runTitle = headings[index];
    run.push(...gridFigures(brand, directive, skip, drawn));
  });
  flush();
  return slides;
}

/**
 * What the guidelines leave open in each category the page's `blazon:section` directives name, once for each, in the order
 * the page first names them. It is a fact about the category, whatever assets the directive lists. A category in `skip` leaves
 * nothing open here: it is not in the deck.
 */
export function openLists(brand: Brand, page: Page, skip: readonly string[]): OpenList[] {
  const lists: OpenList[] = [];
  const seen = new Set<string>();
  for (const directive of page.directives) {
    const key = directive.name === 'section' && has(directive.args) ? directive.args![0] : undefined;
    const category = brand.categories.find((candidate) => candidate.category === key);
    if (key !== undefined && category && has(category.notSpecified) && !seen.has(key) && !skip.includes(key)) {
      seen.add(key);
      lists.push({ title: category.label || humanize(key), items: category.notSpecified!, source: sourceLine(category.source) });
    }
  }
  return lists;
}
