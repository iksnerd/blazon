import { lengthInPx, type BrandAsset, type Format } from './brand.js';
import { MIN_CONTRAST, MIN_LOGO_CONTRAST } from './contrast.js';
import { NAME } from './request.js';
import { findingFor, type Finding } from '../shared/plugin.js';

export type { Finding };

// What a card is checked for, and the findings it answers with. Every finding's path is the card's file, `<id>.png`.

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const plugin = findingFor(NAME);
const finding = (code: string, severity: Finding['severity'], id: string, message: string): Finding => plugin(code, severity, `${id}.png`, `card "${id}": ${message}`);

export const contrastFinding = (id: string, ratio: number, alpha: number): Finding =>
  finding('card-text-contrast', 'error', id, `the headline is ${ratio.toFixed(1)}:1 against the picture even with the strongest scrim (${alpha}), under ${MIN_CONTRAST}:1`);

export const logoContrastFinding = (id: string, ratio: number): Finding =>
  finding(
    'card-logo-contrast',
    'error',
    id,
    `the logo is ${ratio.toFixed(1)}:1 against the picture under it, under ${MIN_LOGO_CONTRAST}:1; use a logo variant made for that surface (logo.onLight, logo.onDark), move the logo with anchor or logoCorner, or pick another background`,
  );

export const logoWidthFinding = (id: string, asked: number, least: number): Finding =>
  finding(
    'card-logo-width-clamped',
    'warning',
    id,
    `logoWidth asks for a logo ${Number(asked.toFixed(1))}px wide, under the ${Math.round(least)}px its minSize allows; it is drawn at ${Math.round(least)}px`,
  );

export const overflowFinding = (id: string, floor: number): Finding =>
  finding('card-text-overflow', 'error', id, `the headline does not fit the safe area at ${floor}px, the smallest type step; shorten it or use a larger format`);

/** What is wrong with the background image of a card: a generated one nobody has reviewed, and one too small for the format. */
export function backgroundFindings(id: string, asset: Pick<BrandAsset, 'id' | 'format' | 'width' | 'height' | 'meta'>, format: Pick<Format, 'width' | 'height'>): Finding[] {
  const found: Finding[] = [];
  // an asset without the `generated` provenance field counts as not generated
  const meta = asset.meta ?? {};
  const review = typeof meta.review === 'object' && meta.review !== null ? (meta.review as { status?: unknown }).status : undefined;
  if (meta.generated && review !== 'ok') {
    const why = review === undefined ? 'it has no review' : `review.status is ${JSON.stringify(review)}, not "ok"`;
    found.push(finding('card-background-generated-unreviewed', 'error', id, `the background ${asset.id} is generated and has not been reviewed (${why})`));
  }
  if (asset.format !== 'svg' && asset.width && asset.height) {
    const scale = Math.max(format.width / asset.width, format.height / asset.height);
    if (scale > 1) {
      found.push(
        finding(
          'card-background-small',
          'warning',
          id,
          `the background ${asset.id} is ${asset.width} x ${asset.height} px and the card needs ${format.width} x ${format.height} px, so it is enlarged ${scale.toFixed(1)} times`,
        ),
      );
    }
  }
  return found;
}

export interface LogoMeta {
  placement?: string[];
  minSize?: { width?: unknown; height?: unknown };
  clearSpace?: unknown;
  unit?: unknown;
}

export const CORNERS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const;
export type Corner = (typeof CORNERS)[number];

export interface LogoPlan {
  corner: Corner;
  rect: Rect;
  /** The space to keep free around the logo, in card px */
  clearSpace: number;
  /** Set when `logoWidth` asked for fewer px than the sidecar's `minSize`: what was asked (the logo is drawn at the minimum) */
  clampedFrom?: number;
}
/** A logo is this share of the card's width when its sidecar sets no larger minimum */
const LOGO_SHARE = 0.14;

/**
 * Where the logo goes and how big it is: in the first corner its sidecar lists (top left without one), inside the margin,
 * no smaller than its `minSize` in card px. Its `clearSpace` is stated in the artwork's own pixels (or in its `unit`), so it
 * grows with the logo. `ask` is the card's own choice: a `width` (px, or a share of the shorter side such as "22%") replaces the 14%
 * but never goes under the minimum, and a `corner` replaces the sidecar's and the text edge's.
 */
