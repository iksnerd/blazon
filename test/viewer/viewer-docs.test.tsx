// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { hasReference, referencePath } from '../support/reference';
import { REPO } from '../support/paths';
import { starterProject } from '../support/init-project';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { loadConfig } from '../../src/core/config/index.js';
import { compileBlazonData } from '../../src/core/index.js';
import { checkTokens } from '../../src/core/checker/index.js';
import { directiveFindings } from '../../src/core/docs/directives.js';
import { tileSvg } from '../../src/viewer/components/blazon/layout-previews';
import { injectBlazonData } from '../../src/server/data-script.js';
import type { Asset, DocItem, BlazonData, TokenItem } from '../../src/types/index.js';
import { App } from '../../src/viewer/App';
import { starterFacts } from '../support/starter-facts';

// The reference brand when a maintainer has it, else blazon's own: a describe that needs the reference is skipped without it
const PRESENT = hasReference('examples/auth0');
const EXAMPLE = PRESENT ? referencePath('examples/auth0') : path.join(REPO, 'examples/blazon');
let data: BlazonData;

beforeAll(async () => {
  data = await compileBlazonData(await loadConfig(EXAMPLE), EXAMPLE);
});

afterEach(() => {
  cleanup();
  document.head.innerHTML = '';
  localStorage.clear();
  vi.restoreAllMocks();
});

function openViewer(hash: string, brand: BlazonData = data) {
  document.head.innerHTML = new DOMParser().parseFromString(injectBlazonData('<html><head></head><body></body></html>', brand), 'text/html').head.innerHTML;
  window.location.hash = hash;
  return render(<App />);
}

function main() {
  return within(screen.getByRole('main'));
}

/** A doc as core compiles Markdown: inline code becomes <code>, a directive stays an HTML comment. */
function withDoc(html: string, meta: DocItem['meta'] = {}): BlazonData {
  const doc: DocItem = { slug: 'guide', filePath: 'docs/guide.md', title: 'Guide', order: 99, meta, sections: [], markdown: '', html };
  return { ...data, docs: [...data.docs, doc] };
}

describe.skipIf(!PRESENT)('asset downloads', () => {
  it('render the Download link without breaking button semantics', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    openViewer('#assets/logos');
    expect(main().getAllByRole('link', { name: 'Download' }).length).toBe(data.assets.logos.length);
    expect(errors.mock.calls.flat().join(' ')).not.toMatch(/nativeButton/);
  });
});

describe.skipIf(!PRESENT)('proportions', () => {
  function proportionFor(groupPath: string) {
    return main()
      .getAllByRole('heading', { level: 2, name: 'Proportions' })
      .map((h) => h.closest('section') as HTMLElement)
      .find((section) => within(section).queryByText(groupPath))!;
  }

  it('do not borrow the group description as their caption', () => {
    openViewer('#tokens/colors');
    const webUsage = data.tokens.groupMeta.find((g) => g.path === 'color.webUsage')!;
    expect(within(proportionFor('color.webUsage')).queryByText(webUsage.description!)).toBeNull();
  });

  it('draw a bucket that covers several tokens as one stripe per token, and list them', () => {
    openViewer('#tokens/colors');
    const section = proportionFor('color.webUsage');
    const bucket = [...section.querySelectorAll<HTMLElement>('[data-bucket]')].find((b) => b.textContent === '25% Light to medium neutrals')!;
    const stripes = [...bucket.querySelectorAll('[data-swatch]')].map((el) => (el as HTMLElement).style.background);
    expect(stripes).toEqual(['rgb(234, 236, 238)', 'rgb(189, 196, 207)']);
    expect(within(section).getByText('color.neutral.aluminiumLight')).toBeTruthy();
  });
});

describe('all tokens on a phone', () => {
  it('lists every token with its value in a list that needs no sideways scroll', () => {
    openViewer('#tokens/all');
    const list = main().getByRole('list', { name: 'Tokens' });
    const items = within(list).getAllByRole('listitem');
    expect(items.length).toBe(data.tokens.items.length);
    expect(within(items[0]!).getByText(String(data.tokens.items[0]!.value))).toBeTruthy();
  });
});

describe.skipIf(!PRESENT)('docs and tokens', () => {
  it('render live token previews where a doc asks for them', () => {
    openViewer('#doc/guide', withDoc('<h2>Palette</h2><!-- blazon:tokens color.primary.indigo type.h1 --><p>After.</p>'));
    const indigo = main().getByText('#635DFF').closest('[data-token]') as HTMLElement;
    expect(indigo.dataset.token).toBe('color.primary.indigo');
    expect(main().getByText('Inter Semibold 64/72px')).toBeTruthy();
    expect(main().getByText('After.')).toBeTruthy();
  });

  it('paint a gradient token as a swatch, like a color', () => {
    const gradient = data.tokens.items.find((t) => t.type === 'gradient')!;
    openViewer('#doc/guide', withDoc(`<h2>Gradients</h2><!-- blazon:tokens ${gradient.path} -->`));
    const card = main().getByText(gradient.path).closest('[data-token]') as HTMLElement;
    const swatch = card.querySelector<HTMLElement>('[data-swatch]');
    expect(swatch?.style.background).toMatch(/linear-gradient/);
  });

  it('expand a group path to every token under it', () => {
    openViewer('#doc/guide', withDoc('<h2>Icons</h2><!-- blazon:tokens icon.marketing.active -->'));
    expect(main().getByText('#827DFF')).toBeTruthy();
    expect(main().getByText('#C1BEFF')).toBeTruthy();
  });

  it('say so when a directive names no token, so authors catch typos', () => {
    openViewer('#doc/guide', withDoc('<h2>Oops</h2><!-- blazon:tokens color.primary.indgo -->'));
    expect(main().getByText('No token at color.primary.indgo')).toBeTruthy();
  });

  it('link token paths in the prose to the token, a group path to its first token', () => {
    openViewer('#doc/guide', withDoc('<p>Use <code>color.primary.indigo</code>, <code>icon.marketing.active.*</code> and <code>not.a.token</code>.</p>'));
    const indigo = main().getByRole('link', { name: /color\.primary\.indigo/ });
    expect(indigo.getAttribute('href')).toBe('#tokens/colors?token=color.primary.indigo');
    expect(
      main()
        .getByRole('link', { name: /icon\.marketing\.active\.\*/ })
        .getAttribute('href'),
    ).toMatch(/^#tokens\/colors\?token=icon\.marketing\.active\./);
    expect(main().getByText('not.a.token').closest('a')).toBeNull();
  });

  it('open the token page at the linked token', async () => {
    const scrolled: string[] = [];
    // jsdom has no scrollIntoView; record which element the viewer scrolls to
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled.push((this as HTMLElement).dataset.token ?? '');
    };
    openViewer('#tokens/colors?token=color.primary.indigo');
    await act(async () => {});
    expect(main().getByRole('heading', { level: 1, name: 'Colors' })).toBeTruthy();
    expect(scrolled).toContain('color.primary.indigo');
    expect(document.querySelector('[data-token="color.primary.indigo"]')!.classList.contains('blazon-flash')).toBe(true);
    delete (Element.prototype as Partial<Element>).scrollIntoView;
  });
});

/** A raster asset as core catalogs it, in a custom folder. */
function asset(category: string, name: string): Asset {
  return {
    id: `${category}/${name}`,
    name,
    category,
    filePath: `${category}/${name}.png`,
    format: 'png',
    mediaType: 'image/png',
    url: `brand-assets/${category}/${name}.png`,
    bytes: 1000,
    width: 800,
    height: 450,
  };
}

function withAssetsAndDoc(html: string): BlazonData {
  const usage = ['do-use-black-on-light', 'dont-stretch', 'dont-recolor'].map((n) => asset('logo-usage', n));
  const brand = withDoc(html);
  return { ...brand, assets: { ...brand.assets, custom: { ...brand.assets.custom, 'logo-usage': usage }, all: [...brand.assets.all, ...usage] } };
}

