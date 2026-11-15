import { describe, it, expect } from 'vitest';
import { chunkColumns, chunkRows, joinLeftovers, MIN_SCALE, paginate, pairIntros, STRETCH, type Block, type Slide } from '../../src/viewer/lib/paginate';

// The print book lays the brand book out as fixed 16:9 slides. The browser measures each block of a page; this packs
// the measured heights into slides, so the contents can give exact page numbers and every slide has a footer.

const ROOM = 100;
const b = (height: number, kind?: Block['kind']): Block => ({ height, ...(kind && { kind }) });
/** A paragraph, which may introduce the figure or table after it, and a table */
const para = (height: number): Block => ({ height, lead: true });
const table = (height: number): Block => ({ height, table: true });
const ids = (blocks: Block[]) => paginate(blocks, ROOM).map((slide) => slide.blocks);

describe('paginate', () => {
  it('fills a slide before it starts the next', () => {
    expect(ids([b(50), b(50), b(50), b(30)])).toEqual([
      [0, 1],
      [2, 3],
    ]);
  });

  it('fits a block that fills the slide exactly', () => {
    // the third is longer than a quarter of a slide, so it does not join as a short tail
    expect(ids([b(60), b(40), b(30)])).toEqual([[0, 1], [2]]);
  });

  it('starts each section on a slide of its own', () => {
    expect(ids([b(10, 'section'), b(10), b(10, 'section'), b(10)])).toEqual([
      [0, 1],
      [2, 3],
    ]);
  });

  it('starts a section on its own slide even right after a section with nothing in it, such as a title band', () => {
    expect(ids([b(10, 'section'), b(10, 'section'), b(10)])).toEqual([[0], [1, 2]]);
  });

  it('gives an opener a slide to itself, however short, at full size', () => {
    expect(paginate([b(10, 'opener'), b(10), b(10)], ROOM).map((s) => [s.blocks, s.scale])).toEqual([
      [[0], 1],
      [[1, 2], 1],
    ]);
    expect(paginate([b(100, 'opener'), b(10)], ROOM).map((s) => [s.blocks, s.scale])).toEqual([
      [[0], 1],
      [[1], 1],
    ]);
    // an opener is a full-bleed page of its own, taller than a content slide's room: never drawn smaller
    expect(paginate([b(150, 'opener')], ROOM)[0]!.scale).toBe(1);
  });

  it('never leaves a heading at the foot of a slide: it moves on with what follows', () => {
    expect(ids([b(80), b(10, 'heading'), b(40)])).toEqual([[0], [1, 2]]);
  });

  it('gives a block taller than a slide one of its own, drawn smaller to fit but never below the floor', () => {
    const slides = paginate([b(30), b(105), b(30), b(200), b(30)], ROOM);
    expect(slides.map((s) => s.blocks)).toEqual([[0], [1], [2], [3], [4]]);
    // 105 is drawn at 100/105; 200 would be 0.5: it is drawn at the floor (the packer, in the print book, cuts such a block by rows first)
    expect(slides[1]!.scale).toBeCloseTo(100 / 105);
    expect(slides[3]!.scale).toBe(MIN_SCALE);
  });

  it('keeps a heading with the tall block after it, and scales the two together', () => {
    const slides = paginate([b(20, 'heading'), b(180)], ROOM);
    expect(slides.map((s) => s.blocks)).toEqual([[0, 1]]);
    expect(slides[0]!.scale).toBe(MIN_SCALE);
  });

  it('moves an intro to the next slide with the block after it, when that block would start the next slide alone', () => {
    // a heading and its text fit under the first block, the figure after them does not: all three move on together
    expect(ids([b(60), b(10, 'heading'), b(10), b(50)])).toEqual([[0], [1, 2, 3]]);
    // and when the three fit on one slide only by stretching it, they move on together, drawn smaller
    const stretched = paginate([b(60), b(10, 'heading'), b(10), b(90)], ROOM);
    expect(stretched.map((s) => s.blocks)).toEqual([[0], [1, 2, 3]]);
    expect(stretched[1]!.scale).toBeCloseTo(100 / 110);
    // unless they do not fit even then
    expect(ids([b(60), b(10, 'heading'), b(10), b(110)])).toEqual([[0, 1, 2], [3]]);
    // and a block that joins the slide by stretching keeps its intro where it is
    expect(ids([b(60), b(10, 'heading'), b(10), b(20)])).toEqual([[0, 1, 2, 3]]);
    // an intro does not stretch a full slide when the figure after it cannot follow
    expect(ids([b(90), b(10, 'heading'), b(10), b(50)])).toEqual([[0], [1, 2, 3]]);
  });

  it('moves a heading with the block after it from the foot of a slide, whatever that block is', () => {
    // a heading, then a figure that does not fit the room left under the heading
    expect(ids([b(80), b(10, 'heading'), { height: 60, figure: true }])).toEqual([[0], [1, 2]]);
    expect(ids([b(80), b(10, 'heading'), table(60)])).toEqual([[0], [1, 2]]);
    // a heading of any level, and a run of them, moves on together
    expect(ids([b(80), b(10, 'heading'), b(10, 'heading'), b(40)])).toEqual([[0], [1, 2, 3]]);
  });

  it('keeps a heading that opens the page with the block after it', () => {
    // the heading that opens a section starts the slide, and its block follows it
    expect(ids([b(80), b(10, 'section'), b(50)])).toEqual([[0], [1, 2]]);
    expect(ids([b(10, 'heading'), b(50)])).toEqual([[0, 1]]);
  });

  it('keeps a heading with a block that is taller than any slide, on a slide of their own, drawn smaller', () => {
    // nothing is gained by leaving the heading behind: a heading and its block that cannot fit one slide fall back to this
    const slides = paginate([b(70), b(20, 'heading'), b(180)], ROOM);
    expect(slides.map((s) => s.blocks)).toEqual([[0], [1, 2]]);
    expect(slides[1]!.scale).toBe(MIN_SCALE);
  });

  it('moves a paragraph that introduces a figure or a table with it, when the two fit a slide', () => {
    const fig: Block = { height: 60, figure: true };
    expect(ids([b(60), para(10), fig])).toEqual([[0], [1, 2]]);
    expect(ids([b(60), para(10), table(60)])).toEqual([[0], [1, 2]]);
    // when they would fit the slide before only by stretching it, they still move on together
    expect(ids([b(60), para(10), { height: 70, figure: true }])).toEqual([[0], [1, 2]]);
  });

  it('leaves a paragraph and its figure apart when the two do not fit a slide even stretched', () => {
    // 20 + 110 is over the quarter a slide may stretch by: the paragraph stays where it is
    expect(ids([b(60), para(20), { height: 110, figure: true }])).toEqual([[0, 1], [2]]);
  });

  it('leaves a paragraph that is not before a figure or a table, and a figure that is not after a paragraph', () => {
    expect(ids([b(60), para(10), b(60)])).toEqual([[0, 1], [2]]);
    expect(ids([b(60), b(10), { height: 60, figure: true }])).toEqual([[0, 1], [2]]);
    // a section starts its own slide whatever comes before it
    expect(ids([b(60), para(10), { height: 50, figure: true, kind: 'section' }])).toEqual([[0, 1], [2]]);
  });

  it('keeps a heading that ends the page, with nothing after it', () => {
    expect(ids([b(10), b(10, 'heading')])).toEqual([[0, 1]]);
  });

  it('lets a block join the slide before when that overflows it by a ninth at most (the floor), and draws the slide smaller', () => {
    // a short note after a full slide, and an intro with the large figure that follows it
    const tail = paginate([b(90), b(20)], ROOM);
    expect(tail.map((s) => s.blocks)).toEqual([[0, 1]]);
    expect(tail[0]!.scale).toBeCloseTo(100 / 110);
    const intro = paginate([b(20), b(90)], ROOM);
    expect(intro.map((s) => s.blocks)).toEqual([[0, 1]]);
    expect(intro[0]!.scale).toBeCloseTo(100 / 110);
    // exactly as far over as the floor allows still joins
    expect(ids([b(100), b(100 * (STRETCH - 1))])).toEqual([[0, 1]]);
  });

  it('starts a new slide when the slide would overflow by more than the floor allows', () => {
    expect(ids([b(90), b(22)])).toEqual([[0], [1]]);
    expect(ids([b(95), b(20), b(20)])).toEqual([[0], [1, 2]]);
    // a section still starts its own slide, however short
    expect(ids([b(90), b(20, 'section')])).toEqual([[0], [1]]);
  });

  it('makes no slide for no blocks', () => {
    expect(paginate([], ROOM)).toEqual([]);
  });
});

