import type { AssetMeta } from '../../types/index.js';
import { artworkSize } from '../../core/assets/measure.js';
import { isObject, requireBrand } from '../shared/plugin.js';
import { readBaseAsset, readMeta, text } from '../shared/brand.js';

// What the plugin reads from brand.json (the `brand` of the request): the assets, with the sidecar rules of the logos. It trusts none of
// it: a field of the wrong shape is a field that is not there.

export interface KitAsset {
  id: string;
  /** The asset's name: the file name without its extension */
  name: string;
  category: string;
  /** Where the file is, relative to the built site */
  file: string;
  format: string;
  /** The artwork's own size in pixels; undefined when the file does not say */
  size?: { width: number; height: number };
  meta: AssetMeta;
}

export interface BrandRead {
  assets: Map<string, KitAsset>;
}

export function readBrand(brand: unknown): BrandRead {
  const root = requireBrand(brand);
  const assets = new Map<string, KitAsset>();
  for (const raw of Array.isArray(root.assets) ? root.assets : []) {
    if (!isObject(raw)) continue;
    const base = readBaseAsset(raw);
    if (!base) continue;
    const { id, file, format, category } = base;
    const size = artworkSize({ width: raw.width as number | undefined, height: raw.height as number | undefined, viewBox: text(raw.viewBox) });
    assets.set(id, {
      id,
      name: text(raw.name) ?? id.split('/').pop()!,
      category,
      file,
      format,
      ...(size && { size }),
      meta: readMeta(raw),
    });
  }
  return { assets };
}