export function planLogo(
  format: Format,
  artwork: { width: number; height: number },
  meta: LogoMeta | undefined,
  textEdge?: 'top' | 'bottom',
  ask: { width?: number | string; corner?: Corner } = {},
): LogoPlan {
  const aspect = artwork.height / artwork.width;
  const minWidth = lengthInPx(meta?.minSize?.width) ?? 0;
  const minHeight = lengthInPx(meta?.minSize?.height) ?? 0;
  const least = Math.max(minWidth, minHeight / aspect);
  const asked = ask.width === undefined ? undefined : typeof ask.width === 'number' ? ask.width : (Math.min(format.width, format.height) * Number.parseFloat(ask.width)) / 100;
  // Never wider than the card: a logo that wide is outside the safe area and is reported as such, and the browser is not asked to draw it
  // at 1e9 px (the page runs out of memory and no card is drawn)
  const width = Math.min(format.width, Math.round(asked === undefined ? Math.max(least, format.width * LOGO_SHARE) : Math.max(least, asked)));
  // A percentage is a target and the minimum is part of how it lands ("22%, at least 120px"); only a width in px that is not honored is reported
  const clamped = typeof ask.width === 'number' && Math.round(ask.width) < Math.round(least);
  const height = Math.round(width * aspect);
  const listed = (meta?.placement ?? []).filter((c): c is Corner => CORNERS.includes(c as Corner));
  const first = listed[0] ?? 'top-left';
  // Text hanging from the top needs the logo at the bottom, and the other way round: the first listed corner on that edge, else the first corner mirrored
  const mirrored = `${first.startsWith('top') ? 'bottom' : 'top'}-${first.endsWith('left') ? 'left' : 'right'}` as Corner;
  const corner =
    ask.corner ??
    (textEdge === undefined || first.startsWith(textEdge === 'top' ? 'bottom' : 'top')
      ? first
      : (listed.find((c) => c.startsWith(textEdge === 'top' ? 'bottom' : 'top')) ?? mirrored));
  const x = corner.endsWith('left') ? format.margin : format.width - format.margin - width;
  const y = corner.startsWith('top') ? format.margin : format.height - format.margin - height;

  const space = meta?.clearSpace;
  let inArtwork: number | undefined;
  if (typeof space === 'object' && space !== null && 'units' in space && typeof (space as { units: unknown }).units === 'number') {
    inArtwork = (space as { units: number }).units * (lengthInPx(meta?.unit) ?? artwork.height / 2);
  } else {
    inArtwork = lengthInPx(space);
  }
  const clearSpace = inArtwork === undefined ? Math.round(height / 2) : inArtwork * (width / artwork.width);
  return { corner, rect: { x, y, width, height }, clearSpace, ...(clamped && { clampedFrom: ask.width as number }) };
}

const inflate = (r: Rect, by: number): Rect => ({ x: r.x - by, y: r.y - by, width: r.width + 2 * by, height: r.height + 2 * by });
const within = (inner: Rect, outer: Rect, slack = 0.5): boolean =>
  inner.x >= outer.x - slack && inner.y >= outer.y - slack && inner.x + inner.width <= outer.x + outer.width + slack && inner.y + inner.height <= outer.y + outer.height + slack;
const overlaps = (a: Rect, b: Rect): boolean => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** The logo as drawn: it must be in the safe area, its clear space must stay on the card, and the text must stay out of that space. */
export function logoFinding(id: string, drawn: { logo: Rect; clearSpace: number; text: Rect; safe: Rect; card: Rect; shared?: boolean }): Finding | undefined {
  if (!within(drawn.logo, drawn.safe))
    return finding('card-logo-clear-space', 'error', id, 'the logo leaves the safe area; use a larger format, a smaller logoWidth, or a smaller minimum size for the logo');
  const space = inflate(drawn.logo, drawn.clearSpace);
  if (!within(space, drawn.card)) {
    return finding(
      'card-logo-clear-space',
      'error',
      id,
      `the logo's clear space (${Math.round(drawn.clearSpace)}px) reaches past the edge of the card; widen social.format margin to at least that`,
    );
  }
  // On an edge the text shares with the logo the overlap has a code of its own: the fix is the layout (the corner, the alignment, the width), not the logo
  if (overlaps(space, drawn.text) && drawn.shared) {
    return finding(
      'card-text-logo-overlap',
      'error',
      id,
      `the text hangs from the same edge as the logo and is inside the logo's clear space (${Math.round(drawn.clearSpace)}px); put the logo in a corner on the other side of the text, make the logo narrower, or shorten the headline`,
    );
  }
  if (overlaps(space, drawn.text))
    return finding('card-logo-clear-space', 'error', id, `the text is inside the logo's clear space (${Math.round(drawn.clearSpace)}px); shorten it`);
  return undefined;
}

