import { describe, it, expect } from 'vitest';
import { DIRECTIVES, directiveFindings } from '../../../src/core/docs/directives.js';
import type { Asset, AssetCatalog, AssetMeta, DocItem } from '../../../src/types/index.js';

// blazon check on `blazon:logo-colorways` (RFC 0001 §10): one asset id, and the logo's sidecar must state colorways.

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

const mark = asset('mark', { colorways: [{ name: 'Mark on Paper', on: 'color.paper', min: 'AA' }] });
const plain = asset('plain');
const catalog = (...assets: Asset[]): AssetCatalog => ({ logos: assets, icons: [], custom: {}, all: assets });
const doc = (markdown: string) => ({ slug: 'p', filePath: 'p.md', title: 'P', order: 1, meta: {}, markdown, html: '' }) as DocItem;
const found = (markdown: string) =>
  directiveFindings([doc(markdown)], { tokens: { items: [], groupMeta: [] }, assets: catalog(mark, plain), hasLogo: true }).map((f) => `${f.code}: ${f.message}`);

describe('blazon:logo-colorways', () => {
  it('is in the table', () => {
    expect(Object.keys(DIRECTIVES)).toContain('logo-colorways');
  });
  it('accepts a logo that states colorways', () => {
    expect(found('<!-- blazon:logo-colorways logos/mark -->')).toEqual([]);
  });
  it('rejects a logo that states none', () => {
    expect(found('<!-- blazon:logo-colorways logos/plain -->')[0]).toMatch(/^directive-invalid: .*logos\/plain states no colorways in its sidecar/);
  });
  it('fails on an unknown id, an id not written category/name, no argument and an extra argument', () => {
    expect(found('<!-- blazon:logo-colorways logos/nope -->')[0]).toMatch(/no asset at logos\/nope/);
    expect(found('<!-- blazon:logo-colorways mark -->')[0]).toMatch(/"mark" is not an asset id; write category\/name/);
    expect(found('<!-- blazon:logo-colorways -->')[0]).toMatch(/directive-invalid/);
    expect(found('<!-- blazon:logo-colorways logos/mark extra -->')[0]).toMatch(/directive-invalid/);
  });
});
