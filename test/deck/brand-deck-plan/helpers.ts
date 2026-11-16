import { readBrand } from '../../../src/shipped/brand-deck/brand.js';
import { plan, type Slide, type Wrap } from '../../../src/shipped/brand-deck/plan/index.js';

// The slide plan of src/shipped/brand-deck/plan/: a pure function from a brand.json to a list of slides. These are the cases of
// test_brand_deck_plan.py, which tested the Python deck before it was ported, one for one. The brands here are written by hand,
// so the expected values come from the fixtures and not from the code under test.

export type J = Record<string, any>;

export const color = (p: string, value: string, print?: J, alias?: string, description?: string): J => ({
  path: p,
  type: 'color',
  value,
  resolvedValue: value,
  rawValue: value,
  ...(alias && { aliasOf: alias }),
  ...(description && { description }),
  ...(print && { blazon: { print } }),
});

const rawBrand = (tokens: J[] = [], assets: J[] = [], groups: J[] = [], title = 'Acme Brand Book', description?: string, logo?: J): J => ({
  format: 'blazon-brand',
  version: 2,
  brand: { title, ...(description && { description }) },
  theme: { roles: { text: '#101010', accent: '#635DFF' }, tokens: {}, fonts: [] },
  logo: logo ?? {},
  tokens,
  groups,
  modifiers: [],
  contexts: [],
  pages: [],
  assets,
  categories: [],
  iconSets: [],
  findings: [],
});

export interface Options {
  wrap?: Wrap;
  skip?: string[];
}
/** plan() of a raw brand, read as the plugin reads it */
export const planOf = (raw: J, favicons: any = null, { wrap, skip }: Options = {}): Slide[] => plan(readBrand(raw), favicons, wrap, skip);
export const brand = (tokens: J[] = [], opts: { assets?: J[]; groups?: J[]; description?: string; logo?: J } = {}) =>
  rawBrand(tokens, opts.assets, opts.groups, 'Acme Brand Book', opts.description, opts.logo);

export const logoAsset = (name: string, meta?: J, fmt = 'png', width = 2000, height = 500): J => ({
  id: `logos/${name}`,
  name,
  category: 'logos',
  file: `brand-assets/logos/${name}.${fmt}`,
  format: fmt,
  mediaType: 'image/png',
  bytes: 1,
  width,
  height,
  ...(meta && { meta }),
});

export const kinds = (slides: Slide[]) => slides.map((s) => s.kind);
export const ofKind = <K extends Slide['kind']>(slides: Slide[], kind: K) => slides.filter((s) => s.kind === kind) as Extract<Slide, { kind: K }>[];

export const page = (slug: string, title: string, order: number, sections: string[] = [], directives: J[] = [], description?: string): J => ({
  slug,
  sourceFile: `${slug}.md`,
  title,
  order,
  meta: { title, ...(description && { description }) },
  sections,
  markdown: '',
  directives,
});
export const section = (category: string, ...names: string[]): J => ({ name: 'section', args: [category, ...names] });
export const assetOf = (category: string, name: string, meta?: J, fmt = 'png'): J => ({
  id: `${category}/${name}`,
  name,
  category,
  file: `brand-assets/${category}/${name}.${fmt}`,
  format: fmt,
  mediaType: 'image/png',
  bytes: 1,
  width: 800,
  height: 400,
  ...(meta && { meta }),
});
export const book = (pages: J[] = [], assets: J[] = [], categories: [string, J][] = [], tokens: J[] = []): J => ({
  ...rawBrand(tokens, assets),
  pages,
  categories: categories.map(([category, extra]) => ({ category, label: category.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()), ...extra })),
});
export const titlesOf = (slides: Slide[], kind: Slide['kind']) => slides.filter((s) => s.kind === kind).map((s) => s.title);

export const assetsOf = (category: string, ...names: string[]): J => ({ name: 'assets', args: [category, ...names] });
export const shaped = (category: string, name: string, width: number | null, height: number | null, meta?: J): J => ({ ...assetOf(category, name, meta), width, height });
export const gridPage = (markdown: string, directives: J[], title = 'Social'): J => ({ ...page('social', title, 1, [], directives), markdown });
export const grids = (slides: Slide[]) => ofKind(slides, 'grid');

/** Lines the way a font half as wide as it is high would break them: enough to test the fitting without a browser. */
export const fakeWrap: Wrap = (text, size, width) => {
  const limit = Math.max(1, Math.floor(width / (size * 0.5)));
  const lines: string[] = [];
  let line = '';
  for (let word of text.split(/\s+/).filter(Boolean)) {
    while (word.length > limit) {
      if (line) lines.push(line);
      lines.push(word.slice(0, limit));
      line = '';
      word = word.slice(limit);
    }
    if (line && line.length + 1 + word.length > limit) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines.length > 0 ? lines : [''];
};
export const words = (...texts: (string | null)[]) => texts.flatMap((text) => (text ?? '').split(/\s+/).filter(Boolean)).sort();
