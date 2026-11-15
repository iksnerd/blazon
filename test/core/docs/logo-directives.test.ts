import { describe, it, expect } from 'vitest';
import { DIRECTIVES, directiveFindings } from '../../../src/core/docs/directives.js';
import type { Asset, AssetCatalog, AssetMeta, DocItem } from '../../../src/types/index.js';

// blazon check on the logo directives (RFC 0001 §10): each one names assets, and the asset it draws must
// state the rule it draws.

const asset = (category: string, name: string, meta?: AssetMeta): Asset => ({
  id: `${category}/${name}`,
  name,
  category,
  filePath: `${category}/${name}.svg`,
  format: 'svg',
  mediaType: 'image/svg+xml',
  url: `brand-assets/${category}/${name}.svg`,
  bytes: 1,
  width: 100,
  height: 40,
  ...(meta && { meta }),
});

const px = (value: number) => ({ value, unit: 'px' as const });
const mark = asset('logos', 'mark', {
  unit: px(12),
  lockup: 'horizontal',
  placement: ['top-left'],
  clearSpace: { units: 1 },
  partnership: { gap: { units: 1 }, dividerHeight: px(40) },
});
const initiated = asset('logos', 'initiated', { unit: px(12), initiative: { name: 'Lab', mark: 'initiatives/lab', gap: { units: 2 } } });
const plain = asset('logos', 'plain');
const partner = asset('partners', 'acme');

function catalog(...assets: Asset[]): AssetCatalog {
  const custom: Record<string, Asset[]> = {};
  for (const a of assets.filter((x) => x.category !== 'logos' && x.category !== 'icons')) (custom[a.category] ??= []).push(a);
  return { logos: assets.filter((a) => a.category === 'logos'), icons: [], custom, all: assets };
}

const doc = (markdown: string) => ({ slug: 'p', filePath: 'p.md', title: 'P', order: 1, meta: {}, markdown, html: '' }) as DocItem;
const messages = (markdown: string, ...assets: Asset[]) =>
  directiveFindings([doc(markdown)], { tokens: { items: [], groupMeta: [] }, assets: catalog(...(assets.length ? assets : [mark, plain, partner])), hasLogo: true }).map(
    (f) => f.message,
  );

describe('the logo directives are in the table', () => {
  it('has the three new directives', () => {
    expect(Object.keys(DIRECTIVES)).toEqual(expect.arrayContaining(['logo-lockups', 'logo-partner', 'logo-placement']));
  });
});

describe('blazon:logo-lockups', () => {
  it('accepts a folder whose logos state a lockup, whole or by name', () => {
    expect(messages('<!-- blazon:logo-lockups logos -->')).toEqual([]);
    expect(messages('<!-- blazon:logo-lockups logos mark -->')).toEqual([]);
  });
  it('rejects an unknown folder or name', () => {
    expect(messages('<!-- blazon:logo-lockups nope -->')[0]).toMatch(/no asset at nope/);
    expect(messages('<!-- blazon:logo-lockups logos nope -->')[0]).toMatch(/no asset at logos\/nope/);
  });
  it('rejects a folder where no logo states a lockup', () => {
    expect(messages('<!-- blazon:logo-lockups logos -->', plain)[0]).toMatch(/no asset at logos states a lockup in its sidecar/);
  });
  it('needs a folder', () => {
    expect(messages('<!-- blazon:logo-lockups -->')[0]).toMatch(/needs at least one argument/);
  });
});

describe('blazon:logo-partner', () => {
  it('accepts a logo with a partnership rule and a partner, which may sit in another folder', () => {
    expect(messages('<!-- blazon:logo-partner logos/mark partners/acme -->')).toEqual([]);
  });
  it('rejects an asset that does not exist', () => {
    expect(messages('<!-- blazon:logo-partner logos/nope partners/acme -->')[0]).toMatch(/no asset at logos\/nope/);
    expect(messages('<!-- blazon:logo-partner logos/mark partners/nope -->')[0]).toMatch(/no asset at partners\/nope/);
  });
  it('rejects a logo that states no partnership', () => {
    expect(messages('<!-- blazon:logo-partner logos/plain partners/acme -->')[0]).toMatch(/logos\/plain states no partnership in its sidecar/);
  });
  it('needs exactly two asset ids, each written category/name', () => {
    expect(messages('<!-- blazon:logo-partner logos/mark -->')[0]).toMatch(/needs 2 asset ids/);
    expect(messages('<!-- blazon:logo-partner logos/mark partners/acme logos/plain -->')[0]).toMatch(/needs 2 asset ids/);
    expect(messages('<!-- blazon:logo-partner mark partners/acme -->')[0]).toMatch(/"mark" is not an asset id; write category\/name/);
  });
});

describe('blazon:logo-placement', () => {
  it('accepts a logo that states a placement, with or without a URL', () => {
    expect(messages('<!-- blazon:logo-placement logos/mark -->')).toEqual([]);
    expect(messages('<!-- blazon:logo-placement logos/mark example.com -->')).toEqual([]);
  });
  it('rejects an unknown asset and a logo that states no placement', () => {
    expect(messages('<!-- blazon:logo-placement logos/nope -->')[0]).toMatch(/no asset at logos\/nope/);
    expect(messages('<!-- blazon:logo-placement logos/plain -->')[0]).toMatch(/logos\/plain states no placement in its sidecar/);
  });
  it('needs one asset id and at most one URL', () => {
    expect(messages('<!-- blazon:logo-placement -->')[0]).toMatch(/needs at least one argument/);
    expect(messages('<!-- blazon:logo-placement logos/mark a.com b.com -->')[0]).toMatch(/takes an asset id and at most one text/);
  });
});

describe('blazon:logo-space still asks for a clear space or a minimum size', () => {
  it('accepts a logo that states one and rejects one that states neither', () => {
    expect(messages('<!-- blazon:logo-space logos -->')).toEqual([]);
    expect(messages('<!-- blazon:logo-space logos -->', plain)[0]).toMatch(/no asset at logos states a clearSpace or minSize in its sidecar/);
  });
});

describe('blazon:logo-initiative', () => {
  it('accepts a logo with an initiative rule', () => {
    expect(messages('<!-- blazon:logo-initiative logos/initiated -->', initiated, plain)).toEqual([]);
  });
  it('rejects an asset that does not exist', () => {
    expect(messages('<!-- blazon:logo-initiative logos/nope -->')[0]).toMatch(/no asset at logos\/nope/);
  });
  it('rejects a logo that states no initiative', () => {
    expect(messages('<!-- blazon:logo-initiative logos/plain -->')[0]).toMatch(/logos\/plain states no initiative in its sidecar/);
  });
  it('needs exactly one asset id, written category/name', () => {
    expect(messages('<!-- blazon:logo-initiative -->')[0]).toMatch(/needs at least one argument/);
    expect(messages('<!-- blazon:logo-initiative logos/initiated logos/plain -->', initiated, plain)[0]).toMatch(/needs 1 asset id, each written category/);
    expect(messages('<!-- blazon:logo-initiative initiated -->')[0]).toMatch(/"initiated" is not an asset id; write category\/name/);
  });
});
