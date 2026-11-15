// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import path from 'node:path';
import { REPO } from '../support/paths';
import { hasReference, referencePath } from '../support/reference';
import { cleanup, render, screen } from '@testing-library/react';
import { loadConfig } from '../../src/core/config/index.js';
import { compileBlazonData } from '../../src/core/index.js';
import { injectBlazonData } from '../../src/server/data-script.js';
import type { DocItem, BlazonData } from '../../src/types/index.js';
import { App } from '../../src/viewer/App';
import { badgeColorCodes } from '../../src/viewer/lib/theme/color-badges';
import { inkOnPaint } from '../../src/viewer/lib/theme/color';
import { linkTokenPaths } from '../../src/viewer/lib/tokens/token-links';
import { ColorText } from '../../src/viewer/components/blazon/color-text';

// Wherever the viewer writes a color as text, it is a badge: a pill filled with the color, in black or
// white ink by contrast, so the reader sees the color and not only its name.

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

/** What the browser makes of a CSS color, so a test compares like with like. */
function normalized(property: 'background' | 'color', value: string): string {
  const probe = document.createElement('span');
  probe.style[property] = value;
  return probe.style[property];
}

function parse(html: string): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = html;
  return root;
}

const badges = (root: ParentNode) => [...root.querySelectorAll<HTMLElement>('[data-color-badge]')];

describe('color codes written in prose', () => {
  it('become badges filled with that color, in readable ink, keeping the text', () => {
    const root = parse(badgeColorCodes('<p>Light Gray #E9EBED, Indigo rgb(99, 93, 255) and #00000080.</p>'));
    const found = badges(root);
    expect(found.map((b) => b.textContent)).toEqual(['#E9EBED', 'rgb(99, 93, 255)', '#00000080']);
    expect(found[0]!.style.background).toBe(normalized('background', '#E9EBED'));
    expect(found[0]!.style.color).toBe(normalized('color', '#000'));
    expect(found[1]!.style.background).toBe(normalized('background', 'rgb(99, 93, 255)'));
    expect(found[1]!.style.color).toBe(normalized('color', '#fff'));
    expect(root.textContent).toBe('Light Gray #E9EBED, Indigo rgb(99, 93, 255) and #00000080.');
  });

  it.each([
    ['a code block', '<pre><code>color: #E9EBED;</code></pre>'],
    ["a link's text", '<p><a href="/x">use #E9EBED</a></p>'],
    ['an attribute', '<p><a href="https://example.com/y#123456">y</a> <img alt="#E9EBED" src="a.png"></p>'],
    ['a 3-digit code, which may be an issue number', '<p>see #123 and #abc</p>'],
    ['a 4-digit or 5-digit code', '<p>#1234 #12345</p>'],
    ['a 7-digit run', '<p>#1234567</p>'],
    ['a word that merely contains hex digits', '<p>issue#E9EBED or x#E9EBED</p>'],
  ])('leave %s alone', (_, html) => {
    expect(badges(parse(badgeColorCodes(html)))).toEqual([]);
  });

  it('badge a code only once however often it runs', () => {
    const once = badgeColorCodes('<p>#E9EBED</p>');
    expect(badges(parse(badgeColorCodes(once)))).toHaveLength(1);
  });
});

