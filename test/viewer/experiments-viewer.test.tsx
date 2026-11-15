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

// An experimental asset category (RFC 0001 §11) is labelled where it is drawn, and listed on the Review page apart from the findings.

// The reference brand when a maintainer has it, else blazon's own: a describe that needs the reference is skipped without it
const PRESENT = hasReference('examples/auth0');
const EXAMPLE = PRESENT ? referencePath('examples/auth0') : path.join(REPO, 'examples/blazon');
const CATEGORY = 'logo-usage';
let data: BlazonData;

beforeAll(async () => {
  data = await compileBlazonData(await loadConfig(EXAMPLE), EXAMPLE);
});

afterEach(() => {
  cleanup();
  document.head.innerHTML = '';
  localStorage.clear();
});

function openViewer(hash: string, brand: BlazonData) {
  document.head.innerHTML = new DOMParser().parseFromString(injectBlazonData('<html><head></head><body></body></html>', brand), 'text/html').head.innerHTML;
  window.location.hash = hash;
  return render(<App />);
}
const main = () => within(screen.getByRole('main'));

/** The brand with one category experimental, and a page that draws it as a gallery and as a section. */
function experimenting(on = true): BlazonData {
  const doc: DocItem = {
    slug: 'guide',
    filePath: 'docs/guide.md',
    title: 'Guide',
    order: 99,
    meta: {},
    sections: [],
    markdown: '',
    html: `<!-- blazon:assets ${CATEGORY} -->`,
  };
  const section: DocItem = { ...doc, slug: 'sec', filePath: 'docs/sec.md', title: 'Sec', html: `<!-- blazon:section ${CATEGORY} -->` };
  return { ...data, docs: [...data.docs, doc, section], assetCategories: [{ category: CATEGORY, label: 'Sketches', ...(on && { experimental: true as const }) }] };
}

