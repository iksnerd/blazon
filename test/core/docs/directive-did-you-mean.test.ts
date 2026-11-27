import { describe, it, expect } from 'vitest';
import { directiveFindings } from '../../../src/core/docs/directives.js';
import type { AssetCatalog, DocItem, ParsedTokens } from '../../../src/types/index.js';

// An unknown directive lists the known ones; it also says which one was probably meant.

const doc = (markdown: string): DocItem => ({ slug: 'p', filePath: 'p.md', title: 'P', order: 1, meta: {}, sections: [], markdown, html: '' });
const context = { tokens: { items: [] } as unknown as ParsedTokens, assets: { logos: [], icons: [], custom: {}, all: [] } as unknown as AssetCatalog, hasLogo: true };
const message = (markdown: string) => directiveFindings([doc(markdown)], context)[0]!.message;

describe('directive-unknown suggestions', () => {
  it('names the directive a typo is near', () => {
    expect(message('<!-- blazon:token color.a -->')).toMatch(/; did you mean blazon:tokens\?$/);
    expect(message('<!-- blazon:logo-usag -->')).toMatch(/; did you mean blazon:logo-usage\?$/);
  });
  it('names the directives that start with what was typed, and says how many more', () => {
    const text = message('<!-- blazon:logo -->');
    expect(text).toContain('unknown directive blazon:logo; known: tokens, assets');
    expect(text).toMatch(/; did you mean blazon:logo-usage, blazon:logo-on or blazon:logo-contrast \(7 more start with logo\)\?$/);
  });
  it('adds nothing when no name is near', () => {
    expect(message('<!-- blazon:zzzzzzzz -->')).not.toContain('did you mean');
  });
});
