import type { CSSProperties } from 'react';
import type { Asset, BlazonData } from '../../../../types/index.js';
import { assetCategories, categoryKind } from '@/lib/brand';
import { CategoryLabel } from '@/components/blazon/category-label';
import { Missing, paints, TokenLabel } from './shared';

/**
 * The icons as masks over one paint, so any SVG or PNG takes the color or gradient. The mask URL is
 * made absolute here: a relative url() in a custom property resolves against the stylesheet that uses
 * it, which a built site serves from assets/, not against the page.
 */
function IconSet({ icons, paint }: { icons: Asset[]; paint: string }) {
  return (
    <div className="flex flex-wrap gap-3">
      {icons.map((asset) => (
        <span
          key={asset.id}
          data-icon={asset.id}
          role="img"
          aria-label={asset.name}
          title={asset.name}
          className="blazon-icon size-8"
          style={{ background: paint, '--blazon-icon': `url("${new URL(asset.url, document.baseURI).href}")` } as CSSProperties}
        />
      ))}
    </div>
  );
}

/**
 * The `<!-- blazon:icons <folder> [path ...] -->` directive: every icon in the folder, painted in each
 * color or gradient token named, or once in the text color when the doc names none.
 */
export function IconRows({ data, args }: { data: BlazonData; args: string[] }) {
  const [category, ...paths] = args;
  const folder = assetCategories(data).find((c) => c.category === category);
  if (!category || !folder) return <Missing>No asset at {category}</Missing>;
  const row = 'grid items-center gap-3 rounded-lg border p-3';
  return (
    <div className="not-prose my-4 flex flex-col gap-2.5">
      {categoryKind(folder) && (
        <div>
          <CategoryLabel kind={categoryKind(folder)} />
        </div>
      )}
      {paths.length === 0 && (
        <div data-icon-row="" className={row}>
          <IconSet icons={folder.assets} paint="currentColor" />
        </div>
      )}
      {paints(data, paths).map((item) =>
        'missing' in item ? (
          <Missing key={item.missing}>No token at {item.missing}</Missing>
        ) : (
          <div key={item.path} data-icon-row={item.path} className={`${row} sm:grid-cols-[200px_minmax(0,1fr)]`}>
            <TokenLabel token={item} />
            <IconSet icons={folder.assets} paint={String(item.value)} />
          </div>
        ),
      )}
    </div>
  );
}
