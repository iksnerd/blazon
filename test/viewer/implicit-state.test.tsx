// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { hasReference, referencePath } from '../support/reference';
import { loadConfig } from '../../src/core/config/index.js';
import { compileBlazonData } from '../../src/core/index.js';
import { injectBlazonData } from '../../src/server/data-script.js';
import { useSelectedContexts } from '../../src/viewer/lib/theme/contexts';
import { App } from '../../src/viewer/App';

const renders: string[] = [];
vi.mock('../../src/viewer/pages/tokens', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  SearchPage: ({ query }: { query: string }) => {
    renders.push(`${window.location.hash}|${query}`);
    return <p>search page</p>;
  },
}));

afterEach(() => {
  cleanup();
  document.head.innerHTML = '';
  localStorage.clear();
});

const EXAMPLE = referencePath('examples/auth0');

describe('viewer state that is derived, not synced', () => {
  it.skipIf(!hasReference('examples/auth0'))('never renders a search page on a page other than the one the search was typed on', async () => {
    const data = await compileBlazonData(await loadConfig(EXAMPLE), EXAMPLE);
    document.head.innerHTML = new DOMParser().parseFromString(injectBlazonData('<html><head></head><body></body></html>', data), 'text/html').head.innerHTML;
    window.location.hash = '#tokens/colors';
    render(<App />);
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'brand' } });
    expect(renders.at(-1)).toBe('#tokens/colors|brand');
    renders.length = 0;
    await act(async () => {
      window.location.hash = '#tokens/typography';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(renders).toEqual([]);
    expect((screen.getByLabelText('Search') as HTMLInputElement).value).toBe('');
  });

  it.skipIf(!hasReference('examples/auth0'))('keeps both of two context choices made before a render', async () => {
    const data = await compileBlazonData(await loadConfig(EXAMPLE), EXAMPLE);
    const modifier = data.tokens.modifiers!.find((m) => m.contexts.length > 1)!;
    const [a, b] = modifier.contexts.filter((c) => c !== modifier.default);
    const other = { ...modifier, name: 'other', default: 'x', contexts: ['x', 'y'] };
    const two = { ...data, tokens: { ...data.tokens, modifiers: [...data.tokens.modifiers!, other] } };
    const { result } = renderHook(() => useSelectedContexts(two));
    act(() => {
      result.current[1](modifier.name, (a ?? b)!);
      result.current[1]('other', 'y');
    });
    expect(result.current[0]).toEqual({ [modifier.name]: (a ?? b)!, other: 'y' });
    expect(JSON.parse(localStorage.getItem('blazon-contexts')!)).toEqual(result.current[0]);
  });
});
