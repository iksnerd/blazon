import type { ReactNode } from 'react';
import type { Asset, BlazonData, LogoCorner } from '../../../types/index.js';
import { planInitiative, planPartnership } from '../../../core/logo/lockup.js';
import { ClearSpaceDrawing, SPACE_PREVIEW_WIDTH, surfaceOf } from '@/components/blazon/logo-drawing';
import { assetCategories, assetKind, categoryKind } from '@/lib/brand';
import { CategoryLabel } from '@/components/blazon/category-label';
import { describeMeasure, dimensionText, naturalSize, pageUrl } from '@/lib/logo-geometry';
import { replacementText, sizeText } from '@/lib/tokens/format';
import { assetTitle } from '@/components/blazon/asset-figures';
import { ColorText } from '@/components/blazon/color-text';

// Previews of what a brand states about its logo in a sidecar (RFC 0001 §10): the lockups it comes in, how
// it sits beside a partner's, and where it goes on a layout. Geometry is drawn in SVG, so it scales as one.

function Missing({ children }: { children: ReactNode }) {
  return <p className="col-span-full text-[13px] text-destructive">{children}</p>;
}

const findAsset = (data: BlazonData, id: string | undefined): Asset | undefined => data.assets.all.find((a) => a.id === id);

const LOCKUP_LABEL = (kind: string) => `${kind[0]!.toUpperCase()}${kind.slice(1)}`;

/**
 * The `<!-- blazon:logo-lockups <folder> [name ...] -->` directive: the logos that state a `lockup`, grouped
 * by it (the standard lockups, then the brand's own, in the order `BlazonData.vocabulary` lists them), each with its clear space drawn as a band.
 */
