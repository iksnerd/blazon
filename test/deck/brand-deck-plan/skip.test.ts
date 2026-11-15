import { describe, it, expect } from 'vitest';
import { readBrand } from '../../../src/shipped/brand-deck/brand.js';
import { readOptions } from '../../../src/shipped/brand-deck/checks.js';
import { unknownSkips } from '../../../src/shipped/brand-deck/plan/index.js';
import { assetOf, assetsOf, book, brand, kinds, logoAsset, page, planOf, section, titlesOf, type J, type Options } from './helpers.js';

describe('skip: the asset categories the deck leaves out', () => {
  const DIRECTIVES = [section('favicons'), section('favicons-supplied')];
  const ASSETS = [assetOf('favicons', 'a'), assetOf('favicons-supplied', 'b'), assetOf('favicons-supplied', 'c')];
  const CATEGORIES: [string, J][] = [
    ['favicons', {}],
    ['favicons-supplied', { notSpecified: ['Nothing: the specified set ships'] }],
  ];
  const deck = (opts: Options = {}) => planOf(book([page('logo', 'Logo', 1, [], DIRECTIVES)], ASSETS, CATEGORIES), null, opts);

  it('a category in skip has no slides and the others keep theirs', () => {
    expect(titlesOf(deck(), 'guideline')).toEqual(['A', 'B', 'C']);
    expect(titlesOf(deck({ skip: ['favicons-supplied'] }), 'guideline')).toEqual(['A']);
  });

  it('the contents numbers the slides that are left', () => {
    expect(kinds(deck({ skip: ['favicons-supplied'] }))).toEqual(['cover', 'contents', 'page', 'guideline']);
  });

  it('what a skipped category leaves open is not on the divider', () => {
    expect((deck()[2] as any).open.map((o: any) => o.title)).toEqual(['Favicons Supplied']);
    expect((deck({ skip: ['favicons-supplied'] })[2] as any).open).toEqual([]);
  });

  it('an experimental category is always left out, with no option, and what it leaves open is not on the divider', () => {
    const experiments: [string, J][] = [['experiments', { experimental: true, notSpecified: ['Everything: these are sketches'] }]];
    const slides = planOf(
      book(
        [page('x', 'X', 1, [], [section('experiments'), assetsOf('experiments'), section('favicons')])],
        [assetOf('experiments', 'sketch'), assetOf('favicons', 'a')],
        [...experiments, ['favicons', {}]],
      ),
    );
    expect(titlesOf(slides, 'guideline')).toEqual(['A']);
    expect(kinds(slides)).not.toContain('grid');
    expect((slides[2] as any).open).toEqual([]);
    const ordinary = planOf(book([page('x', 'X', 1, [], [section('experiments')])], [assetOf('experiments', 'sketch')], [['experiments', {}]]));
    expect(titlesOf(ordinary, 'guideline')).toEqual(['Sketch']);
  });

  it('a reference category is left out too, with no option, as an experimental one is', () => {
    const slides = planOf(
      book(
        [page('x', 'X', 1, [], [section('cards-reference'), assetsOf('cards-reference'), section('favicons')])],
        [assetOf('cards-reference', 'card'), assetOf('favicons', 'a')],
        [
          ['cards-reference', { reference: true, notSpecified: ['Everything: kept for comparison'] }],
          ['favicons', {}],
        ],
      ),
    );
    expect(titlesOf(slides, 'guideline')).toEqual(['A']);
    expect(kinds(slides)).not.toContain('grid');
    expect((slides[2] as any).open).toEqual([]);
    const ordinary = planOf(book([page('x', 'X', 1, [], [section('cards-reference')])], [assetOf('cards-reference', 'card')], [['cards-reference', {}]]));
    expect(titlesOf(ordinary, 'guideline')).toEqual(['Card']);
    // Only the flag leaves it out: a reference: false category is drawn
    const off = planOf(book([page('x', 'X', 1, [], [section('cards-reference')])], [assetOf('cards-reference', 'card')], [['cards-reference', { reference: false }]]));
    expect(titlesOf(off, 'guideline')).toEqual(['Card']);
  });

  it('skipping logos leaves out the logo slides', () => {
    const assets = [logoAsset('mark')];
    expect(kinds(planOf(brand([], { assets }), null, { skip: ['logos'] }))).toEqual(['cover', 'contents']);
    expect(kinds(planOf(brand([], { assets })))).toContain('logo');
  });

  it('names that are no category are found and listed once each in the order given', () => {
    expect(unknownSkips(readBrand(book([], ASSETS, CATEGORIES)), ['nope', 'favicons', 'nope', 'also-not'])).toEqual(['nope', 'also-not']);
  });

  it('the options of a request are read and a wrong one is a warning that leaves the deck whole', () => {
    const read = readBrand(book([], ASSETS, CATEGORIES));
    expect(readOptions({ skip: ['favicons-supplied'] }, read)).toEqual({ skip: ['favicons-supplied'], findings: [] });
    expect(readOptions({}, read)).toEqual({ skip: [], findings: [] });
    const { skip, findings } = readOptions({ skip: ['favicons-supplied', 'typo'] }, read);
    expect(skip).toEqual(['favicons-supplied']);
    expect(findings.map((f) => [f.code, f.severity, f.path])).toEqual([['blazon.brand-deck/skip-unknown', 'warning', 'options.skip']]);
    expect(findings[0]!.message).toContain('"typo"');
    for (const [options, code] of [
      [{ skip: 'favicons' }, 'option-invalid'],
      [{ skip: [1] }, 'option-invalid'],
      [[], 'option-invalid'],
      [{ skp: [] }, 'option-unknown'],
    ] as const) {
      const result = readOptions(options, read);
      expect([result.skip, result.findings.map((f) => f.code)], JSON.stringify(options)).toEqual([[], [`blazon.brand-deck/${code}`]]);
    }
  });
});