// An intro (a heading and its text) left alone on a slide, before a figure that does not fit under it, shares one slide
// with the figure instead: the text in a column on the left, the figure in the two thirds on the right.
describe('pairIntros', () => {
  const fig = (height: number): Block => ({ height, figure: true });
  const pair = (blocks: Block[]) => pairIntros(paginate(blocks, ROOM), blocks, ROOM).map((s) => [s.blocks, s.layout ?? 'stack']);

  it('sets a short intro beside the figure after it', () => {
    // the figure is 120 high across the slide, 80 across two thirds of it
    expect(pair([b(20, 'heading'), b(20), fig(120)])).toEqual([[[0, 1, 2], 'split']]);
  });

  it('leaves an intro that fills more than half a slide on its own', () => {
    expect(pair([b(20, 'heading'), b(40), fig(120)])).toEqual([
      [[0, 1], 'stack'],
      [[2], 'stack'],
    ]);
  });

  it('leaves a figure too tall for the slide even at two thirds of its width', () => {
    // 200 x 2/3 = 133, over the quarter a slide may stretch by
    expect(pair([b(20, 'heading'), b(20), fig(200)])).toEqual([
      [[0, 1], 'stack'],
      [[2], 'stack'],
    ]);
  });

  it('pairs only a text slide with a slide that holds one figure and nothing else', () => {
    expect(pair([b(20, 'heading'), fig(10), fig(120)])).toEqual([
      [[0, 1], 'stack'],
      [[2], 'stack'],
    ]);
    // the figure (90) does not fit under the intro (40), and the note after it shares the figure's slide
    expect(pair([b(20, 'heading'), b(20), fig(90), b(5)])).toEqual([
      [[0, 1], 'stack'],
      [[2, 3], 'stack'],
    ]);
  });

  it('never pairs across an opener', () => {
    expect(pair([b(20, 'heading'), b(20), { ...fig(120), kind: 'opener' }])).toEqual([
      [[0, 1], 'stack'],
      [[2], 'stack'],
    ]);
  });
});

