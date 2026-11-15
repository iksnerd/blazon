import { describe, it, expect } from 'vitest';
import { GUIDE_SOURCE_LEAD, sourceRoom } from '../../../src/shipped/brand-deck/plan/index.js';
import { assetOf, book, fakeWrap, kinds, ofKind, page, planOf, section, type J, words } from './helpers.js';

describe("fitting: an asset's slide shows all of its text, at the largest size and in the plainest layout that holds it", () => {
  const slide = (meta: J) =>
    ofKind(planOf(book([page('p', 'P', 1, [], [section('usage')])], [assetOf('usage', 'one', { title: 'One', ...meta })], [['usage', {}]]), null, { wrap: fakeWrap }), 'guideline');

  it('a slide that fits is one slide in the standard layout', () => {
    const slides = slide({ description: 'Short.', traits: ['Flat'], do: ['Keep it flat'], dont: ['Stretch it'] });
    expect(slides).toHaveLength(1);
    expect(slides[0]!.layout).toEqual({ panel: 540, size: 12, columns: 1, traits: 'list' });
  });

  it('without wrap the plan is the slides unfitted', () => {
    const slides = planOf(book([page('p', 'P', 1, [], [section('usage')])], [assetOf('usage', 'one', { do: Array<string>(80).fill('x') })], [['usage', {}]]));
    expect(kinds(slides)).toEqual(['cover', 'contents', 'page', 'guideline']);
    expect(slides[3]).not.toHaveProperty('layout');
  });

  it('traits become a line before the type gets smaller', () => {
    const [only] = slide({ traits: ['one', 'two', 'three', 'four', 'five', 'six'], do: Array<string>(6).fill('Keep it flat'), dont: Array<string>(4).fill('Stretch it') });
    expect(only!.layout!.traits).toBe('line');
    expect(only!.layout!.size).toBe(12);
  });

  it('a panel hugs a tall image to give the text room', () => {
    const meta = {
      description: 'word '.repeat(120),
      do: Array<string>(4).fill('Keep the rule and read it twice over'),
      dont: Array<string>(4).fill('Break the rule and read it twice over'),
    };
    const tall = planOf(book([page('p', 'P', 1, [], [section('usage')])], [{ ...assetOf('usage', 'one', meta), width: 1080, height: 1920 }], [['usage', {}]]), null, {
      wrap: fakeWrap,
    });
    const [only] = ofKind(tall, 'guideline');
    expect(only!.layout!.panel).toBeLessThan(540);
  });

  it('the text is never smaller than ten points', () => {
    for (const count of [1, 4, 8, 16, 40, 120]) {
      for (const each of slide({
        description: 'word '.repeat(count),
        traits: Array<string>(4).fill('a trait'),
        do: Array<string>(count).fill('Do this thing, which is long enough to wrap'),
        dont: Array<string>(count).fill('Not that'),
      })) {
        expect(each.layout!.size).toBeGreaterThanOrEqual(10);
      }
    }
  });

  it('what does not fit goes on a slide titled continued and no text is dropped', () => {
    const doList = Array.from({ length: 30 }, (_, n) => `Do rule number ${n} ${'and some words to wrap '.repeat(3)}`);
    const dontList = Array.from({ length: 30 }, (_, n) => `Dont rule number ${n} ${'and some words to wrap '.repeat(3)}`);
    const description = 'A description. '.repeat(40);
    const slides = slide({ description, traits: ['a', 'b', 'c'], do: doList, dont: dontList });
    expect(slides.length).toBeGreaterThan(1);
    expect(slides.map((s) => s.title)).toEqual(['One', ...Array<string>(slides.length - 1).fill('One (continued)')]);
    expect(words(...slides.map((s) => s.description))).toEqual(words(description));
    expect(words(...slides.flatMap((s) => s.do))).toEqual(words(...doList));
    expect(words(...slides.flatMap((s) => s.dont))).toEqual(words(...dontList));
    expect(slides.flatMap((s) => s.traits)).toEqual(['a', 'b', 'c']);
    expect(slides[0]!.layout!.panel).not.toBeNull();
    expect(slides.slice(1).every((s) => s.layout!.panel === null)).toBe(true);
  });

  it('do and dont stay together on the slide that continues them', () => {
    const slides = slide({ description: 'A description. '.repeat(200), do: Array<string>(3).fill('Do this'), dont: Array<string>(3).fill('Not that') });
    expect(slides.length).toBeGreaterThan(1);
    for (const each of slides) expect(each.do.length > 0).toBe(each.dont.length > 0);
  });

  it('one item longer than a slide is cut between its lines and loses no word', () => {
    const item = 'an endless rule '.repeat(400);
    const slides = slide({ do: [item] });
    expect(slides.length).toBeGreaterThan(1);
    expect(words(...slides.flatMap((s) => s.do))).toEqual(words(item));
  });

  it('more traits than a slide holds in a line are still all drawn', () => {
    const traits = Array.from({ length: 400 }, (_, n) => `trait number ${n} of a very long list of them`);
    expect(words(...slide({ traits }).flatMap((s) => s.traits))).toEqual(words(...traits));
  });

  it('a long source has room reserved so the text stops above it', () => {
    const { height } = sourceRoom({ source: `Source: ${'a long document name '.repeat(12)}` }, 276, fakeWrap);
    expect(height).toBeGreaterThan(3 * GUIDE_SOURCE_LEAD);
    expect(sourceRoom({ source: null }, 276, fakeWrap)).toEqual({ lines: [], height: 0 });
  });

  it('the contents counts the continued slides', () => {
    const meta = { do: Array<string>(60).fill('a rule that is long enough '.repeat(4)), dont: Array<string>(60).fill('no '.repeat(30)) };
    const slides = planOf(book([page('p', 'P', 1, [], [section('usage')]), page('q', 'Q', 2)], [assetOf('usage', 'one', meta)], [['usage', {}]]), null, { wrap: fakeWrap });
    const guidelines = ofKind(slides, 'guideline');
    expect(guidelines.length).toBeGreaterThan(1);
    expect((slides[1] as any).items.map((i: any) => i.page)).toEqual([3, 3 + 1 + guidelines.length]);
  });
});
