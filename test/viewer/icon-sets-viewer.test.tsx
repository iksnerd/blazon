// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import path from 'node:path';
import { REPO } from '../support/paths';
import { hasReference, referencePath } from '../support/reference';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { loadConfig } from '../../src/core/config/index.js';
import { compileBlazonData } from '../../src/core/index.js';
import { directiveFindings } from '../../src/core/docs/directives.js';
import { injectBlazonData } from '../../src/server/data-script.js';
import type { DocItem, BlazonData, IconSet } from '../../src/types/index.js';
import { App } from '../../src/viewer/App';

// The reference brand when a maintainer has it, else blazon's own: a describe that needs the reference is skipped without it
const PRESENT = hasReference('examples/auth0');
const EXAMPLE = PRESENT ? referencePath('examples/auth0') : path.join(REPO, 'examples/blazon');
const lucide: IconSet = {
  name: 'lucide',
  package: 'lucide-static',
  version: '1.61.0',
  license: 'ISC',
  count: 5,
  categories: [
    { name: 'Navigation', icons: ['arrow-left', 'home'] },
    { name: 'Other', icons: ['minus', 'plus', 'x'] },
  ],
};

let data: BlazonData;
beforeAll(async () => {
  data = await compileBlazonData(await loadConfig(EXAMPLE), EXAMPLE);
});
afterEach(() => {
  cleanup();
  document.head.innerHTML = '';
  localStorage.clear();
});

function openWith(directive: string, base?: string) {
  const doc: DocItem = { slug: 'guide', filePath: 'docs/guide.md', title: 'Guide', order: 99, meta: {}, sections: [], markdown: '', html: `<h2>Icons</h2>${directive}` };
  const brand: BlazonData = { ...data, docs: [...data.docs, doc], iconSets: [lucide] };
  document.head.innerHTML = new DOMParser().parseFromString(injectBlazonData('<html><head></head><body></body></html>', brand), 'text/html').head.innerHTML;
  if (base) document.head.insertAdjacentHTML('afterbegin', `<base href="${base}">`);
  window.location.hash = '#doc/guide';
  return render(<App />);
}

const main = () => within(screen.getByRole('main'));
const icons = () => [...document.querySelectorAll<HTMLElement>('main [data-icon-name]')].map((e) => e.dataset.iconName);

describe('the icon-set directive in the viewer', () => {
  it('lists each category collapsed, with its count, and draws no icon until one is opened', () => {
    openWith('<!-- blazon:icon-set lucide -->');
    const navigation = main().getByRole('button', { name: /Navigation/ });
    expect(navigation.getAttribute('aria-expanded')).toBe('false');
    expect(within(navigation).getByText('2')).toBeTruthy();
    expect(main().getByRole('button', { name: /Other/ }).getAttribute('aria-expanded')).toBe('false');
    expect(icons()).toEqual([]);
  });

  it("draws a category's icons from the package when it is opened, and hides them when closed", () => {
    openWith('<!-- blazon:icon-set lucide -->');
    const navigation = main().getByRole('button', { name: /Navigation/ });
    fireEvent.click(navigation);
    expect(navigation.getAttribute('aria-expanded')).toBe('true');
    expect(icons()).toEqual(['arrow-left', 'home']);
    const first = document.querySelector<HTMLElement>('main [data-icon-name="arrow-left"] [data-icon-mask]')!;
    // Absolute, because a relative url() in a custom property resolves against the stylesheet that uses
    // it (/assets/index-*.css in a built site), not against the page
    expect(first.style.getPropertyValue('--blazon-icon')).toBe(`url("${location.origin}/brand-assets/icon-sets/lucide/arrow-left.svg")`);
    fireEvent.click(navigation);
    expect(icons()).toEqual([]);
  });

  it("resolve an icon against the page's base, so a site under a subpath still finds its files", () => {
    openWith('<!-- blazon:icon-set lucide -->', `${location.origin}/brand/`);
    fireEvent.click(main().getByRole('button', { name: /Navigation/ }));
    const first = document.querySelector<HTMLElement>('main [data-icon-name="home"] [data-icon-mask]')!;
    expect(first.style.getPropertyValue('--blazon-icon')).toBe(`url("${location.origin}/brand/brand-assets/icon-sets/lucide/home.svg")`);
  });

  it('show only the categories named', () => {
    openWith('<!-- blazon:icon-set lucide Navigation -->');
    expect(main().getByRole('button', { name: /Navigation/ })).toBeTruthy();
    expect(main().queryByRole('button', { name: /Other/ })).toBeNull();
  });

  it('name the package, its version and license', () => {
    openWith('<!-- blazon:icon-set lucide -->');
    expect(main().getByText('lucide-static 1.61.0 · ISC · 5 icons')).toBeTruthy();
  });

  it('say so when the set or a category does not exist', () => {
    openWith('<!-- blazon:icon-set lucid --><!-- blazon:icon-set lucide Navigaton -->');
    expect(main().getByText('No icon set at lucid')).toBeTruthy();
    expect(main().getByText('No category Navigaton in lucide')).toBeTruthy();
  });
});

describe('blazon check on the icon-set directive', () => {
  const doc = (markdown: string) => ({ slug: 'p', filePath: 'p.md', title: 'P', order: 1, meta: {}, sections: [], markdown, html: '' }) as DocItem;
  const messages = (markdown: string) =>
    directiveFindings([doc(markdown)], { tokens: { items: [], groupMeta: [] }, assets: { logos: [], icons: [], custom: {}, all: [] }, hasLogo: true, iconSets: [lucide] }).map(
      (f) => f.message,
    );

  it('accepts a known set and its categories', () => {
    expect(messages('<!-- blazon:icon-set lucide -->')).toEqual([]);
    expect(messages('<!-- blazon:icon-set lucide Navigation Other -->')).toEqual([]);
  });

  it('names an unknown set or category and lists the known ones', () => {
    expect(messages('<!-- blazon:icon-set lucid -->')[0]).toMatch(/no icon set at lucid; known: lucide/);
    expect(messages('<!-- blazon:icon-set lucide Navigaton -->')[0]).toMatch(/no category Navigaton in lucide; known: Navigation, Other/);
    expect(messages('<!-- blazon:icon-set -->')[0]).toMatch(/needs at least one argument/);
  });
});
