import type { CSSProperties, ReactNode } from 'react';
import type { BlazonData } from '../../../types/index.js';
import { formatsAt, patternsAt, type PatternSpec } from '../../../core/tokens/groups.js';

// Previews of a brand's layout rules, drawn from token groups (RFC 0001 §8): social formats and patterns.

function Missing({ children }: { children: ReactNode }) {
  return <p className="col-span-full text-[13px] text-destructive">{children}</p>;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** The ratio in lowest terms, "9:16"; a ratio of large coprime numbers (1200 × 630 is 40:21) is still exact. */
function ratioText(width: number, height: number): string {
  const d = gcd(Math.round(width), Math.round(height));
  return `${Math.round(width) / d}:${Math.round(height) / d}`;
}

/** The longest side of a format frame; every format is drawn at the same scale for its own proportions. */
const FRAME_LONG_SIDE = 280;

/**
 * The `<!-- blazon:formats <path> ... -->` directive: a frame per social format at its real proportions,
 * with the safe-area margin dashed, the column grid, the logo and a headline in the display font. All
 * formats share one scale, so a story is visibly taller than a square.
 */
export function FormatFrames({ data, args }: { data: BlazonData; args: string[] }) {
  const logo = data.logo?.onLight ?? data.logo?.onDark;
  const resolved = args.map((path) => formatsAt(data.tokens, path));
  const formats = resolved.flatMap((r) => r.found);
  const longest = Math.max(1, ...formats.flatMap((f) => [f.width, f.height]));
  const scale = FRAME_LONG_SIDE / longest;
  return (
    <div className="not-prose my-4 flex flex-wrap items-end gap-4">
      {resolved
        .flatMap((r) => r.problems)
        .map((message) => (
          <Missing key={message}>{message}</Missing>
        ))}
      {formats.map((format) => {
        const margin = (format.margin ?? 0) * scale;
        return (
          <figure key={format.path} data-format={format.path} className="flex flex-col gap-2">
            <div
              data-frame=""
              className="relative overflow-hidden rounded-[var(--radius)] border bg-[var(--blazon-bg)] text-[var(--blazon-text)]"
              style={{ width: format.width * scale, height: format.height * scale }}
            >
              {format.margin !== undefined && (
                <div data-margin="" className="absolute border border-dashed border-[var(--blazon-accent,currentColor)]" style={{ inset: margin }}>
                  {format.columns !== undefined &&
                    Array.from({ length: format.columns - 1 }, (_, i) => (
                      <span
                        key={i}
                        data-column=""
                        className="absolute inset-y-0 border-l border-dashed border-[var(--blazon-accent,currentColor)] opacity-40"
                        style={{ left: `${((i + 1) / format.columns!) * 100}%` }}
                      />
                    ))}
                </div>
              )}
              {/* inset sets all four sides, so no height: a height would push the logo past the bottom edge */}
              <div className="absolute flex flex-col justify-between" style={{ inset: Math.max(margin, 6) }}>
                <span className="font-[family-name:var(--blazon-font-display)] leading-tight font-semibold" style={{ fontSize: Math.max(8, format.width * scale * 0.09) }}>
                  Headline
                </span>
                {logo && <img className="w-auto self-start" style={{ height: Math.max(8, format.width * scale * 0.07) }} src={logo} alt="" />}
              </div>
            </div>
            <figcaption className="flex flex-col text-[13px]">
              <span className="font-semibold">{format.name}</span>
              <span className="font-mono text-[11px] text-muted-foreground">
                {Math.round(format.width)} × {Math.round(format.height)} px · {ratioText(format.width, format.height)}
              </span>
              {(format.margin !== undefined || format.columns !== undefined) && (
                <span className="font-mono text-[11px] text-muted-foreground">
                  {[format.margin !== undefined && `margin ${format.margin}px`, format.columns !== undefined && `${format.columns} columns`].filter(Boolean).join(' · ')}
                </span>
              )}
            </figcaption>
          </figure>
        );
      })}
    </div>
  );
}

/** One repeat of the pattern as an SVG in black, for use as a mask: the ink shows wherever the mask is opaque. */
export function tileSvg({ kind, size, stroke }: PatternSpec): string {
  const s = size;
  const half = s / 2;
  const line = (x1: number, y1: number, x2: number, y2: number) => `<path d="M${x1} ${y1}L${x2} ${y2}"/>`;
  const shapes: Record<PatternSpec['kind'], string> = {
    dots: `<circle cx="${half}" cy="${half}" r="${stroke / 2}" fill="#000" stroke="none"/>`,
    lines: line(0, half, s, half),
    // x + y = s, plus the two corner pieces of its neighbors, so the diagonal runs on across tiles
    diagonal: line(0, s, s, 0) + line(-half, half, half, -half) + line(half, s + half, s + half, half),
    grid: line(0, half, s, half) + line(half, 0, half, s),
    checks: `<rect x="0" y="0" width="${half}" height="${half}" fill="#000" stroke="none"/><rect x="${half}" y="${half}" width="${half}" height="${half}" fill="#000" stroke="none"/>`,
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" fill="none" stroke="#000" stroke-width="${stroke}">${shapes[kind]}</svg>`;
}

function PatternTile({ pattern }: { pattern: PatternSpec }) {
  const mask = `url("data:image/svg+xml,${encodeURIComponent(tileSvg(pattern))}")`;
  const ink = pattern.ink ?? 'var(--blazon-text)';
  const maskStyle = { WebkitMask: `${mask} 0 0 / ${pattern.size}px ${pattern.size}px repeat`, mask: `${mask} 0 0 / ${pattern.size}px ${pattern.size}px repeat` } as CSSProperties;
  return (
    <figure data-pattern={pattern.path} data-kind={pattern.kind} className="flex flex-col gap-2">
      <div className="relative aspect-square overflow-hidden rounded-lg border" style={{ background: pattern.ground ?? 'var(--blazon-bg)' }}>
        {/* The ink is a paint, so a gradient works too: the pattern is the mask, not a fill */}
        <div data-ink="" className="absolute inset-0" style={{ background: ink, ...maskStyle }} />
      </div>
      <figcaption className="flex flex-col text-[13px]">
        <span className="font-semibold">{pattern.name}</span>
        <span className="font-mono text-[11px] text-muted-foreground">
          {pattern.kind} · {pattern.size}px · {pattern.stroke}px
        </span>
      </figcaption>
    </figure>
  );
}

/**
 * The `<!-- blazon:patterns <path> ... -->` directive: each pattern group drawn as a tile, its ink (a color
 * or a gradient) shown through the repeat over its ground, at actual scale.
 */
export function PatternTiles({ data, args }: { data: BlazonData; args: string[] }) {
  const resolved = args.map((path) => patternsAt(data.tokens, path));
  return (
    <div className="not-prose my-4 grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2.5">
      {resolved
        .flatMap((r) => r.problems)
        .map((message) => (
          <Missing key={message}>{message}</Missing>
        ))}
      {resolved
        .flatMap((r) => r.found)
        .map((pattern) => (
          <PatternTile key={pattern.path} pattern={pattern} />
        ))}
    </div>
  );
}
