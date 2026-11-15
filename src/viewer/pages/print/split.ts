import { chunkColumns, chunkRows, STRETCH } from '@/lib/paginate';
import type { Placed } from './blocks';
import { CONTENT, LABEL_HEIGHT, ROOM } from './geometry';

/** A block cut into pieces that each fit a slide: copies of the block, and each one's height with the space around it. */
export interface Pieces {
  els: HTMLElement[];
  heights: number[];
}

/** Children whose tops differ by less than this are in one row of a grid */
const SAME_ROW = 2;

/** The rows a block can be cut at: a table's body rows, or what a grid or a list holds, a row of tiles being one. */
interface Rows {
  target: HTMLElement;
  /** Each row's elements */
  groups: HTMLElement[][];
  /** A table's header, which every piece repeats */
  head: HTMLElement | null;
}

const visible = (el: Element): el is HTMLElement => el instanceof HTMLElement && !['STYLE', 'SCRIPT'].includes(el.tagName) && el.getBoundingClientRect().height > 0;

function rowsOf(target: HTMLElement): Rows | null {
  if (target instanceof HTMLTableElement) {
    const rows = [...target.tBodies].flatMap((body) => [...body.rows]);
    return rows.length > 1 ? { target, groups: rows.map((row) => [row]), head: target.tHead } : null;
  }
  const groups: HTMLElement[][] = [];
  let top = -Infinity;
  for (const child of target.children) {
    if (!visible(child)) continue;
    const at = child.getBoundingClientRect().top;
    if (groups.length === 0 || at - top >= SAME_ROW) groups.push([child]);
    else groups.at(-1)!.push(child);
    top = at;
  }
  return groups.length > 1 ? { target, groups, head: null } : null;
}

/** A table, a list, or a grid (or a wrapping row) of tiles: what has rows. Not a stack of a figure's own parts. */
function hasRows(el: HTMLElement): boolean {
  if (el instanceof HTMLTableElement || el instanceof HTMLUListElement || el instanceof HTMLOListElement) return true;
  const { display, flexWrap } = getComputedStyle(el);
  return display.includes('grid') || (display.includes('flex') && flexWrap !== 'nowrap');
}

/**
 * The descendant of a block (or the block itself) with the most rows to cut at. A figure is one piece: its caption
 * stays with its picture, so nothing inside one is cut.
 */
function rowsIn(block: HTMLElement): Rows | null {
  let best: Rows | null = null;
  for (const el of [block, ...block.querySelectorAll<HTMLElement>('table, div, ul, ol, section')]) {
    if (!hasRows(el) || (el.closest('figure') !== null && block.contains(el.closest('figure')))) continue;
    const rows = rowsOf(el);
    if (rows && (!best || rows.groups.length > best.groups.length)) best = rows;
  }
  return best;
}

/** The indexes of an element below its ancestor, to find the same element again in a copy */
function pathTo(from: HTMLElement, to: HTMLElement): number[] {
  const path: number[] = [];
  for (let el: HTMLElement = to; el !== from; el = el.parentElement!) path.unshift([...el.parentElement!.children].indexOf(el));
  return path;
}

/**
 * Cuts a block that is too tall for a slide into pieces by rows, so a table or a grid is drawn at its own size over
 * several slides and not smaller on one. The block is measured where it is laid out (the flow) and copied, never
 * changed. The first piece has `first` px, the others `rest`. A table's header is in every piece; what comes before
 * the rows (a group's title) is in the first only and what comes after them (a note) in the last; a later piece has no
 * ids, and says `data-print-continued`, whose value is `heading`: the frame draws "<heading> (continued)" above it, and
 * each later piece is that much taller (LABEL_HEIGHT), which the rows of a piece are packed to leave room for. No heading,
 * no label and no room kept. `height` is the block's, with the space after it. Null when it has no rows to cut at, or fits.
 */
export function splitBlock(block: HTMLElement, height: number, first: number, rest: number, heading = ''): Pieces | null {
  const found = rowsIn(block);
  if (!found) return null;
  // A grid of marks that each took a whole row (a mark wider than 2 : 1 spans the grid) is laid out again in as many columns
  // as fit, in a copy beside the block, and cut there: the marks keep their size, and a slide holds a few rows of them
  // instead of two. The copy is taken out again at once, and the block is as it was.
  if (spansRows(found)) {
    const trial = block.cloneNode(true) as HTMLElement;
    let tile = trial;
    for (const step of pathTo(block, found.target)) tile = tile.children[step] as HTMLElement;
    for (const kid of tile.children) if (kid instanceof HTMLElement) kid.style.gridColumn = 'auto';
    block.after(trial);
    try {
      const pieces = cutRows(trial, height - block.getBoundingClientRect().height + trial.getBoundingClientRect().height, first, rest, heading, true);
      if (pieces) return pieces;
    } finally {
      trial.remove();
    }
  }
  return cutRows(block, height, first, rest, heading, false);
}

