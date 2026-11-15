import {
  GUIDE_BULLET,
  GUIDE_INSET,
  GUIDE_ITEM,
  GUIDE_LABEL,
  GUIDE_LEAD,
  GUIDE_PAIR_GAP,
  GUIDE_PANEL_MIN,
  GUIDE_PANELS,
  GUIDE_SIZES,
  GUIDE_SOURCE_LEAD,
  GUIDE_SPACE,
  MARGIN,
  NOTE_PT,
  PAGE,
  PANEL_BOTTOM,
  PANEL_GAP,
  PANEL_TOP,
} from './constants.js';
import { type GuideContent, type GuideOp, type Wrap } from './types.js';

/** Python's round(): halves go to the even neighbour */
function roundHalfEven(value: number): number {
  const floor = Math.floor(value);
  const diff = value - floor;
  if (diff === 0.5) return floor % 2 === 0 ? floor : floor + 1;
  return Math.round(value);
}

// `wrap(text, size, width)` breaks text into lines the way the deck will draw it. It is a parameter so the fitting below needs no
// browser and is the same arithmetic the drawing uses: the renderer draws the ops that guideOps returns.

/**
 * What an asset slide's text draws: ([(role, x, y, text)], height). y is the baseline, downward from the top of the text. A list
 * item is one op, role `bullet`, at the baseline of its first line, with its lines joined by a newline. The
 * description, the traits (a list, or with `line` one line of them, wrapped, joined by dots), then Do and Don't, stacked or
 * (columns 2) side by side when both are there.
 */
export function guideOps(content: GuideContent, size: number, width: number, columns: 1 | 2, wrap: Wrap, line = false): { ops: GuideOp[]; height: number } {
  const lead = size * GUIDE_LEAD;
  const ops: GuideOp[] = [];
  let y = GUIDE_INSET;

  const block = (items: string[], x: number, top: number, room: number, label?: string): number => {
    let at = top;
    if (label) {
      ops.push(['label', x, at + 12, label]);
      at += GUIDE_LABEL;
    }
    for (const item of items) {
      const lines = wrap(item, size, room - GUIDE_BULLET);
      // One op for the whole item, its lines joined by a newline: the deck sets it as one list item, so a wrapped line hangs under the text
      ops.push(['bullet', x + GUIDE_BULLET, at + size, lines.join('\n')]);
      at += lines.length * lead + GUIDE_ITEM;
    }
    return at + GUIDE_SPACE;
  };

  if (content.description) {
    const lines = wrap(content.description, size, width);
    lines.forEach((text, n) => ops.push(['text', 0, y + size + n * lead, text]));
    y += lines.length * lead + GUIDE_SPACE;
  }
  if (content.traits.length > 0 && line) {
    const lines = wrap(content.traits.join('  ·  '), size, width);
    lines.forEach((text, n) => ops.push(['item', 0, y + size + n * lead, text]));
    y += lines.length * lead + GUIDE_SPACE;
  } else if (content.traits.length > 0) {
    y = block(content.traits, 0, y, width);
  }
  if (columns === 2 && content.do.length > 0 && content.dont.length > 0) {
    const half = (width - GUIDE_PAIR_GAP) / 2;
    y = Math.max(block(content.do, 0, y, half, 'Do'), block(content.dont, half + GUIDE_PAIR_GAP, y, half, "Don't"));
  } else {
    for (const [label, key] of [
      ['Do', 'do'],
      ["Don't", 'dont'],
    ] as const)
      if (content[key].length > 0) y = block(content[key], 0, y, width, label);
  }
  return { ops, height: Math.max(y - GUIDE_SPACE, 0) };
}

/** The lines of an asset slide's source at this width, and the height they take below the text: none when it has no source. */
export function sourceRoom(slide: { source: string | null }, width: number, wrap: Wrap): { lines: string[]; height: number } {
  const lines = slide.source ? wrap(slide.source, NOTE_PT, width) : [];
  return { lines, height: lines.length * GUIDE_SOURCE_LEAD + (lines.length > 0 ? GUIDE_SPACE : 0) };
}

/** (x, width) of the text beside a panel `panel` points wide, or across the slide when there is no panel. */
export function guideGeometry(panel: number | null): { x: number; width: number } {
  if (panel === null) return { x: MARGIN, width: PAGE.width - 2 * MARGIN };
  const x = MARGIN + panel + PANEL_GAP;
  return { x, width: PAGE.width - MARGIN - x };
}

/**
 * The (panel width, point size) an asset slide is tried at, best first: the largest size at each width from the widest panel
 * down, then the next size. A panel narrower than its image needs is no narrower than the image (a tall image gives the text
 * room by it), but the first is always the standard panel, so a slide that fits as it always did is drawn as it always was.
 */
export function guideCandidates(slide: { width?: number | null; height?: number | null }): [number, number][] {
  const hug = slide.width && slide.height ? Math.max(GUIDE_PANEL_MIN, roundHalfEven(48 + ((PANEL_TOP - PANEL_BOTTOM - 48) * slide.width) / slide.height)) : undefined;
  const candidates: [number, number][] = [];
  for (const size of GUIDE_SIZES) {
    GUIDE_PANELS.forEach((panel, index) => {
      const candidate: [number, number] = [index > 0 && hug !== undefined ? Math.min(panel, hug) : panel, size];
      if (!candidates.some(([p, s]) => p === candidate[0] && s === candidate[1])) candidates.push(candidate);
    });
  }
  return candidates;
}
