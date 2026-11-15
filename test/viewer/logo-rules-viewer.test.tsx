// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import path from 'node:path';
import { REPO } from '../support/paths';
import { hasReference, referencePath } from '../support/reference';
import { cleanup, render, screen, within } from '@testing-library/react';
import { loadConfig } from '../../src/core/config/index.js';
import { compileBlazonData } from '../../src/core/index.js';
import { injectBlazonData } from '../../src/server/data-script.js';
import type { Asset, AssetMeta, DocItem, BlazonData } from '../../src/types/index.js';
import { App } from '../../src/viewer/App';
import { assetRules } from '../../src/viewer/lib/tokens/format';

// The logo directives draw what a sidecar states (RFC 0001 §10). Each expected number below is worked out
// by hand from the rules, not read back from the code.

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
});

const px = (value: number) => ({ value, unit: 'px' as const });
const asset = (category: string, name: string, size: { width: number; height: number }, meta?: AssetMeta): Asset => ({
  id: `${category}/${name}`,
  name,
  category,
  filePath: `${category}/${name}.svg`,
  format: 'svg',
  mediaType: 'image/svg+xml',
  url: `brand-assets/${category}/${name}.svg`,
  bytes: 1,
  ...size,
  ...(meta && { meta }),
});

// 100 x 40 artwork whose unit is 12px
const MARK_META: AssetMeta = {
  unit: px(12),
  background: 'light',
  lockup: 'horizontal',
  description: 'Primary lockup',
  clearSpace: { units: 1 },
  placement: ['top-left', 'bottom-right'],
  partnership: { gap: { units: 1 }, dividerHeight: px(40) },
};

function open(directive: string, assets: Asset[]) {
  const doc: DocItem = { slug: 'guide', filePath: 'docs/guide.md', title: 'Guide', order: 99, meta: {}, sections: [], markdown: '', html: `<h2>Logo</h2>${directive}` };
  const logos = assets.filter((a) => a.category === 'logos');
  const custom: Record<string, Asset[]> = {};
  for (const a of assets.filter((x) => x.category !== 'logos')) (custom[a.category] ??= []).push(a);
  const brand: BlazonData = { ...data, docs: [...data.docs, doc], assets: { ...data.assets, logos, icons: [], custom, all: assets } };
  document.head.innerHTML = new DOMParser().parseFromString(injectBlazonData('<html><head></head><body></body></html>', brand), 'text/html').head.innerHTML;
  window.location.hash = '#doc/guide';
  return render(<App />);
}

const q = <T extends Element>(selector: string) => document.querySelector<T>(`main ${selector}`)!;
const main = () => within(screen.getByRole('main'));