/** Whether a grid's tiles each take a whole row (so that setting them in columns shortens the grid) */
function spansRows({ target, groups }: Rows): boolean {
  return (
    !(target instanceof HTMLTableElement) &&
    getComputedStyle(target).display.includes('grid') &&
    groups.length > 1 &&
    groups.every((row) => row.length === 1 && row[0]!.classList.contains('col-span-full'))
  );
}

/** Whether every row of a grid but the last (which has no gap after it) is as tall as the first, within a pixel */
function uniform(extents: readonly number[]): boolean {
  return extents.length > 2 && extents.slice(0, -1).every((extent) => Math.abs(extent - extents[0]!) <= 1);
}

/** The gap between a table's two groups of rows */
const COLUMN_GAP = 48;

/**
 * Whether a table is narrow enough to set its rows in two groups side by side (each at its own width, so the rows keep
 * the height they were measured at), and plain enough to cut anywhere: no merged cells, no footer or caption, no table
 * inside it.
 */
function narrow({ target, groups }: Rows): boolean {
  return (
    target instanceof HTMLTableElement &&
    groups.length > 3 &&
    target.getBoundingClientRect().width * 2 + COLUMN_GAP <= CONTENT.width &&
    target.tFoot === null &&
    target.caption === null &&
    target.querySelector('[rowspan], [colspan], table table') === null
  );
}

/** A piece's rows in two groups of the same widths side by side, the header over each: the table's copy `at` is replaced by them. */
function inTwoGroups(at: HTMLTableElement, widths: number[], inFirst: number): HTMLElement {
  const second = at.cloneNode(true) as HTMLTableElement;
  const rows = (table: HTMLTableElement) => [...table.querySelectorAll('tbody tr')];
  rows(at)
    .slice(inFirst)
    .forEach((row) => row.remove());
  rows(second)
    .slice(0, inFirst)
    .forEach((row) => row.remove());
  const wrapper = document.createElement('div');
  wrapper.dataset.printColumns = '';
  wrapper.style.cssText = `display:flex;align-items:flex-start;gap:${COLUMN_GAP}px;margin-bottom:${getComputedStyle(at).marginBottom}`;
  for (const table of [at, second]) {
    for (const body of [...table.tBodies]) if (body.rows.length === 0) body.remove();
    const group = document.createElement('colgroup');
    for (const width of widths) group.append(Object.assign(document.createElement('col'), { style: `width:${width}px` }));
    table.prepend(group);
    table.style.cssText = `table-layout:fixed;width:${widths.reduce((a, b) => a + b, 0)}px;margin:0`;
    wrapper.append(table);
  }
  return wrapper;
}

