import { Check, X } from 'lucide-react';
import type { Asset, BlazonData } from '../../../types/index.js';
import { assetCategories, categoryKind, type AssetCategoryView, type CategoryKind } from '@/lib/brand';
import { humanize, rulesLine } from '@/lib/tokens/format';
import { CategoryLabel } from '@/components/blazon/category-label';
import { ColorText } from '@/components/blazon/color-text';

/** "dont-stretch" -> "Don't stretch": an asset's name as a caption, with the deck's do/don't wording kept. */
export function assetCaption(name: string): string {
  return humanize(name.replace(/^dont-/, "don't-").replace(/-/g, ' '));
}

/** What to call an asset: its sidecar's title, or its file name made readable. */
export function assetTitle(asset: Asset): string {
  return asset.meta?.title ?? assetCaption(asset.name);
}

/** A usage example named do-… or dont-…: brand books pair what to do with what not to do. */
function verdict(name: string): 'do' | 'dont' | undefined {
  if (name.startsWith('dont-')) return 'dont';
  if (name.startsWith('do-')) return 'do';
  return undefined;
}

/** Wider than this, an asset (a slide band, a lockup row) takes the whole row instead of one grid cell. */
const WIDE = 2;

/** The asset's own width and height, when known, so a figure frames it at its real proportions. */
function ratioOf(asset: Asset): { css: string; value: number } | undefined {
  const width = Number(asset.width);
  const height = Number(asset.height);
  return width > 0 && height > 0 ? { css: `${width} / ${height}`, value: width / height } : undefined;
}

/**
 * One asset in a frame, captioned with its file name. When a heading beside it already names the asset (`named`),
 * that name becomes the alt text and the caption keeps only the link, so the name is not said twice.
 */
