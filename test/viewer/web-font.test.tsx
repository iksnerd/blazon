// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { cleanup, render, within } from '@testing-library/react';
import { compileBlazonData } from '../../src/core/index.js';
import { injectBlazonData } from '../../src/server/data-script.js';
import type { BlazonData } from '../../src/types/index.js';
import { App } from '../../src/viewer/App';
import { writeProject, TEST_CONFIG } from '../support/helpers.js';

// A typeface the brand book cannot load (`dev.blazon.webFont`, RFC 0001 §2): a commercial font with no web
// stylesheet. Its specimens say they show a fallback instead of passing one off as the brand's font.

const WHY = 'Commercial; use Proxima Nova where it is not installed.';
let data: BlazonData;

beforeAll(async () => {
  const root = writeProject({
    'tokens/type.json': {
      font: {
        $type: 'fontFamily',
        headline: { $value: ['Larsseit', 'sans-serif'], $extensions: { 'dev.blazon': { webFont: false } } },
        text: { $value: ['Circular Pro', 'sans-serif'], $extensions: { 'dev.blazon': { webFont: WHY } } },
        mono: { $value: ['Menlo', 'monospace'] },
      },
      type: {
        $type: 'typography',
        h1: { $value: { fontFamily: '{font.headline}', fontWeight: 700, fontSize: { value: 48, unit: 'px' }, lineHeight: 1.1 } },
        code: { $value: { fontFamily: '{font.mono}', fontWeight: 400, fontSize: { value: 14, unit: 'px' }, lineHeight: 1.4 } },
      },
    },
  });
  data = await compileBlazonData({ ...TEST_CONFIG }, root);
});

afterEach(() => {
  cleanup();
  document.head.innerHTML = '';
});

function open() {
  document.head.innerHTML = new DOMParser().parseFromString(injectBlazonData('<html><head></head><body></body></html>', data), 'text/html').head.innerHTML;
  window.location.hash = '#tokens/typography';
  return render(<App />);
}

const card = (path: string) => document.querySelector<HTMLElement>(`main [data-token="${path}"]`)!;

describe('a typeface the brand book cannot load', () => {
  it('keeps webFont on the token', () => {
    expect(data.tokens.byPath.get('font.headline')!.blazon.webFont).toBe(false);
    expect(data.tokens.byPath.get('font.text')!.blazon.webFont).toBe(WHY);
    expect(data.findings.filter((f) => f.severity !== 'info')).toEqual([]);
  });

  it('says on its card that the specimen is a fallback, with the reason when the brand gives one', () => {
    open();
    expect(within(card('font.headline')).getByText('Not loaded by this brand book: the specimen uses the first font in its stack that this computer has.')).toBeTruthy();
    expect(within(card('font.text')).getByText(WHY)).toBeTruthy();
    expect(card('font.mono').querySelector('[data-not-loaded]')).toBeNull();
  });

  it('marks a style set in it, and no other', () => {
    open();
    expect(within(card('type.h1')).getByText('Not loaded here')).toBeTruthy();
    expect(card('type.code').querySelector('[data-not-loaded]')).toBeNull();
  });
});

describe('where a typeface comes from and its license', () => {
  it('shows on its card what the token states, and nothing on a card with no font fact', async () => {
    const root = writeProject({
      'tokens/type.json': {
        font: {
          $type: 'fontFamily',
          headline: {
            $value: ['Kinto', 'sans-serif'],
            $extensions: { 'dev.blazon': { font: { source: 'Kinto Type Foundry', license: 'OFL-1.1', licenseUrl: 'https://openfontlicense.org/' } } },
          },
          mono: { $value: ['Menlo', 'monospace'] },
        },
      },
    });
    data = await compileBlazonData({ ...TEST_CONFIG }, root);
    expect(data.findings.filter((f) => f.code === 'invalid-font-meta')).toEqual([]);
    open();
    expect(within(card('font.headline')).getByText('Source: Kinto Type Foundry')).toBeTruthy();
    expect(within(card('font.headline')).getByText('License: OFL-1.1, https://openfontlicense.org/')).toBeTruthy();
    expect(card('font.mono').querySelector('[data-font-facts]')).toBeNull();
  });
});
