import { describe, it, expect } from 'vitest';
import { directiveFindings } from '../../../src/core/docs/directives.js';
import type { Asset, AssetCatalog, DocItem } from '../../../src/types/index.js';

// A guideline page that draws an asset whose sidecar is still `needs-review` shows it as the brand's own.

const asset = (category: string, name: string, review?: 'ok' | 'needs-review'): Asset => ({
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
  ...(review && { meta: { review: { status: review, note: 'Demo' } } }),
});
const flagged = (name: string) => asset('logos', name, 'needs-review');
const plain = asset('logos', 'plain');
const partner = asset('partners', 'acme');

function catalog(...assets: Asset[]): AssetCatalog {
  const custom: Record<string, Asset[]> = {};
  for (const a of assets.filter((x) => x.category !== 'logos' && x.category !== 'icons')) (custom[a.category] ??= []).push(a);
  return { logos: assets.filter((a) => a.category === 'logos'), icons: [], custom, all: assets };
}

const doc = (markdown: string) => ({ slug: 'p', filePath: 'p.md', title: 'P', order: 1, meta: {}, markdown, html: '' }) as DocItem;
const warnings = (markdown: string, ...assets: Asset[]) =>
  directiveFindings([doc(markdown)], { tokens: { items: [], groupMeta: [] }, assets: catalog(...assets), hasLogo: true }).filter((f) => f.code === 'needs-review-in-use');

describe('needs-review-in-use', () => {
  it('is one warning for a page, with the count and the ids, for a folder, a name or an asset id', () => {
    expect(warnings('<!-- blazon:assets logos -->', flagged('a'), flagged('b'), plain)).toEqual([
      { code: 'needs-review-in-use', severity: 'warning', path: 'p.md', message: 'Shows 2 assets still marked needs-review: logos/a, logos/b' },
    ]);
    expect(warnings('<!-- blazon:assets logos a -->', flagged('a'), flagged('b'))[0]!.message).toBe('Shows 1 asset still marked needs-review: logos/a');
    expect(warnings('<!-- blazon:logo-partner logos/a partners/acme -->', flagged('a'), partner)).toHaveLength(1);
  });

  it('counts an asset once however often the page draws it, and names five at most', () => {
    expect(warnings('<!-- blazon:assets logos a --><!-- blazon:assets logos -->', flagged('a'))[0]!.message).toMatch(/^Shows 1 asset /);
    const many = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(flagged);
    expect(warnings('<!-- blazon:assets logos -->', ...many)[0]!.message).toBe('Shows 7 assets still marked needs-review: logos/a, logos/b, logos/c, logos/d, logos/e and 2 more');
  });

  it('treats a folder name like an object member as an asset folder that is not there, not as a crash', () => {
    for (const name of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      const findings = directiveFindings([doc(`<!-- blazon:assets ${name} -->`)], { tokens: { items: [], groupMeta: [] }, assets: catalog(flagged('a')), hasLogo: true });
      expect(findings.map((f) => f.code)).toContain('directive-invalid');
      expect(findings.some((f) => f.code === 'needs-review-in-use')).toBe(false);
    }
  });

  it('says nothing for an asset marked ok, one the page does not draw, or a directive in a code fence', () => {
    expect(warnings('<!-- blazon:assets logos -->', asset('logos', 'a', 'ok'), plain)).toEqual([]);
    expect(warnings('<!-- blazon:assets logos plain -->', flagged('a'), plain)).toEqual([]);
    expect(warnings('```\n<!-- blazon:assets logos -->\n```', flagged('a'))).toEqual([]);
  });
});