describe('colors in the text printed with an asset', () => {
  /** A folder of one asset whose sidecar text mentions colors, shown by a directive. */
  function withColoredAsset(directive: string, name = 'blue-on-white'): BlazonData {
    const colored: Asset = {
      ...asset('palette', name),
      meta: { description: 'Blue #3F73F8 on white.', traits: ['Ground #0F172A'], do: ['Use rgb(63, 115, 248) for links'], dont: ['Tint it with #3F73F880'] },
    };
    const brand = withDoc(`<h2>Palette</h2>${directive}`);
    return { ...brand, assets: { ...brand.assets, custom: { ...brand.assets.custom, palette: [colored] }, all: [...brand.assets.all, colored] } };
  }

  it('are badges in the description, the traits and the do and dont lines of an asset section', () => {
    openViewer('#doc/guide', withColoredAsset('<!-- blazon:section palette blue-on-white -->'));
    const section = document.querySelector<HTMLElement>('[data-section-asset="palette/blue-on-white"]')!;
    const badges = [...section.querySelectorAll<HTMLElement>('[data-color-badge]')];
    expect(badges.map((b) => b.textContent)).toEqual(['#3F73F8', '#0F172A', 'rgb(63, 115, 248)', '#3F73F880']);
    expect(section.querySelector('p.text-sm')!.textContent).toBe('Blue #3F73F8 on white.');
    expect(badges[0]!.style.background).toBeTruthy();
  });
});

describe.skipIf(!PRESENT)('asset figures in docs', () => {
  function figures() {
    return [...document.querySelectorAll<HTMLElement>('main figure[data-asset]')];
  }

  it('show every asset of a folder, each with its image, caption and a link to the file', () => {
    openViewer('#doc/guide', withAssetsAndDoc('<h2>Usage</h2><!-- blazon:assets logo-usage -->'));
    expect(figures().map((f) => f.dataset.asset)).toEqual(['logo-usage/do-use-black-on-light', 'logo-usage/dont-stretch', 'logo-usage/dont-recolor']);
    const stretch = within(figures()[1]!);
    const img = stretch.getByRole('img', { name: "Don't stretch" }) as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('brand-assets/logo-usage/dont-stretch.png');
    expect(img.getAttribute('loading')).toBe('lazy');
    expect(stretch.getByText("Don't stretch")).toBeTruthy();
    expect(stretch.getByRole('link', { name: /full size/i }).getAttribute('href')).toBe('brand-assets/logo-usage/dont-stretch.png');
  });

  it('show only the named assets, in the order given', () => {
    openViewer('#doc/guide', withAssetsAndDoc('<h2>Usage</h2><!-- blazon:assets logo-usage dont-recolor do-use-black-on-light -->'));
    expect(figures().map((f) => f.dataset.asset)).toEqual(['logo-usage/dont-recolor', 'logo-usage/do-use-black-on-light']);
  });

  it("mark do and don't examples", () => {
    openViewer('#doc/guide', withAssetsAndDoc('<h2>Usage</h2><!-- blazon:assets logo-usage -->'));
    expect(within(figures()[0]!).getByLabelText('Do')).toBeTruthy();
    expect(within(figures()[1]!).getByLabelText("Don't")).toBeTruthy();
  });

  it("keep each asset's own aspect ratio, and let a wide band span the whole row", () => {
    const band = { ...asset('logo-usage', 'text-lockups'), width: 1600, height: 431 };
    const square = { ...asset('logo-usage', 'dont-stretch'), width: 800, height: 800 };
    const brand = withDoc('<h2>Usage</h2><!-- blazon:assets logo-usage -->');
    openViewer('#doc/guide', { ...brand, assets: { ...brand.assets, custom: { ...brand.assets.custom, 'logo-usage': [band, square] } } });
    const [wide, narrow] = figures();
    expect((wide!.querySelector('[data-frame]') as HTMLElement).style.aspectRatio).toBe('1600 / 431');
    expect(wide!.className).toMatch(/col-span-full/);
    expect((narrow!.querySelector('[data-frame]') as HTMLElement).style.aspectRatio).toBe('800 / 800');
    expect(narrow!.className).not.toMatch(/col-span-full/);
  });

  it('give a single named asset the full column', () => {
    openViewer('#doc/guide', withAssetsAndDoc('<h2>Usage</h2><!-- blazon:assets logo-usage dont-stretch -->'));
    expect(figures()[0]!.parentElement!.className).toMatch(/grid-cols-1(\s|$)/);
  });

  it('say so when a folder or a name does not exist', () => {
    openViewer('#doc/guide', withAssetsAndDoc('<h2>Oops</h2><!-- blazon:assets logo-usge --><!-- blazon:assets logo-usage dont-squash -->'));
    expect(main().getByText('No asset at logo-usge')).toBeTruthy();
    expect(main().getByText('No asset at logo-usage/dont-squash')).toBeTruthy();
  });

  it('can sit next to token cards in the same section', () => {
    openViewer(
      '#doc/guide',
      withAssetsAndDoc('<h2>Mixed</h2><p>Before.</p><!-- blazon:tokens color.primary.indigo --><p>Between.</p><!-- blazon:assets logo-usage dont-stretch --><p>After.</p>'),
    );
    expect(main().getByText('#635DFF')).toBeTruthy();
    expect(figures()).toHaveLength(1);
    expect(main().getByText('Between.')).toBeTruthy();
    expect(main().getByText('After.')).toBeTruthy();
  });
});

describe.skipIf(!PRESENT)('icons built from the icon folder and color tokens', () => {
  function rows() {
    return [...document.querySelectorAll<HTMLElement>('main [data-icon-row]')];
  }

  it('paint every icon of the folder once per token, with the icon file as its shape', () => {
    openViewer('#doc/guide', withDoc('<h2>States</h2><!-- blazon:icons icons icon.marketing.active icon.feature.gradient.indigoBlue -->'));
    const icons = data.assets.icons;
    expect(rows().map((r) => r.dataset.iconRow)).toEqual([
      'icon.marketing.active.indigo',
      'icon.marketing.active.indigoMedium',
      'icon.marketing.active.indigoLight',
      'icon.feature.gradient.indigoBlue',
    ]);
    const medium = rows()[1]!;
    const painted = [...medium.querySelectorAll<HTMLElement>('[data-icon]')];
    expect(painted.map((el) => el.dataset.icon)).toEqual(icons.map((a) => a.id));
    expect(painted[0]!.style.background).toBe('rgb(130, 125, 255)');
    // A full URL: a relative url() in a custom property resolves against the stylesheet (assets/), not the page
    expect(painted[0]!.style.getPropertyValue('--blazon-icon')).toBe(`url("${location.origin}/${icons[0]!.url}")`);
    expect(within(medium).getByText('icon.marketing.active.indigoMedium')).toBeTruthy();
    expect(rows()[3]!.querySelector<HTMLElement>('[data-icon]')!.style.background).toMatch(/linear-gradient/);
  });

  it('resolve the icon files under the folder a site is hosted in', () => {
    const view = openViewer('#doc/guide', withDoc('<h2>Set</h2><!-- blazon:icons icons -->'));
    // A site published under a subpath, as GitHub Pages hosts /<repo>/
    const base = document.createElement('base');
    base.href = 'https://example.github.io/brand/';
    document.head.prepend(base);
    view.rerender(<App />);
    const first = document.querySelector<HTMLElement>('main [data-icon]')!;
    expect(first.style.getPropertyValue('--blazon-icon')).toBe(`url("https://example.github.io/brand/${data.assets.icons[0]!.url}")`);
  });

  it('show the set once in the text color when no token is named, claiming no color', () => {
    openViewer('#doc/guide', withDoc('<h2>Set</h2><!-- blazon:icons icons -->'));
    expect(rows()).toHaveLength(1);
    const painted = [...rows()[0]!.querySelectorAll<HTMLElement>('[data-icon]')];
    expect(painted).toHaveLength(data.assets.icons.length);
    expect(painted[0]!.style.background).toBe('currentcolor');
  });

  it('say so when the folder or a token does not exist', () => {
    openViewer('#doc/guide', withDoc('<h2>Oops</h2><!-- blazon:icons icns icon.marketing.active --><!-- blazon:icons icons icon.marketing.actve -->'));
    expect(main().getByText('No asset at icns')).toBeTruthy();
    expect(main().getByText('No token at icon.marketing.actve')).toBeTruthy();
  });
});

