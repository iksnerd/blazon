import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../../src/core/config/index.js';
import { brandedName, slug } from '../../../src/shipped/shared/slug.js';
import { deckFileName } from '../../../src/shipped/brand-deck/brand.js';
import { parseOptions } from '../../../src/shipped/press-kit/options.js';

// The files the press kit and the brand deck write are named after the brand, as the Office template's are: a file sent to someone outside
// the company has to say whose it is.

describe('slug', () => {
  it('is the file-name slug the Office template uses', () => {
    expect(slug('Acme Co.')).toBe('acme-co');
    expect(slug('../../etc/passwd')).toBe('etc-passwd');
    expect(slug('///', 'brand-template')).toBe('brand-template');
  });
});

describe('brandedName', () => {
  it.each([
    ['Acme', 'acme-press-kit'],
    ['Acme Brand Book', 'acme-press-kit'],
    ['Acme Brand Guidelines', 'acme-brand-guidelines-press-kit'],
    ['Acme Co.', 'acme-co-press-kit'],
    ['Café Acme', 'cafe-acme-press-kit'],
  ])('names %j %s', (title, name) => {
    expect(brandedName(title, 'press-kit')).toBe(name);
  });

  it.each([['', 'empty'], ['   ', 'blank'], ['日本語', 'nothing left as a slug'], ['///', 'only punctuation'], [DEFAULT_CONFIG.title, 'the title a new book gets'], ['Brand Book', 'only the suffix'], [undefined, 'no title']])(
    'keeps the plain name for %j (%s)',
    (title, _why) => {
      expect(brandedName(title, 'press-kit')).toBe('press-kit');
    },
  );

  it('makes a safe file name of a title with a path, dots, spaces and non-ASCII letters', () => {
    for (const title of ['../../etc/passwd', 'a/../b', '..', 'Acme\\..\\x', '  Ünï Acme \t Co  ', 'x'.repeat(200)]) {
      const name = brandedName(title, 'press-kit');
      expect(name, title).toMatch(/^[a-z0-9][a-z0-9._-]*$/);
      expect(name, title).not.toMatch(/[/\\]/);
      expect(name.length, title).toBeLessThanOrEqual(64);
      expect(name.startsWith('.'), title).toBe(false);
    }
    expect(brandedName('../../etc/passwd', 'press-kit')).toBe('etc-passwd-press-kit');
  });
});

describe('the press kit name', () => {
  it('is the one it is given when the option is absent, and the option wins', () => {
    expect(parseOptions({}, new Set(), 'acme-press-kit').options.name).toBe('acme-press-kit');
    expect(parseOptions({ name: 'kit' }, new Set(), 'acme-press-kit').options.name).toBe('kit');
    expect(parseOptions({ name: '../x' }, new Set(), 'acme-press-kit').options.name).toBe('acme-press-kit');
    expect(parseOptions({}, new Set()).options.name).toBe('press-kit');
  });
});

describe('deckFileName', () => {
  const brand = (title: string) => ({ brand: { title } }) as Parameters<typeof deckFileName>[0];
  it('is the slug and brand-deck.pdf', () => {
    expect(deckFileName(brand('Acme'))).toBe('acme-brand-deck.pdf');
    expect(deckFileName(brand('Acme Brand Book'))).toBe('acme-brand-deck.pdf');
    expect(deckFileName(brand('Acme Brand Guidelines'))).toBe('acme-brand-guidelines-brand-deck.pdf');
    expect(deckFileName(brand(''))).toBe('brand-deck.pdf');
    expect(deckFileName(brand(DEFAULT_CONFIG.title))).toBe('brand-deck.pdf');
    expect(deckFileName(brand('../../x/..'))).toBe('x-brand-deck.pdf');
  });
});
