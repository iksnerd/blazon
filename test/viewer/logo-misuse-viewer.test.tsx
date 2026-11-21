// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import path from 'node:path';
import { REPO } from '../support/paths';
import { cleanup, render } from '@testing-library/react';
import { loadConfig } from '../../src/core/config/index.js';
import { compileBlazonData } from '../../src/core/index.js';
import { injectBlazonData } from '../../src/server/data-script.js';
import type { Asset, AssetMeta, DocItem, BlazonData } from '../../src/types/index.js';
import { App } from '../../src/viewer/App';

// `blazon:logo-misuse` draws the real logo misused in named ways (RFC 0001 §10), one captioned figure each.

const EXAMPLE = path.join(REPO, 'examples/blazon');
let data: BlazonData;
beforeAll(async () => {
  data = await compileBlazonData(await loadConfig(EXAMPLE), EXAMPLE);
});
afterEach(() => {
  cleanup();
  document.head.innerHTML = '';
  localStorage.clear();
});

const asset = (name: string, format: 'svg' | 'png', meta?: AssetMeta): Asset => ({
  id: `logos/${name}`,
  name,
  category: 'logos',
  filePath: `logos/${name}.${format}`,
  format,
  mediaType: format === 'svg' ? 'image/svg+xml' : 'image/png',
  url: `brand-assets/logos/${name}.${format}`,
  bytes: 1,
  width: 100,
  height: 40,
  ...(meta && { meta }),
});

function open(directive: string, assets: Asset[]) {
  const doc: DocItem = { slug: 'guide', filePath: 'docs/guide.md', title: 'Guide', order: 99, meta: {}, sections: [], markdown: '', html: `<h2>Logo</h2>${directive}` };
  const brand: BlazonData = { ...data, docs: [...data.docs, doc], assets: { ...data.assets, logos: assets, icons: [], custom: {}, all: assets } };
  document.head.innerHTML = new DOMParser().parseFromString(injectBlazonData('<html><head></head><body></body></html>', brand), 'text/html').head.innerHTML;
  window.location.hash = '#doc/guide';
  return render(<App />);
}

const figures = () => [...document.querySelectorAll<HTMLElement>('main figure[data-misuse-kind]')];
const kinds = () => figures().map((f) => f.dataset.misuseKind);
const figure = (kind: string) => document.querySelector<HTMLElement>(`main figure[data-misuse-kind="${kind}"]`)!;

const DEFAULT = ['stretch', 'rotate', 'outline', 'recolor', 'shadow', 'low-contrast'];
const CAPTION: Record<string, string> = {
  stretch: 'Do not stretch the logo',
  squash: 'Do not squash the logo',
  rotate: 'Do not rotate the logo',
  outline: 'Do not outline the logo',
  recolor: 'Do not recolor the logo',
  shadow: 'Do not add a shadow to the logo',
  crop: 'Do not crop the logo',
  'low-contrast': 'Do not place the logo on a background of similar lightness',
  'busy-background': 'Do not place the logo on a busy background',
};

