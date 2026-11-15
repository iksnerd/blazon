import type { Asset, AssetMeta } from '../../../types/index.js';
import { measurePx, naturalSize } from '@/lib/logo-geometry';

/** Wider than this, a logo with its clear space on both sides is drawn smaller as one. */
export const SPACE_PREVIEW_WIDTH = 320;

/**
 * The surface a logo is shown on: the background its sidecar says it is made for. applyTheme() points the light and dark surface at the
 * background or the inverse, whichever has that darkness, so a brand's dark theme (a dark page, a light inverse) keeps each logo visible.
 */
export function surfaceOf(background: AssetMeta['background']): { fill: string; ink: string } {
  return background === 'dark'
    ? { fill: 'var(--blazon-surface-dark)', ink: 'var(--blazon-surface-dark-text)' }
    : { fill: 'var(--blazon-surface-light)', ink: 'var(--blazon-surface-light-text)' };
}

/** The artwork and the clear space on both sides of it, drawn as one so the band can never be cut off. */
export function clearSpaceLayout(asset: Asset) {
  const size = naturalSize(asset);
  const space = (asset.meta?.clearSpace && measurePx(asset.meta.clearSpace, asset.meta)) || 0;
  const total = size.width + 2 * space;
  return { size, space, total, scale: Math.min(1, SPACE_PREVIEW_WIDTH / total) };
}

/** The logo inside a hatched, dashed band the width of its clear space. Everything shrinks together in a narrow cell. */
export function ClearSpaceDrawing({ asset }: { asset: Asset }) {
  const { size, space, total, scale } = clearSpaceLayout(asset);
  const { fill } = surfaceOf(asset.meta?.background);
  return (
    // Sized here and fluid below it: in a cell narrower than the drawing, everything shrinks together
    <div data-clear-zone="" className="w-full self-center" style={{ maxWidth: `${total * scale}px` }}>
      <div
        data-clear-band=""
        className="rounded-sm outline-1 outline-dashed outline-[var(--blazon-accent,currentColor)]"
        style={{
          padding: `${Math.round((space / total) * 1e5) / 1e3}%`,
          background: `repeating-linear-gradient(45deg, color-mix(in srgb, var(--blazon-accent, currentColor) 22%, transparent) 0 4px, transparent 4px 8px), ${fill}`,
        }}
      >
        <img src={asset.url} alt="" width={size.width} height={size.height} className="block h-auto" style={{ width: '100%', background: fill }} />
      </div>
    </div>
  );
}
