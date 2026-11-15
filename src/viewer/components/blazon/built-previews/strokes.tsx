import type { BlazonData, TokenItem } from '../../../../types/index.js';
import { inkOn } from '@/lib/theme/color';
import { toPx } from '@/lib/tokens/preview';
import { tokensAt } from '@/lib/tokens/token-links';
import { isBorder } from '../../../../core/docs/directives.js';
import { Missing, paints, TokenLabel } from './shared';

/** A border token's stroke: color and width as the token states them. */
type Stroke = { color: string; width: number };

function strokeOf(token: TokenItem): Stroke {
  const parts = token.parts ?? {};
  return { color: String(parts.color ?? 'currentColor'), width: toPx(parts.width ?? '1px') ?? 1 };
}

/** The border tokens the paths name, or a "No token at" line per path that names none. */
function borders(data: BlazonData, paths: string[]): (TokenItem | { missing: string })[] {
  return paths.flatMap((path): (TokenItem | { missing: string })[] => {
    const tokens = tokensAt(data, path).filter(isBorder);
    return tokens.length ? tokens : [{ missing: path }];
  });
}

/** Blazon's own sample canvas: a brand book rarely states one, and a stroke is only honest at actual size on it. */
const SAMPLE_CANVAS = 250;

/** A circle, a rounded square and a curve, stroked at actual size with the rounded caps and joins the illustration rule asks for. */
function SampleShapes({ stroke, paint, fill }: { stroke: Stroke; paint?: string; fill?: boolean }) {
  return (
    <svg
      viewBox={`0 0 ${SAMPLE_CANVAS} ${SAMPLE_CANVAS}`}
      width={SAMPLE_CANVAS}
      height={SAMPLE_CANVAS}
      aria-hidden="true"
      className={fill ? 'aspect-square h-auto w-full' : 'h-auto max-w-full'}
      style={paint ? { background: paint } : undefined}
    >
      <g fill="none" stroke={stroke.color} strokeWidth={stroke.width} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="85" cy="90" r="45" />
        <rect x="120" y="110" width="95" height="95" rx="18" />
        <path d="M30 200 C 50 150, 90 150, 110 190 S 70 235, 30 200" />
      </g>
    </svg>
  );
}

/**
 * The `<!-- blazon:strokes <path> ... -->` directive: sample shapes drawn with each border token at its
 * real width on a canvas of blazon's own size, over the theme's canvas color.
 */
export function StrokeSamples({ data, args }: { data: BlazonData; args: string[] }) {
  return (
    <figure className="not-prose my-4 flex flex-col gap-2">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-2.5">
        {borders(data, args).map((item) =>
          'missing' in item ? (
            <Missing key={item.missing}>No border token at {item.missing}</Missing>
          ) : (
            <div key={item.path} data-stroke={item.path} className="flex flex-col gap-2 rounded-lg border p-3">
              <SampleShapes stroke={strokeOf(item)} paint="var(--blazon-canvas, transparent)" />
              <TokenLabel token={item} />
            </div>
          ),
        )}
      </div>
      <figcaption className="text-[13px] text-muted-foreground">
        Drawn at actual size on a {SAMPLE_CANVAS}px canvas with rounded caps and joins. Sample shapes are blazon's own.
      </figcaption>
    </figure>
  );
}

/** One tile. A stroke the color of its own background would draw nothing, so black or white takes over, and the caption says so. */
function SpotTile({ token, stroke }: { token: TokenItem; stroke?: Stroke }) {
  const paint = String(token.value);
  const hidden = stroke !== undefined && stroke.color.toLowerCase() === paint.toLowerCase();
  const drawn = stroke && !hidden ? stroke : { color: inkOn(paint), width: stroke?.width ?? 1 };
  return (
    <figure data-spot={token.path} className="flex flex-col gap-2 overflow-hidden rounded-lg border">
      <SampleShapes stroke={drawn} paint={paint} fill />
      <figcaption className="flex flex-col gap-1 px-3 pb-3">
        <TokenLabel token={token} />
        {hidden && <span className="text-[11px] text-muted-foreground">The stroke token has this background's color; drawn in {drawn.color === '#fff' ? 'white' : 'black'}.</span>}
      </figcaption>
    </figure>
  );
}

/**
 * The `<!-- blazon:spots <path> ... -->` directive: sample shapes on each color or gradient token, drawn
 * with the first border token among the paths, or in black or white by contrast when none is named.
 */
export function SpotTiles({ data, args }: { data: BlazonData; args: string[] }) {
  const namesBorder = (path: string) => tokensAt(data, path).some(isBorder);
  const border = borders(data, args.filter(namesBorder)).find((b): b is TokenItem => !('missing' in b));
  const stroke = border ? strokeOf(border) : undefined;
  return (
    <div className="not-prose my-4 grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2.5">
      {paints(
        data,
        args.filter((p) => !namesBorder(p)),
      ).map((item) => ('missing' in item ? <Missing key={item.missing}>No token at {item.missing}</Missing> : <SpotTile key={item.path} token={item} stroke={stroke} />))}
    </div>
  );
}
