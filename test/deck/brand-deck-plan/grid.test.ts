import { describe, it, expect } from 'vitest';
import { GRID_MIN_AREA, gridFit } from '../../../src/shipped/brand-deck/plan/index.js';
import { assetOf, assetsOf, book, gridPage, grids, type J, kinds, type Options, page, planOf, section, shaped } from './helpers.js';

describe('grids: a `blazon:assets` directive is a grid of figures', () => {
  const deck = (markdown: string, directives: J[], assets: J[], categories: [string, J][] = [['social', {}]], opts: Options = {}) =>
    planOf(book([gridPage(markdown, directives)], assets, categories), null, opts);

  it('the assets of a directive are one grid slide titled by the heading above it', () => {
    const assets = [
      ['a', 'Post A'],
      ['b', 'Post B'],
    ].map(([n, t]) => shaped('social', n!, 1080, 1080, { title: t }));
    const slides = deck('# Social\n\n## Posts\n\nText.\n\n<!-- blazon:assets social a b -->\n', [assetsOf('social', 'a', 'b')], assets);
    expect(kinds(slides)).toEqual(['cover', 'contents', 'page', 'grid']);
    const grid = slides[3] as any;
    expect(grid.title).toBe('Posts');
    expect(grid.figures.map((f: any) => f.title)).toEqual(['Post A', 'Post B']);
    expect([grid.cols, grid.rows]).toEqual([2, 1]);
    expect(Object.keys(grid.figures[0]).sort()).toEqual(['background', 'file', 'format', 'height', 'local', 'title', 'width']);
  });

  it('a directive before any heading is titled by the page and the nearest heading wins at any level', () => {
    const assets = [shaped('social', 'a', 100, 100), shaped('social', 'b', 100, 100)];
    const markdown = '<!-- blazon:assets social a -->\n\n## Formats\n\n### The `square` post\n\n<!-- blazon:assets social b -->\n';
    expect(grids(deck(markdown, [assetsOf('social', 'a'), assetsOf('social', 'b')], assets)).map((s) => s.title)).toEqual(['Social', 'The square post']);
  });

  it('a heading or directive inside a fence or a code span counts for nothing', () => {
    const assets = [shaped('social', 'a', 100, 100)];
    const markdown = '## Real\n\n```md\n## Fake\n<!-- blazon:assets social z -->\n```\n\nWrite `<!-- blazon:assets social y -->` like so.\n\n<!-- blazon:assets social a -->\n';
    expect(grids(deck(markdown, [assetsOf('social', 'a')], assets)).map((s) => s.title)).toEqual(['Real']);
  });

  it('when the markdown does not hold the directives brand.json lists every grid is titled by the page', () => {
    expect(grids(deck('## Posts\n\nno directive here\n', [assetsOf('social', 'a')], [shaped('social', 'a', 100, 100)])).map((s) => s.title)).toEqual(['Social']);
  });

  it('directives under one heading share slides and a new heading starts another', () => {
    const assets = [...'abcd'].map((n) => shaped('social', n, 1080, 1080));
    const markdown = '## One\n\n<!-- blazon:assets social a -->\n\ntext\n\n<!-- blazon:assets social b -->\n\n## Two\n\n<!-- blazon:assets social c d -->\n';
    const slides = grids(deck(markdown, [assetsOf('social', 'a'), assetsOf('social', 'b'), assetsOf('social', 'c', 'd')], assets));
    expect(slides.map((s) => [s.title, s.figures.map((f) => f.file.slice(-5, -4))])).toEqual([
      ['One', ['a', 'b']],
      ['Two', ['c', 'd']],
    ]);
  });

  it('a directive with no names is the whole category and a name with no asset draws nothing', () => {
    const assets = [shaped('social', 'a', 100, 100), shaped('social', 'b', 100, 100), shaped('other', 'z', 100, 100)];
    const every = deck('## T\n\n<!-- blazon:assets social -->\n', [assetsOf('social')], assets);
    expect(grids(every)[0]!.figures.map((f) => f.title)).toEqual(['A', 'B']);
    const none = deck('## T\n\n<!-- blazon:assets social nope -->\n<!-- blazon:assets missing -->\n', [assetsOf('social', 'nope'), assetsOf('missing')], assets);
    expect(grids(none)).toEqual([]);
  });

  it('tall pictures go three to a slide, squares up to six, and a longer run is shared evenly (seven squares are four and three)', () => {
    const tall = Array.from({ length: 4 }, (_, n) => shaped('social', `t${n}`, 1080, 1920));
    expect(grids(deck('## Stories\n\n<!-- blazon:assets social -->\n', [assetsOf('social')], tall)).map((s) => [s.title, s.figures.length])).toEqual([
      ['Stories', 2],
      ['Stories (continued)', 2],
    ]);
    const squares = Array.from({ length: 7 }, (_, n) => shaped('social', `s${n}`, 1080, 1080));
    expect(grids(deck('## Posts\n\n<!-- blazon:assets social -->\n', [assetsOf('social')], squares)).map((s) => [s.figures.length, s.cols, s.rows])).toEqual([
      [4, 2, 2],
      [3, 3, 1],
    ]);
  });

  it('figures keep the order of the directive and none is drawn smaller than the floor', () => {
    const mixed = [shaped('social', 'story', 1080, 1920), shaped('social', 'feed', 1080, 1350), shaped('social', 'square', 1080, 1080), shaped('social', 'wide', 1920, 1080)];
    const slides = grids(deck('## M\n\n<!-- blazon:assets social story feed square wide -->\n', [assetsOf('social', 'story', 'feed', 'square', 'wide')], mixed));
    expect(slides.map((s) => s.figures.map((f) => f.title))).toEqual([
      ['Story', 'Feed'],
      ['Square', 'Wide'],
    ]);
    for (const s of slides)
      expect(
        gridFit(
          s.figures.map((f) => f.width! / f.height!),
          s.cols,
          s.rows,
        ),
      ).toBeGreaterThanOrEqual(GRID_MIN_AREA);
  });

  it('wide banners stack in rows so each keeps its width', () => {
    const wide = Array.from({ length: 2 }, (_, n) => shaped('social', `w${n}`, 1584, 396));
    const slide = grids(deck('## W\n\n<!-- blazon:assets social -->\n', [assetsOf('social')], wide))[0]!;
    expect([slide.cols, slide.rows]).toEqual([1, 2]);
  });

  it('an asset a section of the page draws is not drawn again in a grid and a grid does not repeat itself', () => {
    const assets = [...'abc'].map((n) => shaped('social', n, 100, 100));
    const markdown = '## T\n\n<!-- blazon:assets social a b -->\n\n<!-- blazon:section social b -->\n\n<!-- blazon:assets social b c c -->\n';
    const directives = [assetsOf('social', 'a', 'b'), section('social', 'b'), assetsOf('social', 'b', 'c', 'c')];
    const slides = deck(markdown, directives, assets);
    expect(kinds(slides)).toEqual(['cover', 'contents', 'page', 'grid', 'guideline', 'grid']);
    expect(grids(slides).map((s) => s.figures.map((f) => f.title))).toEqual([['A'], ['C']]);
    expect(slides[4]!.title).toBe('B');
  });

  it('a section and a grid come in the order of the page', () => {
    const assets = [...'ab'].map((n) => shaped('social', n, 100, 100));
    const directives = [assetsOf('social', 'a'), section('social', 'b')];
    expect(kinds(deck('## T\n\n<!-- blazon:assets social a -->\n<!-- blazon:section social b -->\n', directives, assets)).slice(3)).toEqual(['grid', 'guideline']);
    expect(kinds(deck('## T\n\n<!-- blazon:section social b -->\n<!-- blazon:assets social a -->\n', [...directives].reverse(), assets)).slice(3)).toEqual(['guideline', 'grid']);
  });

  it('a category in skip has no grid and the contents numbers what is left', () => {
    const assets = [shaped('social', 'a', 100, 100), shaped('keep', 'b', 100, 100)];
    const markdown = '## T\n\n<!-- blazon:assets social a -->\n\n<!-- blazon:assets keep b -->\n';
    const directives = [assetsOf('social', 'a'), assetsOf('keep', 'b')];
    const categories: [string, J][] = [
      ['social', {}],
      ['keep', {}],
    ];
    const slides = deck(markdown, directives, assets, categories, { skip: ['social'] });
    expect(grids(slides).map((s) => s.figures.map((f) => f.title))).toEqual([['B']]);
    expect((slides[1] as any).items).toEqual([{ title: 'Social', page: 3 }]);
    expect(kinds(deck(markdown, directives, assets, undefined, { skip: ['social', 'keep'] }))).toEqual(['cover', 'contents', 'page']);
  });

  it('the contents counts grid slides and the next part starts after them', () => {
    const assets = Array.from({ length: 4 }, (_, n) => shaped('social', `t${n}`, 1080, 1920));
    const pages = [gridPage('## S\n\n<!-- blazon:assets social -->\n', [assetsOf('social')]), page('after', 'After', 2)];
    const slides = planOf(book(pages, assets, [['social', {}]]));
    expect(kinds(slides)).toEqual(['cover', 'contents', 'page', 'grid', 'grid', 'page']);
    expect((slides[1] as any).items).toEqual([
      { title: 'Social', page: 3 },
      { title: 'After', page: 6 },
    ]);
  });

  it('a page with no assets directive plans the same slides as before', () => {
    const pages = [{ ...page('p', 'P', 1, [], [section('social', 'a'), { name: 'tokens', args: ['color.a'] }]), markdown: '## T\n\n<!-- blazon:section social a -->\n' }];
    expect(kinds(planOf(book(pages, [shaped('social', 'a', 100, 100)], [['social', {}]])))).toEqual(['cover', 'contents', 'page', 'guideline']);
  });

  it('a figure with no size is taken as square and carries its ground and local sentence', () => {
    const art = { ...assetOf('art', 'x', { background: 'dark' }), width: null, height: null };
    const slide = grids(deck('## T\n\n<!-- blazon:assets art -->\n', [assetsOf('art')], [art], [['art', { local: 'Run render-art.py.' }]]))[0]!;
    const figure = slide.figures[0]!;
    expect([figure.background, figure.local, figure.width]).toEqual(['dark', 'Run render-art.py.', null]);
  });
});
