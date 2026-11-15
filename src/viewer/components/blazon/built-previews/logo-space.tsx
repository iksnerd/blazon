import type { Asset, BlazonData } from '../../../../types/index.js';
import { assetCategories, categoryKind } from '@/lib/brand';
import { describeMeasure, dimensionToPx } from '@/lib/logo-geometry';
import { ClearSpaceDrawing, clearSpaceLayout, surfaceOf } from '@/components/blazon/logo-drawing';
import { assetTitle } from '@/components/blazon/asset-figures';
import { CategoryLabel } from '@/components/blazon/category-label';
import { Missing } from './shared';

/**
 * The `<!-- blazon:logo-space <folder> [name ...] -->` directive: each asset whose sidecar states a clear
 * space or a minimum size, with the clear space drawn as a hatched band around the artwork and the
 * artwork shown at its minimum size. Wider than 320px with its clear space, a logo is drawn smaller,
 * clear space with it, and narrower still where the column is.
 */
export function LogoSpace({ data, args }: { data: BlazonData; args: string[] }) {
  const [category, ...names] = args;
  const folder = assetCategories(data).find((c) => c.category === category);
  if (!category || !folder) return <Missing>No asset at {category}</Missing>;
  const picked = names.length ? names.map((n) => folder.assets.find((a) => a.name === n)).filter((a): a is Asset => a !== undefined) : folder.assets;
  const stated = picked.filter((a) => a.meta?.clearSpace || a.meta?.minSize);
  if (stated.length === 0) return <Missing>No asset at {category} states a clear space or minimum size</Missing>;
  return (
    <div className="not-prose my-4 grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-2.5">
      {stated.map((asset) => {
        const { clearSpace, minSize, background } = asset.meta!;
        const { scale } = clearSpaceLayout(asset);
        const ink = surfaceOf(background).fill;
        return (
          <figure key={asset.id} data-logo-space={asset.id} className="flex min-w-0 flex-col gap-3 rounded-lg border p-4">
            {clearSpace && <ClearSpaceDrawing asset={asset} />}
            {minSize && (
              // Centred under the clear-space drawing, which is centred in the tile; the label goes under the sample on one line
              <div className="flex flex-col items-center gap-2 self-center">
                <div className="rounded-sm p-2" style={{ background: ink }}>
                  <img
                    data-min-size={minSize.width ? dimensionToPx(minSize.width) : dimensionToPx(minSize.height!)}
                    data-min-axis={minSize.width ? 'width' : 'height'}
                    src={asset.url}
                    alt=""
                    className="block max-w-none"
                    style={minSize.width ? { width: dimensionToPx(minSize.width), height: 'auto' } : { height: dimensionToPx(minSize.height!), width: 'auto' }}
                  />
                </div>
                <span className="font-mono text-[11px] whitespace-nowrap text-muted-foreground">
                  Minimum {minSize.width ? `width ${minSize.width.value}${minSize.width.unit}` : `height ${minSize.height!.value}${minSize.height!.unit}`}
                </span>
              </div>
            )}
            <figcaption className="flex flex-col text-[13px]">
              <span className="flex items-center justify-between gap-2 font-semibold">
                {assetTitle(asset)}
                <CategoryLabel kind={categoryKind(folder)} />
              </span>
              {clearSpace && (
                <span className="text-muted-foreground">
                  Clear space {describeMeasure(clearSpace, asset.meta!)}
                  {scale < 1 && `, drawn at ×${Math.round(scale * 100) / 100}`}
                </span>
              )}
            </figcaption>
          </figure>
        );
      })}
    </div>
  );
}
