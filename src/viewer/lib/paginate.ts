/**
 * A measured block of a brand book page: its height on the slide, and whether it opens a section (and so a new
 * slide, such as a chapter's opener) or is a heading (which never ends a slide on its own).
 */
export interface Block {
  height: number;
  /** opener: alone on its slide (a chapter's title); section: starts a slide; heading: never ends one */
  kind?: 'opener' | 'section' | 'heading';
  /** A picture, a drawing or a set of cards rather than text */
  figure?: boolean;
  /** A table */
  table?: boolean;
  /** A paragraph: it may introduce the figure or table right after it */
  lead?: boolean;
  /** A later piece of a table or grid cut by rows: it starts a slide of its own (it carries a label at its top) and nothing joins it */
  continued?: boolean;
  /** How much shorter the block's pictures can be drawn, in px, without the figure being lost (the layout's squeezeFloor) */
  slack?: number;
}

/** What a block starts: a continued piece starts a slide as a section does, so that nothing is set above its label. */
const startOf = (block: Block): Block['kind'] => (block.continued ? 'section' : block.kind);

/**
 * The smallest factor a slide is drawn at. A slide prints at 0.75 pt per px, so the book's 20px body is 15 pt and is
 * still 13.5 pt at 0.9, and the smallest text the book sets (12px, a caption) is 8.1 pt: above the 10 pt a body and the
 * 8 pt a caption need to be read on paper. Below this a dense page is split across slides, not drawn smaller.
 */
export const MIN_SCALE = 0.9;

/**
 * A block joins the slide before, rather than start the next, when that slide then overflows by at most this share
 * (what MIN_SCALE allows); the slide is drawn smaller to fit. A note left alone, or an intro parted from its figure,
 * costs a slide otherwise.
 */
export const STRETCH = 1 / MIN_SCALE;

/**
 * Splits rows into runs, in order, for a block too tall for a slide (a table, a grid of figures). `heights` is each
 * row's own height, `first` the room the first run has, `rest` the room each later run has (less what it repeats, such
 * as a table's header). A run takes rows while they fit; a row taller than the room it has takes a run of its own, and
 * is the one a slide may still be drawn smaller for. Returns each run's `[start, end)` row indexes.
 */
export function chunkRows(heights: readonly number[], first: number, rest: number): [number, number][] {
  const runs: [number, number][] = [];
  let start = 0;
  let used = 0;
  heights.forEach((height, index) => {
    const room = runs.length === 0 ? first : rest;
    if (index > start && used + height > room) {
      runs.push([start, index]);
      start = index;
      used = 0;
    }
    used += height;
  });
  if (heights.length > start) runs.push([start, heights.length]);
  return runs;
}

/**
 * Like chunkRows, for a block set in `columns` side by side on each slide (a narrow table in two groups of rows, a grid):
 * a piece is a list of columns, each a `[start, end)` run of rows, read down the first and then down the next. The
 * pieces are balanced: the same cap on a column's height for each (the lowest that gives no more pieces than filling
 * them one after another would), and the columns of a piece are as even as the rows allow, so a slide is not left with
 * a full column beside an empty one, and the last one is not nearly empty.
 */
export function chunkColumns(heights: readonly number[], first: number, rest: number, columns: number): [number, number][][] {
  const sum = (from: number, to: number) => heights.slice(from, to).reduce((a, b) => a + b, 0);
  const fill = (cap: number): [number, number][][] => {
    const pieces: [number, number][][] = [];
    let cols: [number, number][] = [];
    let start = 0;
    let used = 0;
    const room = () => Math.min(cap, pieces.length === 0 ? first : rest);
    heights.forEach((height, index) => {
      if (index > start && used + height > room()) {
        cols.push([start, index]);
        start = index;
        used = 0;
        if (cols.length === columns) {
          pieces.push(cols);
          cols = [];
        }
      }
      used += height;
    });
    if (heights.length > start) cols.push([start, heights.length]);
    if (cols.length > 0) pieces.push(cols);
    return pieces;
  };
  const greedy = fill(Infinity);
  // the lowest cap that still fits in as many pieces: a binary search over the heights it can take
  let low = Math.max(0, ...heights);
  let high = Math.min(Math.max(first, rest, low), sum(0, heights.length));
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    if (fill(mid).length <= greedy.length) high = mid;
    else low = mid;
  }
  const even = fill(fill(low).length <= greedy.length ? low : high);
  // within a piece, the split that makes the tallest column shortest
  return even.map((cols) => {
    if (columns !== 2 || cols.length < 2) return cols;
    const [a, b] = [cols[0]![0], cols[1]![1]];
    let best = cols[0]![1];
    for (let at = a + 1; at < b; at++) if (Math.max(sum(a, at), sum(at, b)) < Math.max(sum(a, best), sum(best, b))) best = at;
    return [
      [a, best],
      [best, b],
    ];
  });
}