describe('color codes written in inline code', () => {
  it('make a code span that is only a color its badge, in monospace and not nested in code', () => {
    const root = parse(badgeColorCodes('<p>Use <code>#3F73F8</code> for links.</p>'));
    const [badge] = badges(root);
    expect(badges(root)).toHaveLength(1);
    expect(badge!.tagName).toBe('CODE');
    expect(badge!.textContent).toBe('#3F73F8');
    expect(badge!.style.background).toBe(normalized('background', '#3F73F8'));
    expect(badge!.style.color).toBe(normalized('color', inkOnPaint('#3F73F8')));
    expect(root.querySelector('code code')).toBeNull();
    expect(root.textContent).toBe('Use #3F73F8 for links.');
  });

  it('badge an rgb() or rgba() code that is the whole span, and one with an alpha channel', () => {
    const root = parse(badgeColorCodes('<p><code>rgb(63, 115, 248)</code> <code>#0F172A8C</code></p>'));
    expect(badges(root).map((b) => b.textContent)).toEqual(['rgb(63, 115, 248)', '#0F172A8C']);
  });

  it('badge each color in a code span with more in it, and keep the rest as code', () => {
    const root = parse(badgeColorCodes('<p><code>blue.500 #3F73F8</code> and <code>#2050C8 → #1B2642</code></p>'));
    const codes = [...root.querySelectorAll('p > code')];
    expect(codes).toHaveLength(2);
    expect(codes[0]!.textContent).toBe('blue.500 #3F73F8');
    expect(badges(codes[0]!).map((b) => b.textContent)).toEqual(['#3F73F8']);
    expect(codes[1]!.textContent).toBe('#2050C8 → #1B2642');
    expect(badges(codes[1]!).map((b) => b.textContent)).toEqual(['#2050C8', '#1B2642']);
  });

  it('leave a code span without a color, and a color that is part of a longer word, as they are', () => {
    const html = '<p><code>--pm-blue</code> <code>issue#E9EBED</code> <code>#123</code></p>';
    const root = parse(badgeColorCodes(html));
    expect(badges(root)).toEqual([]);
    expect(root.innerHTML).toBe(html);
  });

  it('badge a code span once however often the pass runs', () => {
    const once = badgeColorCodes('<p><code>#E9EBED</code> <code>a #E9EBED</code></p>');
    expect(badges(parse(badgeColorCodes(once)))).toHaveLength(2);
  });
});

describe('color codes in the text the viewer prints itself', () => {
  it('are badges in that color, with the text around them kept', () => {
    const { container } = render(<ColorText text="Blue #3F73F8 and rgb(1, 2, 3), not #123." />);
    const found = badges(container);
    expect(found.map((b) => b.textContent)).toEqual(['#3F73F8', 'rgb(1, 2, 3)']);
    expect(found[0]!.style.background).toBe(normalized('background', '#3F73F8'));
    expect(container.textContent).toBe('Blue #3F73F8 and rgb(1, 2, 3), not #123.');
  });

  it('are plain text when there is no color in it', () => {
    const { container } = render(<ColorText text="A 4 : 1 ratio, issue #123" />);
    expect(badges(container)).toEqual([]);
    expect(container.textContent).toBe('A 4 : 1 ratio, issue #123');
  });
});

describe.skipIf(!PRESENT)('token paths written in prose', () => {
  const html = (path: string) => parse(linkTokenPaths(`<p><code>${path}</code></p>`, data));

  it("are badges filled with the token's color, keeping the path as the text and the link", () => {
    const root = html('color.primary.indigo');
    const [badge] = badges(root);
    expect(badge!.textContent).toBe('color.primary.indigo');
    expect(badge!.style.background).toBe(normalized('background', '#635DFF'));
    expect(badge!.style.color).toBe(normalized('color', '#fff'));
    expect(badge!.closest('a.blazon-token-link')).not.toBeNull();
    expect(root.querySelector('.blazon-token-dot')).toBeNull();
  });

  it('are badges for a gradient token too', () => {
    const [badge] = badges(html('gradient.indigoBlue'));
    expect(badge!.style.background).toMatch(/linear-gradient/);
  });

  it('are plain links for a group, which has no single color', () => {
    const root = html('color.primary.*');
    expect(badges(root)).toEqual([]);
    expect(root.querySelector('a.blazon-token-link')).not.toBeNull();
  });

  it('are plain links for a token that is not a color', () => {
    expect(badges(html('radius.card'))).toEqual([]);
  });
});

function open(hash: string, brand: BlazonData = data) {
  document.head.innerHTML = new DOMParser().parseFromString(injectBlazonData('<html><head></head><body></body></html>', brand), 'text/html').head.innerHTML;
  window.location.hash = hash;
  return render(<App />);
}

