// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import path from 'node:path';
import { REPO } from '../support/paths';
import { hasReference, referencePath } from '../support/reference';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { loadConfig } from '../../src/core/config/index.js';
import { compileBlazonData } from '../../src/core/index.js';
import { injectBlazonData } from '../../src/server/data-script.js';
import type { Asset, BlazonData } from '../../src/types/index.js';
import { App } from '../../src/viewer/App';

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

/** Opens the viewer the way a browser does: the data script blazon build writes, then a hash route. */
function openViewer(hash: string, brand: BlazonData = data) {
  document.head.innerHTML = new DOMParser().parseFromString(injectBlazonData('<html><head></head><body></body></html>', brand), 'text/html').head.innerHTML;
  window.location.hash = hash;
  return render(<App />);
}

function main() {
  return within(screen.getByRole('main'));
}

describe.skipIf(!PRESENT)('doc pages', () => {
  it('opens a doc with its cover, its sections and the logo usage tiles', () => {
    const doc = data.docs.find((d) => d.title === 'Logotype')!;
    openViewer(`#doc/${doc.slug}`);

    expect(main().getByRole('heading', { level: 1, name: 'Logotype' })).toBeTruthy();
    expect(main().getByText('System elements', { selector: 'p' })).toBeTruthy();
    expect(main().getByRole('heading', { level: 2, name: 'Anatomy' })).toBeTruthy();
    expect(main().getByText('On dark backgrounds')).toBeTruthy();
    expect(main().getByText('System elements / Logotype')).toBeTruthy();
  });

  it('lists every doc in the navigation under its group', () => {
    openViewer('');
    const nav = within(screen.getByRole('navigation', { name: 'Brand book' }));
    expect(nav.getByText('System elements')).toBeTruthy();
    expect(nav.getByRole('link', { name: 'Logotype' })).toBeTruthy();
  });

  it('opens the first doc when there is no hash', () => {
    openViewer('');
    expect(main().getByRole('heading', { level: 1, name: data.docs[0]!.title })).toBeTruthy();
  });
});

describe('navigating', () => {
  it('follows hash changes', async () => {
    openViewer('#tokens/colors');
    await act(async () => {
      window.location.hash = '#review';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(main().getByRole('heading', { level: 1, name: 'Review' })).toBeTruthy();
  });

  it('says so when a page does not exist', () => {
    openViewer('#nowhere');
    expect(main().getByRole('heading', { level: 1, name: 'Nothing here' })).toBeTruthy();
  });
});

/** Records what the viewer puts on the clipboard. */
function stubClipboard(): string[] {
  const copied: string[] = [];
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn(async (text: string) => void copied.push(text)) },
  });
  return copied;
}

async function click(element: HTMLElement) {
  await act(async () => {
    fireEvent.click(element);
  });
}

