// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { hasReference, referencePath } from '../support/reference';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { loadConfig } from '../../src/core/config/index.js';
import { compileBlazonData } from '../../src/core/index.js';
import { injectBlazonData } from '../../src/server/data-script.js';
import type { BlazonData } from '../../src/types/index.js';
import { App } from '../../src/viewer/App';

// The Auth0 example is the reference brand book. Its pages show the brand's own tokens live, not only
// describe them: each page below must render a token card for every path listed.

const EXAMPLE = referencePath('examples/auth0');
const PRESENT = hasReference('examples/auth0');
let data: BlazonData;
beforeAll(async () => {
  if (!PRESENT) return;
  data = await compileBlazonData(await loadConfig(EXAMPLE), EXAMPLE);
});
afterEach(() => {
  cleanup();
  document.head.innerHTML = '';
  localStorage.clear();
});

const PAGES: Record<string, string[]> = {
  colors: [
    'color.neutral.white',
    'color.neutral.black',
    'color.primary.orange',
    'color.primary.indigo',
    'color.secondary.yellow',
    'color.secondary.pink',
    'color.secondary.emerald',
    'gradient.orangePink',
    'gradient.aquaEmerald',
  ],
  typography: ['font.family.display', 'font.family.body', 'type.display', 'type.h1', 'type.base', 'type.xs'],
  layout: ['radius.container', 'radius.component', 'radius.card', 'radius.button'],
  motion: ['type.kinetic.fontSize', 'type.kinetic.letterSpacing'],
};

describe.skipIf(!PRESENT)('the Auth0 example pages that state tokens also show them', () => {
  it.each(Object.entries(PAGES))('the %s page renders a token card per token', (slug, paths) => {
    for (const tokenPath of paths)
      expect(
        data.tokens.items.some((t) => t.path === tokenPath),
        `${tokenPath} is a token`,
      ).toBe(true);

    document.head.innerHTML = new DOMParser().parseFromString(injectBlazonData('<html><head></head><body></body></html>', data), 'text/html').head.innerHTML;
    window.location.hash = `#doc/${slug}`;
    render(<App />);
    const shown = new Set([...document.querySelectorAll<HTMLElement>('main button[data-token]')].map((card) => card.dataset.token));
    expect(paths.filter((p) => !shown.has(p))).toEqual([]);
  });
});

describe.skipIf(!PRESENT)('a guideline page in a context', () => {
  it('shows the token values of the context the reader chose, as the token pages do', async () => {
    document.head.innerHTML = new DOMParser().parseFromString(injectBlazonData('<html><head></head><body></body></html>', data), 'text/html').head.innerHTML;
    window.location.hash = '#doc/typography';
    render(<App />);
    const display = () => document.querySelector<HTMLElement>('main [data-token="font.family.display"]')!.textContent!;
    expect(display()).not.toContain('Kinto');
    fireEvent.change(screen.getByLabelText('Locale'), { target: { value: 'ja' } });
    await waitFor(() => expect(display()).toContain('Kinto'));
  });
});
