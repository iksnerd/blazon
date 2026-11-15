import { describe, it, expect } from 'vitest';
import { assetOf, book, color, kinds, logoAsset, ofKind, page, planOf, section, titlesOf, type J } from './helpers.js';

describe('pages: a part for each page, in page order, with the token slides under the page whose section they belong to', () => {
  const FAMILY = { path: 'font.family.display', type: 'fontFamily', value: 'Inter', resolvedValue: ['Inter'], rawValue: [] };
  const STYLE = {
    path: 'type.display',
    type: 'typography',
    value: 'x',
    resolvedValue: { fontFamily: ['Inter'], fontSize: { value: 72, unit: 'px' }, fontWeight: 600 },
    rawValue: {},
  };
  const META = { unit: { value: 579, unit: 'px' }, clearSpace: { units: 1 } };

  it('a page is a divider with its title and description and a part of the contents', () => {
    const slides = planOf(book([page('intro', 'Introduction', 1, ['intro'], [], 'Who we are.')]));
    expect(kinds(slides)).toEqual(['cover', 'contents', 'page']);
    expect(slides[2]).toMatchObject({ title: 'Introduction', description: 'Who we are.' });
    expect((slides[1] as any).items).toEqual([{ title: 'Introduction', page: 3 }]);
  });

  it('a page with no description has none', () => {
    expect((planOf(book([page('intro', 'Introduction', 1)]))[2] as any).description).toBeNull();
  });

  it('pages come in their order and not the order of the list', () => {
    const slides = planOf(book([page('b', 'Second', 2), page('c', 'Third', 2.5), page('a', 'First', 1)]));
    expect(slides.slice(2).map((s) => s.title)).toEqual(['First', 'Second', 'Third']);
    expect((slides[1] as any).items).toEqual([
      { title: 'First', page: 3 },
      { title: 'Second', page: 4 },
      { title: 'Third', page: 5 },
    ]);
  });

  it('the token slides come under the page of their section', () => {
    const pages = [page('type', 'Typography', 3, ['typography']), page('logo', 'The logo', 1, ['logo']), page('color', 'Color System', 2, ['color'])];
    const slides = planOf(book(pages, [logoAsset('black', META)], [], [color('color.a.x', '#111111'), FAMILY, STYLE]));
    expect(kinds(slides)).toEqual(['cover', 'contents', 'page', 'logo', 'page', 'colors', 'page', 'fonts', 'type-scale']);
    expect((slides[1] as any).items).toEqual([
      { title: 'The logo', page: 3 },
      { title: 'Color System', page: 5 },
      { title: 'Typography', page: 7 },
    ]);
  });

  it('token slides no page claims follow the pages in a part of their own', () => {
    const slides = planOf(book([page('intro', 'Introduction', 1, ['intro'])], [logoAsset('black', META)], [], [color('color.a.x', '#111111')]));
    expect(kinds(slides)).toEqual(['cover', 'contents', 'page', 'logo', 'colors']);
    expect((slides[1] as any).items).toEqual([
      { title: 'Introduction', page: 3 },
      { title: 'Logo', page: 4 },
      { title: 'Colors', page: 5 },
    ]);
  });

  it('when two pages share a section the first takes its token slides', () => {
    const slides = planOf(book([page('logo-2', 'Logo, continued', 2, ['logo']), page('logo', 'Logo', 1, ['logo'])], [logoAsset('black', META)]));
    expect(kinds(slides)).toEqual(['cover', 'contents', 'page', 'logo', 'page']);
    expect(titlesOf(slides, 'page')).toEqual(['Logo', 'Logo, continued']);
  });

  it('the contents names the slide each page starts on', () => {
    const pages = [page('logo', 'Logo', 1, ['logo'], [section('usage', 'a', 'b')]), page('color', 'Color', 2, ['color']), page('x', 'Extra', 3)];
    const slides = planOf(book(pages, [logoAsset('black', META), assetOf('usage', 'a'), assetOf('usage', 'b')], [['usage', {}]], [color('color.a.x', '#111111')]));
    for (const item of (slides[1] as any).items) expect(slides[item.page - 1]!.title).toBe(item.title);
  });

  it("an asset a section directive lists is a slide with its sidecar's prose", () => {
    const meta = {
      title: 'Usage on backgrounds',
      description: 'Only on white or black.',
      traits: ['Flat'],
      do: ['Keep it flat'],
      dont: ['Place it on a photo'],
      background: 'dark',
      source: { doc: 'guidelines', locator: 'page 9' },
    };
    const slides = planOf(book([page('logo', 'Logo', 1, ['logo'], [section('usage', 'backgrounds')])], [assetOf('usage', 'backgrounds', meta)], [['usage', {}]]));
    expect(kinds(slides)).toEqual(['cover', 'contents', 'page', 'guideline']);
    const slide = slides[3] as any;
    expect(slide.title).toBe('Usage on backgrounds');
    expect([slide.file, slide.format, slide.width, slide.height]).toEqual(['brand-assets/usage/backgrounds.png', 'png', 800, 400]);
    expect([slide.background, slide.description, slide.traits, slide.do, slide.dont]).toEqual([
      'dark',
      'Only on white or black.',
      ['Flat'],
      ['Keep it flat'],
      ['Place it on a photo'],
    ]);
    expect(slide.source).toBe('Source: guidelines, page 9');
  });

  it('an asset with no sidecar is titled by its readable name and states nothing', () => {
    const slide = planOf(book([page('p', 'P', 1, [], [section('usage', 'clear-space')])], [assetOf('usage', 'clear-space')], [['usage', {}]]))[3] as any;
    expect(slide.title).toBe('Clear space');
    expect([slide.description, slide.traits, slide.do, slide.dont, slide.source, slide.background]).toEqual([null, [], [], [], null, 'light']);
  });

  it('a directive with names draws those assets in that order and one with none draws the category', () => {
    const assets = [assetOf('usage', 'a'), assetOf('usage', 'b'), assetOf('usage', 'c'), assetOf('other', 'z')];
    const categories: [string, J][] = [
      ['usage', {}],
      ['other', {}],
    ];
    expect(titlesOf(planOf(book([page('p', 'P', 1, [], [section('usage', 'c', 'a')])], assets, categories)), 'guideline')).toEqual(['C', 'A']);
    expect(titlesOf(planOf(book([page('p', 'P', 1, [], [section('usage')])], assets, categories)), 'guideline')).toEqual(['A', 'B', 'C']);
  });

  it('a name with no asset and a category with none draw nothing', () => {
    const slides = planOf(book([page('p', 'P', 1, [], [section('usage', 'nope'), section('missing')])], [assetOf('usage', 'a')], [['usage', {}]]));
    expect(kinds(slides)).toEqual(['cover', 'contents', 'page']);
  });

  it('the other directives draw nothing', () => {
    const directives = [
      { name: 'tokens', args: ['color.a'] },
      { name: 'icons', args: ['usage'] },
      { name: 'logo-usage', args: [] },
    ];
    expect(kinds(planOf(book([page('p', 'P', 1, [], directives)], [assetOf('usage', 'a')], [['usage', {}]])))).toEqual(['cover', 'contents', 'page']);
  });

  it('directives are followed in the order the page has them', () => {
    const slides = planOf(
      book(
        [page('p', 'P', 1, [], [section('two', 'x'), section('one', 'y')])],
        [assetOf('one', 'y'), assetOf('two', 'x')],
        [
          ['one', {}],
          ['two', {}],
        ],
      ),
    );
    expect(titlesOf(slides, 'guideline')).toEqual(['X', 'Y']);
  });

  it("what the guidelines leave open is on the page's divider once for each category", () => {
    const directives = [section('shots', 'a'), section('shots', 'b'), section('plain', 'c'), section('video', 'd')];
    const assets = [assetOf('shots', 'a'), assetOf('shots', 'b'), assetOf('plain', 'c'), assetOf('video', 'd')];
    const categories: [string, J][] = [
      ['shots', { notSpecified: ['Shot sizes', 'Retouching'], source: { doc: 'guidelines', locator: 'page 3' } }],
      ['plain', {}],
      ['video', { notSpecified: ['Length'] }],
    ];
    const slides = planOf(book([page('p', 'P', 1, [], directives)], assets, categories));
    expect(kinds(slides)).toEqual(['cover', 'contents', 'page', 'guideline', 'guideline', 'guideline', 'guideline']);
    expect((slides[2] as any).open).toEqual([
      { title: 'Shots', items: ['Shot sizes', 'Retouching'], source: 'Source: guidelines, page 3' },
      { title: 'Video', items: ['Length'], source: null },
    ]);
  });

  it('a page that leaves nothing open has an empty list', () => {
    const slides = planOf(book([page('p', 'P', 1, [], [section('plain', 'c')])], [assetOf('plain', 'c')], [['plain', {}]]));
    expect((slides[2] as any).open).toEqual([]);
    expect((planOf(book([page('p', 'P', 1)]))[2] as any).open).toEqual([]);
  });

  it('what a category leaves open is stated even when the directive lists no asset that exists', () => {
    const slides = planOf(book([page('p', 'P', 1, [], [section('shots', 'nope')])], [assetOf('shots', 'a')], [['shots', { notSpecified: ['Shot sizes'] }]]));
    expect(kinds(slides)).toEqual(['cover', 'contents', 'page']);
    expect((slides[2] as any).open.map((o: any) => o.title)).toEqual(['Shots']);
  });

  it('a category the book does not describe leaves nothing open', () => {
    const slides = planOf(book([page('p', 'P', 1, [], [section('shots')])], [assetOf('shots', 'a')], []));
    expect(kinds(slides)).toEqual(['cover', 'contents', 'page', 'guideline']);
    expect((slides[2] as any).open).toEqual([]);
  });

  it('a category kept out of git hands its sentence to the slide so a missing image can be explained', () => {
    const categories: [string, J][] = [
      ['art', { local: 'Run render-art.py to draw these.' }],
      ['plain', {}],
    ];
    const slides = planOf(book([page('p', 'P', 1, [], [section('art'), section('plain')])], [assetOf('art', 'a'), assetOf('plain', 'b')], categories));
    expect(ofKind(slides, 'guideline').map((s) => s.local ?? null)).toEqual(['Run render-art.py to draw these.', null]);
  });

  it('a page with no section still gets its divider and nothing else', () => {
    expect(kinds(planOf(book([page('p', 'P', 1)], [assetOf('usage', 'a')], [['usage', {}]])))).toEqual(['cover', 'contents', 'page']);
  });
});