describe('blazon:logo-lockups', () => {
  const horizontal = asset('logos', 'horizontal', { width: 100, height: 40 }, MARK_META);
  const stacked = asset('logos', 'stacked', { width: 40, height: 60 }, { unit: px(12), lockup: 'stacked', description: 'Large scale only', clearSpace: px(12) });
  const shield = asset('logos', 'shield', { width: 40, height: 40 }, { lockup: 'mark', background: 'dark' });
  const unstated = asset('logos', 'plain', { width: 10, height: 10 });

  it('groups the logos by lockup, in the order horizontal, stacked, mark', () => {
    open('<!-- blazon:logo-lockups logos -->', [shield, stacked, horizontal, unstated]);
    const groups = [...document.querySelectorAll<HTMLElement>('main [data-lockup-group]')].map((g) => g.dataset.lockupGroup);
    expect(groups).toEqual(['horizontal', 'stacked', 'mark']);
    expect(q('[data-lockup-group="horizontal"] h3').textContent).toBe('Horizontal');
    expect(q('[data-logo-lockup="logos/plain"]')).toBeNull();
  });

  it("draws each logo's clear space as a band: 1 unit of 12px round a 100px logo is 12/124 of the drawing", () => {
    open('<!-- blazon:logo-lockups logos -->', [horizontal]);
    expect(q<HTMLElement>('[data-logo-lockup="logos/horizontal"] [data-clear-band]').style.padding).toBe('9.677%');
    expect(within(q<HTMLElement>('[data-logo-lockup="logos/horizontal"]')).getByText('Clear space 1 unit (12px)')).toBeTruthy();
    expect(within(q<HTMLElement>('[data-logo-lockup="logos/horizontal"]')).getByText('Primary lockup')).toBeTruthy();
  });

  it('states the largest size and the logo to use below a size', () => {
    const sized = asset('logos', 'horizontal', { width: 100, height: 40 }, { ...MARK_META, maxSize: { width: px(90) }, replacedBelow: { width: px(30), by: 'logos/small' } });
    open('<!-- blazon:logo-lockups logos -->', [sized]);
    const card = within(q<HTMLElement>('[data-logo-lockup="logos/horizontal"]'));
    expect(card.getByText('Maximum width 90px')).toBeTruthy();
    expect(card.getByText('Below width 30px, use logos/small')).toBeTruthy();
    expect(assetRules(sized)).toEqual(expect.arrayContaining(['Max width 90px', 'Below width 30px, use logos/small']));
  });

  it('draws a logo with no clear space no wider than 320px, so a large mark does not fill the page', () => {
    const big = asset('logos', 'shield', { width: 646, height: 717 }, { lockup: 'mark', background: 'dark' });
    open('<!-- blazon:logo-lockups logos -->', [big]);
    // the tile's own padding (2rem across) comes on top, so the artwork itself is 320px wide
    expect(q<HTMLElement>('[data-logo-lockup="logos/shield"] img').parentElement!.style.maxWidth).toBe('calc(320px + 2rem)');
  });

  it("draws a small logo at its natural size: the tile's padding does not eat it", () => {
    // a 32px badge was drawn 0px wide when the tile's padding was taken from its 32px
    open('<!-- blazon:logo-lockups logos -->', [shield]);
    expect(q<HTMLElement>('[data-logo-lockup="logos/shield"] img').parentElement!.style.maxWidth).toBe('calc(40px + 2rem)');
  });

  it('shows a logo with no clear space as the artwork alone, and says so when nothing states a lockup', () => {
    open('<!-- blazon:logo-lockups logos -->', [shield]);
    expect(q('[data-logo-lockup="logos/shield"] img')).not.toBeNull();
    expect(q('[data-logo-lockup="logos/shield"] [data-clear-band]')).toBeNull();
    cleanup();
    open('<!-- blazon:logo-lockups logos -->', [unstated]);
    expect(main().getByText('No asset at logos states a lockup')).toBeTruthy();
  });
});

