import { useId, type ReactNode } from 'react';
import type { Asset, BlazonData } from '../../../types/index.js';
import { colorwayResults, type ColorwayResult } from '../../../core/logo/colorways.js';
import { CONTRAST_MINIMUM, ratioMessage } from '../../../core/checker/contrast.js';
import { pickRepresentation } from '../../../core/assets/representations.js';
import { assetKind } from '@/lib/brand';
import { naturalSize } from '@/lib/logo-geometry';
import { CategoryLabel } from '@/components/blazon/category-label';
import { assetTitle } from '@/components/blazon/asset-figures';

// The named colorways of a logo (RFC 0001 §10): the logo on a background token, with the contrast the sidecar asks for and the contrast measured.

function Missing({ children }: { children: ReactNode }) {
  return <p className="col-span-full text-[13px] text-destructive">{children}</p>;
}

/** The artwork's height in a colorway figure. */
const COLORWAY_HEIGHT_REM = 2.75;

/** A check or a cross before a result: a shape and the words beside it carry pass and fail, so the figure does not rest on color. */
function ResultMark({ pass }: { pass: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="size-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d={pass ? 'M3 8.5l3.2 3.2L13 4.5' : 'M3.5 3.5l9 9M12.5 3.5l-9 9'} />
    </svg>
  );
}

function ColorwayFigure({ result }: { result: ColorwayResult }) {
  const captionId = useId();
  const { variant, background, ratio, pass, min, name, on } = result;
  const size = naturalSize(variant);
  const text = ratio === undefined ? 'Contrast not measured' : `${pass ? 'Passes' : 'Fails'} ${min}: ${ratioMessage(ratio)}:1${pass ? '' : `, needs ${CONTRAST_MINIMUM[min]}:1`}`;
  return (
    <figure
      data-logo-colorway={name}
      data-colorway-pass={pass === undefined ? 'unknown' : String(pass)}
      aria-labelledby={captionId}
      className="m-0 flex min-w-0 flex-col gap-2 rounded-lg border p-2"
    >
      <div data-colorway-stage="" className="flex min-h-32 items-center justify-center rounded-sm border p-6" style={{ background: String(background!.value) }}>
        <img
          src={variant.url}
          alt={`${assetTitle(variant)}, on ${on}`}
          className="block max-w-full"
          style={{ height: `${COLORWAY_HEIGHT_REM}rem`, width: 'auto', aspectRatio: `${size.width / size.height}` }}
        />
      </div>
      <figcaption id={captionId} className="flex flex-col text-[13px]">
        <span className="font-semibold">{name}</span>
        <span data-colorway-result="" className="flex items-center gap-1.5 text-muted-foreground">
          {pass !== undefined && <ResultMark pass={pass} />}
          {text}
        </span>
      </figcaption>
    </figure>
  );
}

const findAsset = (data: BlazonData, id: string | undefined): Asset | undefined => (id === undefined ? undefined : pickRepresentation(data.assets.all, id));

/**
 * The `<!-- blazon:logo-colorways <logo> -->` directive: each named colorway of the logo's sidecar, the logo (or the variant the
 * colorway names) on its background token, the name as the caption, the measured contrast and whether it reaches the colorway's level.
 */
export function LogoColorways({ data, args }: { data: BlazonData; args: string[] }) {
  const [logoId] = args;
  const logo = findAsset(data, logoId);
  if (!logo) return <Missing>No asset at {logoId}</Missing>;
  if (!logo.meta?.colorways) return <Missing>{logo.id} states no colorways</Missing>;
  const results = colorwayResults(logo, data.assets.all, data.tokens.items).filter((r) => r.background !== undefined);
  return (
    <div data-logo-colorways={logo.id} className="not-prose my-4 flex flex-col gap-3">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(240px,100%),1fr))] gap-2.5">
        {results.map((result) => (
          <ColorwayFigure key={result.name} result={result} />
        ))}
      </div>
      <CategoryLabel kind={assetKind(data, logo)} />
    </div>
  );
}
