import { type Asset, type Brand, type Directive } from '../brand.js';
import { humanize } from './format.js';

/** An asset's sidecar title, or its name made readable. */
export function assetTitle(asset: Asset): string {
  const title = asset.meta?.title;
  return typeof title === 'string' && title !== '' ? title : humanize(asset.name);
}

export const backgroundOf = (asset: Asset): string => (typeof asset.meta?.background === 'string' ? asset.meta.background : 'light');

/** The assets a directive lists: its category, narrowed and ordered by the names it gives */
export function membersOf(brand: Brand, directive: Directive): Asset[] {
  const [key, ...names] = directive.args ?? [];
  const members = brand.assets.filter((asset) => asset.category === key);
  if (names.length === 0) return members;
  const byName = new Map(members.map((asset) => [asset.name, asset]));
  return names.flatMap((name) => (byName.has(name) ? [byName.get(name)!] : []));
}