describe.skipIf(!PRESENT)('the logo on color tokens', () => {
  function tile(path: string) {
    return document.querySelector<HTMLElement>(`main [data-logo-on="${path}"]`)!;
  }

  it('put the logo variant with more contrast on each color or gradient', () => {
    openViewer('#doc/guide', withDoc('<h2>On color</h2><!-- blazon:logo-on color.primary.indigo color.neutral.white gradient.indigoBlue -->'));
    expect(tile('color.primary.indigo').style.background).toBe('rgb(99, 93, 255)');
    expect(tile('color.primary.indigo').querySelector('img')!.getAttribute('src')).toBe(data.logo!.onDark);
    expect(tile('color.neutral.white').querySelector('img')!.getAttribute('src')).toBe(data.logo!.onLight);
    expect(tile('gradient.indigoBlue').style.background).toMatch(/linear-gradient/);
    expect(tile('gradient.indigoBlue').querySelector('img')!.getAttribute('src')).toBe(data.logo!.onDark);
    expect(within(tile('gradient.indigoBlue')).getByText('gradient.indigoBlue')).toBeTruthy();
  });

  // A mid green, and a near-black. White reaches 4.3:1 on the green; a navy ink 3.9:1. Navy on the near-black is about 1.1:1.
  const paint = (path: string, value: string): TokenItem => ({ ...data.tokens.items.find((t) => t.path === 'color.primary.indigo')!, path, value, resolvedValue: value });
  const withNavy = (doc: string, ink: string | undefined): BlazonData => {
    const brand = withDoc(doc);
    const navy: Asset = { ...brand.assets.logos[0]!, id: 'logos/navy', name: 'navy', url: 'brand-assets/logos/navy.svg', ...(ink && { meta: { ink } }) };
    const items = [...brand.tokens.items, paint('color.test.green', '#2E8B57'), paint('color.test.night', '#101820')];
    return { ...brand, tokens: { ...brand.tokens, items }, assets: { ...brand.assets, logos: [...brand.assets.logos, navy] } };
  };

  it('pick a logo that declares an ink which reaches graphic contrast on the color', () => {
    openViewer('#doc/guide', withNavy('<h2>On green</h2><!-- blazon:logo-on color.test.green -->', '#0B1F3A'));
    expect(tile('color.test.green').querySelector('img')!.getAttribute('src')).toBe('brand-assets/logos/navy.svg');
  });

  it('leave out a logo the color forbids, as the asset id or as the variant it is, and fall back to nothing when the pick is forbidden', () => {
    const forbid = (names: string[]): BlazonData => {
      const brand = withNavy('<h2>On green</h2><!-- blazon:logo-on color.test.green -->', '#0B1F3A');
      const items = brand.tokens.items.map((t) => (t.path === 'color.test.green' ? { ...t, blazon: { ...t.blazon, logo: { deny: names, reason: 'Never on green' } } } : t));
      return { ...brand, tokens: { ...brand.tokens, items } };
    };
    openViewer('#doc/guide', forbid(['logos/navy']));
    expect(tile('color.test.green').querySelector('img')!.getAttribute('src')).toBe(data.logo!.onDark);
    // `tile` takes the first match on the page, so the first render must go before the second is read
    cleanup();
    openViewer('#doc/guide', forbid(['logos/navy', 'onDark']));
    expect(tile('color.test.green').querySelector('img')).toBeNull();
  });

  it('change nothing when no logo declares an ink', () => {
    openViewer('#doc/guide', withNavy('<h2>On green</h2><!-- blazon:logo-on color.test.green color.primary.indigo -->', undefined));
    expect(tile('color.test.green').querySelector('img')!.getAttribute('src')).toBe(data.logo!.onDark);
    expect(tile('color.primary.indigo').querySelector('img')!.getAttribute('src')).toBe(data.logo!.onDark);
  });

  it('keep the configured variant where the declared ink is too faint', () => {
    openViewer('#doc/guide', withNavy('<h2>On night</h2><!-- blazon:logo-on color.test.night -->', '#0B1F3A'));
    expect(tile('color.test.night').querySelector('img')!.getAttribute('src')).toBe(data.logo!.onDark);
  });

  it('list a logo that declares an ink among the contrast rows', () => {
    openViewer('#doc/guide', withNavy('<h2>Contrast</h2><!-- blazon:logo-contrast color.test.green -->', '#0B1F3A'));
    const row = document.querySelector<HTMLElement>('main [data-logo-contrast="color.test.green"] [data-variant="logos/navy"]')!;
    expect(row.dataset.legible).toBe('true');
    expect(row.textContent).toMatch(/3\.9:1/);
  });

  // A brand whose configured onLight logo is blue and onDark logo white, both declaring their ink, and a navy one that is not configured
  const inked = (doc: string, configured: Partial<NonNullable<BlazonData['logo']>> = {}): BlazonData => {
    const brand = withDoc(doc);
    const logoAsset = (name: string, ink?: string): Asset => ({
      ...brand.assets.logos[0]!,
      id: `logos/${name}`,
      name,
      url: `brand-assets/logos/${name}.svg`,
      meta: ink ? { ink } : undefined,
    });
    const logos = [logoAsset('blue', '#3F73F8'), logoAsset('white', '#FFFFFF'), logoAsset('navy', '#0B1F3A')];
    const items = [...brand.tokens.items, paint('color.test.white', '#FFFFFF'), paint('color.test.night', '#0B1F3A')];
    const logo = {
      onLight: 'data:image/svg+xml;base64,Ymx1ZQ==',
      onDark: 'data:image/svg+xml;base64,d2hpdGU=',
      onLightAsset: 'logos/blue',
      onLightInk: '#3F73F8',
      onDarkAsset: 'logos/white',
      onDarkInk: '#FFFFFF',
      ...configured,
    };
    return { ...brand, logo, tokens: { ...brand.tokens, items }, assets: { ...brand.assets, logos } };
  };
  const rows = (token: string) => [...document.querySelectorAll<HTMLElement>(`main [data-logo-contrast="${token}"] [data-variant]`)];

  it('judge a configured logo as the ink its sidecar declares, and list it once', () => {
    openViewer('#doc/guide', inked('<h2>Contrast</h2><!-- blazon:logo-contrast color.test.white color.test.night -->'));
    // Blue is not black: 4.2:1 on white (black would say 21.0), 3.9:1 on navy (black would say 1.3)
    expect(rows('color.test.white').map((r) => r.dataset.variant)).toEqual(['onLight', 'onDark', 'logos/navy']);
    expect(rows('color.test.white').map((r) => r.textContent)).toEqual(['4.2:1 ✓', '1.0:1 ✗', '16.5:1 ✓']);
    expect(rows('color.test.night').map((r) => r.textContent)).toEqual(['3.9:1 ✓', '16.5:1 ✓', '1.0:1 ✗']);
    expect(document.querySelectorAll('main [data-logo-contrast="color.test.white"] img').length).toBe(3);
  });

  it('keep black on light and white on dark for a configured logo with no declared ink', () => {
    const brand = inked('<h2>Contrast</h2><!-- blazon:logo-contrast color.test.white color.test.night -->', { onLightInk: undefined, onDarkInk: undefined });
    openViewer('#doc/guide', { ...brand, assets: { ...brand.assets, logos: brand.assets.logos.map((a) => (a.id === 'logos/navy' ? a : { ...a, meta: undefined })) } });
    expect(rows('color.test.white').map((r) => r.textContent)).toEqual(['21.0:1 ✓', '1.0:1 ✗', '16.5:1 ✓']);
    expect(rows('color.test.night').map((r) => r.textContent)).toEqual(['1.3:1 ✗', '16.5:1 ✓', '1.0:1 ✗']);
  });

  it('list a configured logo that is no asset as before, and an inked asset as an extra row', () => {
    openViewer(
      '#doc/guide',
      inked('<h2>Contrast</h2><!-- blazon:logo-contrast color.test.night -->', { onLightAsset: undefined, onLightInk: undefined, onDarkAsset: undefined, onDarkInk: undefined }),
    );
    expect(rows('color.test.night').map((r) => [r.dataset.variant, r.textContent])).toEqual([
      ['onLight', '1.3:1 ✗'],
      ['onDark', '16.5:1 ✓'],
      ['logos/blue', '3.9:1 ✓'],
      ['logos/white', '16.5:1 ✓'],
      ['logos/navy', '1.0:1 ✗'],
    ]);
  });

  it('forbid the configured row by its variant name and by its asset id', () => {
    const deny = (names: string[]): BlazonData => {
      const brand = inked('<h2>Contrast</h2><!-- blazon:logo-contrast color.test.night -->');
      const items = brand.tokens.items.map((t) => (t.path === 'color.test.night' ? { ...t, blazon: { ...t.blazon, logo: { deny: names, reason: 'Never on navy' } } } : t));
      return { ...brand, tokens: { ...brand.tokens, items } };
    };
    for (const names of [['onLight'], ['logos/blue']]) {
      openViewer('#doc/guide', deny(names));
      expect(rows('color.test.night').map((r) => r.dataset.forbidden)).toEqual(['true', 'false', 'false']);
      expect(rows('color.test.night')[0]!.textContent).toContain('3.9:1 ✗ forbidden');
      cleanup();
    }
    openViewer('#doc/guide', deny(['logos/navy']));
    expect(rows('color.test.night').map((r) => r.dataset.forbidden)).toEqual(['false', 'false', 'true']);
  });

  it('pick the configured blue logo on white by its declared ink', () => {
    const brand = inked('<h2>On white</h2><!-- blazon:logo-on color.test.white -->');
    openViewer('#doc/guide', { ...brand, assets: { ...brand.assets, logos: brand.assets.logos.filter((a) => a.id !== 'logos/navy') } });
    expect(tile('color.test.white').querySelector('img')!.getAttribute('src')).toBe('brand-assets/logos/blue.svg');
  });

  it('say so when a token does not exist or no logo is configured', () => {
    openViewer('#doc/guide', withDoc('<h2>Oops</h2><!-- blazon:logo-on color.primary.indgo -->'));
    expect(main().getByText('No token at color.primary.indgo')).toBeTruthy();
    cleanup();
    openViewer('#doc/guide', { ...withDoc('<h2>Oops</h2><!-- blazon:logo-on color.primary.indigo -->'), logo: undefined });
    expect(main().getByText(/No logo is configured/)).toBeTruthy();
  });
});

