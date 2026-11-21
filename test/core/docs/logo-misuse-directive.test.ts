import { describe, it, expect } from 'vitest';
import { DIRECTIVES, directiveFindings } from '../../../src/core/docs/directives.js';
import type { Asset, AssetCatalog, AssetMeta, DocItem } from '../../../src/types/index.js';

// blazon check on `blazon:logo-misuse` (RFC 0001 §10): an asset id, then optional misuse kinds.

const asset = (name: string, meta?: AssetMeta): Asset => ({
  id: `logos/${name}`,
  name,
  category: 'logos',
  filePath: `logos/${name}.svg`,
  format: 'svg',
  mediaType: 'image/svg+xml',
  url: `brand-assets/logos/${name}.svg`,
  bytes: 1,
  width: 100,
  height: 40,
  ...(meta && { meta }),
});

const mark = asset('mark', { misuse: ['crop'] });
const plain = asset('plain');
const catalog = (...assets: Asset[]): AssetCatalog => ({ logos: assets, icons: [], custom: {}, all: assets });
const doc = (markdown: string) => ({ slug: 'p', filePath: 'p.md', title: 'P', order: 1, meta: {}, markdown, html: '' }) as DocItem;
const found = (markdown: string) =>
  directiveFindings([doc(markdown)], { tokens: { items: [], groupMeta: [] }, assets: catalog(mark, plain), hasLogo: true }).map((f) => `${f.code}: ${f.message}`);

describe('blazon:logo-misuse', () => {
  it('is in the table', () => {
    expect(Object.keys(DIRECTIVES)).toContain('logo-misuse');
  });
  it('accepts a logo id alone, and a logo id with known kinds', () => {
    expect(found('<!-- blazon:logo-misuse logos/plain -->')).toEqual([]);
    expect(found('<!-- blazon:logo-misuse logos/mark stretch rotate -->')).toEqual([]);
  });
  it('reports an unknown kind as asset-misuse-unknown, with the allowed kinds', () => {
    const [first, ...more] = found('<!-- blazon:logo-misuse logos/mark stretch melt -->');
    expect(more).toEqual([]);
    expect(first).toMatch(/^asset-misuse-unknown: .*melt/);
    expect(first).toMatch(/stretch, squash, rotate, outline, recolor, shadow, crop, low-contrast, busy-background/);
  });
  it('fails on an unknown id like the other logo directives, and needs an id written category/name', () => {
    expect(found('<!-- blazon:logo-misuse logos/nope -->')[0]).toMatch(/^directive-invalid: .*no asset at logos\/nope/);
    expect(found('<!-- blazon:logo-misuse mark -->')[0]).toMatch(/"mark" is not an asset id; write category\/name/);
    expect(found('<!-- blazon:logo-misuse -->')[0]).toMatch(/needs at least one argument/);
  });
});
