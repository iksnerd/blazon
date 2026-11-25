// @vitest-environment jsdom
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { applyTheme } from '../../src/viewer/lib/theme/theme';
import type { BlazonData } from '../../src/types/index.js';

// The brand's mono role has to reach code styling. Viewer code, and so the print book, sets it with `font-mono`, which index.css
// maps to --blazon-font-mono, the variable applyTheme sets from the fontMono role. Without the mapping Tailwind's default stack
// (Menlo on a Mac) is printed instead.
describe('the mono role', () => {
  it('is set as --blazon-font-mono from the theme', () => {
    applyTheme({ theme: { fontMono: 'Acme Mono, monospace' }, fonts: [], title: 'Acme' } as unknown as BlazonData);
    expect(document.documentElement.style.getPropertyValue('--blazon-font-mono')).toBe('Acme Mono, monospace');
  });

  it('is what the font-mono utility reads, with a monospace fallback when the brand has none', () => {
    const css = fs.readFileSync(path.resolve(process.cwd(), 'src/viewer/index.css'), 'utf8');
    expect(css).toMatch(/--font-mono:\s*var\(--blazon-font-mono,[^)]*monospace\)/);
  });
});
