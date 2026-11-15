import { isObject, requireBrand } from '../shared/plugin.js';
import { readBaseAsset, text } from '../shared/brand.js';

// What the plugin reads from brand.json (the `brand` of the request): the logos, and the brand's accent color for the figure. It trusts none
// of it: a field of the wrong shape is a field that is not there.

export interface LogoAsset {
  id: string;
  /** Where the file is, relative to the built site */
  file: string;
  format: string;
}

export interface BrandRead {
  /** Every asset by id, in the order the brand lists them */
  assets: Map<string, LogoAsset & { category: string }>;
  /** The theme's accent, when the brand states one */
  accent?: string;
}

/** The formats this plugin measures. */
export const MEASURED = ['svg', 'png', 'webp'];

export function readBrand(brand: unknown): BrandRead {
  const root = requireBrand(brand);
  const assets: BrandRead['assets'] = new Map();
  for (const raw of Array.isArray(root.assets) ? root.assets : []) {
    const asset = readBaseAsset(raw);
    if (asset) assets.set(asset.id, asset);
  }
  const roles = isObject(root.theme) && isObject(root.theme.roles) ? root.theme.roles : {};
  const accent = text(roles.accent);
  return { assets, ...(accent && { accent }) };
}

/** The ids of the logos to measure when the options name none: the `logos` category, in a format this plugin reads. */
export const defaultLogos = (read: BrandRead): string[] => [...read.assets.values()].filter((a) => a.category === 'logos' && MEASURED.includes(a.format)).map((a) => a.id);
