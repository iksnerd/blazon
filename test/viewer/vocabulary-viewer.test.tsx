// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import path from 'node:path';
import { REPO } from '../support/paths';
import { hasReference, referencePath } from '../support/reference';
import { cleanup, render } from '@testing-library/react';
import { loadConfig } from '../../src/core/config/index.js';
import { compileBlazonData } from '../../src/core/index.js';
import { injectBlazonData } from '../../src/server/data-script.js';
import type { Asset, AssetMeta, DocItem, BlazonData } from '../../src/types/index.js';
import { App } from '../../src/viewer/App';

// The viewer groups logos by the lockups BlazonData holds, so a lockup a brand added shows (RFC 0002 §1).

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

const logo = (name: string, meta: AssetMeta): Asset => ({
  id: `logos/${name}`,
  name,
  category: 'logos',
  filePath: `logos/${name}.svg`,
  format: 'svg',
  mediaType: 'image/svg+xml',
  url: `brand-assets/logos/${name}.svg`,
  bytes: 1,
  width: 40,
  height: 40,
  meta,
});

function open(assets: Asset[], vocabulary: BlazonData['vocabulary']) {
  const doc: DocItem = {
    slug: 'guide',
    filePath: 'docs/guide.md',
    title: 'Guide',
    order: 99,
    meta: {},
    sections: [],
    markdown: '',
    html: '<h2>Logo</h2><!-- blazon:logo-lockups logos -->',
  };
  const brand: BlazonData = { ...data, vocabulary, docs: [...data.docs, doc], assets: { ...data.assets, logos: assets, icons: [], custom: {}, all: assets } };
  document.head.innerHTML = new DOMParser().parseFromString(injectBlazonData('<html><head></head><body></body></html>', brand), 'text/html').head.innerHTML;
  window.location.hash = '#doc/guide';
  return render(<App />);
}

const groups = () => [...document.querySelectorAll<HTMLElement>('main [data-lockup-group]')].map((g) => g.dataset.lockupGroup);

describe('blazon:logo-lockups with a vocabulary', () => {
  const standard = ['horizontal', 'stacked', 'mark', 'wordmark'];
  const mono = logo('mono', { lockup: 'monogram' });
  const horizontal = logo('wide', { lockup: 'horizontal' });
  const shield = logo('shield', { lockup: 'shield' });

  it('shows a lockup the brand added, after the standard ones, in the order the vocabulary lists them', () => {
    open([mono, horizontal, shield], { lockups: [...standard, 'monogram', 'shield'], usageRoles: [] });
    expect(groups()).toEqual(['horizontal', 'monogram', 'shield']);
  });

  it('titles the group from the name, as it does a standard one', () => {
    open([mono], { lockups: [...standard, 'monogram'], usageRoles: [] });
    expect(document.querySelector('main [data-lockup-group="monogram"] h3')!.textContent).toBe('Monogram');
  });

  it('does not show a lockup the vocabulary does not list', () => {
    open([mono, horizontal], { lockups: standard, usageRoles: [] });
    expect(groups()).toEqual(['horizontal']);
  });
});
