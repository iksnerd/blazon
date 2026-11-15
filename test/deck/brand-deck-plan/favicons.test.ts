import { describe, it, expect } from 'vitest';
import { FAVICON_HEAD_CHARS, fitsUnderTable } from '../../../src/shipped/brand-deck/plan/index.js';
import { brand, color, type J, kinds, planOf } from './helpers.js';

describe('favicons: the part that follows the brand', () => {
  const data = (extra: J = {}): J => ({
    format: 'blazon-favicons',
    version: 1,
    symbol: 'logos/mark',
    colors: { ground: '#3F73F8', ink: '#FFFFFF' },
    views: [
      { id: 'tabs', title: 'Browser tabs', file: 'favicon-tabs.png', width: 2400, height: 680 },
      { id: 'masks', title: 'App icon masks', file: 'app-icon-masks.png', width: 2400, height: 600 },
    ],
    adaptive: { symbolReach: 0.2831, safeRadius: 0.3056 },
    files: [{ file: 'favicon.svg', size: 'vector', use: 'Tab icon' }],
    head: '<link rel="icon" href="/favicon.svg">\n',
    folder: '/out/blazon.favicons',
    ...extra,
  });

  it('no favicons is no part', () => {
    expect(kinds(planOf(brand()))).toEqual(['cover', 'contents']);
    expect(kinds(planOf(brand(), null))).toEqual(['cover', 'contents']);
  });

  it('the part follows the brand with a slide for each view then the files and the head snippet', () => {
    const slides = planOf(brand(), data());
    expect(kinds(slides)).toEqual(['cover', 'contents', 'page', 'favicon-view', 'favicon-view', 'favicon-files']);
    expect((slides[1] as any).items).toEqual([{ title: 'Favicons', page: 3 }]);
    expect((slides[3] as any).base).toBe('/out/blazon.favicons/favicons.json');
    expect((slides[2] as any).title).toBe('Favicons');
  });

  it('a short snippet goes under the files table, and a long table or snippet keeps its own slide', () => {
    const together = planOf(brand(), data()).find((s: any) => s.kind === 'favicon-files') as any;
    expect(together.head).toEqual(['<link rel="icon" href="/favicon.svg">']);
    const rows = Array.from({ length: 13 }, (_, i) => ({ file: `f${i}.png`, size: '16 x 16', use: 'Tab' }));
    expect(fitsUnderTable(13, 5)).toBe(true);
    expect(fitsUnderTable(13, 8)).toBe(false);
    expect(fitsUnderTable(13, 1)).toBe(true); // the colours need their own room beside a short snippet
    expect(fitsUnderTable(20, 5)).toBe(false);
    const apart = planOf(brand(), data({ files: rows, head: 'a\nb\nc\nd\ne\nf\ng\nh\n' }));
    expect(kinds(apart).slice(-2)).toEqual(['favicon-files', 'favicon-head']);
    expect((apart.find((s: any) => s.kind === 'favicon-files') as any).head).toBeUndefined();
  });

  it('a snippet with a line longer than its column holds, at the size it is set in, has the whole slide, so no line is cut', () => {
    const files = (head: string) => planOf(brand(), data({ head })).find((s: any) => s.kind === 'favicon-files') as any;
    const fits = '<link rel="icon" href="/favicon.svg" sizes="any" type="image/svg+xml">'.slice(0, FAVICON_HEAD_CHARS);
    expect(fits).toHaveLength(FAVICON_HEAD_CHARS);
    expect(files(fits).head).toEqual([fits]);
    const long = `${fits}x`;
    expect(files(long).head).toBeUndefined();
    expect(kinds(planOf(brand(), data({ head: long }))).slice(-2)).toEqual(['favicon-files', 'favicon-head']);
  });

  it('comes after the token parts', () => {
    const slides = planOf(brand([color('color.primary.indigo', '#635DFF')]), data());
    expect((slides[1] as any).items.map((item: any) => item.title)).toEqual(['Colors', 'Favicons']);
  });

  it('the masks slide says how far the symbol reaches', () => {
    const masks = planOf(brand(), data()).find((s: any) => s.file === 'app-icon-masks.png') as any;
    expect(masks.note).toContain("28.3% of the Android layer's width");
    expect(masks.note).toContain('30.6%');
  });

  it('a part an older favicons.json lacks leaves its slide out', () => {
    const old = data();
    for (const key of ['views', 'files', 'head']) delete old[key];
    expect(kinds(planOf(brand(), old))).toEqual(['cover', 'contents']);
  });
});
