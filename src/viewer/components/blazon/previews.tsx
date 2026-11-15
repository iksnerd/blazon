import type { ReactNode } from 'react';
import type { PreviewKind, TokenItem } from '../../../types/index.js';
import { toPx } from '@/lib/tokens/preview';

/** Previews draw into a box this size; anything smaller in reality is magnified to fit. */
const BOX = 96;

function Caption({ children }: { children: ReactNode }) {
  return <span className="font-mono text-[11px] text-muted-foreground">{children}</span>;
}

function Radius({ token }: { token: TokenItem }) {
  return <span data-preview="radius" className="block size-24 border-2 border-foreground" style={{ borderRadius: String(token.value) }} />;
}

/** A size or construction grid: the square at that many units, with a line per unit (or per 1/24 on big grids). */
function Square({ token }: { token: TokenItem }) {
  const n = Math.max(1, toPx(token.value) ?? 24);
  const step = n <= 48 ? 1 : n / 24;
  const lines = [];
  for (let i = step; i < n; i += step) {
    lines.push(<line key={`v${i}`} x1={i} y1={0} x2={i} y2={n} />, <line key={`h${i}`} x1={0} y1={i} x2={n} y2={i} />);
  }
  return (
    <span className="flex flex-col items-start gap-1">
      <svg data-preview="square" viewBox={`0 0 ${n} ${n}`} width={BOX} height={BOX} aria-hidden="true" className="text-foreground">
        <g stroke="currentColor" strokeOpacity="0.15" strokeWidth={n / BOX}>
          {lines}
        </g>
        <rect x={0} y={0} width={n} height={n} fill="none" stroke="currentColor" strokeWidth={(2 * n) / BOX} />
      </svg>
      <Caption>
        {n} × {n}
      </Caption>
    </span>
  );
}

/** A stroke width: a shape on a 24-unit icon grid, stroked at that weight and magnified with the grid. */
function Stroke({ token }: { token: TokenItem }) {
  const width = toPx(token.value) ?? 1;
  return (
    <span className="flex flex-col items-start gap-1">
      <svg data-preview="stroke" viewBox="0 0 24 24" width={BOX} height={BOX} aria-hidden="true" className="text-foreground">
        <rect x={0.25} y={0.25} width={23.5} height={23.5} fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth={0.25} />
        <g fill="none" stroke="currentColor" strokeWidth={String(width)} strokeLinecap="round" strokeLinejoin="round">
          <circle cx={12} cy={12} r={8} />
          <path d="M8.5 12.5l2.5 2.5 5-6" />
        </g>
      </svg>
      <Caption>×{BOX / 24} on a 24 grid</Caption>
    </span>
  );
}

function Tracking({ token }: { token: TokenItem }) {
  return (
    <span data-preview="tracking" className="font-heading text-2xl font-semibold" style={{ letterSpacing: String(token.value) }}>
      Identity
    </span>
  );
}

function FontSize({ token }: { token: TokenItem }) {
  return (
    <span className="block max-w-full overflow-hidden">
      <span data-preview="fontSize" className="block font-heading leading-none font-semibold" style={{ fontSize: String(token.value) }}>
        Aa
      </span>
    </span>
  );
}

/** A canvas or artboard: its frame, drawn to fit, labelled with its real size. */
function Frame({ token }: { token: TokenItem }) {
  const n = toPx(token.value);
  return (
    <span data-preview="frame" className="flex size-24 items-center justify-center rounded-sm border-2 border-dashed border-muted-foreground/60">
      <Caption>{n !== undefined ? `${n} × ${n}` : String(token.value)}</Caption>
    </span>
  );
}

/** An opacity: the brand's primary color at full strength next to the same color faded to the value. */
function Opacity({ token }: { token: TokenItem }) {
  return (
    <span data-preview="opacity" className="flex items-end gap-2">
      <span className="flex flex-col items-center gap-1">
        <span className="block size-10 rounded-md bg-primary" />
        <Caption>1</Caption>
      </span>
      <span className="flex flex-col items-center gap-1">
        <span data-faded className="block size-10 rounded-md bg-primary" style={{ opacity: Number(token.value) }} />
        <Caption>{String(token.value)}</Caption>
      </span>
    </span>
  );
}

/** A border: a corner path drawn with it, rounded caps and joins, magnified until the stroke is about 2px on screen. */
function Border({ token }: { token: TokenItem }) {
  const parts = token.parts ?? {};
  const width = toPx(parts.width ?? '1px') ?? 1;
  const scale = Math.min(10, Math.max(1, 2 / width));
  const v = BOX / scale;
  const dash = parts.style === 'dashed' ? `${width * 4} ${width * 3}` : parts.style === 'dotted' ? `0 ${width * 2}` : undefined;
  return (
    <span className="flex flex-col items-start gap-1">
      {/* A fixed light backdrop, not a theme color: a dark stroke must stay visible in dark mode too */}
      <svg data-preview="border" viewBox={`0 0 ${v} ${v}`} width={BOX} height={BOX} aria-hidden="true" className="rounded-md ring-1 ring-border" style={{ background: '#F4F5F6' }}>
        <path
          d={`M${v * 0.2} ${v * 0.8}L${v * 0.2} ${v * 0.2}L${v * 0.8} ${v * 0.2}`}
          fill="none"
          stroke={String(parts.color ?? 'currentColor')}
          strokeWidth={String(width)}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={dash}
        />
      </svg>
      <Caption>{scale > 1 ? `×${Math.round(scale * 10) / 10}` : 'actual size'}</Caption>
    </span>
  );
}

/** Anything else that measures: a bar as long as its magnitude. */
function Bar({ token }: { token: TokenItem }) {
  const px = Math.abs(toPx(token.value) ?? 0);
  return <span data-preview="bar" className="block h-3 max-w-full rounded-sm bg-primary" style={{ width: `${px}px` }} />;
}

const PREVIEWS: Record<PreviewKind, (props: { token: TokenItem }) => ReactNode> = {
  radius: Radius,
  square: Square,
  stroke: Stroke,
  tracking: Tracking,
  fontSize: FontSize,
  frame: Frame,
  opacity: Opacity,
  border: Border,
  bar: Bar,
};

export function Preview({ token, kind }: { token: TokenItem; kind: PreviewKind }) {
  const Component = PREVIEWS[kind];
  return <Component token={token} />;
}