describe.skipIf(!PRESENT)('sample cards on gradient tokens', () => {
  it('frame a card with the logo in each gradient, titled as the brand names it', () => {
    openViewer('#doc/guide', withDoc('<h2>Resources</h2><!-- blazon:cards gradient.category -->'));
    const cards = [...document.querySelectorAll<HTMLElement>('main [data-card]')];
    expect(cards.map((c) => c.dataset.card)).toEqual(['gradient.category.security', 'gradient.category.digitalTransformation', 'gradient.category.ciam']);
    const ciam = cards[2]!;
    expect(ciam.style.background).toMatch(/linear-gradient/);
    expect(within(ciam).getByText('CIAM')).toBeTruthy();
    expect(ciam.querySelector('img')!.getAttribute('src')).toBe(data.logo!.onLight);
    expect(main().getByText(/sizes and spacing are blazon's own/i)).toBeTruthy();
  });

  it('say so when a token does not exist', () => {
    openViewer('#doc/guide', withDoc('<h2>Oops</h2><!-- blazon:cards gradient.categry -->'));
    expect(main().getByText('No token at gradient.categry')).toBeTruthy();
  });
});

describe('the logo usage tiles', () => {
  const tile = (label: string) => screen.getByText(label, { selector: 'figcaption' }).closest('figure')!;

  it('stand each variant on the surface of its darkness, which a dark theme swaps', () => {
    const doc = withDoc('<h2>Usage</h2><!-- blazon:logo-usage -->');
    openViewer('#doc/guide', { ...doc, theme: { ...doc.theme, background: '#F2F0EB', text: '#1E1F21', inverse: '#1E1F21', inverseText: '#F2F0EB' } });
    expect(tile('On light backgrounds').className).toContain('bg-[var(--blazon-bg)]');
    expect(tile('On dark backgrounds').className).toContain('bg-[var(--blazon-inverse)]');
    cleanup();
    // A dark theme: the page is Graphite and the inverse band Bone, so the light-surface logo goes on the inverse
    openViewer('#doc/guide', { ...doc, theme: { ...doc.theme, background: '#1E1F21', text: '#F2F0EB', inverse: '#F2F0EB', inverseText: '#1E1F21' } });
    expect(tile('On light backgrounds').className).toContain('bg-[var(--blazon-inverse)]');
    expect(tile('On light backgrounds').querySelector('img')!.getAttribute('src')).toBe(data.logo!.onLight);
    expect(tile('On dark backgrounds').className).toContain('bg-[var(--blazon-bg)]');
    expect(tile('On dark backgrounds').querySelector('img')!.getAttribute('src')).toBe(data.logo!.onDark);
  });

  it('point the surfaces the clear-space and placement figures draw on at the background or inverse of that darkness', () => {
    const root = document.documentElement.style;
    openViewer('#doc/guide', { ...data, theme: { ...data.theme, background: '#F2F0EB', text: '#1E1F21', inverse: '#1E1F21', inverseText: '#F2F0EB' } });
    expect(root.getPropertyValue('--blazon-surface-light')).toBe('');
    cleanup();
    openViewer('#doc/guide', { ...data, theme: { ...data.theme, background: '#1E1F21', text: '#F2F0EB', inverse: '#F2F0EB', inverseText: '#1E1F21' } });
    expect(root.getPropertyValue('--blazon-surface-light')).toBe('var(--blazon-inverse)');
    expect(root.getPropertyValue('--blazon-surface-dark')).toBe('var(--blazon-bg)');
  });
});

describe('the page cover logo', () => {
  function coverLogo() {
    return document.querySelector<HTMLImageElement>('main section img')!.getAttribute('src');
  }

  it('follows dark mode on a canvas cover, which turns dark with it', () => {
    openViewer('#doc/guide', withDoc('<h2>Body</h2><p>Text.</p>', { opener: 'full' }));
    expect(coverLogo()).toBe(data.logo!.onLight);
    act(() => fireEvent.click(screen.getByRole('button', { name: 'Dark mode' })));
    expect(coverLogo()).toBe(data.logo!.onDark);
  });

  it('is left out of an accent cover when the brand forbids the logo on the accent color', () => {
    const accent = data.themeTokens?.accent ?? 'color.primary.indigo';
    const cover = (rule?: { deny: string[]; reason: string }): BlazonData => {
      // the token's own logo rule, if the fixture has one, is replaced: this test says what the rule does
      const items = data.tokens.items.map((t) => (t.path === accent ? { ...t, blazon: { ...t.blazon, logo: rule } } : t));
      return { ...withDoc('<h2>Body</h2><p>Text.</p>', { opener: 'full', cover: 'accent' }), themeTokens: { ...data.themeTokens, accent }, tokens: { ...data.tokens, items } };
    };
    openViewer('#doc/guide', cover());
    expect(document.querySelector('[data-opener-mark]')).not.toBeNull();
    cleanup();
    openViewer('#doc/guide', cover({ deny: ['onLight', 'onDark'], reason: 'Never on the accent' }));
    expect(document.querySelector('[data-opener-mark]')).toBeNull();
  });
});

describe('the page opener', () => {
  const title = () => document.querySelector('main h1')!;

  it("is a full cover on the book's first page and a short header on the others", () => {
    openViewer(`#doc/${data.docs[0]!.slug}`);
    expect(title().closest('section')!.className).toMatch(/min-h-/);
    cleanup();

    // the first page's cover is the accent color, which the brand may forbid its logo on: a canvas cover shows the mark
    openViewer('#doc/guide', withDoc('<h2>Body</h2><p>Text.</p>', { opener: 'full' }));
    expect(document.querySelector('[data-opener-mark]')).not.toBeNull();
    cleanup();

    openViewer('#doc/guide', withDoc('<h2>Body</h2><p>Text.</p>'));
    expect(title().closest('section')!.className).not.toMatch(/min-h-/);
    expect(document.querySelector('[data-opener-mark]')).toBeNull();
  });

  it("follows the page's own opener over the default", () => {
    openViewer(`#doc/${data.docs[0]!.slug}`, { ...data, docs: data.docs.map((d, i) => (i === 0 ? { ...d, meta: { ...d.meta, opener: 'compact' } } : d)) });
    expect(document.querySelector('[data-opener-mark]')).toBeNull();
  });
});

describe('the jump links on a guideline page', () => {
  const four = '<p>Lead.</p><h2>One</h2><p>a</p><h2>Two <em>b</em></h2><p>b</p><h2>Three</h2><p>c</p><h2>Four</h2><p>d</p>';

  it('list each H2 and jump to its section', async () => {
    const scrolled: string[] = [];
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled.push(this.id);
    };
    openViewer('#doc/guide', withDoc(four));
    await act(async () => {});
    const index = main().getByRole('navigation', { name: 'On this page' });
    expect(
      within(index)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['One', 'Two b', 'Three', 'Four']);
    await act(async () => {
      fireEvent.click(within(index).getByRole('button', { name: 'Two b' }));
    });
    expect(scrolled).toEqual(['section-two-b']);
  });

  it('give two sections with the same heading, and a heading of only symbols, ids of their own, and each link goes to its own', async () => {
    const scrolled: string[] = [];
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled.push(this.id);
    };
    openViewer('#doc/guide', withDoc('<h2>Examples</h2><p>a</p><h2>Examples</h2><p>b</p><h2>🎉</h2><p>c</p><h2>Last</h2><p>d</p>'));
    await act(async () => {});
    const ids = [...document.querySelectorAll('section[data-section]')].map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every(Boolean)).toBe(true);
    expect(ids[0]).toBe('section-examples');
    expect(ids[1]).toBe('section-examples-2');
    const buttons = within(main().getByRole('navigation', { name: 'On this page' })).getAllByRole('button');
    for (const button of [buttons[1]!, buttons[2]!]) {
      await act(async () => {
        fireEvent.click(button);
      });
    }
    expect(scrolled).toEqual([ids[1], ids[2]]);
  });

  it('are not in the print book, which is cut into slides from one flow', async () => {
    openViewer('#print/pages=doc/guide', withDoc(four));
    await act(async () => {});
    expect(document.querySelector('[data-print-book]')).not.toBeNull();
    expect(document.querySelector('[data-section-index]')).toBeNull();
  });

  it('only ask for the room of their column outside the print book (the rule is about the book, a headless browser at 1280px matches it)', () => {
    const css = fs.readFileSync(path.join(REPO, 'src/viewer/index.css'), 'utf-8');
    expect(css).toContain('main:not([data-print-book]):has([data-section-index]:not([hidden])) [data-page-body]');
  });

  it('are left out of a page with fewer than four sections', async () => {
    openViewer('#doc/guide', withDoc('<h2>One</h2><p>a</p><h2>Two</h2><p>b</p>'));
    await act(async () => {});
    expect(document.querySelector<HTMLElement>('[data-section-index]')!.hidden).toBe(true);
  });

  it('let the lead before the first H2 span the page instead of the content column', () => {
    openViewer('#doc/guide', withDoc(four));
    const lead = main().getByText('Lead.').closest('section')!;
    expect(lead.className).not.toMatch(/grid-cols/);
    expect(main().getByText('a').closest('section')!.className).toMatch(/grid-cols/);
  });
});

