// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import path from 'node:path';
import { REPO } from '../support/paths';
import { hasReference, referencePath } from '../support/reference';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { loadConfig } from '../../src/core/config/index.js';
import { compileBlazonData } from '../../src/core/index.js';
import { injectBlazonData } from '../../src/server/data-script.js';
import type { BlazonData } from '../../src/types/index.js';
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
  delete (Element.prototype as Partial<Element>).scrollIntoView;
});

function openViewer(hash: string, brand: BlazonData = data) {
  document.head.innerHTML = new DOMParser().parseFromString(injectBlazonData('<html><head></head><body></body></html>', brand), 'text/html').head.innerHTML;
  window.location.hash = hash;
  return render(<App />);
}

function main() {
  return within(screen.getByRole('main'));
}

describe.skipIf(!PRESENT)('section index', () => {
  it('lists the sections of a long token page and jumps to one', async () => {
    const scrolled: string[] = [];
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled.push(this.id);
    };
    openViewer('#tokens/colors');
    await act(async () => {});
    const index = main().getByRole('navigation', { name: 'On this page' });
    const links = within(index)
      .getAllByRole('button')
      .map((b) => b.textContent);
    expect(links).toEqual(expect.arrayContaining(['Neutral', 'Primary', 'Secondary']));

    await act(async () => {
      fireEvent.click(within(index).getByRole('button', { name: 'Primary' }));
    });
    expect(scrolled).toEqual(['section-primary-color-primary']);
  });

  it('tells apart two sections with the same heading by their path', async () => {
    openViewer('#tokens/colors');
    await act(async () => {});
    const index = main().getByRole('navigation', { name: 'On this page' });
    const proportions = within(index)
      .getAllByRole('button')
      .filter((b) => b.textContent?.startsWith('Proportions'));
    // One per group that documents a proportion (Auth0: the palette rule on color, and slide 84's web usage)
    const groups = data.tokens.groupMeta.filter((g) => g.blazon.proportion).map((g) => g.path);
    expect(groups.length).toBe(2);
    expect(proportions.map((b) => b.textContent)).toEqual(groups.map((g) => `Proportions · ${g}`));
  });

  it('gives every section its own anchor, even two on the same path', async () => {
    openViewer('#tokens/colors');
    await act(async () => {});
    const ids = [...document.querySelectorAll('main section[data-section]')].map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('is left out of a page with only a few sections', async () => {
    openViewer('#tokens/typography');
    await act(async () => {});
    expect(main().queryByRole('navigation', { name: 'On this page' })).toBeNull();
  });
});

describe.skipIf(!PRESENT)('all tokens filters', () => {
  async function choose(label: string, value: string) {
    await act(async () => {
      fireEvent.change(main().getByRole('combobox', { name: label }), { target: { value } });
    });
  }

  function rows() {
    return within(main().getByRole('list', { name: 'Tokens' })).getAllByRole('listitem');
  }

  it('filters by type and by group, and says how many match', async () => {
    openViewer('#tokens/all');
    expect(rows().length).toBe(data.tokens.items.length);

    await choose('Type', 'typography');
    const typography = data.tokens.items.filter((t) => t.type === 'typography');
    expect(rows().length).toBe(typography.length);
    expect(main().getByText(`${typography.length} of ${data.tokens.items.length} tokens`)).toBeTruthy();

    await choose('Group', 'icon');
    expect(main().getByText('No tokens match these filters.')).toBeTruthy();

    await choose('Type', '');
    const icons = data.tokens.items.filter((t) => t.group === 'icon');
    expect(rows().length).toBe(icons.length);
  });
});

describe.skipIf(!PRESENT)('review links', () => {
  it('links a finding to its token, opened at the token', () => {
    openViewer('#review');
    // A color finding, so its token page is known: Colors
    const finding = data.findings.find((f) => data.tokens.items.some((t) => t.path === f.path && t.type === 'color'))!;
    const link = main().getAllByRole('link', { name: finding.path })[0]!;
    expect(link.getAttribute('href')).toBe(`#tokens/colors?token=${finding.path}`);
  });

  it('leaves a finding that names no token as plain text', () => {
    const odd = { ...data, findings: [{ code: 'logo-missing', severity: 'warning' as const, path: 'logo', message: 'No logo' }] };
    openViewer('#review', odd);
    expect(main().getByText('logo').closest('a')).toBeNull();
  });
});

describe('search box', () => {
  it('keeps the spaces a reader types', () => {
    openViewer('#');
    const box = screen.getByLabelText('Search') as HTMLInputElement;
    fireEvent.change(box, { target: { value: 'brand ' } });
    expect(box.value).toBe('brand ');
    fireEvent.change(box, { target: { value: 'brand color' } });
    expect(box.value).toBe('brand color');
  });
});