describe.skipIf(!PRESENT)('experimental asset categories in the viewer', () => {
  it('label the category page', () => {
    openViewer(`#assets/${CATEGORY}`, experimenting());
    expect(main().getByText('Experiment')).toBeTruthy();
    expect(main().getByText(/Explorations, not the brand's identity/)).toBeTruthy();
  });

  it('label each asset a blazon:assets directive draws, and a blazon:section too', () => {
    const count = data.assets.custom[CATEGORY]!.length;
    openViewer('#doc/guide', experimenting());
    expect(main().getAllByText('Experiment')).toHaveLength(count);
    cleanup();
    openViewer('#doc/sec', experimenting());
    expect(main().getAllByText('Experiment')).toHaveLength(count);
  });

  it('label nothing in an ordinary category', () => {
    openViewer(`#assets/${CATEGORY}`, experimenting(false));
    expect(main().queryByText('Experiment')).toBeNull();
    cleanup();
    openViewer('#doc/guide', experimenting(false));
    expect(main().queryByText('Experiment')).toBeNull();
  });

  it('are listed on the Review page with their file count, apart from the findings', () => {
    const brand = experimenting();
    openViewer('#review', brand);
    expect(main().getByRole('heading', { level: 2, name: 'Experiments' })).toBeTruthy();
    const row = document.querySelector(`[data-experiment-category="${CATEGORY}"]`) as HTMLElement;
    expect(row.textContent).toContain(`${brand.assets.custom[CATEGORY]!.length} files`);
    expect(within(row).getByRole('link').getAttribute('href')).toBe(`#assets/${CATEGORY}`);
  });

  it('have no Experiments section on the Review page when no category is experimental', () => {
    openViewer('#review', experimenting(false));
    expect(main().queryByRole('heading', { level: 2, name: 'Experiments' })).toBeNull();
  });
});

/** The same brand with the category marked `reference` in place of `experimental`. */
function referencing(on = true): BlazonData {
  const brand = experimenting(false);
  return { ...brand, assetCategories: [{ category: CATEGORY, label: 'Cards', ...(on && { reference: true as const }) }] };
}

describe.skipIf(!PRESENT)('reference asset categories in the viewer', () => {
  it('label the category page "Reference", and not "Experiment"', () => {
    openViewer(`#assets/${CATEGORY}`, referencing());
    expect(main().getByText('Reference')).toBeTruthy();
    expect(main().queryByText('Experiment')).toBeNull();
    expect(main().getByText(/kept for comparison or supplied by someone else/i)).toBeTruthy();
    expect(main().queryByText(/Explorations/)).toBeNull();
  });

  it('label each asset a blazon:assets directive draws, and a blazon:section too', () => {
    const count = data.assets.custom[CATEGORY]!.length;
    openViewer('#doc/guide', referencing());
    expect(main().getAllByText('Reference')).toHaveLength(count);
    expect(main().queryByText('Experiment')).toBeNull();
    cleanup();
    openViewer('#doc/sec', referencing());
    expect(main().getAllByText('Reference')).toHaveLength(count);
  });

  it('label nothing in an ordinary category', () => {
    openViewer(`#assets/${CATEGORY}`, referencing(false));
    expect(main().queryByText('Reference')).toBeNull();
    cleanup();
    openViewer('#doc/guide', referencing(false));
    expect(main().queryByText('Reference')).toBeNull();
  });

  it('are listed on the Review page under their own heading, with their file count', () => {
    const brand = referencing();
    openViewer('#review', brand);
    expect(main().getByRole('heading', { level: 2, name: 'Reference' })).toBeTruthy();
    expect(main().queryByRole('heading', { level: 2, name: 'Experiments' })).toBeNull();
    const row = document.querySelector(`[data-reference-category="${CATEGORY}"]`) as HTMLElement;
    expect(row.textContent).toContain(`${brand.assets.custom[CATEGORY]!.length} files`);
    expect(within(row).getByRole('link').getAttribute('href')).toBe(`#assets/${CATEGORY}`);
    expect(document.querySelector('[data-experiment-category]')).toBeNull();
  });

  it('have no Reference section on the Review page when no category is reference', () => {
    openViewer('#review', referencing(false));
    expect(main().queryByRole('heading', { level: 2, name: 'Reference' })).toBeNull();
  });

  it('are labelled by the directives that draw a logo, as experimental ones are', () => {
    const drawn = (on: boolean) => {
      const brand = drawing('<!-- blazon:logo-lockups sketches -->', false);
      return { ...brand, assetCategories: brand.assetCategories!.map((c) => (c.category === 'sketches' && on ? { ...c, reference: true as const } : c)) };
    };
    openViewer('#doc/draw', drawn(true));
    expect(main().getAllByText('Reference').length).toBeGreaterThan(0);
    expect(main().queryByText('Experiment')).toBeNull();
    cleanup();
    openViewer('#doc/draw', drawn(false));
    expect(main().queryByText('Reference')).toBeNull();
  });
});

// Every directive that draws an asset of a category labels it when the category is experimental (RFC 0001 §11).

const px = (value: number) => ({ value, unit: 'px' as const });

function asset(category: string, name: string, meta: AssetMeta): Asset {
  return {
    id: `${category}/${name}`,
    name,
    category,
    filePath: `${category}/${name}.svg`,
    format: 'svg',
    mediaType: 'image/svg+xml',
    url: `brand-assets/${category}/${name}.svg`,
    bytes: 10,
    width: 100,
    height: 40,
    viewBox: '0 0 100 40',
    svg: '<svg viewBox="0 0 100 40" width="100" height="40"></svg>',
    meta,
  };
}

const PLACEMENT = ['top-left'] as const;

/** Two categories with the same kind of logo: `sketches` is experimental when `on`, `plain` never is. */
function drawing(page: string, on: boolean): BlazonData {
  const sketch = (name: string, meta: AssetMeta = {}) =>
    asset('sketches', name, { lockup: 'horizontal', clearSpace: px(8), minSize: { width: px(40) }, placement: [...PLACEMENT], ...meta });
  const plain = (name: string, meta: AssetMeta = {}) =>
    asset('plain', name, { lockup: 'horizontal', clearSpace: px(8), minSize: { width: px(40) }, placement: [...PLACEMENT], ...meta });
  const sketches = [sketch('a', { partnership: { gap: px(8) }, initiative: { name: 'Program', mark: 'sketches/b', gap: px(8) } }), sketch('b')];
  const plains = [plain('a', { partnership: { gap: px(8) }, initiative: { name: 'Program', mark: 'plain/b', gap: px(8) } }), plain('b')];
  const icons = [asset('icons', 'x', {})];
  const doc: DocItem = { slug: 'draw', filePath: 'docs/draw.md', title: 'Draw', order: 99, meta: {}, sections: [], markdown: '', html: page };
  const all = [...sketches, ...plains, ...icons];
  return {
    ...data,
    docs: [...data.docs, doc],
    assets: { ...data.assets, all, logos: [], icons, custom: { sketches, plain: plains } },
    assetCategories: [
      { category: 'sketches', label: 'Sketches', ...(on && { experimental: true as const }) },
      { category: 'plain', label: 'Plain' },
      { category: 'icons', label: 'Icons', ...(on && { experimental: true as const }) },
    ],
  };
}

/** The labels on a page that draws `page`: with an experimental category and then without one. */
function labelsOn(directive: string): { experimental: number; ordinary: number } {
  openViewer('#doc/draw', drawing(directive, true));
  const experimental = main().queryAllByText('Experiment').length;
  cleanup();
  document.head.innerHTML = '';
  openViewer('#doc/draw', drawing(directive.replace(/sketches/g, 'plain'), true));
  const ordinary = main().queryAllByText('Experiment').length;
  return { experimental, ordinary };
}

describe('every directive that draws a category labels an experimental one', () => {
  it('blazon:logo-lockups labels each logo it draws', () => {
    expect(labelsOn('<!-- blazon:logo-lockups sketches -->')).toEqual({ experimental: 2, ordinary: 0 });
  });

  it('blazon:logo-space labels each logo it draws', () => {
    expect(labelsOn('<!-- blazon:logo-space sketches -->')).toEqual({ experimental: 2, ordinary: 0 });
  });

  it('blazon:logo-partner labels the pair when either logo is experimental', () => {
    expect(labelsOn('<!-- blazon:logo-partner sketches/a sketches/b -->')).toEqual({ experimental: 1, ordinary: 0 });
    cleanup();
    document.head.innerHTML = '';
    openViewer('#doc/draw', drawing('<!-- blazon:logo-partner plain/a sketches/b -->', true));
    expect(main().getAllByText('Experiment')).toHaveLength(1);
  });

  it('blazon:logo-initiative labels the logo and mark pair when either is experimental', () => {
    expect(labelsOn('<!-- blazon:logo-initiative sketches/a -->')).toEqual({ experimental: 1, ordinary: 0 });
  });

  it('blazon:logo-placement labels the logo', () => {
    expect(labelsOn('<!-- blazon:logo-placement sketches/a -->')).toEqual({ experimental: 1, ordinary: 0 });
  });

  it('blazon:icons labels an experimental icon folder once, and an ordinary one not at all', () => {
    openViewer('#doc/draw', drawing('<!-- blazon:icons icons -->', true));
    expect(main().getAllByText('Experiment')).toHaveLength(1);
    cleanup();
    document.head.innerHTML = '';
    openViewer('#doc/draw', drawing('<!-- blazon:icons icons -->', false));
    expect(main().queryByText('Experiment')).toBeNull();
  });
});
