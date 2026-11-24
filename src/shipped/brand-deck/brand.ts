import { Cannot } from './request.js';
import { brandedName } from '../shared/slug.js';

// What the deck reads from brand.json (the `brand` of the request). It trusts as little of it as the Python deck did: the
// format and the version are checked, the lists are lists, and an item that is not an object is not an item.

export type Obj = Record<string, unknown>;

export const isObject = (value: unknown): value is Obj => typeof value === 'object' && value !== null && !Array.isArray(value);
/** A real number: not a boolean, not a string */
export const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
/** Python's truthiness for what a sidecar holds: a non-empty list, object or text, a non-zero number */
export const has = (value: unknown): boolean =>
  Array.isArray(value) ? value.length > 0 : isObject(value) ? Object.keys(value).length > 0 : typeof value === 'number' ? value !== 0 : Boolean(value);

export const FORMAT = 'blazon-brand';
export const VERSION = 2;
export const REM_PX = 16;

export interface Token {
  path: string;
  type?: string;
  value?: unknown;
  resolvedValue?: unknown;
  aliasOf?: unknown;
  description?: string;
  blazon?: Obj;
}

export interface Asset {
  id: string;
  name: string;
  category: string;
  file: string;
  format: string;
  width?: number | null;
  height?: number | null;
  meta?: Obj;
}

export interface Directive {
  name?: string;
  args?: string[];
}

export interface Page {
  title: string;
  order: number;
  meta?: Obj;
  sections: string[];
  markdown?: string;
  directives: Directive[];
}

export interface Category {
  category: string;
  label?: string;
  notSpecified?: string[];
  source?: unknown;
  local?: string | null;
  /** Explorations, not the identity: the deck leaves the category out */
  experimental?: boolean;
  /** Kept for comparison, or supplied by someone else: the deck leaves the category out */
  reference?: boolean;
}

export interface Group {
  path: string;
  description?: string | null;
}

export interface Brand {
  brand: { title: string; description?: string };
  theme: { roles: Obj; fonts: unknown[] };
  logo: { onLight?: string; onDark?: string };
  tokens: Token[];
  groups: Group[];
  pages: Page[];
  assets: Asset[];
  categories: Category[];
}

/** Python's repr of a value in the message that names a wrong format: 'x' for text, None for nothing */
const shown = (value: unknown): string => (typeof value === 'string' ? `'${value}'` : value === undefined || value === null ? 'None' : JSON.stringify(value));

const objects = (value: unknown): Obj[] => (Array.isArray(value) ? value.filter(isObject) : []);

/** The brand when the request holds a blazon brand of a version this deck reads; Cannot otherwise. `source` only names it in the message. */
export function readBrand(raw: unknown, source = 'the brand in the request'): Brand {
  if (!isObject(raw) || raw.format !== FORMAT) throw new Cannot(`${source} is not a blazon brand: its format is ${shown(isObject(raw) ? raw.format : undefined)}, not '${FORMAT}'`);
  if (raw.version !== VERSION) throw new Cannot(`${source} is version ${shown(raw.version)}; this reader understands version ${VERSION}`);
  const brand = isObject(raw.brand) ? raw.brand : {};
  const theme = isObject(raw.theme) ? raw.theme : {};
  return {
    brand: {
      title: typeof brand.title === 'string' ? brand.title : '',
      ...(typeof brand.description === 'string' && brand.description !== '' && { description: brand.description }),
    },
    theme: { roles: isObject(theme.roles) ? theme.roles : {}, fonts: Array.isArray(theme.fonts) ? theme.fonts : [] },
    logo: isObject(raw.logo) ? (raw.logo as Brand['logo']) : {},
    tokens: objects(raw.tokens).filter((item) => typeof item.path === 'string') as unknown as Token[],
    groups: objects(raw.groups).filter((item) => typeof item.path === 'string') as unknown as Group[],
    pages: objects(raw.pages).map((page) => ({
      ...page,
      title: typeof page.title === 'string' ? page.title : '',
      order: isNumber(page.order) ? page.order : 0,
      sections: Array.isArray(page.sections) ? page.sections.filter((id): id is string => typeof id === 'string') : [],
      directives: objects(page.directives) as Directive[],
    })) as unknown as Page[],
    assets: objects(raw.assets).filter((item) => typeof item.id === 'string' && typeof item.file === 'string') as unknown as Asset[],
    categories: objects(raw.categories).filter((item) => typeof item.category === 'string') as unknown as Category[],
  };
}

/** A dimension {"value": 20, "unit": "px"} in pixels; a rem is 16px */
export function dimensionPx(dimension: unknown): number | undefined {
  if (!isObject(dimension) || !isNumber(dimension.value)) return undefined;
  return dimension.value * (dimension.unit === 'rem' ? REM_PX : 1);
}

/** A measure in the artwork's own pixels: a dimension, or {"units": n} of the asset's unit. undefined if unknown. */
export function measurePx(measure: unknown, meta: Obj): number | undefined {
  if (!isObject(measure)) return undefined;
  if ('units' in measure) {
    const unit = dimensionPx(meta.unit);
    return isNumber(measure.units) && unit !== undefined ? measure.units * unit : undefined;
  }
  return dimensionPx(measure);
}

/** The deck's file name: `<brand>-brand-deck.pdf`, or `brand-deck.pdf` when the brand has no title of its own */
export const deckFileName = (brand: Pick<Brand, 'brand'>): string => `${brandedName(brand.brand.title, 'brand-deck')}.pdf`;