describe.skipIf(!PRESENT)('colors', () => {
  it('prints the deck specs on each brand color', () => {
    openViewer('#tokens/colors');
    // The brand tile comes first; icon palettes repeat the value further down
    const indigo = main().getAllByText('HEX #635DFF')[0]!.closest('button')!;
    expect(within(indigo).getByText('CMYK 84 70 0 0')).toBeTruthy();
    expect(within(indigo).getByText('PMS 2726 C')).toBeTruthy();
    expect(within(indigo).getByText('RGB 99 93 255')).toBeTruthy();
  });

  it('writes a RAL number as RAL on the color card', () => {
    const items = data.tokens.items.map((t) => (t.path === 'color.primary.indigo' ? { ...t, blazon: { ...t.blazon, print: { ...t.blazon.print, ral: '5012' } } } : t));
    openViewer('#tokens/colors', { ...data, tokens: { ...data.tokens, items } });
    const indigo = main().getAllByText('HEX #635DFF')[0]!.closest('button')!;
    expect(within(indigo).getByText('PMS 2726 C')).toBeTruthy();
    expect(within(indigo).getByText('RAL 5012')).toBeTruthy();
  });

  it('copies a color as its CSS variable', async () => {
    const copied = stubClipboard();
    openViewer('#tokens/colors');
    await click(main().getAllByText('HEX #635DFF')[0]!.closest('button')!);
    expect(copied).toEqual(['var(--color-primary-indigo)']);
  });

  it('shows the documented proportions of the palette', () => {
    openViewer('#tokens/colors');
    // Each bucket shows on the bar and again in the legend
    expect(main().getAllByText('60% Neutral').length).toBeGreaterThan(0);
    expect(main().getAllByText('30% Primary').length).toBeGreaterThan(0);
  });

  it('shows a second proportion whose buckets are named, not groups (web color usage, slide 84)', () => {
    openViewer('#tokens/colors');
    const bucket = (label: string) => [...document.querySelectorAll<HTMLElement>('main [data-bucket]')].find((b) => b.textContent === label);
    expect(bucket('25% Light to medium neutrals')).toBeTruthy();
    expect(bucket('10% Accent colors')).toBeTruthy();
    // A bucket is painted with its tokens' colors
    expect(bucket('50% White')!.querySelector<HTMLElement>('[data-swatch]')!.style.background).toBe('rgb(255, 255, 255)');
  });

  it('shows token cards in the Auth0 icon and illustration pages, every path resolving', () => {
    for (const slug of ['icons', 'illustration']) {
      openViewer(`#doc/${slug}`);
      expect(document.querySelectorAll('main [data-token]').length).toBeGreaterThan(3);
      expect(main().queryByText(/^No token at/)).toBeNull();
      cleanup();
    }
  });

  it('keeps web color usage on its own group, apart from the product ramps', () => {
    openViewer('#tokens/colors');
    const bar = [...document.querySelectorAll<HTMLElement>('main [data-bucket]')].find((b) => b.textContent === '50% White')!;
    const section = bar.closest('section')!;
    expect(within(section).getByText('color.webUsage')).toBeTruthy();
  });

  it('shows semantic roles with the palette color they point to', () => {
    openViewer('#tokens/colors');
    expect(main().getAllByText('color.primary.indigo').length).toBeGreaterThan(0);
  });
});

describe.skipIf(!PRESENT)('typography', () => {
  it('sets each style in itself with the deck label', () => {
    openViewer('#tokens/typography');
    expect(main().getByText('Inter Semibold 64/72px').style.font).toContain('64px');
    expect(main().getAllByText('Space Grotesk').length).toBeGreaterThan(0);
  });

  it('copies a style as its typography.css class name', async () => {
    const copied = stubClipboard();
    openViewer('#tokens/typography');
    await click(main().getByText('Inter Semibold 64/72px'));
    expect(copied).toEqual(['type-h1']);
  });
});

describe.skipIf(!PRESENT)('typefaces', () => {
  it('shows each typeface once, not again for a token that only aliases it', () => {
    openViewer('#tokens/typography');
    const typefaces = main().getByRole('heading', { level: 2, name: 'Typefaces' }).closest('section')!;
    const names = within(typefaces as HTMLElement)
      .getAllByText((_, el) => el?.tagName === 'SPAN' && el.classList.contains('font-semibold'))
      .map((el) => el.textContent);
    expect(names.filter((n) => n === 'Space Grotesk')).toHaveLength(1);
    expect(names).toEqual(expect.arrayContaining(['Space Grotesk', 'Inter', 'Kinto']));
  });
});

describe('dimensions', () => {
  it('shows radii, but not font dimensions', () => {
    openViewer('#tokens/dimensions');
    expect(main().getByRole('heading', { level: 2, name: 'Radius' })).toBeTruthy();
    expect(main().queryByText('font.letterSpacing')).toBeNull();
  });
});