describe('blazon:logo-partner', () => {
  const mark = asset('logos', 'mark', { width: 100, height: 40 }, MARK_META);
  const acme = asset('partners', 'acme', { width: 50, height: 20 });

  it("lays the logo, a divider and the partner on one baseline: gap 1 unit = 12px, partner scaled to the logo's height", () => {
    open('<!-- blazon:logo-partner logos/mark partners/acme -->', [mark, acme]);
    const svg = q<SVGElement>('[data-logo-partner="logos/mark+partners/acme"] svg');
    // 100 (logo) + 12 + 1 (divider) + 12 + 100 (partner at 40 high: 50 * 40/20) = 225 wide, 40 high
    expect(svg.getAttribute('viewBox')).toBe('0 0 225 40');
    const [first, second] = [...svg.querySelectorAll('image')];
    expect([first!.getAttribute('x'), first!.getAttribute('y'), first!.getAttribute('width'), first!.getAttribute('height')]).toEqual(['0', '0', '100', '40']);
    expect([second!.getAttribute('x'), second!.getAttribute('y'), second!.getAttribute('width'), second!.getAttribute('height')]).toEqual(['125', '0', '100', '40']);
    const divider = svg.querySelector('[data-divider]')!;
    expect([divider.getAttribute('x1'), divider.getAttribute('y1'), divider.getAttribute('y2')]).toEqual(['112.5', '0', '40']);
    expect(first!.getAttribute('href')).toBe('http://localhost:3000/brand-assets/logos/mark.svg');
    expect(second!.getAttribute('href')).toBe('http://localhost:3000/brand-assets/partners/acme.svg');
  });

  it('sits both logos on the baseline when the divider is taller than they are, and honours partnerHeight', () => {
    const tall = asset(
      'logos',
      'mark',
      { width: 100, height: 40 },
      {
        ...MARK_META,
        partnership: { gap: px(10), dividerHeight: px(60), partnerHeight: { units: 3 } },
      },
    );
    open('<!-- blazon:logo-partner logos/mark partners/acme -->', [tall, acme]);
    const svg = q<SVGElement>('[data-logo-partner] svg');
    // partner 36 high (3 units of 12) so 90 wide; row is 60 high (the divider); logos stand on the bottom edge
    expect(svg.getAttribute('viewBox')).toBe('0 0 211 60');
    const [first, second] = [...svg.querySelectorAll('image')];
    expect([first!.getAttribute('y'), first!.getAttribute('height')]).toEqual(['20', '40']);
    expect([second!.getAttribute('x'), second!.getAttribute('y'), second!.getAttribute('width'), second!.getAttribute('height')]).toEqual(['121', '24', '90', '36']);
    const divider = svg.querySelector('[data-divider]')!;
    expect([divider.getAttribute('y1'), divider.getAttribute('y2')]).toEqual(['0', '60']);
  });

  it('draws the divider 1% as thick as the logo is high, so it is visible at any size, and 1px at least', () => {
    // 1000 x 400 artwork, unit 100px: gap 100, divider 400 high and 4 thick (1% of 400), partner 1000 wide
    const big = asset('logos', 'mark', { width: 1000, height: 400 }, { unit: px(100), background: 'light', partnership: { gap: { units: 1 }, dividerHeight: px(400) } });
    open('<!-- blazon:logo-partner logos/mark partners/acme -->', [big, acme]);
    const svg = q<SVGElement>('[data-logo-partner] svg');
    expect(svg.getAttribute('viewBox')).toBe('0 0 2204 400');
    const divider = svg.querySelector('[data-divider]')!;
    expect([divider.getAttribute('x1'), divider.getAttribute('stroke-width')]).toEqual(['1102', '4']);
  });

  it('draws no divider when the partnership states none, and keeps one gap between the logos', () => {
    const open_ = asset('logos', 'mark', { width: 100, height: 40 }, { ...MARK_META, partnership: { gap: { units: 1 } } });
    open('<!-- blazon:logo-partner logos/mark partners/acme -->', [open_, acme]);
    const svg = q<SVGElement>('[data-logo-partner] svg');
    // gap 12 (one unit): partner starts at 112, row is 212 wide
    expect(svg.getAttribute('viewBox')).toBe('0 0 212 40');
    expect(svg.querySelector('[data-divider]')).toBeNull();
    expect([...svg.querySelectorAll('image')][1]!.getAttribute('x')).toBe('112');
    expect(q('[data-logo-partner]').textContent).toContain('Gap 1 unit (12px) between the logos, no divider, one baseline');
  });

  it('says so when an asset is missing or the logo states no partnership', () => {
    open('<!-- blazon:logo-partner logos/mark partners/nope -->', [mark, acme]);
    expect(main().getByText('No asset at partners/nope')).toBeTruthy();
    cleanup();
    open('<!-- blazon:logo-partner logos/mark partners/acme -->', [asset('logos', 'mark', { width: 100, height: 40 }), acme]);
    expect(main().getByText('logos/mark states no partnership')).toBeTruthy();
  });
});