// A note or a small table with no heading of its own, spilled onto a slide of its own, joins the slide before it when the
// two fit, else the slide after it. A heading keeps its block and a section its slide.
describe('leftovers', () => {
  it('joins the slide before it, even when that slide was drawn smaller and takes nothing else', () => {
    // 101 is a little over a slide, so it is a slide of its own and closed; the note fits it stretched by a ninth
    const slides = paginate([b(101), b(10)], ROOM);
    expect(slides.map((s) => s.blocks)).toEqual([[0, 1]]);
    expect(slides[0]!.scale).toBeCloseTo(100 / 111);
    // one line more and the two do not fit: the note keeps its slide
    expect(ids([b(101), b(11)])).toEqual([[0], [1]]);
  });

  it('does not take a section, a heading, or an opener for a leftover', () => {
    expect(ids([b(101), b(10, 'section')])).toEqual([[0], [1]]);
    expect(ids([b(101), b(10, 'heading'), b(10)])).toEqual([[0], [1, 2]]);
    expect(ids([b(101), b(10), b(10, 'opener')])).toEqual([[0, 1], [2]]);
    // and a slide of more than a third of a slide is not a leftover
    expect(ids([b(101), b(40)])).toEqual([[0], [1]]);
  });

  const slide = (...blocks: number[]): Slide => ({ blocks, scale: 1 });
  it('never joins a leftover to the slide of an opener', () => {
    expect(joinLeftovers([slide(0), slide(1)], [b(30, 'opener'), b(10)], ROOM).map((s) => s.blocks)).toEqual([[0], [1]]);
  });

  it('joins the slide after it when the one before has no room, in front of its blocks', () => {
    const blocks = [b(100), b(20), b(80)];
    expect(joinLeftovers([slide(0), slide(1), slide(2)], blocks, ROOM).map((s) => s.blocks)).toEqual([[0], [1, 2]]);
    // not a slide that opens a section, nor one that is full
    expect(joinLeftovers([slide(0), slide(1), slide(2)], [b(100), b(20), b(80, 'section')], ROOM).map((s) => s.blocks)).toEqual([[0], [1], [2]]);
    expect(joinLeftovers([slide(0), slide(1), slide(2)], [b(100), b(20), b(100)], ROOM).map((s) => s.blocks)).toEqual([[0], [1], [2]]);
  });
});