describe.skipIf(!PRESENT)('token paths', () => {
  it('break only after a dot, never inside a word', () => {
    const path = 'gradient.category.digitalTransformation';
    openViewer('#doc/guide', withDoc(`<h2>Wrap</h2><!-- blazon:tokens ${path} --><!-- blazon:cards ${path} -->`));
    const shown = [...document.querySelectorAll<HTMLElement>('main code')].filter((el) => el.textContent === path);
    expect(shown).toHaveLength(2);
    for (const el of shown) {
      expect(el.innerHTML).toBe('gradient.<wbr>category.<wbr>digitalTransformation');
      expect(el.className).not.toMatch(/break-all/);
    }
  });
});

/** A brand like blazon's own: a bright signal accent that carries dark text, on a warm off-white. */
const SIGNAL_THEME = {
  background: '#F2F0EB',
  text: '#1E1F21',
  accent: '#FF5A1F',
  accentText: '#1E1F21',
  inverse: '#1E1F21',
  inverseText: '#F2F0EB',
};

describe.skipIf(!PRESENT)('a theme derived from another brand', () => {
  function withSignal(html: string, cover?: string): BlazonData {
    const brand = withDoc(html);
    const docs = brand.docs.map((d) => (d.slug === 'guide' && cover ? { ...d, meta: { cover } } : d));
    return { ...brand, docs, theme: { ...brand.theme, ...SIGNAL_THEME } };
  }

  function accentTile() {
    return main().getByText('On the accent color').closest('figure')!.querySelector('img')!.getAttribute('src');
  }

  it('put the logo for light backgrounds on a light accent, as its text color says', () => {
    openViewer('#doc/guide', withSignal('<h2>Usage</h2><!-- blazon:logo-usage -->', 'accent'));
    expect(accentTile()).toBe(data.logo!.onLight);
    expect(document.querySelector('main section img')!.getAttribute('src')).toBe(data.logo!.onLight);
  });

  it('keep the logo for dark backgrounds on a dark accent', () => {
    openViewer('#doc/guide', withDoc('<h2>Usage</h2><!-- blazon:logo-usage -->'));
    expect(accentTile()).toBe(data.logo!.onDark);
  });

  it('color links with the accent only where it reads as text, in each mode', () => {
    openViewer('#doc/guide', withSignal('<p>Text.</p>'));
    const root = document.documentElement.style;
    // Signal orange on the off-white is about 3:1, under AA for text; on the dark inverse it passes
    expect(root.getPropertyValue('--blazon-link-light')).toBe('#1E1F21');
    expect(root.getPropertyValue('--blazon-link-dark')).toBe('#FF5A1F');
    cleanup();
    openViewer('#doc/guide', withDoc('<p>Text.</p>'));
    expect(document.documentElement.style.getPropertyValue('--blazon-link-light')).toBe(data.theme.accent);
  });

  it('edge colors with the brand border only where it reaches 3:1 on the light background', () => {
    // Graphite on the off-white passes; the stylesheet's mid-tone mix is the fallback elsewhere
    openViewer('#doc/guide', { ...withSignal('<p>Text.</p>'), theme: { ...SIGNAL_THEME, border: '#1E1F21' } });
    expect(document.documentElement.style.getPropertyValue('--blazon-edge-light')).toBe('#1E1F21');
    cleanup();
    // A pale grey rule on white, about 1.8:1, is too faint to edge a white tile
    openViewer('#doc/guide', { ...withDoc('<p>Text.</p>'), theme: { ...data.theme, background: '#FFFFFF', border: '#BDC4CF' } });
    expect(document.documentElement.style.getPropertyValue('--blazon-edge-light')).toBe('');
  });

  it('edge every color tile, so a color the same as the page still shows', () => {
    openViewer('#tokens/colors');
    const tiles = [...document.querySelectorAll<HTMLElement>('main [data-token]')].filter((el) => el.style.background);
    expect(tiles.length).toBeGreaterThan(0);
    expect(tiles.filter((el) => !el.closest('.blazon-swatch'))).toEqual([]);
  });

  it('edge the proportion bar the same way, so a segment the same as the page still shows', () => {
    openViewer('#tokens/colors');
    const segments = [...document.querySelectorAll<HTMLElement>('main [data-bucket] [data-swatch]')];
    expect(segments.length).toBeGreaterThan(0);
    expect(segments.filter((el) => !el.closest('.blazon-swatch'))).toEqual([]);
    // Between segments, a divider in the same edge color
    const buckets = [...document.querySelectorAll<HTMLElement>('main [data-bucket]')];
    expect(buckets.filter((el) => !el.className.includes('border-[var(--blazon-edge)]'))).toEqual([]);
  });
});

describe.skipIf(!PRESENT)('token card titles', () => {
  it('use a short description, so acronyms survive (CIAM, not Ciam)', () => {
    const ciam = data.tokens.items.find((t) => t.path === 'gradient.category.ciam')!;
    openViewer('#doc/guide', withDoc('<h2>Categories</h2><!-- blazon:tokens gradient.category.ciam -->'));
    const card = main().getByText(ciam.path).closest('[data-token]') as HTMLElement;
    expect(within(card).getByText(ciam.description!)).toBeTruthy();
    expect(within(card).queryByText('Ciam')).toBeNull();
  });
});

