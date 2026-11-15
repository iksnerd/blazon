import type { Asset, AssetDimension, AssetMeasure, AssetMeta } from '../../types/index.js';
import { artworkSize, dimensionToPx, isUnits, measurePx } from '../../core/assets/measure.js';

export { dimensionToPx, measurePx };

/** Drawn when the artwork's size is not in its file: wide enough to see, in a logo's usual proportion. */
const FALLBACK_SIZE = { width: 160, height: 48 };

/** The artwork's own size, or a stand-in so something can still be drawn. */
export function naturalSize(asset: Asset): { width: number; height: number } {
  return artworkSize(asset) ?? FALLBACK_SIZE;
}

/** A dimension as written: "20px". */
export const dimensionText = (d: AssetDimension) => `${d.value}${d.unit}`;

/** A measure as the brand stated it, with its size once known: "20px", or "1 unit (12px)". */
export function describeMeasure(measure: AssetMeasure, meta: Pick<AssetMeta, 'unit'>): string {
  if (!isUnits(measure)) return dimensionText(measure);
  const px = measurePx(measure, meta);
  return `${measure.units} ${measure.units === 1 ? 'unit' : 'units'}${px === undefined ? '' : ` (${Math.round(px * 100) / 100}px)`}`;
}

/** A URL the browser resolves against the page, not against a stylesheet: right at the root and under a subpath. */
export const pageUrl = (relative: string): string => new URL(relative, document.baseURI).href;