describe('blazon:logo-initiative', () => {
  const lab = asset('initiatives', 'lab', { width: 60, height: 20 }, { title: 'Open Banking Lab' });
  const withRule = (rule: object) =>
    asset('logos', 'mark', { width: 100, height: 40 }, { ...MARK_META, initiative: { name: 'Open Banking Lab', mark: 'initiatives/lab', gap: { units: 2 }, ...rule } });

  it('puts the mark beside the logo on one baseline: gap 2 units = 24px, mark scaled to the logo height', () => {
    open('<!-- blazon:logo-initiative logos/mark -->', [withRule({}), lab]);
    const svg = q<SVGElement>('[data-logo-initiative="logos/mark+initiatives/lab"] svg');
    // 100 (logo) + 24 + 120 (mark at 40 high: 60 * 40/20) = 244 wide, 40 high
    expect(svg.getAttribute('viewBox')).toBe('0 0 244 40');
    const [first, second] = [...svg.querySelectorAll('image')];
    expect([first!.getAttribute('x'), first!.getAttribute('y'), first!.getAttribute('width'), first!.getAttribute('height')]).toEqual(['0', '0', '100', '40']);
    expect([second!.getAttribute('x'), second!.getAttribute('y'), second!.getAttribute('width'), second!.getAttribute('height')]).toEqual(['124', '0', '120', '40']);
    expect(second!.getAttribute('href')).toBe('http://localhost:3000/brand-assets/initiatives/lab.svg');
    expect(q('[data-logo-initiative]').textContent).toContain('Gap 2 units (24px) beside the logo, one baseline');
  });

  it('puts the mark under the logo, left edges aligned, when the rule says below', () => {
    open('<!-- blazon:logo-initiative logos/mark -->', [withRule({ position: 'below', markHeight: px(20) }), lab]);
    const svg = q<SVGElement>('[data-logo-initiative] svg');
    // 40 (logo) + 24 + 20 (mark) = 84 high; the mark is 60 wide, narrower than the logo
    expect(svg.getAttribute('viewBox')).toBe('0 0 100 84');
    const [, second] = [...svg.querySelectorAll('image')];
    expect([second!.getAttribute('x'), second!.getAttribute('y'), second!.getAttribute('width'), second!.getAttribute('height')]).toEqual(['0', '64', '60', '20']);
    expect(q('[data-logo-initiative]').textContent).toContain('under the logo, left edges aligned');
    expect(svg.getAttribute('aria-label')).toBe('Mark, Open Banking Lab');
  });

  it('says so when an asset is missing, the logo states no initiative, or its mark is not there', () => {
    open('<!-- blazon:logo-initiative logos/nope -->', [withRule({}), lab]);
    expect(main().getByText('No asset at logos/nope')).toBeTruthy();
    cleanup();
    open('<!-- blazon:logo-initiative logos/mark -->', [asset('logos', 'mark', { width: 100, height: 40 }), lab]);
    expect(main().getByText('logos/mark states no initiative')).toBeTruthy();
    cleanup();
    open('<!-- blazon:logo-initiative logos/mark -->', [withRule({})]);
    expect(main().getByText('No asset at initiatives/lab')).toBeTruthy();
  });
});

