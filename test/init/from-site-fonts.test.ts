import { describe, expect, it } from 'vitest';
import { fontOf } from '../../src/core/init/from-site/fonts.js';

// The font-family list of a site's stylesheet, split the way CSS Syntax Level 3 tokenizes it: a quoted string
// ends at its own quote, a backslash escapes, and a comma inside a function's parentheses is not a separator.

const body = /^body$/;
const stackOf = (value: string) => fontOf(`body { font-family: ${value}; }`, new Map(), body)?.stack;

describe('font-family list of a scraped stylesheet', () => {
  it('splits plain, quoted and mixed lists', () => {
    expect(stackOf('Acme Sans, "Acme Serif", \'Acme Mono\', serif')).toEqual(['Acme Sans', 'Acme Serif', 'Acme Mono', 'serif']);
    expect(stackOf('"Acme, Inc Sans", serif')).toEqual(['Acme, Inc Sans', 'serif']);
  });

  it('keeps a quote of the other kind inside a string', () => {
    expect(stackOf(`"Acme 'Sans'", serif`)).toEqual(["Acme 'Sans'", 'serif']);
  });

  it('reads a backslash-escaped quote as part of the name, not as the end of the string', () => {
    expect(stackOf('"Acme \\"Sans\\", Bold", serif')).toEqual(['Acme "Sans", Bold', 'serif']);
    expect(stackOf("'Acme\\'s Sans', serif")).toEqual(["Acme's Sans", 'serif']);
  });

  it('reads a hex escape in a string, and eats the one space that ends it', () => {
    expect(stackOf('"Acme\\22 Sans", serif')).toEqual(['Acme"Sans', 'serif']);
    expect(stackOf('"Acme \\41 B", serif')).toEqual(['Acme AB', 'serif']);
    expect(stackOf('"Acme\\0 Sans", serif')).toEqual(['Acme�Sans', 'serif']);
  });

  it('drops a backslash-newline line continuation inside a string', () => {
    expect(stackOf('"Acme \\\nSans", serif')).toEqual(['Acme Sans', 'serif']);
  });

  it('reads escapes in an unquoted name', () => {
    expect(stackOf('Acme\\ Sans, serif')).toEqual(['Acme Sans', 'serif']);
    expect(stackOf('Acme\\,Sans, serif')).toEqual(['Acme,Sans', 'serif']);
  });

  it('keeps an unterminated string to the end of the list, as CSS does', () => {
    expect(stackOf('"Acme Sans, serif')).toEqual(['Acme Sans, serif']);
    expect(stackOf('serif, "Acme Sans\\')).toEqual(['serif', 'Acme Sans']);
  });

  it('ends a string at an unescaped newline, as a bad string', () => {
    expect(stackOf('"Acme Sans\n, serif')).toEqual(['Acme Sans', 'serif']);
  });

  it('keeps a comma inside parentheses, quoted or not, in one entry', () => {
    expect(stackOf('var(--x, "Acme A, B"), Acme Sans')).toEqual(['var(--x, "Acme A, B")', 'Acme Sans']);
    expect(stackOf('var(--x, Acme A, Acme B), "Acme Sans"')).toEqual(['var(--x, Acme A, Acme B)', 'Acme Sans']);
    expect(stackOf('var(--x, ")"), Acme Sans')).toEqual(['var(--x, ")")', 'Acme Sans']);
  });

  it('picks the first family that is not a generic or a var()', () => {
    expect(fontOf('body { font-family: var(--x, "Acme A, B"), "Acme \\"Sans\\"", serif }', new Map(), body)?.family).toBe('Acme "Sans"');
  });
});