/** A part of the card the text and the logo stay out of, in percent of the card from its top left. `name` is set for a named zone. */
export interface KeepClear extends Rect {
  name?: 'avatar';
}

/**
 * The named zones. "avatar" is where the profile photo of a LinkedIn or X cover sits: the bottom left quarter of the width by
 * half of the height. Those numbers are a convention of those platforms, not a rule of blazon's, and a platform may change them.
 */
export const KEEP_CLEAR_ZONES = { avatar: { x: 0, y: 50, width: 25, height: 50 } } as const satisfies Record<string, Rect>;

/** Overlap up to this many px is not reported: the box of a line is a little taller than its glyphs, and a glyph may overhang its box */
export const KEEP_CLEAR_SLACK = 2;

/**
 * How far `box` reaches into `zone`, in px: the smaller of the overlap's width and height, so a box that only grazes a corner
 * counts as little as it intrudes. 0 when they are apart or only touch.
 */
export function intrusion(box: Rect, zone: Rect): number {
  const across = Math.min(box.x + box.width, zone.x + zone.width) - Math.max(box.x, zone.x);
  const down = Math.min(box.y + box.height, zone.y + zone.height) - Math.max(box.y, zone.y);
  return Math.max(0, Math.min(across, down));
}

const zoneName = (zone: KeepClear): string => `${zone.name ? `"${zone.name}" ` : ''}(x ${zone.x}%, y ${zone.y}%, ${zone.width}% by ${zone.height}%)`;

/**
 * The text and the logo against the zones the card keeps clear, in px of the card. `lines` are the boxes of the rendered lines of
 * the headline (and the accent rule above it) and of the subline, `logo` the logo's own box, not its clear space. One finding for
 * each part and zone it reaches more than `KEEP_CLEAR_SLACK` px into, with the deepest reach.
 */
export function keepClearFindings(
  id: string,
  drawn: { card: Pick<Rect, 'width' | 'height'>; zones: readonly KeepClear[]; lines: { headline: Rect[]; subline: Rect[] }; logo?: Rect },
): Finding[] {
  const found: Finding[] = [];
  for (const zone of drawn.zones) {
    const px: Rect = {
      x: (zone.x * drawn.card.width) / 100,
      y: (zone.y * drawn.card.height) / 100,
      width: (zone.width * drawn.card.width) / 100,
      height: (zone.height * drawn.card.height) / 100,
    };
    const reach = (boxes: readonly Rect[]) => Math.max(0, ...boxes.map((box) => intrusion(box, px)));
    for (const part of ['headline', 'subline'] as const) {
      const depth = reach(drawn.lines[part]);
      if (depth > KEEP_CLEAR_SLACK) {
        found.push(
          finding(
            'card-text-keep-clear',
            'error',
            id,
            `the ${part} reaches ${Math.round(depth)}px into the area kept clear ${zoneName(zone)}; shorten it, narrow the text, or move it with anchor and align`,
          ),
        );
      }
    }
    const depth = drawn.logo ? reach([drawn.logo]) : 0;
    if (depth > KEEP_CLEAR_SLACK) {
      found.push(
        finding(
          'card-logo-keep-clear',
          'error',
          id,
          `the logo reaches ${Math.round(depth)}px into the area kept clear ${zoneName(zone)}; move it with logoCorner, or make it narrower with logoWidth (not below the logo's minSize)`,
        ),
      );
    }
  }
  return found;
}
