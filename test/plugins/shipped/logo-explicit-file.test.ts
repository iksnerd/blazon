import { describe, it, expect } from 'vitest';
import { findByFile } from '../../../src/core/assets/representations.js';
import { readBrand as officeTemplate } from '../../../src/shipped/office-template/brand.js';
import { chooseLogos } from '../../../src/shipped/office-template/logo.js';
import { readBrand as socialCards } from '../../../src/shipped/social-cards/brand.js';
import { logoOf } from '../../../src/shipped/social-cards/render.js';

// A logo that names a FILE (`logo` in blazon.json, so `logo.onLight` and `logo.onDark` in brand.json) is that file in every reader,
// whatever the id's other files and whatever order brand.json lists them in. A logo that names an ID takes the reader's choice
// (RFC 0001 section 12).

const orders = <T,>(items: readonly T[]): T[][] =>
  items.length <= 1 ? [[...items]] : items.flatMap((item, i) => orders([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]));

const SETS: Record<string, string[]> = {
  'png and svg': ['png', 'svg'],
  'svg and webp': ['svg', 'webp'],
  'png, svg and webp': ['png', 'svg', 'webp'],
};

const fileOf = (format: string) => `brand-assets/logos/mark.${format}`;
const brandOf = (formats: readonly string[], logo: { onLight?: string; onDark?: string }, background: 'light' | 'dark' = 'light') => ({
  format: 'blazon-brand',
  version: 2,
  logo,
  assets: formats.map((format) => ({ id: 'logos/mark', name: 'mark', category: 'logos', file: fileOf(format), format, mediaType: `image/${format}`, bytes: 40, width: 10, height: 5, meta: { lockup: 'mark', background } })),
});

describe('findByFile', () => {
  const records = [
    { id: 'logos/mark', format: 'svg', file: 'brand-assets/logos/mark.svg' },
    { id: 'logos/mark', format: 'png', file: 'brand-assets/logos/mark.png' },
  ];
  it('finds the record of one file among the several of an id, and none for a file that is not there', () => {
    expect(findByFile(records, 'brand-assets/logos/mark.png')?.format).toBe('png');
    expect(findByFile(records, 'brand-assets/logos/other.png')).toBeUndefined();
  });
  it('matches the catalog path as well as the brand.json path', () => {
    expect(findByFile([{ id: 'a', format: 'png', filePath: 'logos/a.png' }], 'logos/a.png')?.id).toBe('a');
  });
});

describe('a logo that names a file is that file, for every set and every order', () => {
  for (const [label, formats] of Object.entries(SETS)) {
    for (const named of formats) {
      it(`blazon.office-template, ${label}, onLight names ${named}`, () => {
        for (const order of orders(formats)) {
          const read = officeTemplate(brandOf(order, { onLight: fileOf(named) }));
          expect(chooseLogos(read, {}).light?.file, order.join()).toBe(fileOf(named));
        }
      });
      it(`blazon.social-cards, ${label}, onLight names ${named}`, () => {
        for (const order of orders(formats)) {
          const logo = logoOf(socialCards(brandOf(order, { onLight: fileOf(named) })), 'onLight');
          expect([logo?.src, logo?.asset?.file], order.join()).toEqual([fileOf(named), fileOf(named)]);
        }
      });
    }
  }

  it('blazon.office-template takes onDark by file too', () => {
    const read = officeTemplate(brandOf(['svg', 'png'], { onDark: fileOf('png') }, 'dark'));
    expect(chooseLogos(read, {}).dark?.file).toBe(fileOf('png'));
  });
});

describe('a logo that names an id, or no file, takes the default order', () => {
  it('blazon.office-template: the `logo` option names an id, and a brand with no named file takes the logos folder', () => {
    for (const order of orders(SETS['png, svg and webp']!)) {
      const read = officeTemplate(brandOf(order, {}));
      expect(chooseLogos(read, { logo: 'logos/mark' }).light?.format, order.join()).toBe('svg');
      expect(chooseLogos(read, {}).light?.format, order.join()).toBe('svg');
    }
  });
});

describe('a file that is not there', () => {
  it('is not matched: social-cards keeps the name and has no asset, office-template falls back to the logos folder', () => {
    const brand = brandOf(['png', 'svg'], { onLight: fileOf('gif') });
    const logo = logoOf(socialCards(brand), 'onLight');
    expect([logo?.src, logo?.asset]).toEqual([fileOf('gif'), undefined]);
    expect(chooseLogos(officeTemplate(brand), {}).light?.format).toBe('svg');
  });
});