export function LogoLockups({ data, args }: { data: BlazonData; args: string[] }) {
  const [category, ...names] = args;
  const folder = assetCategories(data).find((c) => c.category === category);
  if (!category || !folder) return <Missing>No asset at {category}</Missing>;
  const picked = names.length ? names.map((n) => folder.assets.find((a) => a.name === n)).filter((a): a is Asset => a !== undefined) : folder.assets;
  const stated = picked.filter((a) => a.meta?.lockup);
  if (stated.length === 0) return <Missing>No asset at {category} states a lockup</Missing>;
  return (
    <div className="not-prose my-4 flex flex-col gap-5">
      {data.vocabulary.lockups.map((kind) => {
        const group = stated.filter((a) => a.meta!.lockup === kind);
        if (group.length === 0) return null;
        return (
          <section key={kind} data-lockup-group={kind} className="not-prose flex flex-col gap-2.5">
            <h3 className="text-sm font-semibold">{LOCKUP_LABEL(kind)}</h3>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-2.5">
              {group.map((asset) => {
                const { clearSpace, minSize, maxSize, replacedBelow, description, background } = asset.meta!;
                const size = naturalSize(asset);
                return (
                  <figure key={asset.id} data-logo-lockup={asset.id} className="flex min-w-0 flex-col gap-3 rounded-lg border p-4">
                    {clearSpace ? (
                      <ClearSpaceDrawing asset={asset} />
                    ) : (
                      // The cap is the artwork's width plus the tile's padding (p-4, 2rem across), so the artwork keeps it
                      <div
                        className="w-full self-center rounded-sm p-4"
                        style={{ background: surfaceOf(background).fill, maxWidth: `calc(${Math.min(size.width, SPACE_PREVIEW_WIDTH)}px + 2rem)` }}
                      >
                        <img src={asset.url} alt="" width={size.width} height={size.height} className="block h-auto w-full" />
                      </div>
                    )}
                    <figcaption className="flex flex-col text-[13px]">
                      <span className="flex items-center justify-between gap-2 font-semibold">
                        {assetTitle(asset)}
                        <CategoryLabel kind={categoryKind(folder)} />
                      </span>
                      {description && (
                        <span>
                          <ColorText text={description} />
                        </span>
                      )}
                      {clearSpace && <span className="text-muted-foreground">Clear space {describeMeasure(clearSpace, asset.meta!)}</span>}
                      {minSize && (
                        <span className="text-muted-foreground">
                          Minimum {minSize.width ? `width ${dimensionText(minSize.width)}` : `height ${dimensionText(minSize.height!)}`}
                        </span>
                      )}
                      {maxSize && <span className="text-muted-foreground">Maximum {sizeText(maxSize)}</span>}
                      {replacedBelow && (
                        <span className="text-muted-foreground">
                          {replacementText(replacedBelow, (id) => {
                            const target = data.assets.all.find((a) => a.id === id);
                            return target && assetTitle(target);
                          })}
                        </span>
                      )}
                    </figcaption>
                  </figure>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/** A partnership row wider than this is drawn smaller as one. */
const PARTNER_PREVIEW_WIDTH = 480;

/**
 * The `<!-- blazon:logo-partner <logo> <partner> -->` directive: the logo and a partner's side by side,
 * divided by a vertical line. The gap on each side of the line and the line's height come from the logo's
 * `partnership` rule; both logos stand on one baseline, and the line is centered on the row. The partner is
 * drawn as tall as the rule's `partnerHeight`, or as tall as the logo when it states none.
 */
export function LogoPartner({ data, args }: { data: BlazonData; args: string[] }) {
  const [logoId, partnerId] = args;
  const logo = findAsset(data, logoId);
  const partner = findAsset(data, partnerId);
  if (!logo) return <Missing>No asset at {logoId}</Missing>;
  if (!partner) return <Missing>No asset at {partnerId}</Missing>;
  const rule = logo.meta?.partnership;
  if (!rule) return <Missing>{logo.id} states no partnership</Missing>;

  const layout = planPartnership({ size: naturalSize(logo), meta: logo.meta! }, { size: naturalSize(partner) })!;
  const { width, height, divider } = layout;
  const surface = surfaceOf(logo.meta?.background);

  return (
    <div className="not-prose my-4">
      <figure data-logo-partner={`${logo.id}+${partner.id}`} className="flex flex-col gap-3 rounded-lg border p-4">
        <div className="rounded-sm p-5" style={{ background: surface.fill, color: surface.ink }}>
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="block h-auto w-full"
            style={{ maxWidth: `${Math.min(width, PARTNER_PREVIEW_WIDTH)}px` }}
            role="img"
            aria-label={`${assetTitle(logo)} and ${assetTitle(partner)}`}
          >
            <image href={pageUrl(logo.url)} x={layout.logo.x} y={layout.logo.y} width={layout.logo.width} height={layout.logo.height} />
            {divider && <line data-divider="" x1={divider.x} x2={divider.x} y1={divider.y1} y2={divider.y2} stroke="currentColor" strokeWidth={divider.stroke} />}
            <image href={pageUrl(partner.url)} x={layout.partner.x} y={layout.partner.y} width={layout.partner.width} height={layout.partner.height} />
          </svg>
        </div>
        <figcaption className="flex flex-col text-[13px]">
          <span className="flex items-center justify-between gap-2 font-semibold">
            <span>
              {assetTitle(logo)} and {assetTitle(partner)}
            </span>
            <CategoryLabel kind={assetKind(data, logo) ?? assetKind(data, partner)} />
          </span>
          <span className="text-muted-foreground">
            {rule.dividerHeight
              ? `Gap ${describeMeasure(rule.gap, logo.meta!)} each side, divider ${describeMeasure(rule.dividerHeight!, logo.meta!)} high, one baseline`
              : `Gap ${describeMeasure(rule.gap, logo.meta!)} between the logos, no divider, one baseline`}
          </span>
        </figcaption>
      </figure>
    </div>
  );
}

/**
 * The `<!-- blazon:logo-initiative <logo> -->` directive: the logo with the artwork of a program the brand runs, beside it on one
 * baseline or under it, as its `initiative` rule states. The mark is drawn as tall as `markHeight`, or as tall as the logo.
 */
export function LogoInitiative({ data, args }: { data: BlazonData; args: string[] }) {
  const [logoId] = args;
  const logo = findAsset(data, logoId);
  if (!logo) return <Missing>No asset at {logoId}</Missing>;
  const rule = logo.meta?.initiative;
  if (!rule) return <Missing>{logo.id} states no initiative</Missing>;
  const mark = findAsset(data, rule.mark);
  if (!mark) return <Missing>No asset at {rule.mark}</Missing>;

  const layout = planInitiative({ size: naturalSize(logo), meta: logo.meta! }, { size: naturalSize(mark) })!;
  const { width, height } = layout;
  const surface = surfaceOf(logo.meta?.background);

  return (
    <div className="not-prose my-4">
      <figure data-logo-initiative={`${logo.id}+${mark.id}`} className="flex flex-col gap-3 rounded-lg border p-4">
        <div className="rounded-sm p-5" style={{ background: surface.fill, color: surface.ink }}>
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="block h-auto w-full"
            style={{ maxWidth: `${Math.min(width, PARTNER_PREVIEW_WIDTH)}px` }}
            role="img"
            aria-label={`${assetTitle(logo)}, ${rule.name}`}
          >
            <image href={pageUrl(logo.url)} x={layout.logo.x} y={layout.logo.y} width={layout.logo.width} height={layout.logo.height} />
            <image href={pageUrl(mark.url)} x={layout.mark.x} y={layout.mark.y} width={layout.mark.width} height={layout.mark.height} />
          </svg>
        </div>
        <figcaption className="flex flex-col text-[13px]">
          <span className="flex items-center justify-between gap-2 font-semibold">
            <span>
              {assetTitle(logo)}, {rule.name}
            </span>
            <CategoryLabel kind={assetKind(data, logo) ?? assetKind(data, mark)} />
          </span>
          <span className="text-muted-foreground">
            {rule.position === 'below'
              ? `Gap ${describeMeasure(rule.gap, logo.meta!)} under the logo, left edges aligned`
              : `Gap ${describeMeasure(rule.gap, logo.meta!)} beside the logo, one baseline`}
          </span>
        </figcaption>
      </figure>
    </div>
  );
}

// A sample frame: the brand states the corners, not the sizes, so these are blazon's own.
const FRAME = { width: 320, height: 180 };
const LOGO_HEIGHT = FRAME.height * 0.1;
const MARGIN = FRAME.width * 0.05;
const URL_SIZE = 10;

const CORNER_LABEL: Record<LogoCorner, string> = {
  'top-left': 'Top left',
  'top-right': 'Top right',
  'bottom-left': 'Bottom left',
  'bottom-right': 'Bottom right',
};

/**
 * The `<!-- blazon:logo-placement <logo> [url] -->` directive: a sample frame for each corner the logo may
 * sit in. With a URL, it goes on the opposite side of the same edge, aligned to the logo. The frame, the
 * logo's size and the margin are blazon's own; the brand states only the corners.
 */
export function LogoPlacement({ data, args }: { data: BlazonData; args: string[] }) {
  const [logoId, url] = args;
  const logo = findAsset(data, logoId);
  if (!logo) return <Missing>No asset at {logoId}</Missing>;
  const corners = logo.meta?.placement;
  if (!corners) return <Missing>{logo.id} states no placement</Missing>;

  const size = naturalSize(logo);
  const logoWidth = (size.width * LOGO_HEIGHT) / size.height;
  const surface = surfaceOf(logo.meta?.background);

  return (
    <div className="not-prose my-4">
      <figure data-logo-placement={logo.id} className="flex flex-col gap-3">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-2.5">
          {corners.map((corner) => {
            const top = corner.startsWith('top');
            const left = corner.endsWith('left');
            const x = left ? MARGIN : FRAME.width - MARGIN - logoWidth;
            const y = top ? MARGIN : FRAME.height - MARGIN - LOGO_HEIGHT;
            return (
              <div key={corner} className="flex flex-col gap-1.5">
                <svg
                  data-corner={corner}
                  viewBox={`0 0 ${FRAME.width} ${FRAME.height}`}
                  className="block h-auto w-full rounded-md border"
                  style={{ background: surface.fill, color: surface.ink }}
                  role="img"
                  aria-label={`${assetTitle(logo)}, ${CORNER_LABEL[corner].toLowerCase()}`}
                >
                  <image href={pageUrl(logo.url)} x={x} y={y} width={logoWidth} height={LOGO_HEIGHT} />
                  {url && (
                    <text
                      data-url=""
                      x={left ? FRAME.width - MARGIN : MARGIN}
                      y={y + LOGO_HEIGHT * (top ? 0.7 : 0.9)}
                      textAnchor={left ? 'end' : 'start'}
                      fontSize={URL_SIZE}
                      fill="currentColor"
                      style={{ fontFamily: 'var(--blazon-font-body, sans-serif)' }}
                    >
                      {url}
                    </text>
                  )}
                </svg>
                <span className="text-[13px] font-semibold">{CORNER_LABEL[corner]}</span>
              </div>
            );
          })}
        </div>
        <figcaption className="flex items-center justify-between gap-2 text-[13px] text-muted-foreground">
          <span>{assetTitle(logo)}: the corners come from the sidecar. The frame, the logo's size and the margin are blazon's own.</span>
          <CategoryLabel kind={assetKind(data, logo)} />
        </figcaption>
      </figure>
    </div>
  );
}
