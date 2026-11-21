import { pickRepresentation } from '../../../core/assets/representations.js';
import { type Asset, type Brand, type Directive } from '../brand.js';
import { humanize } from './format.js';

/** An asset's sidecar title, or its name made readable. */
export function assetTitle(asset: Asset): string {
  const title = asset.meta?.title;
  return typeof title === 'string' && title !== '' ? title : humanize(asset.name);
}

export const backgroundOf = (asset: Asset): string => (typeof asset.meta?.background === 'string' ? asset.meta.background : 'light');

/** The formats the deck can embed, best first: the browser that draws it takes each of them, and a vector stays sharp at any size. */
export const DECK_FORMATS: readonly string[] = ['svg', 'png', 'webp', 'jpg', 'jpeg', 'gif', 'avif'];

/** The file the deck draws for an id: the best of the formats it embeds, else the first in the default order (the deck then reports it when it draws). */
export const representationOf = (assets: readonly Asset[], id: string): Asset | undefined =>
  pickRepresentation(assets, id, { formats: DECK_FORMATS }) ?? pickRepresentation(assets, id);

/** One asset for each id of `assets`, in the order its ids first appear, each as the file the deck draws. */
export function onePerId(assets: readonly Asset[]): Asset[] {
  return [...new Set(assets.map((asset) => asset.id))].map((id) => representationOf(assets, id)!);
}

/** The assets a directive lists: its category, narrowed and ordered by the names it gives, one for each id */
export function membersOf(brand: Brand, directive: Directive): Asset[] {
  const [key, ...names] = directive.args ?? [];
  const members = onePerId(brand.assets.filter((asset) => asset.category === key));
  if (names.length === 0) return members;
  const byName = new Map(members.map((asset) => [asset.name, asset]));
  return names.flatMap((name) => (byName.has(name) ? [byName.get(name)!] : []));
}