/** A slide of the print book: the indexes of the blocks on it, and the factor they are drawn at (1, or less when they would not fit). */
export interface Slide {
  blocks: number[];
  scale: number;
  /** split: the text in a column on the left, the figure in the two thirds on the right */
  layout?: 'split';
  /** A picture on it is drawn shorter than it would be alone, to fit the slide (fit() does it, to the room that is left) */
  squeeze?: boolean;
}

/** Blocks that must share a slide: a heading, or a run of them, with the block that follows. */
interface Unit {
  blocks: number[];
  height: number;
  section: boolean;
  opener: boolean;
  /** Starts with a heading: an intro to what follows */
  intro: boolean;
}

function units(blocks: readonly Block[], room: number): Unit[] {
  const out: Unit[] = [];
  let open: Unit | undefined;
  blocks.forEach((block, index) => {
    // A section or an opener starts a unit of its own: a heading waiting for its next block does not take it in
    if (open && (startOf(block) === 'section' || startOf(block) === 'opener')) {
      out.push(open);
      open = undefined;
    }
    const unit = open ?? { blocks: [], height: 0, section: startOf(block) === 'section', opener: block.kind === 'opener', intro: block.kind === 'heading' };
    unit.blocks.push(index);
    unit.height += block.height;
    // A heading waits for what follows; anything else closes the unit
    if (block.kind === 'heading' && !unit.opener) open = unit;
    else {
      out.push(unit);
      open = undefined;
    }
  });
  if (open) out.push(open);
  // A paragraph on its own that introduces a figure or a table (the figure or table starts the next unit) goes with it,
  // when the two fit one slide, stretched at most as far as a block may be: never a near-empty slide. A heading's intro
  // is parted from its figure only under the rule in paginate()
  const merged: Unit[] = [];
  for (const unit of out) {
    const prev = merged.at(-1);
    const first = blocks[unit.blocks[0]!]!;
    if (
      prev &&
      !prev.opener &&
      !unit.section &&
      !unit.opener &&
      prev.blocks.length === 1 &&
      blocks[prev.blocks[0]!]!.lead &&
      (first.figure || first.table) &&
      prev.height + unit.height <= room * STRETCH
    ) {
      prev.blocks.push(...unit.blocks);
      prev.height += unit.height;
    } else merged.push(unit);
  }
  return merged;
}

const slackOf = (unit: { blocks: readonly number[] }, blocks: readonly Block[]) => unit.blocks.reduce((sum, i) => sum + (blocks[i]!.slack ?? 0), 0);

/** A slide of blocks with no heading of its own, this share of a slide or less, is a leftover: a note or a small table that spilled. */
const LEFTOVER = 0.35;

/**
 * Joins each leftover to the slide before it, when the two fit a slide (stretched as far as a block may be), else to the
 * slide after it. A leftover is a slide of blocks with no heading of its own and no more than LEFTOVER of a slide; a
 * slide never takes one across a section or an opener, which start a slide on purpose, and a heading still moves on
 * with its block because a leftover has none.
 */
export function joinLeftovers(slides: readonly Slide[], blocks: readonly Block[], room: number): Slide[] {
  const out: Slide[] = slides.map((s) => ({ ...s, blocks: [...s.blocks] }));
  const height = (slide: Slide) => slide.blocks.reduce((sum, i) => sum + blocks[i]!.height, 0);
  const starts = (slide: Slide | undefined) => (slide ? startOf(blocks[slide.blocks[0]!]!) : undefined);
  const set = (slide: Slide, taken: number[], before: boolean, squeeze = false) => {
    slide.blocks = before ? [...taken, ...slide.blocks] : [...slide.blocks, ...taken];
    if (squeeze) {
      slide.squeeze = true;
      slide.scale = 1;
    } else slide.scale = Math.max(MIN_SCALE, Math.min(1, room / height(slide)));
  };
  const kept: Slide[] = [];
  out.forEach((slide, index) => {
    const leftover =
      slide.scale === 1 && slide.layout === undefined && slide.blocks.every((i) => blocks[i]!.kind === undefined && !blocks[i]!.continued) && height(slide) <= room * LEFTOVER;
    const prev = kept.at(-1);
    const next = out[index + 1];
    if (leftover && prev && starts(prev) !== 'opener' && height(prev) + height(slide) <= room * STRETCH) set(prev, slide.blocks, false);
    // or when the slide before takes it once its pictures are drawn a little shorter
    else if (leftover && prev && starts(prev) !== 'opener' && prev.scale === 1 && height(prev) + height(slide) - slackOf(prev, blocks) <= room)
      set(prev, slide.blocks, false, true);
    else if (leftover && next && starts(next) !== 'section' && starts(next) !== 'opener' && height(slide) + height(next) <= room * STRETCH) set(next, slide.blocks, true);
    else kept.push(slide);
  });
  return kept;
}