// A later piece of a cut table or grid carries a label at the top of its slide: it starts that slide, and nothing is set above it
describe('a continued piece', () => {
  const piece = (height: number): Block => ({ height, table: true, continued: true });
  const slide = (...blocks: number[]): Slide => ({ blocks, scale: 1 });

  it('starts a slide of its own, even when the slide before has room for it', () => {
    expect(ids([b(30), piece(30)])).toEqual([[0], [1]]);
    expect(ids([b(30), piece(30), b(30)])).toEqual([[0], [1, 2]]);
  });

  it('is never taken for a leftover, and nothing is moved in front of it', () => {
    // a small last piece does not join the full slide before it (that would put its label in the middle of a slide)
    expect(ids([table(100), piece(20)])).toEqual([[0], [1]]);
    expect(joinLeftovers([slide(0), slide(1), slide(2)], [b(100), piece(20), b(80)], ROOM).map((s) => s.blocks)).toEqual([[0], [1], [2]]);
    // a leftover before it does not move in front of it either
    expect(joinLeftovers([slide(0), slide(1), slide(2)], [b(100), b(20), piece(80)], ROOM).map((s) => s.blocks)).toEqual([[0], [1], [2]]);
  });

  it('is never set beside the text before it', () => {
    const blocks: Block[] = [b(20), { height: 90, figure: true, continued: true }];
    expect(pairIntros([slide(0), slide(1)], blocks, ROOM).map((s) => s.layout)).toEqual([undefined, undefined]);
    expect(pairIntros([slide(0), slide(1)], [b(20), { height: 90, figure: true }], ROOM).map((s) => s.layout)).toEqual(['split']);
  });
});

// A table or a grid taller than a slide is cut at its rows, in runs: what each slide of a continued table or grid holds.
describe('chunkRows', () => {
  it('fills a run with rows while they fit, and the later runs have their own room', () => {
    // rows of 30 in 100: three to a run; the first run has less room (a heading above it) and holds two
    expect(chunkRows(Array(8).fill(30), 70, 100)).toEqual([
      [0, 2],
      [2, 5],
      [5, 8],
    ]);
  });

  it('is one run when everything fits, and none for no rows', () => {
    expect(chunkRows([30, 30], 100, 100)).toEqual([[0, 2]]);
    expect(chunkRows([], 100, 100)).toEqual([]);
  });

  it('gives a row taller than the room a run of its own, and never an empty run', () => {
    expect(chunkRows([30, 150, 30], 100, 100)).toEqual([
      [0, 1],
      [1, 2],
      [2, 3],
    ]);
    expect(chunkRows([150, 30], 100, 100)).toEqual([
      [0, 1],
      [1, 2],
    ]);
    // a first run with no room at all still takes a row: the rows are all printed
    expect(chunkRows([30, 30], 0, 100)).toEqual([
      [0, 1],
      [1, 2],
    ]);
  });
});

// A block set in columns (a narrow table in two groups of rows): pieces of columns, balanced
describe('chunkColumns', () => {
  it('is chunkRows for one column', () => {
    for (const heights of [Array(7).fill(30), [30, 150, 30], [10, 20, 30, 40, 50, 60]])
      expect(chunkColumns(heights, 70, 100, 1)).toEqual(chunkRows(heights, 70, 100).map((run) => [run]));
  });

  it('puts two columns on a piece, as even as the rows allow, and keeps the order of the rows', () => {
    // 10 rows of 30, 3 to a column: one after the other 3 + 3 | 3 + 1; the last piece is evened to 2 + 2
    expect(chunkColumns(Array(10).fill(30), 100, 100, 2)).toEqual([
      [
        [0, 3],
        [3, 6],
      ],
      [
        [6, 8],
        [8, 10],
      ],
    ]);
    // a piece of one row has one column
    expect(chunkColumns([30], 100, 100, 2)).toEqual([[[0, 1]]]);
    expect(chunkColumns([], 100, 100, 2)).toEqual([]);
  });

  it('never makes a column taller than the room, nor more pieces than filling one after another', () => {
    for (let n = 1; n < 40; n++) {
      const heights = Array.from({ length: n }, (_, i) => 10 + ((i * 7) % 25));
      const pieces = chunkColumns(heights, 80, 100, 2);
      const plain = chunkColumns(heights, Infinity, Infinity, 2);
      expect(pieces.flat().flatMap(([a, b]) => heights.slice(a, b))).toEqual(heights);
      for (const [p, cols] of pieces.entries()) for (const [a, b] of cols) expect(heights.slice(a, b).reduce((x, y) => x + y, 0)).toBeLessThanOrEqual(p === 0 ? 80 : 100);
      expect(plain.length).toBe(1);
    }
  });
});

