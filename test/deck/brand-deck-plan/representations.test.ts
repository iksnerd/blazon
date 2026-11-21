import { describe, it, expect } from 'vitest';
import { assetOf, assetsOf, book, brand, gridPage, kinds, logoAsset, ofKind, page, planOf, section, type J } from './helpers.js';

// An asset id with several files is one asset (RFC 0001 section 7): the deck draws it once, from the best format it can embed.

const orders = <T>(items: readonly T[]): T[][] =>
  items.length <= 1 ? [[...items]] : items.flatMap((item, i) => orders([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]));

const SETS: [string, string[], string][] = [
  ['png and svg', ['png', 'svg'], 'svg'],
  ['svg and webp', ['svg', 'webp'], 'svg'],
  ['png, svg and webp', ['png', 'svg', 'webp'], 'svg'],
  ['png and webp', ['png', 'webp'], 'png'],
  ['jpg and gif', ['gif', 'jpg'], 'jpg'],
];
const META = { title: 'Acme mark', lockup: 'mark', background: 'dark', description: 'The Acme mark.', clearSpace: { units: 1 }, unit: { value: 10, unit: 'px' } };
const files = (formats: readonly string[], name = 'acme-mark') => formats.map((format) => logoAsset(name, META, format));
const logos = (assets: J[]) => ofKind(planOf(brand([], { assets })), 'logo');

describe('a logo with several files is one logo slide', () => {
  for (const [label, formats, expected] of SETS) {
    it(`${label}: one slide drawing ${expected}, in every file order`, () => {
      for (const order of orders(formats)) {
        const slides = logos(files(order));
        expect(slides, order.join()).toHaveLength(1);
        expect([slides[0]!.file, slides[0]!.format], order.join()).toEqual([`brand-assets/logos/acme-mark.${expected}`, expected]);
        expect([slides[0]!.title, slides[0]!.background, slides[0]!.note, slides[0]!.clear_space_px]).toEqual(['Acme mark', 'dark', 'The Acme mark.', 10]);
      }
    });
  }

  it('a one-file id is one slide, as before', () => {
    expect(logos(files(['png'])).map((s) => s.file)).toEqual(['brand-assets/logos/acme-mark.png']);
  });

  it('two different ids are two slides, in the order of their first file', () => {
    const slides = logos([...files(['png'], 'zeta'), ...files(['svg', 'png'], 'alpha'), ...files(['png'], 'zeta-2')]);
    expect(slides.map((s) => s.file)).toEqual(['brand-assets/logos/zeta.png', 'brand-assets/logos/alpha.svg', 'brand-assets/logos/zeta-2.png']);
  });

  it('an id with no format the deck embeds keeps one slide, from its first file in the default order, and the deck reports it when it draws', () => {
    const slides = logos([logoAsset('acme-mark', META, 'tiff'), logoAsset('acme-mark', META, 'bmp')]);
    expect(slides.map((s) => s.file)).toEqual(['brand-assets/logos/acme-mark.bmp']);
  });

  it('a file the deck embeds wins over one it does not', () => {
    expect(logos([logoAsset('acme-mark', META, 'tiff'), logoAsset('acme-mark', META, 'gif')]).map((s) => s.format)).toEqual(['gif']);
  });

  it('avif is drawn only when the id has nothing else', () => {
    expect(logos(files(['avif', 'png'])).map((s) => s.format)).toEqual(['png']);
    expect(logos(files(['avif'])).map((s) => s.format)).toEqual(['avif']);
  });
});

describe('the other places the deck draws an asset take one file per id too', () => {
  const cat = [['usage', {}]] as [string, J][];
  it('a section directive gives one guideline slide per id, from the chosen file', () => {
    for (const order of orders(['png', 'svg'])) {
      const assets = order.map((format) => assetOf('usage', 'backgrounds', { title: 'Backgrounds' }, format));
      const slides = ofKind(planOf(book([page('p', 'P', 1, [], [section('usage')])], assets, cat)), 'guideline');
      expect(
        slides.map((s) => s.file),
        order.join(),
      ).toEqual(['brand-assets/usage/backgrounds.svg']);
    }
  });

  it('a section directive naming the asset finds the chosen file whatever order the files are in', () => {
    for (const order of orders(['png', 'svg'])) {
      const assets = order.map((format) => assetOf('usage', 'backgrounds', undefined, format));
      const slides = ofKind(planOf(book([page('p', 'P', 1, [], [section('usage', 'backgrounds')])], assets, cat)), 'guideline');
      expect(
        slides.map((s) => s.file),
        order.join(),
      ).toEqual(['brand-assets/usage/backgrounds.svg']);
    }
  });

  it('a grid draws the chosen file of an id', () => {
    for (const order of orders(['png', 'svg'])) {
      const assets = order.map((format) => assetOf('social', 'banner', undefined, format));
      const slides = planOf(book([gridPage('# Social\n\n<!-- blazon:assets social -->\n', [assetsOf('social')])], assets, [['social', {}]]));
      const figures = ofKind(slides, 'grid').flatMap((g) => g.figures);
      expect(
        figures.map((f) => f.file),
        order.join(),
      ).toEqual(['brand-assets/social/banner.svg']);
    }
  });

  it('a png logo and an svg logo of different ids are two logo slides', () => {
    expect(kinds(planOf(brand([], { assets: [logoAsset('a'), logoAsset('b', undefined, 'svg')] }))).filter((k) => k === 'logo')).toHaveLength(2);
  });
});
