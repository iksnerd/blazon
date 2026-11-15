import type { Asset, AssetDimension, AssetMeasure, AssetMeta, Finding } from '../../types/index.js';
import { finding } from '../checker/catalogue.js';

/** A rem is read as 16px: a sidecar states no root size, and the browser default is the only honest guess. */
const REM_PX = 16;

export const dimensionToPx = (d: AssetDimension): number => (d.unit === 'rem' ? d.value * REM_PX : d.value);

/** True for a multiple of the artwork's unit, as opposed to a dimension. */
export function isUnits(measure: AssetMeasure): measure is { units: number } {
  return 'units' in measure;
}

/**
 * A measure in the artwork's own pixels. A multiple needs the sidecar's `unit`; without one it has no
 * size, which the sidecar check reports before anything draws it.
 */
export function measurePx(measure: AssetMeasure, meta: Pick<AssetMeta, 'unit'>): number | undefined {
  if (!isUnits(measure)) return dimensionToPx(measure);
  return meta.unit ? measure.units * dimensionToPx(meta.unit) : undefined;
}

/** The artwork's own pixel size: a raster file's, an SVG's width and height, or its viewBox. Undefined when unknown. */
export function artworkSize(asset: Pick<Asset, 'width' | 'height' | 'viewBox'>): { width: number; height: number } | undefined {
  const width = Number(asset.width);
  const height = Number(asset.height);
  if (width > 0 && height > 0) return { width, height };
  const box = asset.viewBox
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  if (box && box.length === 4 && box[2]! > 0 && box[3]! > 0) return { width: box[2]!, height: box[3]! };
  return undefined;
}

/**
 * A unit taller than its artwork is a unit measured in the wrong size, such as a logo re-exported at
 * another resolution. One finding per sidecar, even when it describes an SVG and a PNG.
 */
export function unitFindings(assets: readonly Asset[]): Finding[] {
  const seen = new Set<string>();
  const findings: Finding[] = [];
  for (const asset of assets) {
    const unit = asset.meta?.unit;
    const size = artworkSize(asset);
    if (!unit || !size) continue;
    const sidecar = asset.filePath.slice(0, asset.filePath.lastIndexOf('.')) + '.json';
    if (seen.has(sidecar) || dimensionToPx(unit) <= size.height) continue;
    seen.add(sidecar);
    findings.push(
      finding('asset-sidecar-invalid', {
        path: sidecar,
        message: `unit ${unit.value}${unit.unit} is taller than the artwork (${size.height}px); a unit is measured in the artwork's own pixels`,
      }),
    );
  }
  return findings;
}