// Random chapters through the packer: what holds whatever the heights are
describe('paginate, on random chapters', () => {
  /** A small deterministic generator (mulberry32), so a failure can be run again */
  const random = (seed: number) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  /** A chapter of up to 25 blocks; a heading is always followed by a block of its own section; a few blocks are taller than a slide */
  function chapter(next: () => number): Block[] {
    const blocks: Block[] = [];
    const count = 1 + Math.floor(next() * 25);
    for (let i = 0; i < count; i++) {
      const roll = next();
      const height = 5 + Math.floor(next() * (next() < 0.1 ? 220 : 70));
      const last = i === count - 1;
      if (roll < 0.2 && !last) blocks.push(b(8 + Math.floor(next() * 12), 'heading'));
      else if (roll < 0.3 && (i === 0 || blocks.at(-1)!.kind !== 'heading')) blocks.push(b(height, 'section'));
      else if (roll < 0.4) blocks.push({ height, figure: true });
      else if (roll < 0.5) blocks.push({ height, table: true });
      else if (roll < 0.7) blocks.push(para(height));
      else blocks.push(b(height));
    }
    return blocks;
  }

  it('prints every block once and in order, starts a section on a slide, ends none on a heading, and draws none below the floor', () => {
    const next = random(20261110);
    for (let run = 0; run < 400; run++) {
      const blocks = chapter(next);
      const slides = pairIntros(paginate(blocks, ROOM), blocks, ROOM);
      expect(
        slides.flatMap((s) => s.blocks),
        `run ${run}`,
      ).toEqual(blocks.map((_, i) => i));
      for (const slide of slides) {
        expect(slide.scale, `run ${run}`).toBeGreaterThanOrEqual(MIN_SCALE - 1e-9);
        if (slide.blocks.length > 1)
          expect(
            blocks.slice(slide.blocks[0]! + 1, slide.blocks.at(-1)! + 1).every((x) => x.kind !== 'section'),
            `run ${run}`,
          ).toBe(true);
        // a leftover (no heading of its own, a third of a slide or less) stays alone only when the slide before it cannot take it
        const at = slides.indexOf(slide);
        const before = slides[at - 1];
        const total = slide.blocks.reduce((sum, i) => sum + blocks[i]!.height, 0);
        if (
          before &&
          slide.scale === 1 &&
          slide.layout === undefined &&
          before.layout === undefined &&
          blocks[before.blocks[0]!]!.kind !== 'opener' &&
          slide.blocks.every((i) => blocks[i]!.kind === undefined && total <= ROOM * 0.35)
        )
          expect(before.blocks.reduce((sum, i) => sum + blocks[i]!.height, 0) + total, `run ${run}: a leftover that fits the slide before it`).toBeGreaterThan(
            ROOM * STRETCH - 1e-9,
          );
        const end = slide.blocks.at(-1)!;
        if (blocks[end]!.kind === 'heading') expect(end, `run ${run}: a heading ends a slide`).toBe(blocks.length - 1);
        // a slide drawn smaller than the floor allows is one a block too tall to cut makes: slides of short blocks fit the room they stretch to
        const height = slide.blocks.reduce((sum, i) => sum + blocks[i]!.height, 0);
        if (slide.layout === undefined && slide.blocks.every((i) => blocks[i]!.height <= 40)) expect(height, `run ${run}`).toBeLessThanOrEqual(ROOM * STRETCH + 1e-9);
      }
    }
  });
});

describe('a figure whose picture can be drawn shorter', () => {
  const figure = (height: number, slack: number): Block => ({ height, figure: true, slack });

  it('joins the slide before it, marked to be squeezed, when it fits once the picture is shorter', () => {
    const slides = paginate([b(60), figure(80, 45)], ROOM);
    expect(slides.map((s) => s.blocks)).toEqual([[0, 1]]);
    expect(slides[0]).toMatchObject({ scale: 1, squeeze: true });
  });

  it('takes a slide of its own when even the shorter picture does not fit', () => {
    const slides = paginate([b(60), figure(80, 10)], ROOM);
    expect(slides.map((s) => s.blocks)).toEqual([[0], [1]]);
    expect(slides.some((s) => s.squeeze)).toBe(false);
  });
});
