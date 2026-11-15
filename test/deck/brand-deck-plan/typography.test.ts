import { describe, it, expect } from 'vitest';
import { BODY_BOTTOM, BODY_GAP, familyDrop, FONTS_NOTE_ROOM, FONTS_TOP, FOOTER_TOP } from '../../../src/shipped/brand-deck/plan/index.js';
import { brand, fakeWrap, type J, ofKind, planOf } from './helpers.js';

describe('typography', () => {
  const FAMILY: J = {
    path: 'font.family.display',
    type: 'fontFamily',
    value: "'Space Grotesk', Inter, sans-serif",
    resolvedValue: ['Space Grotesk', 'Inter', 'sans-serif'],
    rawValue: [],
    description: 'Headings',
  };
  const STYLE: J = {
    path: 'type.display',
    type: 'typography',
    value: "600 72px/1.111 'Space Grotesk', Inter, sans-serif",
    resolvedValue: {
      fontFamily: ['Space Grotesk', 'Inter', 'sans-serif'],
      fontSize: { value: 72, unit: 'px' },
      fontWeight: 600,
      letterSpacing: { value: -0.01, unit: 'em' },
      lineHeight: 1.111,
    },
    rawValue: {},
  };
  const REM: J = {
    path: 'type.body',
    type: 'typography',
    value: 'x',
    resolvedValue: { fontFamily: ['Inter'], fontSize: { value: 1.5, unit: 'rem' }, fontWeight: 400, lineHeight: 1.5 },
    rawValue: {},
  };
  const styles = (...sizes: number[]): J[] =>
    sizes.map((px, i) => ({
      path: `type.s${i}`,
      type: 'typography',
      value: 'x',
      rawValue: {},
      resolvedValue: { fontFamily: ['Inter'], fontSize: { value: px, unit: 'px' }, fontWeight: 400, lineHeight: 1.2 },
    }));
  const scale = (tokens: J[]) => ofKind(planOf(brand(tokens)), 'type-scale');

  it('a family is named by its first font and keeps its stack', () => {
    expect(ofKind(planOf(brand([FAMILY])), 'fonts')[0]!.families).toEqual([
      { name: 'Space Grotesk', path: 'font.family.display', stack: "'Space Grotesk', Inter, sans-serif", description: 'Headings' },
    ]);
  });

  describe('the typefaces slide keeps its last line clear of the note and the footer', () => {
    const families = (count: number): J[] =>
      Array.from({ length: count }, (_, i) => ({
        ...FAMILY,
        path: `font.family.f${i}`,
        description: 'A family for the most important words in headings and on covers.',
        blazon: { webFont: 'Loaded from the stylesheet' },
      }));
    const slides = (count: number) => ofKind(planOf(brand(families(count)), null, { wrap: fakeWrap }), 'fonts');

    it('the body ends at least BODY_GAP above the footer', () => {
      expect(BODY_BOTTOM).toBeGreaterThanOrEqual(FOOTER_TOP + BODY_GAP);
    });

    it('four families with a description each do not fit one slide: two and two', () => {
      expect(slides(4).map((slide) => [slide.title, slide.families.length])).toEqual([
        ['Typefaces (1 of 2)', 2],
        ['Typefaces (2 of 2)', 2],
      ]);
    });

    it('three do fit, and seven are shared evenly, never as three, three and one', () => {
      expect(slides(3).map((slide) => slide.families.length)).toEqual([3]);
      expect(slides(7).map((slide) => slide.families.length)).toEqual([3, 2, 2]);
    });

    it('on each slide the last line of the last family is above the note, which is above BODY_BOTTOM', () => {
      for (const slide of slides(9)) {
        const drops = slide.families.map((family) => familyDrop(family, fakeWrap));
        const last = FONTS_TOP - drops.slice(0, -1).reduce((sum, [drop]) => sum + drop, 0) - drops.at(-1)![1];
        expect(last).toBeGreaterThanOrEqual(BODY_BOTTOM + FONTS_NOTE_ROOM);
      }
    });
  });

  it('a family the brand book cannot load says so', () => {
    const unloaded = { ...FAMILY, blazon: { webFont: false } };
    const why = { ...FAMILY, path: 'font.family.text', blazon: { webFont: 'Commercial; use Inter on the web.' } };
    expect(ofKind(planOf(brand([unloaded, why])), 'fonts')[0]!.families.map((f) => f.web_font)).toEqual(['Not loadable on the web', 'Commercial; use Inter on the web.']);
  });

  it('a style states family, size, weight and spacing', () => {
    expect(scale([STYLE])[0]!.styles).toEqual([
      { name: 'Display', path: 'type.display', family: 'Space Grotesk', size_px: 72, weight: 600, line_height: 1.111, letter_spacing: '-0.01em' },
    ]);
  });

  it('a style is named from its path made readable', () => {
    const tokens = styles(16, 16, 16).map((t, i) => ({ ...t, path: ['type.pullQuote', 'type.heroP', 'type.body.small'][i] }));
    expect(scale(tokens)[0]!.styles.map((s) => s.name)).toEqual(['Pull quote', 'Hero p', 'Body small']);
  });

  it('a type scale that fits on one slide takes one', () => {
    // Slack's eight styles: 48 to 9.3px. At half size, 14pt at least, they fit one slide
    expect(scale(styles(48, 32, 24, 16, 24, 13.333, 9.333, 9.333)).map((s) => [s.title, s.styles.length])).toEqual([['Type scale', 8]]);
  });

  it('a type scale of large styles goes over as many slides as their height needs', () => {
    // 200px is drawn at the 54pt cap, a row 54 x 1.3 + 22 = 92.2pt high: three fit in the 340pt a slide has, four do not
    expect(scale(styles(...Array<number>(8).fill(200))).map((s) => [s.title, s.styles.length])).toEqual([
      ['Type scale (1 of 3)', 3],
      ['Type scale (2 of 3)', 3],
      ['Type scale (3 of 3)', 2],
    ]);
  });

  it('a small style is drawn at fourteen points so it can be read', () => {
    // 10px would be 5pt; at 14pt a row is 14 x 1.3 + 22 = 40.2pt high, so eight fit in 340pt and nine do not: twelve need two slides, shared six and six
    expect(scale(styles(...Array<number>(12).fill(10))).map((s) => s.styles.length)).toEqual([6, 6]);
  });
  it('a type scale never leaves a slide with a few rows after a full one', () => {
    // Nine rows need two slides (eight fit): five and four, not eight and one, and in order
    const slides = scale(styles(...Array<number>(9).fill(10)));
    expect(slides.map((s) => s.styles.length)).toEqual([5, 4]);
    expect(slides.flatMap((s) => s.styles.map((style) => style.path))).toEqual(Array.from({ length: 9 }, (_, i) => `type.s${i}`));
  });

  it('a rem is sixteen pixels and a missing spacing is none', () => {
    const style = scale([REM])[0]!.styles[0]!;
    expect([style.size_px, style.letter_spacing]).toEqual([24, null]);
  });
});