describe.skipIf(!PRESENT)('stroke samples, spot tiles and logo contrast', () => {
  it("draw shapes at the border token's real width and color", () => {
    openViewer('#doc/guide', withDoc('<h2>Strokes</h2><!-- blazon:strokes illustration.stroke -->'));
    const tiles = [...document.querySelectorAll<HTMLElement>('main [data-stroke]')];
    expect(tiles.map((t) => t.dataset.stroke)).toEqual(['illustration.stroke.default', 'illustration.stroke.onGray']);
    const g = tiles[0]!.querySelector('g')!;
    expect(g.getAttribute('stroke-width')).toBe('0.4');
    expect(g.getAttribute('stroke-linecap')).toBe('round');
    expect(g.getAttribute('stroke-linejoin')).toBe('round');
  });

  it('put the shapes on each background, stroked by the border token named', () => {
    openViewer('#doc/guide', withDoc('<h2>Spots</h2><!-- blazon:spots illustration.stroke.onGray illustration.spot.background -->'));
    const tiles = [...document.querySelectorAll<HTMLElement>('main [data-spot]')];
    expect(tiles.map((t) => t.dataset.spot)).toEqual([
      'illustration.spot.background.lighterGray',
      'illustration.spot.background.lightGray',
      'illustration.spot.background.mediumGray',
    ]);
    expect(tiles[1]!.querySelector('g')!.getAttribute('stroke')).toBe('#C3C3C3');
    // Medium Gray is the stroke's own color: black takes over, and the tile says so
    expect(tiles[2]!.querySelector('g')!.getAttribute('stroke')).toBe('#000');
    expect(tiles[2]!.textContent).toMatch(/has this background's color/);
  });

  it('fall back to black or white ink when no border token is named', () => {
    openViewer('#doc/guide', withDoc('<h2>Spots</h2><!-- blazon:spots color.primary.indigo color.neutral.white -->'));
    const ink = (path: string) => document.querySelector(`main [data-spot="${path}"] g`)!.getAttribute('stroke');
    expect(ink('color.primary.indigo')).toBe('#fff');
    expect(ink('color.neutral.white')).toBe('#000');
  });

  it('show both logo variants on a token with their contrast', () => {
    openViewer('#doc/guide', withDoc('<h2>Contrast</h2><!-- blazon:logo-contrast color.primary.indigo color.neutral.white -->'));
    const variant = (path: string, name: string) => document.querySelector<HTMLElement>(`main [data-logo-contrast="${path}"] [data-variant="${name}"]`)!;
    expect(variant('color.primary.indigo', 'onDark').dataset.legible).toBe('true');
    expect(variant('color.primary.indigo', 'onLight').dataset.legible).toBe('true'); // black on Indigo is about 5:1: both read, blazon:logo-on still picks white
    expect(variant('color.neutral.white', 'onLight').dataset.legible).toBe('true');
    expect(variant('color.neutral.white', 'onDark').dataset.legible).toBe('false');
    expect(variant('color.neutral.white', 'onLight').textContent).toMatch(/21\.0:1 ✓/);
  });

  it('mark a variant the brand forbids on a token, with the reason, even when its ratio passes', () => {
    const rule = { deny: ['onDark'], reason: 'The white logo is never used on Indigo.' };
    const items = data.tokens.items.map((t) => (t.path === 'color.primary.indigo' ? { ...t, blazon: { ...t.blazon, logo: rule } } : t));
    openViewer('#doc/guide', { ...withDoc('<h2>Contrast</h2><!-- blazon:logo-contrast color.primary.indigo color.neutral.white -->'), tokens: { ...data.tokens, items } });
    const variant = (path: string, name: string) => document.querySelector<HTMLElement>(`main [data-logo-contrast="${path}"] [data-variant="${name}"]`)!;
    const onDark = variant('color.primary.indigo', 'onDark');
    expect(onDark.dataset.legible).toBe('true'); // white on Indigo passes 3:1: the ratio alone would tick it
    expect(onDark.dataset.forbidden).toBe('true');
    expect(onDark.textContent).toMatch(/✗ forbidden/);
    expect(onDark.textContent).toContain(rule.reason);
    expect(variant('color.primary.indigo', 'onLight').dataset.forbidden).toBe('false');
    expect(variant('color.neutral.white', 'onDark').dataset.forbidden).toBe('false');
  });

  it('say so when a path names nothing of the right type or no logo is configured', () => {
    openViewer('#doc/guide', withDoc('<h2>Oops</h2><!-- blazon:strokes color.primary.indigo --><!-- blazon:spots color.primary.indgo -->'));
    expect(main().getByText('No border token at color.primary.indigo')).toBeTruthy();
    expect(main().getByText('No token at color.primary.indgo')).toBeTruthy();
    cleanup();
    openViewer('#doc/guide', { ...withDoc('<h2>Oops</h2><!-- blazon:logo-contrast color.primary.indigo -->'), logo: undefined });
    expect(main().getByText(/No logo is configured/)).toBeTruthy();
  });
});

describe('a new project from `blazon init`', () => {
  // The starter is blazon's own brand book: a new project's pages are the example's, so every directive finds its tokens and assets
  const started = async () => {
    const root = await starterProject();
    return compileBlazonData(await loadConfig(root), root);
  };

  it('has pages whose directives all find their tokens and assets, and a clean check', async () => {
    const project = await started();
    expect(checkTokens(project).errors).toEqual([]);
    expect(project.docs.map((d) => d.slug)).toEqual(starterFacts().slugs);
    for (const doc of project.docs) {
      openViewer(`#doc/${doc.slug}`, project);
      expect(document.querySelector('main')!.textContent, doc.slug).not.toMatch(/No (border )?(token|asset|logo)/);
      cleanup();
    }
  });

  it('names the section of every page, and expects the sections blazon.json lists', async () => {
    const project = await started();
    for (const doc of project.docs) expect(doc.sections.length, doc.slug).toBeGreaterThan(0);
    expect(project.findings.filter((f) => f.code.startsWith('section-'))).toEqual([]);
  });

  it('draws its logo page from the example artwork', async () => {
    const project = await started();
    for (const slug of ['logo']) {
      openViewer(`#doc/${slug}`, project);
      expect(document.querySelectorAll('main figure img, main figure svg').length, slug).toBeGreaterThan(0);
      cleanup();
    }
  });

  it('has the signal color and no gradient, hover state, secondary or accent', async () => {
    const project = await started();
    const paths = project.tokens.items.map((t) => t.path);
    expect(paths).toContain('interactive.primary');
    expect(paths.filter((p) => p.startsWith('gradient.') || p.startsWith('brand.'))).toEqual([]);
  });
});

describe.skipIf(!PRESENT)('blazon check on directives', () => {
  const doc = (markdown: string): DocItem => ({ slug: 'p', filePath: 'p.md', title: 'P', order: 1, meta: {}, sections: [], markdown, html: '' });
  const context = () => ({ tokens: data.tokens, assets: data.assets, hasLogo: true });
  const messages = (markdown: string, hasLogo = true) => directiveFindings([doc(markdown)], { ...context(), hasLogo }).map((f) => f.message);

  it('accepts every directive the Auth0 pages use', () => {
    expect(data.findings.filter((f) => f.code.startsWith('directive'))).toEqual([]);
  });

  it('names an unknown directive and lists the known ones', () => {
    const [found] = directiveFindings([doc('<!-- blazon:swatches color.primary -->')], context());
    expect(found).toMatchObject({ code: 'directive-unknown', severity: 'error', path: 'p.md' });
    expect(found!.message).toMatch(/unknown directive blazon:swatches; known: tokens, assets/);
  });

  it('rejects a path that names nothing, or nothing of the right type', () => {
    expect(messages('<!-- blazon:tokens color.primary.indgo -->')).toEqual(['<!-- blazon:tokens color.primary.indgo -->: no token at color.primary.indgo']);
    expect(messages('<!-- blazon:strokes color.primary.indigo -->')[0]).toMatch(/no border token at color.primary.indigo/);
    expect(messages('<!-- blazon:logo-on illustration.stroke.default -->')[0]).toMatch(/no color or gradient token/);
    expect(messages('<!-- blazon:spots illustration.stroke.onGray color.primary.indigo -->')).toEqual([]);
  });

  it('rejects an asset folder or name that does not exist', () => {
    expect(messages('<!-- blazon:assets nope -->')[0]).toMatch(/no asset at nope/);
    expect(messages('<!-- blazon:assets logo-usage nope -->')[0]).toMatch(/no asset at logo-usage\/nope/);
    expect(messages('<!-- blazon:icons icns color.primary.indigo -->')[0]).toMatch(/no asset at icns/);
  });

  it('checks argument counts and that a logo directive has a logo', () => {
    expect(messages('<!-- blazon:tokens -->')[0]).toMatch(/needs at least one argument/);
    expect(messages('<!-- blazon:logo-usage x -->')[0]).toMatch(/takes no arguments/);
    expect(messages('<!-- blazon:logo-usage -->', false)[0]).toMatch(/needs a logo/);
    expect(messages('<!-- blazon:logo-usage -->')).toEqual([]);
  });

  it('skips directives shown as code', () => {
    expect(messages('Write `<!-- blazon:nope x -->` like so:\n\n```md\n<!-- blazon:nope y -->\n```\n')).toEqual([]);
  });
});

describe('asset sidecars in the viewer', () => {
  it('state what the sidecar says on the asset card', () => {
    openViewer('#assets/logos');
    const rules = [...document.querySelectorAll('main [data-asset-rule]')].map((e) => e.textContent);
    expect(rules).toContain('For dark backgrounds');
    expect(rules).toContain('For light backgrounds');
  });
});

describe('logo clear space and minimum size', () => {
  const logo = (meta: Asset['meta'], size = { width: 160, height: 40 }): Asset => ({
    id: 'logos/mark',
    name: 'mark',
    category: 'logos',
    filePath: 'logos/mark.svg',
    format: 'svg',
    mediaType: 'image/svg+xml',
    url: 'brand-assets/logos/mark.svg',
    bytes: 1,
    ...size,
    ...(meta && { meta }),
  });
  const withLogo = (asset: Asset, directive = '<!-- blazon:logo-space logos -->'): BlazonData => {
    const brand = withDoc(`<h2>Space</h2>${directive}`);
    return { ...brand, assets: { ...brand.assets, logos: [asset], all: [asset] } };
  };
  const fig = () => document.querySelector<HTMLElement>('main [data-logo-space="logos/mark"]')!;

  /** The drawing: its widest size, the clear space as a share of its width, and the artwork filling the rest. */
  function drawing() {
    const zone = fig().querySelector<HTMLElement>('[data-clear-zone]')!;
    // A percentage padding is a share of the parent's width, so the band sits inside the sized zone
    const band = zone.querySelector<HTMLElement>('[data-clear-band]')!;
    const img = band.querySelector<HTMLElement>('img')!;
    return { maxWidth: zone.style.maxWidth, padding: band.style.padding, imgWidth: img.style.width };
  }

  it('draw the clear space around the artwork at its real size, in proportion', () => {
    openViewer('#doc/guide', withLogo(logo({ clearSpace: { value: 20, unit: 'px' }, background: 'dark' })));
    // 160px of artwork and 20px each side: 200px wide, each band a tenth of it
    expect(drawing()).toEqual({ maxWidth: '200px', padding: '10%', imgWidth: '100%' });
    expect(within(fig()).getByText('Clear space 20px')).toBeTruthy();
  });

  it('fit a wide logo and its clear space together into the preview width, and say so', () => {
    openViewer('#doc/guide', withLogo(logo({ clearSpace: { value: 100, unit: 'px' } }, { width: 600, height: 150 })));
    // 600 + 2 × 100 = 800px, drawn at 320px: ×0.4, each band 100/800 of the width
    expect(drawing()).toEqual({ maxWidth: '320px', padding: '12.5%', imgWidth: '100%' });
    expect(within(fig()).getByText(/drawn at ×0.4/)).toBeTruthy();
  });

  it('show the artwork at its minimum width or height, with rem as 16px', () => {
    openViewer('#doc/guide', withLogo(logo({ minSize: { width: { value: 80, unit: 'px' } } })));
    expect(fig().querySelector<HTMLElement>('[data-min-size]')!.style.width).toBe('80px');
    expect(within(fig()).getByText('Minimum width 80px')).toBeTruthy();
    cleanup();
    openViewer('#doc/guide', withLogo(logo({ minSize: { height: { value: 2, unit: 'rem' } } })));
    expect(fig().querySelector<HTMLElement>('[data-min-size]')!.style.height).toBe('32px');
  });

  it('name the logo by its sidecar title', () => {
    openViewer('#doc/guide', withLogo(logo({ clearSpace: { value: 20, unit: 'px' }, title: 'Primary mark' })));
    expect(fig().querySelector('figcaption')!.textContent).toContain('Primary mark');
  });

  it('say so when no asset states either, and in blazon check', () => {
    openViewer('#doc/guide', withLogo(logo({ background: 'light' })));
    expect(main().getByText('No asset at logos states a clear space or minimum size')).toBeTruthy();
    const ctx = (asset: Asset) => ({ tokens: data.tokens, assets: { ...data.assets, logos: [asset], all: [asset] }, hasLogo: true });
    const doc = { slug: 'p', filePath: 'p.md', title: 'P', order: 1, meta: {}, sections: [], markdown: '<!-- blazon:logo-space logos -->', html: '' } as DocItem;
    expect(directiveFindings([doc], ctx(logo({ background: 'light' }))).map((f) => f.message)[0]).toMatch(/no asset at logos states a clearSpace or minSize in its sidecar/);
    expect(directiveFindings([doc], ctx(logo({ clearSpace: { value: 1, unit: 'px' } })))).toEqual([]);
    expect(
      directiveFindings([{ ...doc, markdown: '<!-- blazon:logo-space logos nope -->' }], ctx(logo({ clearSpace: { value: 1, unit: 'px' } }))).map((f) => f.message)[0],
    ).toMatch(/no asset at logos\/nope/);
  });
});

describe('social formats and patterns', () => {
  const item = (path: string, type: string, value: string | number): TokenItem =>
    ({ path, group: path.split('.')[0], name: path.split('.').at(-1), type, value, resolvedValue: value, rawValue: value, file: 't.json' }) as unknown as TokenItem;
  const dim = (path: string, px: number) => item(path, 'dimension', `${px}px`);
  const brand = (items: TokenItem[], groupMeta: BlazonData['tokens']['groupMeta'] = [], directive = ''): BlazonData => {
    const base = withDoc(`<h2>Layout</h2>${directive}`);
    return { ...base, tokens: { ...base.tokens, items, groupMeta } };
  };
  const formatItems = [
    dim('social.format.story.width', 1080),
    dim('social.format.story.height', 1920),
    dim('social.format.story.margin', 80),
    item('social.format.story.columns', 'number', 4),
    dim('social.format.square.width', 1080),
    dim('social.format.square.height', 1080),
  ];
  const frame = (path: string) => document.querySelector<HTMLElement>(`main [data-format="${path}"]`)!;

  it('draw each format to one scale, with its size, ratio, margin and columns', () => {
    openViewer('#doc/guide', brand(formatItems, [], '<!-- blazon:formats social.format -->'));
    const story = frame('social.format.story');
    const square = frame('social.format.square');
    expect(story.querySelector<HTMLElement>('[data-frame]')!.style.height).toBe('280px');
    expect(square.querySelector<HTMLElement>('[data-frame]')!.style.height).toBe(`${(1080 / 1920) * 280}px`);
    expect(within(story).getByText('1080 × 1920 px · 9:16')).toBeTruthy();
    expect(within(story).getByText('margin 80px · 4 columns')).toBeTruthy();
    expect(story.querySelectorAll('[data-column]')).toHaveLength(3);
    expect(square.querySelector('[data-margin]')).toBeNull();
    expect(within(square).getByText('1080 × 1080 px · 1:1')).toBeTruthy();
  });

  const patternItems = (kind: string, extra: TokenItem[] = []) => [
    dim('pattern.p.size', 24),
    dim('pattern.p.stroke', 4),
    item('pattern.p.ink', 'gradient', 'linear-gradient(180deg, #000 0%, #fff 100%)'),
    item('pattern.p.ground', 'color', '#fafafa'),
    ...extra,
  ];
  const meta = (kind: unknown) => [{ path: 'pattern.p', blazon: { pattern: kind } }] as BlazonData['tokens']['groupMeta'];

  it.each(['dots', 'lines', 'diagonal', 'grid', 'checks'])('draw a %s pattern as a mask over its ink, so a gradient ink works', (kind) => {
    openViewer('#doc/guide', brand(patternItems(kind), meta(kind), '<!-- blazon:patterns pattern -->'));
    const tile = document.querySelector<HTMLElement>('main [data-pattern="pattern.p"]')!;
    expect(tile.dataset.kind).toBe(kind);
    const ink = tile.querySelector<HTMLElement>('[data-ink]')!;
    expect(ink.style.background).toMatch(/linear-gradient/);
    expect(within(tile).getByText(`${kind} · 24px · 4px`)).toBeTruthy();
  });

  it('tile each kind seamlessly in black, sized to its repeat', () => {
    const spec = (kind: 'dots' | 'lines' | 'diagonal' | 'grid' | 'checks') => tileSvg({ path: 'p', name: 'p', kind, size: 24, stroke: 4 });
    for (const kind of ['dots', 'lines', 'diagonal', 'grid', 'checks'] as const) expect(spec(kind)).toMatch(/<svg[^>]*width="24" height="24" viewBox="0 0 24 24"/);
    expect(spec('dots')).toMatch(/<circle cx="12" cy="12" r="2"/);
    expect(spec('lines')).toMatch(/M0 12L24 12/);
    expect(spec('grid')).toMatch(/M0 12L24 12.*M12 0L12 24/);
    expect(spec('checks').match(/<rect/g)).toHaveLength(2);
    // The diagonal and its two corner pieces: without them the line breaks at every tile edge
    expect(spec('diagonal').match(/<path/g)).toHaveLength(3);
  });

  it('default the stroke to an eighth of the size', () => {
    openViewer('#doc/guide', brand([dim('pattern.p.size', 24)], meta('lines'), '<!-- blazon:patterns pattern -->'));
    expect(document.querySelector('main [data-pattern="pattern.p"]')!.textContent).toMatch(/lines · 24px · 3px/);
  });

  const ctx = (items: TokenItem[], groupMeta = [] as BlazonData['tokens']['groupMeta']) => ({ tokens: { items, groupMeta }, assets: data.assets, hasLogo: true });
  const doc = (markdown: string) => ({ slug: 'p', filePath: 'p.md', title: 'P', order: 1, meta: {}, sections: [], markdown, html: '' }) as DocItem;
  const messages = (markdown: string, items: TokenItem[], groupMeta?: BlazonData['tokens']['groupMeta']) =>
    directiveFindings([doc(markdown)], ctx(items, groupMeta)).map((f) => f.message);

  it('make blazon check name what is wrong with a format or a pattern', () => {
    expect(messages('<!-- blazon:formats social.format -->', formatItems)).toEqual([]);
    expect(messages('<!-- blazon:formats nope -->', formatItems)[0]).toMatch(/no format at nope \(a group with dimension tokens width and height\)/);
    expect(messages('<!-- blazon:formats social.format -->', [dim('social.format.x.width', 10)])[0]).toMatch(
      /social\.format\.x: needs positive px or rem dimension tokens width and height/,
    );
    expect(
      messages('<!-- blazon:formats social.format -->', [dim('social.format.s.width', 8), dim('social.format.s.height', 8), item('social.format.s.columns', 'number', 0)])[0],
    ).toMatch(/columns must be a whole number/);

    expect(messages('<!-- blazon:patterns pattern -->', patternItems('dots'), meta('dots'))).toEqual([]);
    expect(messages('<!-- blazon:patterns pattern -->', patternItems('dots'), [])[0]).toMatch(/no pattern at pattern \(a group with dev\.blazon\.pattern set to dots, lines/);
    expect(messages('<!-- blazon:patterns pattern -->', patternItems('stripes'), meta('stripes'))[0]).toMatch(
      /pattern must be one of dots, lines, diagonal, grid, checks, got "stripes"/,
    );
    expect(messages('<!-- blazon:patterns pattern -->', [dim('pattern.p.stroke', 2)], meta('dots'))[0]).toMatch(/needs a positive px or rem dimension token size/);
    expect(messages('<!-- blazon:patterns pattern -->', [dim('pattern.p.size', 8), item('pattern.p.ink', 'dimension', '4px')], meta('dots'))[0]).toMatch(
      /ink must be a color or gradient/,
    );
  });
});

describe.skipIf(!PRESENT)('asset categories the config labels and orders', () => {
  // The categories the Auth0 example has, as core lists them: ordered ones first, then the rest
  const withCategories = (categories: BlazonData['assetCategories']): BlazonData => ({ ...data, assetCategories: categories });
  function assetLinks() {
    return [...document.querySelectorAll<HTMLAnchorElement>('a[href^="#assets/"]')].map((a) => [a.getAttribute('href'), a.textContent?.replace(/\d+$/, '').trim()]);
  }

  it('list them in the order given, with the label given', () => {
    openViewer(
      '#doc/intro',
      withCategories([
        { category: 'social', label: 'Social posts', order: 1 },
        { category: 'photography', label: 'Imagery', order: 2 },
        { category: 'logos', label: 'Logos' },
      ]),
    );
    const links = assetLinks();
    expect(links.slice(0, 3)).toEqual([
      ['#assets/social', 'Social posts'],
      ['#assets/photography', 'Imagery'],
      ['#assets/logos', 'Logos'],
    ]);
    // A category core did not list still shows, after the listed ones, alphabetically by label
    const rest = links.slice(3).map(([, label]) => label);
    expect(rest).toEqual([...rest].sort((a, b) => a!.localeCompare(b!)));
    expect(links).toHaveLength(new Set(data.assets.all.map((a) => a.category)).size);
  });

  it('title the category page with the label and lead with its description', () => {
    openViewer('#assets/photography', withCategories([{ category: 'photography', label: 'Imagery', order: 1, description: 'Real people in real light.' }]));
    expect(main().getByRole('heading', { level: 1, name: 'Imagery' })).toBeTruthy();
    expect(main().getByText(/Real people in real light\./)).toBeTruthy();
    expect(screen.getByRole('navigation', { name: /breadcrumb/i }).textContent).toContain('Imagery');
  });

  it("keep folder names and today's order when core sends no categories", () => {
    openViewer('#assets/photography', { ...data, assetCategories: undefined });
    expect(main().getByRole('heading', { level: 1, name: 'Photography' })).toBeTruthy();
    expect(assetLinks()[0]).toEqual(['#assets/logos', 'Logos']);
  });

  it('state the rules a category sets for its files, under the page intro', () => {
    const rules = (r: NonNullable<BlazonData['assetCategories']>[number]['rules']) => withCategories([{ category: 'photography', label: 'Photography', rules: r }]);
    const line = () => document.querySelector<HTMLElement>('main [data-asset-rules]')?.textContent;

    openViewer('#assets/photography', rules({ formats: ['webp', 'jpg'], minPixels: { width: 1600 }, aspectRatios: ['16:9'] }));
    expect(line()).toBe('Files: WebP or JPG, at least 1600px wide, 16:9.');
    cleanup();
    openViewer('#assets/photography', rules({ formats: ['png', 'svg', 'avif'], minPixels: { width: 1200, height: 800 }, aspectRatios: ['3:2', '1:1'] }));
    expect(line()).toBe('Files: PNG, SVG or AVIF, at least 1200 × 800px, 3:2 or 1:1.');
    cleanup();
    openViewer('#assets/photography', rules({ minPixels: { height: 900 } }));
    expect(line()).toBe('Files: at least 900px tall.');
    cleanup();
    // No rules, no line
    openViewer('#assets/photography', withCategories([{ category: 'photography', label: 'Photography' }]));
    expect(line()).toBeUndefined();
  });
});

describe.skipIf(!PRESENT)('blazon:section', () => {
  function withSection(): BlazonData {
    const photos = data.assets.custom.photography!.map((a) =>
      a.name === 'lifestyle'
        ? {
            ...a,
            meta: {
              title: 'People at work',
              description: 'Culture, people and collaboration.',
              traits: ['Candid and real', 'Inclusive'],
              do: ['Use natural light'],
              dont: ['Stage the scene'],
              source: { doc: 'brand-guidelines', locator: 'slide 57' },
            },
          }
        : a,
    );
    const page = withDoc('<h2>Kinds</h2><!-- blazon:section photography lifestyle product -->');
    return {
      ...page,
      assets: { ...page.assets, custom: { ...page.assets.custom, photography: photos } },
      assetCategories: [
        {
          category: 'photography',
          label: 'Photography',
          rules: { formats: ['webp'] },
          notSpecified: ['Crops', 'Color treatment'],
          source: { doc: 'brand-guidelines', locator: 'slides 56-60' },
        },
      ],
    };
  }

  it("gives each asset its title, description, traits, do's and don'ts and source, beside its image", () => {
    openViewer('#doc/guide', withSection());
    const block = document.querySelector<HTMLElement>('main [data-section-asset="photography/lifestyle"]')!;
    const inside = within(block);
    expect(inside.getByRole('heading', { name: 'People at work' })).toBeTruthy();
    expect(inside.getByText('Culture, people and collaboration.')).toBeTruthy();
    expect(inside.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Candid and real', 'Inclusive', 'Use natural light', 'Stage the scene']);
    expect(inside.getByText('Do')).toBeTruthy();
    expect(inside.getByText("Don't")).toBeTruthy();
    expect(inside.getByText('Source: brand-guidelines, slide 57')).toBeTruthy();
    expect(block.querySelector('figure[data-asset="photography/lifestyle"] img')).not.toBeNull();
  });

  it('names each asset once: the heading carries the title, the image its alt text, and the caption only the link', () => {
    openViewer('#doc/guide', withSection());
    const block = document.querySelector<HTMLElement>('main [data-section-asset="photography/lifestyle"]')!;
    expect(within(block).getAllByText('People at work')).toHaveLength(1);
    expect(block.querySelector('figcaption')!.textContent).toBe('Full size');
    expect(within(block).getByAltText('People at work')).toBeTruthy();
  });

  it('falls back to the file name for an asset with no title, in the order the directive lists', () => {
    openViewer('#doc/guide', withSection());
    const ids = [...document.querySelectorAll('main [data-section-asset]')].map((el) => el.getAttribute('data-section-asset'));
    expect(ids).toEqual(['photography/lifestyle', 'photography/product']);
    const product = document.querySelector<HTMLElement>('main [data-section-asset="photography/product"]')!;
    expect(within(product).getByRole('heading', { name: 'Product' })).toBeTruthy();
  });

  it("ends with the category's file rules, what the guidelines leave open, and where they say it", () => {
    openViewer('#doc/guide', withSection());
    const end = document.querySelector<HTMLElement>('main [data-section-end="photography"]')!;
    expect(within(end).getByText('Files: WebP.')).toBeTruthy();
    expect(within(end).getByText('Not specified')).toBeTruthy();
    expect(
      within(end)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Crops', 'Color treatment']);
    expect(within(end).getByText('Source: brand-guidelines, slides 56-60')).toBeTruthy();
  });

  it('says so when the category or an asset does not exist', () => {
    openViewer('#doc/guide', withDoc('<!-- blazon:section photograpy --><!-- blazon:section photography nope -->'));
    expect(main().getByText('No asset at photograpy')).toBeTruthy();
    expect(main().getByText('No asset at photography/nope')).toBeTruthy();
  });
});
