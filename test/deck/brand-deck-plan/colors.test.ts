import { describe, it, expect } from 'vitest';
import { brand, color, ofKind, planOf, type J } from './helpers.js';

describe('colors', () => {
  const TOKENS = [
    color('color.primary.indigo', '#635dff', { cmyk: [84, 70, 0, 0], pms: '2726 C', ral: '5012' }, undefined, 'Moments of interaction'),
    color('color.primary.black', '#000000'),
    color('color.neutral.white', '#FFFFFF'),
    color('text.primary', '#000000', undefined, 'color.primary.black'),
  ];
  const colors = (tokens: J[], groups: J[] = []) => ofKind(planOf(brand(tokens, { groups })), 'colors');
  /** Tokens for groups named by key, each with that many swatches: palette({a: 2, b: 3}) is color.a.* and color.b.* */
  const palette = (sizes: Record<string, number>) =>
    Object.entries(sizes).flatMap(([name, count], n) =>
      Array.from({ length: count }, (_, i) =>
        color(`color.${name}.c${i}`, `#${(i * 10).toString(16).padStart(2, '0').toUpperCase()}${((n + 1) * 10).toString(16).padStart(2, '0').toUpperCase()}00`),
      ),
    );
  const printed = (name: string, count: number) =>
    Array.from({ length: count }, (_, i) => color(`color.${name}.c${i}`, `#${(i * 10).toString(16).padStart(2, '0').toUpperCase()}4000`, { cmyk: [1, 2, 3, 4], pms: '100 C' }));
  const titles = (slides: ReturnType<typeof colors>) => slides.map((s) => s.groups.map((g) => g.title));

  it('swatches are the palette grouped by their parent group', () => {
    const slides = colors(TOKENS);
    expect(slides).toHaveLength(1);
    expect(slides[0]!.groups.map((g) => g.title)).toEqual(['Primary', 'Neutral']);
    expect(slides[0]!.groups[0]!.swatches.map((w) => w.path)).toEqual(['color.primary.indigo', 'color.primary.black']);
    expect(slides[0]!.swatches.map((w) => w.path)).toEqual(['color.primary.indigo', 'color.primary.black', 'color.neutral.white']);
  });

  it('an alias is a role and not a swatch', () => {
    expect(colors(TOKENS).flatMap((s) => s.swatches.map((w) => w.path))).not.toContain('text.primary');
  });

  it('a swatch states hex, rgb and the print values', () => {
    const swatch = colors(TOKENS)
      .flatMap((s) => s.swatches)
      .find((w) => w.name === 'indigo');
    expect(swatch).toEqual({
      name: 'indigo',
      path: 'color.primary.indigo',
      hex: '#635DFF',
      rgb: [99, 93, 255],
      cmyk: [84, 70, 0, 0],
      pms: '2726 C',
      ral: '5012',
      description: 'Moments of interaction',
    });
  });

  it('a color with no print values has none', () => {
    const black = colors(TOKENS)
      .flatMap((s) => s.swatches)
      .find((w) => w.name === 'black')!;
    expect(black.cmyk).toBeNull();
    expect(black.pms).toBeNull();
    expect(black.ral).toBeNull();
  });

  it('a value that is not hex is kept and has no rgb', () => {
    const swatch = colors([color('color.x.mist', 'hsl(210 20% 90%)')])[0]!.swatches[0]!;
    expect([swatch.hex, swatch.rgb]).toEqual(['hsl(210 20% 90%)', null]);
  });

  it('a group of more than eight goes over several slides', () => {
    const slides = colors(Array.from({ length: 9 }, (_, i) => color(`color.big.c${i}`, `#${i.toString(16).padStart(2, '0').toUpperCase()}0000`)));
    expect(slides.map((s) => s.swatches.length)).toEqual([8, 1]);
    expect(slides.map((s) => s.title)).toEqual(['Big (1 of 2)', 'Big (2 of 2)']);
  });

  it('the group note is its description', () => {
    const groups = [{ path: 'color.primary', description: 'The core palette', blazon: {} }];
    const slide = colors(
      TOKENS.filter((t) => t.path.startsWith('color.primary')),
      groups,
    )[0]!;
    expect(slide.note).toBe('The core palette');
    expect(slide.groups[0]!.note).toBe('The core palette');
  });

  describe('small groups share a slide', () => {
    it('in their order under a heading each', () => {
      const slides = colors(palette({ a: 2, b: 3, c: 1 }));
      expect(slides).toHaveLength(1);
      expect(slides[0]!.groups.map((g) => [g.title, g.swatches.length])).toEqual([
        ['A', 2],
        ['B', 3],
        ['C', 1],
      ]);
      expect(slides[0]!.title).toBe('Colors');
      expect(slides[0]!.note).toBeNull();
    });

    it('a slide of two groups is named after both and one of one after that group', () => {
      expect(colors(palette({ a: 2, b: 2 }))[0]!.title).toBe('A and B');
      expect(colors(palette({ a: 2 }))[0]!.title).toBe('A');
    });

    it('a group of up to eight is one row that is never split', () => {
      expect(colors(palette({ a: 8, b: 7, c: 1 })).map((s) => s.groups.map((g) => [g.title, g.swatches.length]))).toEqual([
        [
          ['A', 8],
          ['B', 7],
          ['C', 1],
        ],
      ]);
    });

    it('groups with print values need more room so two share a slide and not three', () => {
      expect(titles(colors([...printed('a', 5), ...printed('b', 5), ...printed('c', 5)]))).toEqual([['A', 'B'], ['C']]);
    });

    it('groups with only a hex and rgb still share three to a slide', () => {
      expect(titles(colors(palette({ a: 5, b: 5, c: 5 })))).toEqual([['A', 'B', 'C']]);
    });

    it('a slide holds at most three groups', () => {
      expect(titles(colors(palette({ a: 1, b: 1, c: 1, d: 1, e: 1 })))).toEqual([
        ['A', 'B', 'C'],
        ['D', 'E'],
      ]);
      expect(titles(colors(palette({ a: 6, b: 6, c: 6, d: 6 })))).toEqual([['A', 'B', 'C'], ['D']]);
    });

    it('a big group has slides of its own and the small ones around it share theirs', () => {
      const slides = colors(palette({ a: 1, big: 9, b: 1 }));
      expect(titles(slides)).toEqual([['A'], ['Big'], ['Big'], ['B']]);
      expect(slides.map((s) => s.title)).toEqual(['A', 'Big (1 of 2)', 'Big (2 of 2)', 'B']);
    });

    it('groups with the same last name are told apart by the name before it', () => {
      const tokens = [
        color('color.hue.yellow.a', '#111111'),
        color('color.hue.yellow.b', '#222222'),
        color('color.product.yellow.a', '#333333'),
        color('color.product.yellow.b', '#444444'),
        color('color.hue.blue.a', '#555555'),
      ];
      expect(colors(tokens).flatMap((s) => s.groups.map((g) => g.title))).toEqual(['Hue yellow', 'Product yellow', 'Blue']);
    });

    it('every swatch is on exactly one slide', () => {
      const tokens = palette({ a: 2, b: 3, c: 1, d: 9, e: 7, f: 4 });
      const paths = colors(tokens).flatMap((s) => s.swatches.map((w) => w.path));
      expect([...paths].sort()).toEqual(tokens.map((t) => t.path).sort());
      expect(new Set(paths).size).toBe(paths.length);
    });

    it('each group keeps its own note', () => {
      const groups = [
        { path: 'color.a', description: 'About A', blazon: {} },
        { path: 'color.b', description: 'About B', blazon: {} },
      ];
      const slide = colors(palette({ a: 2, b: 2 }), groups)[0]!;
      expect(slide.groups.map((g) => g.note)).toEqual(['About A', 'About B']);
      expect(slide.note).toBeNull();
    });
  });
});

describe('gradients', () => {
  const gradient = (p: string, value: string, stops: J[], alias?: string): J => ({
    path: p,
    type: 'gradient',
    value,
    resolvedValue: stops,
    rawValue: stops,
    ...(alias && { aliasOf: alias }),
  });

  it('a gradient has its stops and angle', () => {
    const stops = [
      { color: '#FF4F40', position: 0 },
      { color: '#FF44DD', position: 1 },
    ];
    const tokens = [gradient('gradient.orangePink', 'linear-gradient(180deg, #FF4F40 0%, #FF44DD 100%)', stops), gradient('icon.g', 'x', stops, 'gradient.orangePink')];
    expect(ofKind(planOf(brand(tokens)), 'gradients')[0]!.gradients).toEqual([{ name: 'orangePink', path: 'gradient.orangePink', angle: 180, stops }]);
  });

  it('a gradient with no angle in its value points down, the css default', () => {
    const stops = [
      { color: '#000000', position: 0 },
      { color: '#FFFFFF', position: 1 },
    ];
    expect(ofKind(planOf(brand([gradient('gradient.g', 'linear-gradient(#000, #FFF)', stops)])), 'gradients')[0]!.gradients[0]!.angle).toBe(180);
  });
});