function cutRows(block: HTMLElement, height: number, first: number, rest: number, heading: string, balanced: boolean): Pieces | null {
  const found = rowsIn(block);
  if (!found) return null;
  const { target, groups, head } = found;
  const top = block.getBoundingClientRect().top;
  const tops = groups.map((g) => g[0]!.getBoundingClientRect().top);
  const bottom = Math.max(...groups.at(-1)!.map((el) => el.getBoundingClientRect().bottom));
  const extents = tops.map((at, i) => (tops[i + 1] ?? bottom) - at);
  const prefix = tops[0]! - top;
  const suffix = Math.max(0, height - prefix - extents.reduce((a, b) => a + b, 0));
  // what a table's later pieces repeat: from the header's top to the first row
  const repeat = (head ? tops[0]! - head.getBoundingClientRect().top : 0) + (heading ? LABEL_HEIGHT : 0);
  const twoGroups = narrow(found);
  // A grid of tiles of one height has no row that wraps wider than it was measured, so the slack that guards a table's rows
  // (cut() takes it off the room) and the margin ROOM keeps are given back, and the gap after a piece's last row is not
  // counted: a row's extent includes the gap below it, which the last row of a slide does not have. Otherwise a row that
  // fits is left out and the slide is half empty, for what only a row that varies could need.
  const gap = tops.length > 1 ? tops[1]! - Math.max(...groups[0]!.map((el) => el.getBoundingClientRect().bottom)) : 0;
  const grace =
    !twoGroups && !balanced && !(target instanceof HTMLTableElement || target instanceof HTMLUListElement || target instanceof HTMLOListElement) && uniform(extents)
      ? SLACK + (CONTENT.height - ROOM) + Math.max(0, gap)
      : 0;
  // balanced: a grid set in columns, or a table in two groups, is cut in even pieces; a plain one fills a slide at a time
  const columns =
    twoGroups || balanced
      ? chunkColumns(extents, first - prefix, rest - repeat, twoGroups ? 2 : 1)
      : chunkRows(extents, first - prefix + grace, rest - repeat + grace).map((run) => [run]);
  const runs = columns.map((cols): [number, number] => [cols[0]![0], cols.at(-1)![1]]);
  if (runs.length < 2 && !(balanced || (twoGroups && columns[0]!.length > 1))) return null;
  const widths = twoGroups
    ? [...((head as HTMLTableSectionElement | null)?.rows[0] ?? (target as HTMLTableElement).tBodies[0]!.rows[0])!.cells].map((cell) => cell.getBoundingClientRect().width)
    : [];
  const path = pathTo(block, target);
  const els: HTMLElement[] = [];
  const heights: number[] = [];
  runs.forEach(([start, end], index) => {
    const copy = block.cloneNode(true) as HTMLElement;
    let at: HTMLElement = copy;
    const chain: HTMLElement[] = [copy];
    for (const step of path) chain.push((at = at.children[step] as HTMLElement));
    // the title before the rows only in the first piece, the note after them only in the last
    chain.forEach((el, level) => {
      const next = chain[level + 1];
      if (!next) return;
      const kids = [...el.children];
      const here = kids.indexOf(next);
      kids.forEach((kid, i) => {
        if ((i < here && index > 0) || (i > here && index < runs.length - 1)) kid.remove();
      });
    });
    const mine = new Set(groups.slice(start, end).flat());
    const copies =
      target instanceof HTMLTableElement ? [...at.querySelectorAll<HTMLElement>('tbody tr')] : [...at.children].filter((kid): kid is HTMLElement => kid instanceof HTMLElement);
    const originals = target instanceof HTMLTableElement ? groups.flat() : [...target.children].filter((kid): kid is HTMLElement => kid instanceof HTMLElement);
    copies.forEach((kid, i) => {
      if (!mine.has(originals[i]!)) kid.remove();
    });
    if (at instanceof HTMLTableElement) for (const body of [...at.tBodies]) if (body.rows.length === 0) body.remove();
    // a numbered list goes on from where the piece before it stopped
    if (at instanceof HTMLOListElement)
      at.start = (target as HTMLOListElement).start + originals.slice(0, originals.indexOf(groups[start]![0]!)).filter((kid) => kid.tagName === 'LI').length;
    let root = copy;
    const inColumns = columns[index]!;
    if (twoGroups && inColumns.length > 1 && at instanceof HTMLTableElement) {
      const groupsOf = inTwoGroups(at, widths, inColumns[0]![1] - start);
      if (at === copy) root = groupsOf;
      else at.replaceWith(groupsOf);
    }
    if (index > 0) {
      root.dataset.printContinued = heading;
      for (const el of root.querySelectorAll('[id]')) el.removeAttribute('id');
      root.removeAttribute('id');
    }
    els.push(root);
    const rowsHeight = Math.max(...inColumns.map(([a, b]) => extents.slice(a, b).reduce((x, y) => x + y, 0)));
    heights.push(rowsHeight + (index === 0 ? prefix : repeat) + (index === runs.length - 1 ? suffix : 0));
  });
  return { els, heights };
}

/** What the first piece of a block gives up of its slide: the paragraph that introduces it and the headings above that. */
function reserved(blocks: readonly Placed[], heights: readonly number[], at: number): number {
  let sum = 0;
  let i = at - 1;
  if (i >= 0 && blocks[i]!.lead) sum += heights[i--]!;
  while (i >= 0 && blocks[i]!.kind === 'heading') sum += heights[i--]!;
  return sum;
}

/** The heading a block continues under: the nearest heading above it in the chapter (a paragraph or two between is fine), else the first inside it. */
function headingOf(blocks: readonly Placed[], at: number): string {
  const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  for (let i = at - 1; i >= 0 && blocks[i]!.kind !== 'opener'; i--) {
    const el = blocks[i]!.el;
    if (/^H[2-6]$/.test(el.tagName) && text(el)) return text(el);
  }
  return text(blocks[at]!.el.querySelector('h2, h3, h4, h5, h6'));
}

/** Slack under a slide's room for what the measure of a piece cannot foresee (a row that wraps wider than it was measured) */
const SLACK = 16;

/**
 * Replaces each block that cannot share a slide, because it is taller than one even drawn at the smallest size (with the
 * headings before it), by its pieces from `splitBlock`: the first piece keeps the block's kind (it may open a section),
 * the others are plain blocks. Blocks that cannot be cut at rows stay as they are.
 */
export function cut(blocks: readonly Placed[], heights: readonly number[], room: number): { blocks: Placed[]; heights: number[] } {
  const out: Placed[] = [];
  const outHeights: number[] = [];
  blocks.forEach((block, i) => {
    const height = heights[i]!;
    const keep = reserved(blocks, heights, i);
    const pieces = block.kind !== 'opener' && keep + height > room * STRETCH ? splitBlock(block.el, height, room - keep - SLACK, room - SLACK, headingOf(blocks, i)) : null;
    if (!pieces) {
      out.push(block);
      outHeights.push(height);
      return;
    }
    pieces.els.forEach((el, n) => {
      out.push({
        el,
        origin: block.el,
        ...(n === 0 && block.kind && { kind: block.kind }),
        ...(n > 0 && { continued: true }),
        ...(block.figure && { figure: true }),
        ...(block.table && { table: true }),
      });
      outHeights.push(pieces.heights[n]!);
    });
  });
  return { blocks: out, heights: outHeights };
}
