import { type Brand } from '../brand.js';
import { type Favicons } from '../favicons.js';
import { gradientSlides, paletteSlides } from './colors.js';
import { faviconSlides } from './favicons.js';
import { textOrNull } from './format.js';
import { logoSlides } from './logo.js';
import { openLists, pageSlides } from './pages.js';
import { type CoverSlide, type Slide, type Wrap } from './types.js';
import { typographySlides } from './typography.js';

function coverSlide(brand: Brand): CoverSlide {
  const logo = brand.logo;
  const chosen = logo.onLight ? { file: logo.onLight, background: 'light' as const } : logo.onDark ? { file: logo.onDark, background: 'dark' as const } : null;
  return { kind: 'cover', title: brand.brand.title, subtitle: brand.brand.description ?? null, logo: chosen };
}

/**
 * The slides of the deck, as data. Page numbers in the contents are 1-based. `wrap` is the deck's way of breaking text into
 * lines: with it an asset's text is fitted to its slide, and a long one continues on further slides, so the contents can number
 * them. `skip` names asset categories to leave out; an experimental or reference category (brand.json `categories[].experimental` and
 * `categories[].reference`) is always left out, because the deck presents the identity and neither an exploration nor material kept for comparison is it.
 *
 * The deck follows the brand book. Each page is a part: a divider, the token slides of the sections the page is for (the
 * first page of a section takes them), then the assets its `blazon:section` directives list (a slide each) and its `blazon:assets`
 * directives (grids). Token slides no page takes come last, in parts of their own, so a brand with no pages is a deck of Logo,
 * Colors and Typography.
 */
export function plan(brand: Brand, favicons: Favicons | null = null, wrap?: Wrap, skipped: readonly string[] = []): Slide[] {
  const skip = [...skipped, ...brand.categories.filter((category) => category.experimental === true || category.reference === true).map((category) => category.category)];
  const tokenSlides: Record<string, [string, Slide[]]> = {
    logo: ['Logo', logoSlides(brand, skip)],
    color: ['Colors', [...paletteSlides(brand), ...gradientSlides(brand)]],
    typography: ['Typography', typographySlides(brand, wrap)],
  };
  const parts: [string, Slide[]][] = [];
  const taken = new Set<string>();
  for (const page of [...brand.pages].sort((a, b) => a.order - b.order)) {
    const slides: Slide[] = [{ kind: 'page', title: page.title, description: textOrNull(page.meta?.description), open: openLists(brand, page, skip) }];
    for (const sectionId of page.sections) {
      if (Object.hasOwn(tokenSlides, sectionId) && !taken.has(sectionId)) {
        taken.add(sectionId);
        slides.push(...tokenSlides[sectionId]![1]);
      }
    }
    parts.push([page.title, [...slides, ...pageSlides(brand, page, wrap, skip)]]);
  }
  for (const [sectionId, [title, slides]] of Object.entries(tokenSlides)) if (!taken.has(sectionId) && slides.length > 0) parts.push([title, slides]);
  const favicon = favicons ? faviconSlides(favicons) : [];
  if (favicon.length > 0) parts.push(['Favicons', favicon]);

  const items: { title: string; page: number }[] = [];
  let at = 3; // after the cover and the contents
  for (const [title, slides] of parts) {
    items.push({ title, page: at });
    at += slides.length;
  }
  return [coverSlide(brand), { kind: 'contents', title: 'Contents', items }, ...parts.flatMap(([, slides]) => slides)];
}