describe('blazon:logo-misuse', () => {
  const mark = asset('mark', 'svg', { title: 'Acme mark', background: 'light', ink: '#112233' });

  it('draws the default six figures, in order, each with its caption', () => {
    open('<!-- blazon:logo-misuse logos/mark -->', [mark]);
    expect(kinds()).toEqual(DEFAULT);
    for (const kind of DEFAULT) expect(figure(kind).querySelector('figcaption')!.textContent).toContain(CAPTION[kind]);
  });

  it('draws every kind the directive names, and the directive overrides the sidecar list', () => {
    open('<!-- blazon:logo-misuse logos/mark squash crop busy-background rotate -->', [{ ...mark, meta: { ...mark.meta, misuse: ['shadow'] } }]);
    expect(kinds()).toEqual(['squash', 'crop', 'busy-background', 'rotate']);
    for (const kind of kinds()) expect(figure(kind!).querySelector('figcaption')!.textContent).toContain(CAPTION[kind!]);
  });

  it("draws the sidecar's list when the directive names no kinds", () => {
    open('<!-- blazon:logo-misuse logos/mark -->', [{ ...mark, meta: { ...mark.meta, misuse: ['crop', 'stretch'] } }]);
    expect(kinds()).toEqual(['crop', 'stretch']);
  });

  it('marks each figure as not allowed without colour: a cross glyph and a hidden label, and names it', () => {
    open('<!-- blazon:logo-misuse logos/mark -->', [mark]);
    for (const el of figures()) {
      const kind = el.dataset.misuseKind!;
      const flag = el.querySelector('[data-misuse-mark]')!;
      expect(flag.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
      expect(flag.querySelector('.sr-only')!.textContent).toBe('Not allowed');
      const caption = el.querySelector('figcaption')!;
      expect(caption.id).not.toBe('');
      expect(el.getAttribute('aria-labelledby')).toBe(caption.id);
      expect(el.querySelector('img')!.getAttribute('alt')).toContain('Acme mark');
      expect(el.querySelector('img')!.getAttribute('alt'), kind).not.toBe('Acme mark');
      expect(el.className).toContain('border-dashed');
    }
  });

  it("draws the real artwork in every figure, misused by CSS: the asset's own file", () => {
    open('<!-- blazon:logo-misuse logos/mark squash stretch rotate outline recolor shadow crop low-contrast busy-background -->', [mark]);
    for (const el of figures()) expect(el.querySelector('img')!.getAttribute('src')).toContain('brand-assets/logos/mark.svg');
    const style = (kind: string) => figure(kind).querySelector('img')!.getAttribute('style') ?? '';
    // A transform, not another box: an SVG keeps its proportions in whatever box it is given
    expect(style('stretch')).toMatch(/scale\(1\.6, 1\)/);
    expect(style('squash')).toMatch(/scale\(0\.55, 1\)/);
    expect(style('rotate')).toMatch(/rotate\(/);
    expect(style('outline')).toMatch(/drop-shadow\(/);
    expect(style('recolor')).toMatch(/hue-rotate\(/);
    expect(style('shadow')).toMatch(/drop-shadow\(/);
    expect(figure('crop').querySelector('[data-misuse-clip]')!.className).toContain('overflow-hidden');
    expect(figure('crop').querySelector('[data-misuse-clip] img')).not.toBeNull();
  });

  it('puts the logo on a surface of its own ink for low contrast, and on a repeating pattern for a busy background', () => {
    open('<!-- blazon:logo-misuse logos/mark low-contrast busy-background -->', [mark]);
    expect(figure('low-contrast').querySelector<HTMLElement>('[data-misuse-stage]')!.getAttribute('style')).toContain('#112233');
    expect(figure('busy-background').querySelector<HTMLElement>('[data-misuse-stage]')!.getAttribute('style')).toContain('repeating-linear-gradient');
  });

  it('with no ink, low contrast uses the surface the logo is not made for', () => {
    open('<!-- blazon:logo-misuse logos/mark low-contrast -->', [asset('mark', 'svg', { background: 'dark' })]);
    expect(figure('low-contrast').querySelector<HTMLElement>('[data-misuse-stage]')!.getAttribute('style')).toContain('--blazon-surface-light');
  });

  it("lists the author's own dont rules under the grid", () => {
    open('<!-- blazon:logo-misuse logos/mark -->', [{ ...mark, meta: { ...mark.meta, dont: ['Never place it on a photo', 'Never animate it'] } }]);
    const items = [...document.querySelectorAll('main [data-misuse-rules] li')].map((li) => li.textContent);
    expect(items).toEqual(['Never place it on a photo', 'Never animate it']);
  });

  it('shows no rules list when the sidecar has no dont', () => {
    open('<!-- blazon:logo-misuse logos/mark -->', [mark]);
    expect(document.querySelector('main [data-misuse-rules]')).toBeNull();
  });

  it.each([
    ['svg first', ['svg', 'png']],
    ['png first', ['png', 'svg']],
  ] as const)('draws one file of an id with several, the same whatever the order (%s)', (_name, order) => {
    open(
      '<!-- blazon:logo-misuse logos/mark stretch -->',
      order.map((format) => asset('mark', format, { title: 'Acme mark' })),
    );
    expect(figures()).toHaveLength(1);
    expect(figure('stretch').querySelector('img')!.getAttribute('src')).toContain('mark.svg');
  });

  it('says so when the logo is not there', () => {
    open('<!-- blazon:logo-misuse logos/nope -->', [mark]);
    expect(document.querySelector('main')!.textContent).toContain('No asset at logos/nope');
  });
});