function AssetFigure({ asset, named, markedAs }: { asset: Asset; named?: string; markedAs?: CategoryKind }) {
  const caption = named ?? assetCaption(asset.name);
  const kind = verdict(asset.name);
  const ratio = ratioOf(asset);
  return (
    <figure data-asset={asset.id} className={`flex min-w-0 flex-col gap-2${ratio && ratio.value > WIDE ? ' col-span-full' : ''}`}>
      <div data-frame className="flex items-center justify-center overflow-hidden rounded-lg bg-muted p-3" style={{ aspectRatio: ratio?.css ?? '4 / 3' }}>
        <img className="max-h-full max-w-full object-contain" src={asset.url} alt={caption} loading="lazy" />
      </div>
      <figcaption className="flex items-start gap-2 text-sm">
        {kind && (
          <span
            role="img"
            aria-label={kind === 'do' ? 'Do' : "Don't"}
            className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full text-white ${kind === 'do' ? 'bg-emerald-600' : 'bg-destructive'}`}
          >
            {kind === 'do' ? <Check className="size-3" /> : <X className="size-3" />}
          </span>
        )}
        <span className="min-w-0 flex-1">{named ? null : <ColorText text={caption} />}</span>
        <CategoryLabel kind={markedAs} />
        <a className="shrink-0 text-[13px] text-muted-foreground underline underline-offset-2" href={asset.url}>
          Full size
        </a>
      </figcaption>
    </figure>
  );
}

/**
 * The `<!-- blazon:assets <folder> [name ...] -->` directive: the folder's assets inline in a doc, or only
 * the named ones in the order given. A folder or name that does not exist says so, so a typo shows.
 */
export function AssetFigures({ data, args }: { data: BlazonData; args: string[] }) {
  const [category, ...names] = args;
  const folder = assetCategories(data).find((c) => c.category === category);
  if (!category || !folder) return <p className="text-[13px] text-destructive">No asset at {category}</p>;

  const picked = pick(folder, names);
  return (
    <div className={`not-prose my-4 grid gap-4 ${picked.length === 1 ? 'grid-cols-1' : 'grid-cols-[repeat(auto-fill,minmax(200px,1fr))]'}`}>
      {picked.map(({ name, asset }) =>
        asset ? (
          <AssetFigure key={asset.id} asset={asset} markedAs={categoryKind(folder)} />
        ) : (
          <p key={name} className="col-span-full text-[13px] text-destructive">
            No asset at {category}/{name}
          </p>
        ),
      )}
    </div>
  );
}

/** The named assets in the order given, or the whole folder; a name with no asset keeps its place, so it can say so. */
function pick(folder: AssetCategoryView, names: string[]): { name: string; asset?: Asset }[] {
  return names.length ? names.map((name) => ({ name, asset: folder.assets.find((a) => a.name === name) })) : folder.assets.map((asset) => ({ name: asset.name, asset }));
}

function sourceLine(source: { doc: string; locator: string } | undefined): string | undefined {
  return source && `Source: ${source.doc}, ${source.locator}`;
}

function Statements({ label, items, kind }: { label?: string; items: string[] | undefined; kind?: 'do' | 'dont' }) {
  if (!items?.length) return null;
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <p className="flex items-center gap-1.5 text-[13px] font-semibold">
          {kind && (
            <span aria-hidden className={`flex size-4 items-center justify-center rounded-full text-white ${kind === 'do' ? 'bg-emerald-600' : 'bg-destructive'}`}>
              {kind === 'do' ? <Check className="size-3" /> : <X className="size-3" />}
            </span>
          )}
          {label}
        </p>
      )}
      <ul className="list-disc space-y-1 pl-5 text-sm">
        {items.map((item) => (
          <li key={item}>
            <ColorText text={item} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** One asset as a guideline: its title and prose from the sidecar, beside its image. */
function SectionAsset({ asset, markedAs }: { asset: Asset; markedAs?: CategoryKind }) {
  const meta = asset.meta ?? {};
  const title = assetTitle(asset);
  const source = sourceLine(meta.source);
  return (
    <div data-section-asset={asset.id} className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <div className="flex min-w-0 flex-col gap-3">
        <h3 className="text-[15px] font-semibold">{title}</h3>
        {meta.description && (
          <p className="text-sm">
            <ColorText text={meta.description} />
          </p>
        )}
        <Statements items={meta.traits} />
        <Statements label="Do" items={meta.do} kind="do" />
        <Statements label="Don't" items={meta.dont} kind="dont" />
        {source && <p className="text-[13px] text-muted-foreground">{source}</p>}
      </div>
      <AssetFigure asset={asset} named={title} markedAs={markedAs} />
    </div>
  );
}

/**
 * The `<!-- blazon:section <folder> [name ...] -->` directive: the same assets as `blazon:assets`, each with
 * the title, description, traits and do's and don'ts its sidecar gives, then the category's file rules, what
 * the guidelines leave open, and where they say it. Pages built this way render the same for every brand.
 */
export function AssetSection({ data, args }: { data: BlazonData; args: string[] }) {
  const [category, ...names] = args;
  const folder = assetCategories(data).find((c) => c.category === category);
  if (!category || !folder) return <p className="text-[13px] text-destructive">No asset at {category}</p>;

  const rules = rulesLine(folder.rules);
  const source = sourceLine(folder.source);
  return (
    // data-print-split: the print book lays each asset out as a block of its own
    <div data-print-split="" className="not-prose my-4 flex flex-col gap-8">
      {pick(folder, names).map(({ name, asset }) =>
        asset ? (
          <SectionAsset key={asset.id} asset={asset} markedAs={categoryKind(folder)} />
        ) : (
          <p key={name} className="text-[13px] text-destructive">
            No asset at {category}/{name}
          </p>
        ),
      )}
      {(rules || folder.notSpecified?.length || source) && (
        <div data-section-end={category} className="flex flex-col gap-3 border-t pt-4">
          {rules && <p className="text-sm">{rules}</p>}
          <Statements label="Not specified" items={folder.notSpecified} />
          {source && <p className="text-[13px] text-muted-foreground">{source}</p>}
        </div>
      )}
    </div>
  );
}