describe.skipIf(!PRESENT)('all tokens and search', () => {
  it('lists every token in a table', () => {
    openViewer('#tokens/all');
    expect(main().getAllByRole('row').length).toBe(data.tokens.items.length + 1);
  });

  it('searches tokens and pages from the sidebar', async () => {
    openViewer('#tokens/colors');
    await act(async () => {
      fireEvent.change(screen.getByRole('searchbox', { name: 'Search' }), { target: { value: 'Indigo' } });
    });
    expect(main().getByRole('heading', { level: 1, name: 'Search: indigo' })).toBeTruthy();
    // In the table and in the phone list; CSS shows one of them
    expect(main().getAllByText('color.primary.indigo', { selector: 'code' }).length).toBeGreaterThan(0);
    expect(main().getByRole('link', { name: 'Logotype' })).toBeTruthy();
  });

  it('ends the search when the reader picks a page', async () => {
    openViewer('#tokens/colors');
    await act(async () => {
      fireEvent.change(screen.getByRole('searchbox', { name: 'Search' }), { target: { value: 'indigo' } });
    });
    await act(async () => {
      window.location.hash = '#review';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(main().getByRole('heading', { level: 1, name: 'Review' })).toBeTruthy();
    expect((screen.getByRole('searchbox', { name: 'Search' }) as HTMLInputElement).value).toBe('');
  });
});

describe.skipIf(!PRESENT)('review', () => {
  it('lists what blazon check found', () => {
    openViewer('#review');
    expect(main().getByRole('heading', { level: 2, name: 'Warnings' })).toBeTruthy();
    // The color in the message is a badge in that color, so the sentence is split across elements: find it by its whole text
    const message = main().getByText((_, el) => el?.tagName === 'SPAN' && el.textContent === 'Label copied from red.light; slide 86 draws this swatch #FF79E7');
    const badge = message.querySelector<HTMLElement>('[data-color-badge]')!;
    expect(badge.textContent).toBe('#FF79E7');
    expect(badge.style.background).toBeTruthy();
  });

  it('says when there is nothing to review', () => {
    openViewer('#review', { ...data, findings: [] });
    expect(main().getByText('blazon check found nothing to review.')).toBeTruthy();
  });

  describe('approved', () => {
    type Review = NonNullable<BlazonData['tokens']['items'][number]['blazon']['review']>;

    /** The brand with the first tokens' reviews set, and no other approved item. */
    const approving = (reviews: Review[], findings: BlazonData['findings'] = []): BlazonData => {
      const items: BlazonData['tokens']['items'] = data.tokens.items.map((t) => ({ ...t, blazon: { ...t.blazon, review: undefined } }));
      reviews.forEach((review, i) => (items[i]!.blazon = { ...items[i]!.blazon, review }));
      return { ...data, findings, tokens: { ...data.tokens, items, groupMeta: [] }, assets: { ...data.assets, logos: [], icons: [], custom: {} } };
    };
    const rows = () =>
      main()
        .getAllByRole('listitem')
        .filter((li) => li.textContent?.includes('Approved'));

    it('lists who approved a value and when, with the note', () => {
      openViewer('#review', approving([{ status: 'ok', by: 'A. Person', at: '2026-10-28', note: 'Checked against the deck' }]));
      expect(main().getByRole('heading', { level: 2, name: 'Approved' })).toBeTruthy();
      expect(main().getByText('Approved by A. Person on 2026-10-28. Checked against the deck')).toBeTruthy();
      expect(main().getByText('no value recorded')).toBeTruthy();
    });

    it('says what is missing when an approval has only some of it', () => {
      openViewer('#review', approving([{ status: 'ok', by: 'A. Person' }, { status: 'ok', at: '2026-10-28', value: 'abcdef012345' }, { status: 'ok' }]));
      expect(main().getByText('Approved by A. Person')).toBeTruthy();
      expect(main().getByText('Approved on 2026-10-28')).toBeTruthy();
      expect(main().getByText('Approved, with no name or date recorded')).toBeTruthy();
      expect(main().getByText('value recorded')).toBeTruthy();
    });

    it('marks an approval whose value changed, and lists it first', () => {
      const [first, second] = [data.tokens.items[0]!, data.tokens.items[1]!];
      const stale = {
        code: 'approval-stale',
        severity: 'warning',
        path: second.path,
        message: 'The value changed after review.status was set to ok',
      } as BlazonData['findings'][number];
      openViewer(
        '#review',
        approving(
          [
            { status: 'ok', by: 'A', at: '2026-10-01', value: 'aaaaaaaaaaaa' },
            { status: 'ok', by: 'B', at: '2026-10-02', value: 'bbbbbbbbbbbb' },
          ],
          [stale],
        ),
      );
      expect(main().getByText('changed since')).toBeTruthy();
      expect(rows()[0]!.textContent).toContain('Approved by B');
      expect(rows()[1]!.textContent).toContain('Approved by A');
      expect(first.path).not.toBe(second.path);
    });

    it('has no Approved section when nothing is approved', () => {
      openViewer('#review', approving([]));
      expect(main().queryByRole('heading', { level: 2, name: 'Approved' })).toBeNull();
    });
  });
});

describe.skipIf(!PRESENT)('reference fixture: icons and remaining chapters', () => {
  it('ships Feather system icons drawn at the deck stroke of 1.5px on the 24 grid', () => {
    const icons = data.assets.icons;
    expect(icons.length).toBeGreaterThanOrEqual(6);
    for (const icon of icons) {
      expect(icon.format).toBe('svg');
      expect(icon.viewBox).toBe('0 0 24 24');
      expect(icon.svg).toContain('stroke-width="1.5"');
    }
  });

  it('shows the deck examples inline in the guideline pages, every asset resolving', () => {
    for (const title of ['Logotype', 'Icons', 'Illustration', 'Photography', 'Patterns', 'Diagrams', 'Motion', 'Social templates', 'Applications']) {
      const doc = data.docs.find((d) => d.title === title)!;
      openViewer(`#doc/${doc.slug}`);
      expect(document.querySelectorAll('main figure img').length, title).toBeGreaterThan(0);
      expect(main().queryByText(/^No asset at/), title).toBeNull();
      cleanup();
    }
  });

  it('holds every standard section, each page naming the ones it holds', () => {
    for (const doc of data.docs) expect(doc.sections.length, doc.slug).toBeGreaterThan(0);
    expect(data.findings.filter((f) => f.code === 'section-missing' || f.code === 'section-invalid')).toEqual([]);
    expect(data.docs.find((d) => d.slug === 'patterns')!.sections).toEqual(['patterns']);
    expect(data.docs.find((d) => d.title === '3D graphics')!.sections).toEqual(['3d']);
  });

  it('draws its image-led sections from sidecars and the assets block, not from page prose', () => {
    const block = (title: string, id: string) => {
      openViewer(`#doc/${data.docs.find((d) => d.title === title)!.slug}`);
      return document.querySelector<HTMLElement>(`main [data-section-asset="${id}"]`);
    };
    const lifestyle = block('Photography', 'photography/lifestyle')!;
    expect(within(lifestyle).getByRole('heading', { name: 'Lifestyle' })).toBeTruthy();
    expect(within(lifestyle).getByText('Candid and real scenarios')).toBeTruthy();
    expect(within(lifestyle).getByText('Source: auth0-brand-guidelines, slide 58')).toBeTruthy();
    expect(within(document.querySelector<HTMLElement>('main [data-section-end="photography"]')!).getByText('Not specified')).toBeTruthy();
    cleanup();
    const twoD = block('Patterns', 'patterns/patterns-2d')!;
    expect(within(twoD).getByText("Don't")).toBeTruthy();
    expect(within(twoD).getByText('Use opacity or any blending mode.')).toBeTruthy();
    cleanup();
    for (const [title, id] of [
      ['Motion', 'motion/video-bumpers'],
      ['Applications', 'applications/swag'],
    ]) {
      const el = block(title!, id!);
      expect(el, id).not.toBeNull();
      expect(el!.querySelector('h3 + p'), id).not.toBeNull();
      cleanup();
    }
    const spot = block('Illustration', 'illustrations/spot-illustrations')!;
    expect(within(spot).getByRole('heading', { name: 'Spot illustrations' })).toBeTruthy();
    expect(within(spot).getByText('Use fragments of objects instead of the object itself, whenever possible.')).toBeTruthy();
    cleanup();
    expect(block('Diagrams', 'diagrams/diagram-2d-pills')!.querySelector('h3 + p')).not.toBeNull();
    expect(within(document.querySelector<HTMLElement>('main [data-section-end="diagrams"]')!).getByText('Not specified')).toBeTruthy();
    cleanup();
    // The deck gives 3D graphics no words per image, so they carry a title and a source only
    expect(within(block('3D graphics', '3d-graphics/login-box')!).getByRole('heading', { name: 'Login box' })).toBeTruthy();
    cleanup();
  });

  it('covers the deck slides that are only pictures: tagline, 3D graphics, bumpers and design samples', () => {
    const shows = (title: string, ids: string[]) => {
      openViewer(`#doc/${data.docs.find((d) => d.title === title)!.slug}`);
      for (const id of ids) expect(document.querySelector(`main figure[data-asset="${id}"] img`), `${title}: ${id}`).not.toBeNull();
      cleanup();
    };
    shows('Typography', ['typography/tagline', 'typography/web-typography']);
    shows('3D graphics', ['3d-graphics/shield-ribbons', '3d-graphics/icon-cubes', '3d-graphics/login-box']);
    shows('Motion', ['motion/video-bumpers', 'motion/bumper-colors', 'motion/examples']);
    shows('Applications', [
      'applications/resources',
      'applications/covers',
      'applications/swag',
      'applications/stationery',
      'applications/product-screens',
      'applications/posters-and-banners',
    ]);
  });

  it('documents photography, patterns and diagrams in deck order, and the social templates', () => {
    const titles = data.docs.map((d) => d.title);
    const at = (t: string) => titles.indexOf(t);
    expect(at('Illustration')).toBeLessThan(at('Photography'));
    expect(at('Photography')).toBeLessThan(at('Patterns'));
    expect(at('Patterns')).toBeLessThan(at('3D graphics'));
    expect(at('3D graphics')).toBeLessThan(at('Diagrams'));
    expect(at('Diagrams')).toBeLessThan(at('Motion'));
    expect(at('Social templates')).toBeGreaterThan(at('Containers and layout'));
    expect(at('Applications')).toBeGreaterThan(at('Social templates'));
  });
});

describe.skipIf(!PRESENT)('assets', () => {
  it('shows each raster logo as an image with its size, a download link and Copy URL', async () => {
    const copied = stubClipboard();
    openViewer('#assets/logos');
    const card = main().getByAltText('logotype-black').closest('figure')!;
    expect(within(card).getByText('PNG, 2426 × 717, 42 KB')).toBeTruthy();
    expect(within(card).getByRole('link', { name: 'Download' }).getAttribute('href')).toBe('brand-assets/logos/logotype-black.png');
    await click(within(card).getByRole('button', { name: 'Copy URL' }));
    expect(copied[0]).toMatch(/\/brand-assets\/logos\/logotype-black\.png$/);
  });

  it('never inlines SVG markup, and copies it only after sanitizing', async () => {
    const hostile: Asset = {
      ...data.assets.logos[0]!,
      name: 'star',
      format: 'svg',
      filePath: 'icons/star.svg',
      url: 'brand-assets/icons/star.svg',
      svg: '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(2)</script><path class="a" d="M0 0h1"/></svg>',
    };
    const copied = stubClipboard();
    openViewer('#assets/icons', { ...data, assets: { ...data.assets, icons: [hostile] } });

    expect(main().getByAltText('star').tagName).toBe('IMG');
    expect(document.querySelector('main svg path.a')).toBeNull();

    await click(main().getByRole('button', { name: 'Copy SVG' }));
    await click(main().getByRole('button', { name: 'Copy JSX' }));
    expect(copied[0]).toContain('<path');
    expect(copied.join('')).not.toMatch(/onload|<script|alert/);
    expect(copied[1]).toContain('export function StarIcon(props');
    expect(copied[1]).toContain('className="a"');
  });
});

describe.skipIf(!PRESENT)('the brand book wears the brand', () => {
  it('applies the brand theme and fonts to the page', () => {
    openViewer('#tokens/colors');
    const root = document.documentElement.style;
    expect(root.getPropertyValue('--blazon-accent')).toBe('#635DFF');
    expect(root.getPropertyValue('--blazon-font-display')).toBe("'Space Grotesk', Inter, sans-serif");
    expect(document.title).toBe(data.title);
  });

  it('takes the corner radius from the brand when the theme maps one', () => {
    openViewer('#tokens/colors', { ...data, theme: { ...data.theme, radius: '0px' } });
    expect(document.documentElement.style.getPropertyValue('--blazon-radius')).toBe('0px');
  });

  it('switches to dark mode with the logo made for dark backgrounds, and remembers it', async () => {
    localStorage.clear();
    openViewer('#tokens/colors');
    expect(screen.getByAltText(data.title).getAttribute('src')).toBe(data.logo!.onLight);

    await click(screen.getByRole('button', { name: 'Dark mode' }));
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(screen.getByAltText(data.title).getAttribute('src')).toBe(data.logo!.onDark);
    expect(localStorage.getItem('blazon-mode')).toBe('dark');

    await click(screen.getByRole('button', { name: 'Light mode' }));
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('shows fresh data when blazon dev pushes an update', async () => {
    openViewer('#review');
    await act(async () => {
      window.dispatchEvent(new CustomEvent('blazon:update', { detail: { ...data, findings: [] } }));
    });
    expect(main().getByText('blazon check found nothing to review.')).toBeTruthy();
  });
});

describe.skipIf(!PRESENT)('resolver contexts', () => {
  async function choose(label: string, value: string) {
    await act(async () => {
      fireEvent.change(screen.getByRole('combobox', { name: label }), { target: { value } });
    });
  }

  it('offers one select per modifier, the default labelled', () => {
    openViewer('#tokens/typography');
    const locale = screen.getByRole('combobox', { name: 'Locale' }) as HTMLSelectElement;
    expect([...locale.options].map((o) => o.text)).toEqual(['en (default)', 'ja', 'de', 'fr']);
    expect(locale.value).toBe('en');
  });

  it('shows the tokens as the chosen context resolves them, and remembers the choice', async () => {
    openViewer('#tokens/typography');
    expect(main().getByText('Inter Semibold 64/72px')).toBeTruthy();

    await choose('Locale', 'de');
    expect(main().getByText('Inter Semibold 56/64px')).toBeTruthy();
    expect(main().queryByText('Inter Semibold 64/72px')).toBeNull();

    cleanup();
    openViewer('#tokens/typography');
    expect((screen.getByRole('combobox', { name: 'Locale' }) as HTMLSelectElement).value).toBe('de');
    expect(main().getByText('Inter Semibold 56/64px')).toBeTruthy();
  });

  it('sets the content language to the chosen locale', async () => {
    openViewer('#tokens/typography');
    expect(screen.getByRole('main').getAttribute('lang')).toBe('en');
    await choose('Locale', 'ja');
    expect(screen.getByRole('main').getAttribute('lang')).toBe('ja');
    expect(main().getByText('Kinto Semibold 64/72px')).toBeTruthy();
  });

  it('dresses the brand book in the chosen locale: a role whose token the locale changes follows it', async () => {
    openViewer('#tokens/typography');
    const root = () => document.documentElement.style;
    expect(root().getPropertyValue('--blazon-font-body')).toBe(data.theme.fontBody);
    await choose('Locale', 'ja');
    const kinto = data.tokens.contexts!.find((c) => c.context === 'ja')!.tokens.find((t) => t.path === 'font.family.body')!;
    expect(root().getPropertyValue('--blazon-font-body')).toBe(String(kinto.value));
    expect(root().getPropertyValue('--blazon-font-body')).not.toBe(data.theme.fontBody);
    // A role the locale leaves alone keeps its value
    expect(root().getPropertyValue('--blazon-accent')).toBe(data.theme.accent);
    await choose('Locale', 'en');
    expect(root().getPropertyValue('--blazon-font-body')).toBe(data.theme.fontBody);
  });

  it('forgets the choice when the reader picks the default again', async () => {
    openViewer('#tokens/typography');
    await choose('Locale', 'ja');
    await choose('Locale', 'en');
    expect(JSON.parse(localStorage.getItem('blazon-contexts') ?? '{}')).toEqual({});
  });

  it('flags a token for review only in the context where the finding applies', async () => {
    openViewer('#tokens/typography');
    const body = () => main().getByText('font.family.body').closest('button')!;
    expect(within(body()).queryByText('Review')).toBeNull();
    await choose('Locale', 'ja');
    expect(within(body()).getByText('Review')).toBeTruthy();
  });

  it('lists context findings on the Review page with their context', () => {
    openViewer('#review');
    expect(main().getByText('review-pending, only in locale=ja')).toBeTruthy();
  });

  it('shows no switcher for a brand without a resolver document', () => {
    openViewer('#tokens/typography', { ...data, tokens: { ...data.tokens, modifiers: undefined, contexts: undefined } });
    expect(screen.queryByRole('combobox', { name: 'Locale' })).toBeNull();
  });
});

describe.skipIf(!PRESENT)('app shell (shadcn sidebar-07 layout)', () => {
  function breadcrumb() {
    return within(screen.getByRole('navigation', { name: 'breadcrumb' }));
  }

  it('shows the section and page in a breadcrumb above every page', () => {
    openViewer('#tokens/colors');
    expect(breadcrumb().getByText('Tokens')).toBeTruthy();
    expect(breadcrumb().getByText('Colors').getAttribute('aria-current')).toBe('page');
    cleanup();

    const doc = data.docs.find((d) => d.title === 'Logotype')!;
    openViewer(`#doc/${doc.slug}`);
    expect(breadcrumb().getByText('System elements')).toBeTruthy();
    expect(breadcrumb().getByText('Logotype').getAttribute('aria-current')).toBe('page');
  });

  it('keeps the sidebar open on a wide screen, under a top bar that carries the logo', () => {
    openViewer('#tokens/colors');
    const sidebar = () => document.querySelector('[data-slot="sidebar"][data-state]')!;
    expect(sidebar().getAttribute('data-state')).toBe('expanded');

    const topBar = screen.getByRole('navigation', { name: 'breadcrumb' }).closest('header')!;
    expect(within(topBar).getByAltText(data.title)).toBeTruthy();
    expect(topBar.closest('main')).toBeNull();
    // The menu button opens the drawer on a narrow screen; on a wide one it changes nothing, and neither does Cmd+B
    fireEvent.click(within(topBar).getByRole('button', { name: 'Menu' }));
    fireEvent.keyDown(window, { key: 'b', metaKey: true });
    expect(sidebar().getAttribute('data-state')).toBe('expanded');
  });

  it('lists the pages as text, without icons, and marks the current one', () => {
    openViewer('#tokens/colors');
    const nav = screen.getByRole('navigation', { name: 'Brand book' });
    const links = within(nav).getAllByRole('link');
    expect(links.length).toBeGreaterThan(5);
    for (const link of links) expect(link.querySelector('svg'), link.textContent ?? '').toBeNull();
    const current = nav.querySelector<HTMLElement>('a[href="#tokens/colors"]')!;
    expect(current.getAttribute('aria-current')).toBe('page');
    expect(current.closest('li')!.querySelector('[aria-hidden="true"].bg-primary')).not.toBeNull();
  });

  it('closes a group from its label, and opens it closed next time', () => {
    localStorage.clear();
    openViewer('#tokens/colors');
    const nav = () => screen.getByRole('navigation', { name: 'Brand book' });
    const tokens = within(nav()).getByRole('button', { name: 'Tokens' });
    expect(tokens.getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(tokens);
    expect(tokens.getAttribute('aria-expanded')).toBe('false');
    expect(nav().querySelector('a[href="#tokens/colors"]')).toBeNull();
    expect(localStorage.getItem('blazon:nav-closed')).toBe('["Tokens"]');
    cleanup();

    openViewer('#tokens/colors');
    expect(within(nav()).getByRole('button', { name: 'Tokens' }).getAttribute('aria-expanded')).toBe('false');
    localStorage.clear();
  });

  it("lets the mode switch pick a theme modifier's light or dark tokens, with no select of its own", async () => {
    localStorage.clear();
    const token = data.tokens.items.find((t) => t.type === 'color')!;
    const brand: BlazonData = {
      ...data,
      tokens: {
        ...data.tokens,
        modifiers: [...(data.tokens.modifiers ?? []), { name: 'theme', default: 'light', contexts: ['light', 'dark'] }],
        contexts: [...(data.tokens.contexts ?? []), { modifier: 'theme', context: 'dark', selector: '.dark', tokens: [{ ...token, value: '#010203' }] }],
      },
    };
    openViewer('#tokens/colors', brand);
    const swatch = () => document.querySelector(`[data-token="${token.path}"]`)!.textContent;
    expect(screen.queryByRole('combobox', { name: 'Theme' })).toBeNull();
    expect(screen.getByRole('combobox', { name: 'Locale' })).toBeTruthy();
    expect(swatch()).not.toContain('#010203');

    await click(screen.getByRole('button', { name: 'Dark mode' }));
    expect(swatch()).toContain('#010203');
    localStorage.clear();
  });

  it("paints dark mode from the brand's own dark theme when the mode switch drives one, and from the inverse pair when it does not", () => {
    openViewer('#tokens/colors');
    expect(document.documentElement.hasAttribute('data-mode-themed')).toBe(false);
    cleanup();
    const brand: BlazonData = {
      ...data,
      tokens: { ...data.tokens, modifiers: [...(data.tokens.modifiers ?? []), { name: 'theme', default: 'light', contexts: ['light', 'dark'] }] },
    };
    openViewer('#tokens/colors', brand);
    expect(document.documentElement.hasAttribute('data-mode-themed')).toBe(true);
    document.documentElement.removeAttribute('data-mode-themed');
  });

  it('expands and collapses every group at once, remembers it, and offers to expand when one is closed by hand', () => {
    localStorage.clear();
    openViewer('#tokens/colors');
    const nav = () => screen.getByRole('navigation', { name: 'Brand book' });
    const groups = () =>
      within(nav())
        .getAllByRole('button')
        .filter((b) => b.hasAttribute('aria-expanded'));
    const allClosed = () => groups().every((b) => b.getAttribute('aria-expanded') === 'false');
    const allOpen = () => groups().every((b) => b.getAttribute('aria-expanded') === 'true');
    const count = groups().length;
    expect(count).toBeGreaterThan(2);
    expect(allOpen()).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Collapse all' }));
    expect(allClosed()).toBe(true);
    expect(JSON.parse(localStorage.getItem('blazon:nav-closed')!)).toHaveLength(count);
    cleanup();

    openViewer('#tokens/colors');
    expect(allClosed()).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Expand all' }));
    expect(allOpen()).toBe(true);
    expect(localStorage.getItem('blazon:nav-closed')).toBe('[]');

    fireEvent.click(groups()[0]!);
    expect(screen.getByRole('button', { name: 'Expand all' })).toBeTruthy();
    localStorage.clear();
  });

  it('keeps the contexts reachable on a phone, in the drawer, where the top bar has no room for them', async () => {
    const width = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { value: 800, configurable: true });
    try {
      openViewer('#tokens/colors');
      await click(screen.getByRole('button', { name: 'Menu' }));
      const drawer = within(await screen.findByRole('dialog'));
      expect(drawer.getByRole('combobox', { name: 'Locale' })).toBeTruthy();
    } finally {
      Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
    }
  });

  it('keeps search, the contexts and the mode in the top bar, not in the sidebar', () => {
    openViewer('#tokens/colors');
    const topBar = within(screen.getByRole('navigation', { name: 'breadcrumb' }).closest('header')!);
    expect(topBar.getByRole('searchbox', { name: 'Search' })).toBeTruthy();
    expect(topBar.getByRole('button', { name: 'Dark mode' })).toBeTruthy();
    const sidebar = within(document.querySelector<HTMLElement>('[data-slot="sidebar"][data-state]')!);
    expect(sidebar.queryByRole('searchbox')).toBeNull();
    expect(sidebar.queryByRole('button', { name: /mode/ })).toBeNull();
  });
});
