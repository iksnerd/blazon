import { type Brand } from '../brand.js';
import { unique } from './format.js';

/** The asset categories a deck can leave out: the ones the brand has assets or a description for. */
export function skippable(brand: Brand): string[] {
  return unique([...brand.assets.map((asset) => asset.category), ...brand.categories.map((category) => category.category)]).sort();
}

/** The names in `skip` that are no asset category of this brand, in the order given, once each. */
export function unknownSkips(brand: Brand, skip: readonly string[]): string[] {
  const known = new Set(skippable(brand));
  return unique(skip.filter((name) => !known.has(name)));
}
