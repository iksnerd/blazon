// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import path from 'node:path';
import { REPO } from '../support/paths';
import { hasReference, referencePath } from '../support/reference';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { loadConfig } from '../../src/core/config/index.js';
import { compileBlazonData } from '../../src/core/index.js';
import { injectBlazonData } from '../../src/server/data-script.js';
import type { DocItem, BlazonData } from '../../src/types/index.js';
import { App } from '../../src/viewer/App';
import { splitCodeBlocks } from '../../src/viewer/lib/markup/code-fences';

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
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const FENCE = '<pre><code class="language-css">.a &gt; .b { color: var(--brand-primary); }\n</code></pre>';

function open(html: string) {
  const doc: DocItem = { slug: 'guide', filePath: 'docs/guide.md', title: 'Guide', order: 99, meta: {}, sections: [], markdown: '', html };
  const brand = { ...data, docs: [...data.docs, doc] };
  document.head.innerHTML = new DOMParser().parseFromString(injectBlazonData('<html><head></head><body></body></html>', brand), 'text/html').head.innerHTML;
  window.location.hash = '#doc/guide';
  return render(<App />);
}

describe('splitCodeBlocks', () => {
  it('pulls fenced blocks out of the prose, unescaped, with their language', () => {
    expect(splitCodeBlocks(`<p>a</p>${FENCE}<p>b</p>`)).toEqual([
      { html: '<p>a</p>' },
      { code: '.a > .b { color: var(--brand-primary); }\n', language: 'css' },
      { html: '<p>b</p>' },
    ]);
  });

  it('leaves html with no fence, and inline code, as one piece', () => {
    const html = '<h2>T</h2><p>Use <code>x &lt; y</code>.</p>';
    expect(splitCodeBlocks(html)).toEqual([{ html }]);
  });

  it('gives a fence with no language an empty one', () => {
    expect(splitCodeBlocks('<pre><code>plain\n</code></pre>')).toEqual([{ code: 'plain\n', language: '' }]);
  });
});

describe('fenced code in a brand-book page', () => {
  it('renders in a code block with the language in its header and a copy button', () => {
    open(`<h2>In code</h2><p>Intro</p>${FENCE}`);
    const block = document.querySelector<HTMLElement>('main [data-slot="code-block"]')!;
    expect(block.querySelector('[data-slot="code-block-header"]')!.textContent).toContain('css');
    expect(block.querySelector('[data-slot="code-block-content"]')!.textContent).toContain('.a > .b { color: var(--brand-primary); }');
    expect(screen.getByRole('button', { name: 'Copy' })).toBeTruthy();
    expect(screen.getByRole('main').textContent).toContain('Intro');
  });

  it('copies the code on click, then says Copied for two seconds', async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    open(FENCE);
    vi.useFakeTimers();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    });
    expect(writeText).toHaveBeenCalledWith('.a > .b { color: var(--brand-primary); }');
    expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy();
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByRole('button', { name: 'Copy' })).toBeTruthy();
  });

  it('still says Copied when the clipboard API is missing, using the fallback', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    const exec = vi.fn(() => true);
    (document as unknown as { execCommand: unknown }).execCommand = exec;
    open(FENCE);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    });
    expect(exec).toHaveBeenCalledWith('copy');
    expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy();
  });

  it('leaves a page with no fenced code as it was', () => {
    open('<h2>Plain</h2><p>Just <code>inline</code> text.</p>');
    expect(document.querySelector('main [data-slot="code-block"]')).toBeNull();
    expect(screen.getByRole('main').querySelector('code')!.textContent).toBe('inline');
  });
});
