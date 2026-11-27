// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import path from 'node:path';
import { REPO } from '../support/paths';
import { cleanup, render } from '@testing-library/react';
import { loadConfig } from '../../src/core/config/index.js';
import { compileBlazonData } from '../../src/core/index.js';
import { injectBlazonData } from '../../src/server/data-script.js';
import type { DocItem, BlazonData, TokenItem } from '../../src/types/index.js';
import { App } from '../../src/viewer/App';
import { isDarkPaint, logoOn } from '../../src/viewer/lib/brand';

// `blazon:logo-on` states a surface as dark by the same bar `blazon logo --on` holds its plain onDark file to: 3:1, or the level of a colorway that
// names the token for the onDark asset. On #808080 white is about 3.95:1, so a colorway at AA (4.5:1) turns the surface from dark to light.

const EXAMPLE = path.join(REPO, 'examples/blazon');
let data: BlazonData;
let grey: TokenItem;

beforeAll(async () => {
  const base = await compileBlazonData(await loadConfig(EXAMPLE), EXAMPLE);
  grey = { ...base.tokens.items.find((t) => t.type === 'color')!, path: 'color.acme.mid', value: '#808080', resolvedValue: '#808080', blazon: {} } as TokenItem;
  data = { ...base, tokens: { ...base.tokens, items: [...base.tokens.items, grey] } };
});
afterEach(() => {
  cleanup();
  document.head.innerHTML = '';
  localStorage.clear();
});

/** The brand with a colorway on the onDark asset that names the grey, at a level */
const withBar = (min: 'AA-large' | 'AA'): BlazonData => {
  const id = data.logo!.onDarkAsset!;
  const logos = data.assets.logos.map((a) => (a.id === id ? { ...a, meta: { ...a.meta, colorways: [{ name: 'Mid', on: 'color.acme.mid', min }] } } : a));
  return { ...data, assets: { ...data.assets, logos } };
};

function tile(brand: BlazonData) {
  const doc: DocItem = {
    slug: 'guide',
    filePath: 'docs/guide.md',
    title: 'Guide',
    order: 99,
    meta: {},
    sections: [],
    markdown: '',
    html: '<h2>On grey</h2><!-- blazon:logo-on color.acme.mid -->',
  };
  const withDoc = { ...brand, docs: [...brand.docs, doc] };
  document.head.innerHTML = new DOMParser().parseFromString(injectBlazonData('<html><head></head><body></body></html>', withDoc), 'text/html').head.innerHTML;
  window.location.hash = '#doc/guide';
  render(<App />);
  return document.querySelector<HTMLElement>('main [data-logo-on="color.acme.mid"]')!;
}

describe('the logo on a color token, with a colorway that raises the bar on onDark', () => {
  it('starts from a configured onDark asset', () => {
    expect(data.logo!.onDarkAsset).toBeTruthy();
  });

  it('is a dark surface at 3:1: white text and the onDark file', () => {
    expect(isDarkPaint(data, '#808080', grey)).toBe(true);
    const figure = tile(data);
    expect(figure.style.color).toBe('rgb(255, 255, 255)');
    expect(figure.querySelector('img')!.getAttribute('src')).toBe(data.logo!.onDark);
  });

  it('is a light surface when a colorway holds onDark to AA: black text and the onLight file, as `blazon logo --on` answers', () => {
    const raised = withBar('AA');
    expect(isDarkPaint(raised, '#808080', grey)).toBe(false);
    const figure = tile(raised);
    expect(figure.style.color).toBe('rgb(0, 0, 0)');
    expect(figure.querySelector('img')!.getAttribute('src')).toBe(data.logo!.onLight);
  });

  it('stays dark when the colorway names the same level as the default', () => {
    expect(isDarkPaint(withBar('AA-large'), '#808080', grey)).toBe(true);
  });

  it('picks the plain file by the same decision in logoOn', () => {
    expect(logoOn(withBar('AA'), '#808080', isDarkPaint(withBar('AA'), '#808080', grey), true, grey)).toBe(data.logo!.onLight);
  });
});
