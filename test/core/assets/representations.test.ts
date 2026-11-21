import { describe, it, expect } from 'vitest';
import { keepRepresentation, pickRepresentation, representationsOf, type Representation } from '../../../src/core/assets/representations.js';

// An id with several files is one asset whose files are its representations (RFC 0001 section 7). A reader that needs one file
// for the id asks here, so the answer does not depend on the order of the records.

const rec = (name: string, id = 'logos/mark'): Representation => {
  const extension = name.split('.').pop()!;
  return { id, format: extension === 'jpeg' ? 'jpg' : extension, filePath: `logos/${name}` };
};

/** Every order of a list. */
const orders = <T>(items: readonly T[]): T[][] =>
  items.length <= 1 ? [[...items]] : items.flatMap((item, i) => orders([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]));

const SETS = [
  ['mark.png', 'mark.svg'],
  ['mark.svg', 'mark.webp'],
  ['mark.png', 'mark.svg', 'mark.webp'],
  ['mark.gif', 'mark.jpg', 'mark.avif', 'mark.png'],
];

describe('representations', () => {
  it('orders by the default rule: svg, png, webp, jpg and jpeg, gif, then other formats by name, ties by file name', () => {
    const all = ['mark.avif', 'mark.gif', 'mark.jpeg', 'mark.webp', 'mark.png', 'mark.svg'].map((n) => rec(n));
    expect(representationsOf(all, 'logos/mark').map((r) => r.filePath)).toEqual([
      'logos/mark.svg',
      'logos/mark.png',
      'logos/mark.webp',
      'logos/mark.jpeg',
      'logos/mark.gif',
      'logos/mark.avif',
    ]);
    const jpegs = [rec('mark.jpg'), rec('mark.jpeg')];
    expect(representationsOf(jpegs.reverse(), 'logos/mark').map((r) => r.filePath)).toEqual(['logos/mark.jpeg', 'logos/mark.jpg']);
  });

  it('picks the same file whatever order the records are in, with no preference and with one', () => {
    for (const set of SETS) {
      const expectedDefault = pickRepresentation(
        set.map((n) => rec(n)),
        'logos/mark',
      );
      for (const order of orders(set)) {
        const records = order.map((n) => rec(n));
        expect(pickRepresentation(records, 'logos/mark'), order.join()).toEqual(expectedDefault);
        expect(pickRepresentation(records, 'logos/mark', { formats: ['webp', 'png'] })?.filePath, order.join()).toBe(
          set.includes('mark.webp') ? 'logos/mark.webp' : set.includes('mark.png') ? 'logos/mark.png' : undefined,
        );
      }
    }
  });

  it('takes the first format of the caller that the id has, and nothing when it has none', () => {
    const rasters = [rec('mark.png'), rec('mark.webp')];
    expect(pickRepresentation(rasters, 'logos/mark', { formats: ['svg'] })).toBeUndefined();
    expect(pickRepresentation(rasters, 'logos/other')).toBeUndefined();
    expect(pickRepresentation([rec('mark.png'), rec('mark.svg')], 'logos/mark', { formats: ['png', 'svg'] })?.format).toBe('png');
  });

  it('keeps one record for each id in a map, the best by the caller formats, whatever order they come in', () => {
    for (const order of orders(['mark.png', 'mark.svg', 'mark.webp'])) {
      const map = new Map<string, Representation>();
      for (const name of order) keepRepresentation(map, rec(name));
      expect(map.get('logos/mark')?.format, order.join()).toBe('svg');
      const raster = new Map<string, Representation>();
      for (const name of order) keepRepresentation(raster, rec(name), { formats: ['png', 'webp'] });
      expect(raster.get('logos/mark')?.format, order.join()).toBe('png');
    }
    const only = new Map<string, Representation>();
    keepRepresentation(only, rec('mark.avif'), { formats: ['png'] });
    expect(only.get('logos/mark')?.format).toBe('avif');
  });
});