describe.skipIf(!PRESENT)('color badges in the viewer', () => {
  it("show a color in a page's own description, under its title, as a badge", () => {
    const doc: DocItem = {
      slug: 'guide',
      filePath: 'docs/guide.md',
      title: 'Guide',
      order: 99,
      meta: { description: 'The blue is #3F73F8 and the ink is #0F172A.' },
      sections: [],
      markdown: '',
      html: '<h2>Body</h2><p>Text.</p>',
    };
    open('#doc/guide', { ...data, docs: [...data.docs, doc] });
    const header = document.querySelector<HTMLElement>('main section p.text-base')!;
    expect([...header.querySelectorAll('[data-color-badge]')].map((b) => b.textContent)).toEqual(['#3F73F8', '#0F172A']);
    expect(header.textContent).toBe('The blue is #3F73F8 and the ink is #0F172A.');
  });

  it("show a guideline page's hex codes as badges", () => {
    const doc: DocItem = {
      slug: 'guide',
      filePath: 'docs/guide.md',
      title: 'Guide',
      order: 99,
      meta: {},
      sections: [],
      markdown: '',
      html: '<h2>Grays</h2><p>Light Gray #E9EBED.</p>',
    };
    open('#doc/guide', { ...data, docs: [...data.docs, doc] });
    const badge = [...document.querySelectorAll<HTMLElement>('main [data-color-badge]')].find((b) => b.textContent === '#E9EBED')!;
    expect(badge.style.background).toBe(normalized('background', '#E9EBED'));
    expect(screen.getByRole('main').textContent).toContain('Light Gray #E9EBED.');
  });

  it("show a token card's value as a badge, for colors and gradients only, beside its swatch", () => {
    const doc: DocItem = {
      slug: 'guide',
      filePath: 'docs/guide.md',
      title: 'Guide',
      order: 99,
      meta: {},
      sections: [],
      markdown: '',
      html: '<h2>Tokens</h2><!-- blazon:tokens color.primary.indigo gradient.indigoBlue radius.card -->',
    };
    open('#doc/guide', { ...data, docs: [...data.docs, doc] });
    const card = (tokenPath: string) => document.querySelector<HTMLElement>(`main button[data-token="${tokenPath}"]`)!;
    const [indigo] = badges(card('color.primary.indigo'));
    expect(indigo!.textContent).toBe('#635DFF');
    expect(indigo!.style.background).toBe(normalized('background', '#635DFF'));
    expect(card('color.primary.indigo').querySelector('[data-swatch]')).not.toBeNull();
    const [gradient] = badges(card('gradient.indigoBlue'));
    expect(gradient!.style.background).toMatch(/linear-gradient/);
    // A gradient says its stops, not its CSS, which stays one hover away
    expect(gradient!.textContent).toMatch(/^#[0-9A-F]{6} → #[0-9A-F]{6}$/i);
    expect(gradient!.title).toMatch(/^linear-gradient\(/);
    expect(badges(card('radius.card'))).toEqual([]);
    expect(card('radius.card').textContent).toContain('24px');
  });

  it('show the color value in the all-tokens table as a badge, for colors only', () => {
    open('#tokens/all');
    const row = (tokenPath: string) => document.querySelector<HTMLElement>(`main tr[data-token="${tokenPath}"]`)!;
    const [badge] = badges(row('color.primary.indigo'));
    expect(badge!.textContent).toBe('#635DFF');
    expect(badge!.style.background).toBe(normalized('background', '#635DFF'));
    expect(badges(row('radius.card'))).toEqual([]);
  });

  it("show each semantic color's value on the Colors page as a badge in its own color", () => {
    open('#tokens/colors');
    const roles = [...document.querySelectorAll<HTMLElement>('main button[data-token]')].filter((b) => badges(b).length > 0 && b.querySelector('.font-mono.text-sm'));
    expect(roles.length).toBeGreaterThan(0);
    for (const role of roles) {
      const token = data.tokens.items.find((t) => t.path === role.dataset.token)!;
      expect(badges(role)[0]!.style.background, token.path).toBe(normalized('background', String(token.value)));
    }
  });
});
