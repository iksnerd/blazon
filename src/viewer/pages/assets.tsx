import type { Asset, AssetRules, BlazonData } from '../../types/index.js';
import { copy, notify } from '@/lib/copy';
import { assetMeta, assetRules, rulesLine } from '@/lib/tokens/format';
import { sanitizeSvg, svgToJsx } from '@/lib/markup/sanitize';
import { GUTTER, PageFooter, PageHeader } from '@/components/blazon/page';
import { Button, buttonVariants } from '@/components/ui/button';
import { CategoryLabel } from '@/components/blazon/category-label';
import type { CategoryKind } from '@/lib/brand';
import { ColorText } from '@/components/blazon/color-text';

function downloadSvg(content: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: 'image/svg+xml' }));
  Object.assign(document.createElement('a'), { href: url, download: filename }).click();
  URL.revokeObjectURL(url);
  notify(`Downloaded ${filename}`);
}

/** Everything that hands SVG markup to the reader goes through the sanitizer first. */
function withSafeSvg(asset: Asset, run: (svg: string) => void): void {
  const svg = sanitizeSvg(asset.svg ?? '');
  if (!svg) return notify(`${asset.name} has no SVG content left after removing unsafe markup`);
  run(svg);
}

function AssetCard({ asset }: { asset: Asset }) {
  return (
    <figure className="flex flex-col gap-3">
      {/* SVGs are shown through <img> like raster files, never inlined: an image cannot run script or restyle the page */}
      <div className="flex aspect-[4/3] items-center justify-center rounded-lg bg-muted p-6">
        <img className="max-h-full max-w-full object-contain" src={asset.url} alt={asset.name} loading="lazy" />
      </div>
      <figcaption className="flex flex-col text-sm">
        {asset.name}
        <span className="text-[13px] text-muted-foreground">{assetMeta(asset)}</span>
        {assetRules(asset).map((rule) => (
          <span key={rule} data-asset-rule="" className="text-[13px] text-muted-foreground">
            <ColorText text={rule} />
          </span>
        ))}
      </figcaption>
      <div className="flex flex-wrap gap-x-3">
        {asset.svg ? (
          <>
            <Button variant="link" size="sm" className="h-auto px-0" onClick={() => withSafeSvg(asset, (svg) => copy(svg, `Copied ${asset.name} SVG`))}>
              Copy SVG
            </Button>
            <Button variant="link" size="sm" className="h-auto px-0" onClick={() => withSafeSvg(asset, (svg) => copy(svgToJsx(svg, asset.name), `Copied ${asset.name} JSX`))}>
              Copy JSX
            </Button>
            <Button variant="link" size="sm" className="h-auto px-0" onClick={() => withSafeSvg(asset, (svg) => downloadSvg(svg, `${asset.name}.svg`))}>
              Download
            </Button>
          </>
        ) : (
          <>
            {/* A download is a link; a Button would announce it as a button */}
            <a className={buttonVariants({ variant: 'link', size: 'sm', className: 'h-auto px-0' })} href={asset.url} download>
              Download
            </a>
            <Button variant="link" size="sm" className="h-auto px-0" onClick={() => copy(new URL(asset.url, window.location.href).href, `Copied ${asset.name} URL`)}>
              Copy URL
            </Button>
          </>
        )}
      </div>
    </figure>
  );
}

export function AssetsPage({
  data,
  assets,
  title,
  description,
  rules,
  kind,
}: {
  data: BlazonData;
  assets: Asset[];
  title: string;
  description?: string;
  rules?: AssetRules;
  kind?: CategoryKind;
}) {
  const count = `${assets.length} ${assets.length === 1 ? 'file' : 'files'}.`;
  const required = rulesLine(rules);
  return (
    <>
      <PageHeader label="Assets" title={title} intro={description ? `${description} ${count}` : count}>
        {kind && (
          <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
            <CategoryLabel kind={kind} />
            {kind === 'experiment'
              ? "Explorations, not the brand's identity. They are left out of the press kit, the logo kit and the deck."
              : "Kept for comparison or supplied by someone else, not the brand's live assets. The deck leaves them out."}
          </p>
        )}
        {/* What blazon check holds each file in this category to, so whoever adds one knows */}
        {required && (
          <p data-asset-rules="" className="mt-2 max-w-[40em] text-sm text-muted-foreground">
            {required}
          </p>
        )}
      </PageHeader>
      <div className={`${GUTTER} grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-6 py-10`}>
        {assets.map((asset) => (
          <AssetCard key={asset.filePath} asset={asset} />
        ))}
      </div>
      <PageFooter title={data.title} trail={`Assets / ${title}`} />
    </>
  );
}