describe('blazon:logo-placement', () => {
  const mark = asset('logos', 'mark', { width: 100, height: 40 }, MARK_META);

  // A 320 x 180 frame, blazon's own: the logo 18 high (10% of the frame), a 16 margin (5% of the width)
  it('draws one frame per allowed corner with the logo in it', () => {
    open('<!-- blazon:logo-placement logos/mark -->', [mark]);
    const frame = (corner: string) => q<SVGElement>(`[data-logo-placement="logos/mark"] [data-corner="${corner}"]`);
    expect([...document.querySelectorAll('main [data-corner]')].map((f) => f.getAttribute('data-corner'))).toEqual(['top-left', 'bottom-right']);
    const topLeft = frame('top-left').querySelector('image')!;
    expect([topLeft.getAttribute('x'), topLeft.getAttribute('y'), topLeft.getAttribute('width'), topLeft.getAttribute('height')]).toEqual(['16', '16', '45', '18']);
    const bottomRight = frame('bottom-right').querySelector('image')!;
    expect([bottomRight.getAttribute('x'), bottomRight.getAttribute('y')]).toEqual(['259', '146']);
    expect(frame('top-left').getAttribute('viewBox')).toBe('0 0 320 180');
  });

  it('puts the URL on the opposite side of the same edge, aligned to the logo', () => {
    open('<!-- blazon:logo-placement logos/mark example.com -->', [mark]);
    const url = (corner: string) => q<SVGTextElement>(`[data-corner="${corner}"] [data-url]`);
    expect(url('top-left').textContent).toBe('example.com');
    expect([url('top-left').getAttribute('x'), url('top-left').getAttribute('text-anchor')]).toEqual(['304', 'end']);
    expect([url('bottom-right').getAttribute('x'), url('bottom-right').getAttribute('text-anchor')]).toEqual(['16', 'start']);
  });

  it('draws no URL when none is given, and says so when the logo states no placement', () => {
    open('<!-- blazon:logo-placement logos/mark -->', [mark]);
    expect(q('[data-url]')).toBeNull();
    cleanup();
    open('<!-- blazon:logo-placement logos/mark -->', [asset('logos', 'mark', { width: 100, height: 40 })]);
    expect(main().getByText('logos/mark states no placement')).toBeTruthy();
  });
});

describe('logo rule captions name the logo by its sidecar title', () => {
  const titled = asset('logos', 'horizontal-color', { width: 100, height: 40 }, { ...MARK_META, title: 'Horizontal logo' });
  const plain = asset('logos', 'stacked-white', { width: 40, height: 40 }, { lockup: 'stacked', clearSpace: { units: 1 }, unit: px(12) });
  const partner = asset('partners', 'acme-co', { width: 50, height: 20 }, { title: 'Acme' });

  it('titles a lockup card from the sidecar, or from the file name made readable', () => {
    open('<!-- blazon:logo-lockups logos -->', [titled, plain]);
    expect(q('[data-logo-lockup="logos/horizontal-color"] figcaption').textContent).toContain('Horizontal logo');
    expect(q('[data-logo-lockup="logos/horizontal-color"] figcaption').textContent).not.toContain('horizontal-color');
    expect(q('[data-logo-lockup="logos/stacked-white"] figcaption').textContent).toContain('Stacked white');
  });

  it('names both logos of a partnership by title', () => {
    open('<!-- blazon:logo-partner logos/horizontal-color partners/acme-co -->', [titled, partner]);
    expect(q('[data-logo-partner] figcaption').textContent).toContain('Horizontal logo and Acme');
    expect(q('[data-logo-partner] svg').getAttribute('aria-label')).toBe('Horizontal logo and Acme');
  });

  it('names the logo to use below a size by its title, and by its id when it is not here', () => {
    const small = asset('logos', 'small-mark', { width: 30, height: 30 }, { lockup: 'mark', title: 'Small mark' });
    const sized = asset('logos', 'mark', { width: 100, height: 40 }, { ...MARK_META, replacedBelow: { width: px(30), by: 'logos/small-mark' } });
    open('<!-- blazon:logo-lockups logos -->', [sized, small]);
    expect(within(q<HTMLElement>('[data-logo-lockup="logos/mark"]')).getByText('Below width 30px, use Small mark')).toBeTruthy();
  });

  it('names the logo by title on its placement frames', () => {
    open('<!-- blazon:logo-placement logos/horizontal-color -->', [titled]);
    expect(q('[data-logo-placement="logos/horizontal-color"] [data-corner="top-left"]').getAttribute('aria-label')).toBe('Horizontal logo, top left');
    expect(q('[data-logo-placement="logos/horizontal-color"]').textContent).toContain('Horizontal logo: the corners come from the sidecar');
  });
});