/**
 * Packs measured blocks into slides `room` high, in order: a slide fills before the next starts, a section opens a
 * new slide, a heading moves on with the block after it, a paragraph that introduces a figure or a table goes with it
 * when the two fit a slide, a block that overflows a slide by a ninth at most (MIN_SCALE) joins it
 * (drawn smaller), an intro (a heading and its text) moves on with the figure after it rather than end a slide
 * without it, and blocks that are taller than a slide together get one of their own, scaled to fit but not below MIN_SCALE
 * (the print book splits a table or a grid by rows first, so that only what cannot be split is drawn that small). A note
 * with no heading that would be left on a slide of its own joins the slide before it, or the one after (joinLeftovers).
 */
export function paginate(blocks: readonly Block[], room: number): Slide[] {
  const slides: Slide[] = [];
  let used = 0;
  // An opener's slide, and one drawn smaller, take nothing more
  let closed = false;
  const all = units(blocks, room);
  all.forEach((unit, index) => {
    const current = slides.at(-1);
    const next = all[index + 1];
    // An intro that would end this slide (fitting or stretching it) while the block after it starts the next one
    // alone: both go to the next slide
    const parted =
      unit.intro &&
      next !== undefined &&
      !next.section &&
      !next.opener &&
      used > 0 &&
      used + unit.height + next.height > room * STRETCH &&
      unit.height + next.height <= room * STRETCH;
    if (unit.opener || unit.height > room) {
      // An opener is a full-bleed page of its own, larger than a slide's room, and is never drawn smaller
      slides.push({ blocks: unit.blocks, scale: unit.opener ? 1 : Math.max(MIN_SCALE, room / unit.height) });
      closed = true;
    } else if (current && !closed && !parted && !unit.section && used + unit.height > room && used + unit.height <= room * STRETCH) {
      current.blocks.push(...unit.blocks);
      used += unit.height;
      current.scale = room / used;
    } else if (current && !closed && !parted && !unit.section && used + unit.height > room && used + unit.height - slackOf(unit, blocks) - slackOf(current, blocks) <= room) {
      // A figure that fits once its picture is a little shorter joins the slide, rather than take a slide to itself
      current.blocks.push(...unit.blocks);
      current.squeeze = true;
      used = room;
      closed = true;
    } else if (!current || closed || parted || (unit.section && current.blocks.length > 0) || used + unit.height > room) {
      slides.push({ blocks: [...unit.blocks], scale: 1 });
      used = unit.height;
      closed = false;
    } else {
      current.blocks.push(...unit.blocks);
      used += unit.height;
    }
  });
  return joinLeftovers(slides, blocks, room);
}

/** An intro this share of a slide or less, before a figure that does not fit under it, may sit beside the figure. */
const INTRO_SHARE = 0.5;
/** The share of a slide's width the figure takes beside an intro, which is how much shorter it draws. */
const FIGURE_COLUMN = 2 / 3;

/**
 * Sets a short intro (a slide of text only) beside the figure on the slide after it, when that slide holds the figure
 * alone and the figure fits in two thirds of the width: one slide, laid out in two columns, instead of two.
 */
export function pairIntros(slides: readonly Slide[], blocks: readonly Block[], room: number): Slide[] {
  const out: Slide[] = [];
  const height = (slide: Slide) => slide.blocks.reduce((sum, i) => sum + blocks[i]!.height, 0);
  for (let s = 0; s < slides.length; s++) {
    const intro = slides[s]!;
    const next = slides[s + 1];
    const figure = next?.blocks.length === 1 ? blocks[next.blocks[0]!] : undefined;
    const text = intro.blocks.every((i) => !blocks[i]!.figure && blocks[i]!.kind !== 'opener');
    if (next && figure?.figure && figure.kind !== 'opener' && !figure.continued && text && height(intro) <= room * INTRO_SHARE && figure.height * FIGURE_COLUMN <= room * STRETCH) {
      out.push({ blocks: [...intro.blocks, ...next.blocks], scale: 1, layout: 'split' });
      s++;
    } else out.push(intro);
  }
  return out;
}
