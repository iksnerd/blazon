import { describe, it, expect } from 'vitest';
import { constructionSvg } from '../../../../src/shipped/logo-geometry/figure.js';
import { Unsupported } from '../../../../src/shipped/logo-geometry/geometry.js';
import { labelRaster } from '../../../../src/shipped/logo-geometry/labels.js';
import { analyzeRaster, analyzeSvg, measureLabels, type Measurement } from '../../../../src/shipped/logo-geometry/measure.js';

// What is measured on a logo. The logos are small SVGs written by hand, so the expected values come from the drawing and not from the code
// under test. The cases are the ones the Python script this plugin replaced was held to, and each of the new readings has its own below.

const svg = (body: string, view = '0 0 40 40') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${view}">${body}</svg>`;
const measure = (body: string, view = '0 0 40 40', options: Parameters<typeof analyzeSvg>[1] = {}) => analyzeSvg(svg(body, view), options).measurement;

// A "T": a bar across the top and a stem down the middle. Mirrors left to right, not top to bottom.
const T = '<rect x="0" y="0" width="40" height="10"/><rect x="15" y="10" width="10" height="30"/>';
// An "L": a stem and a foot. Mirrors on neither axis.
const L = '<rect x="0" y="0" width="10" height="40"/><rect x="10" y="30" width="30" height="10"/>';
// A plus: mirrors on both axes, and turns into itself at 90 degrees.
const PLUS = '<rect x="15" y="0" width="10" height="40"/><rect x="0" y="15" width="40" height="10"/>';
// A "Z": no mirror, but turns into itself at 180 degrees.
const Z = '<path d="M0 0H40V10H15L40 30V40H0V30H25L0 10Z" />';
const ALL = ['mirror-x', 'mirror-y', 'rot180', 'rot90'];

describe('symmetry', () => {
  it('a T mirrors left to right only', () => {
    const m = measure(T);
    expect(m.symmetry['mirror-x']!.silhouette).toBeGreaterThanOrEqual(0.98);
    expect(m.symmetry['mirror-y']!.silhouette).toBeLessThan(0.7);
    expect(m.axes).toEqual(['mirror-x']);
  });

  it('an L has no axis', () => expect(measure(L).axes).toEqual([]));
  it('a plus has every axis', () => expect(measure(PLUS).axes).toEqual(ALL));
  it('a Z turns over but does not mirror', () => expect(measure(Z).axes).toEqual(['rot180']));
  it('an arrow pointing right does not mirror left to right', () => expect(measure('<path d="M0 15H25V0L40 20L25 40V25H0Z"/>').axes).toEqual(['mirror-y']));

  it('does not measure rot90 on a wide shape', () => expect(measure('<rect x="0" y="0" width="40" height="10"/>').symmetry.rot90).toBeNull());

  it('is about the shape and not the page: padding does not change the score', () => expect(measure(PLUS, '-100 -60 240 160').axes).toEqual(ALL));

  it('counts color apart from the silhouette', () => {
    const body = '<rect x="0" y="0" width="20" height="10" fill="#000"/><rect x="20" y="0" width="20" height="10" fill="#f00"/><rect x="15" y="10" width="10" height="30" fill="#000"/>';
    const score = measure(body).symmetry['mirror-x']!;
    expect(score.silhouette).toBeGreaterThanOrEqual(0.98);
    expect(score.color).toBeLessThan(0.8);
  });

  it('takes the score that counts as symmetric from the tolerance', () => {
    expect(measure(T, '0 0 40 40', { tolerance: 0.999 }).axes).toEqual(['mirror-x']);
    expect(measure(T, '0 0 40 40', { tolerance: 0.2 }).axes).toContain('mirror-y');
  });
});

describe('balance', () => {
  it('puts a symmetric shape at the center', () => {
    const b = measure(PLUS).balance;
    expect(Math.abs(b.x)).toBeLessThan(0.01);
    expect(Math.abs(b.y)).toBeLessThan(0.01);
  });

  it('makes a T heavy at the top, where negative y is up', () => {
    const b = measure(T).balance;
    expect(Math.abs(b.x)).toBeLessThan(0.01);
    expect(b.y).toBeLessThan(-0.05);
  });

  it('makes an L heavy at the bottom left', () => {
    const b = measure(L).balance;
    expect(b.x).toBeLessThan(-0.05);
    expect(b.y).toBeGreaterThan(0.05);
  });
});

describe('the grid', () => {
  it('finds the coarsest whole-number grid every point sits on', () => {
    expect(measure(T).grid!.detected).toBe(5);
    expect(measure(PLUS).grid!.detected).toBe(5);
  });

  it('names a point off the stated grid', () => {
    const body = '<rect x="0" y="0" width="40" height="10"/><rect x="14" y="10" width="11" height="30"/>';
    const grid = measure(body, '0 0 40 40', { grid: 5 }).grid!;
    expect(grid.stated).toBe(5);
    expect(grid.off).toEqual([{ x: 14, y: 10 }, { x: 14, y: 40 }]);
  });

  it('has no off points for a logo on its grid', () => expect(measure(T, '0 0 40 40', { grid: 5 }).grid!.off).toEqual([]));
  it('has no detected grid for a drawing that is not whole numbers', () => expect(measure('<rect x="0.3" y="0" width="39.7" height="10"/>').grid!.detected).toBeNull());

  it('reads the grid of the points inside a crop only', () => {
    // 10 inside the crop, and 5 only outside it
    const body = '<rect x="10" y="0" width="10" height="10"/><rect x="40" y="0" width="5" height="40"/>';
    expect(measure(body, '0 0 50 40', { crop: [10, 0, 10, 10] }).grid!.detected).toBe(10);
  });

  it('cuts a mark out of a lockup with a crop', () => {
    const body = `${PLUS}<rect x="60" y="0" width="10" height="40"/><rect x="60" y="30" width="30" height="10"/>`;
    expect(measure(body, '0 0 100 40').axes).toEqual([]);
    expect(measure(body, '0 0 100 40', { crop: [0, 0, 40, 40] }).axes).toEqual(ALL);
  });
});

describe('the box', () => {
  it("is the ink's own, in the SVG's units, whatever the artboard", () => {
    expect(measure(PLUS, '-100 -60 240 160').box).toEqual({ x: 0, y: 0, w: 40, h: 40 });
  });
});

describe('a grid of cells, which is how a raster is measured', () => {
  it('measures like the vector it came from', () => {
    const grid = Array.from({ length: 8 }, (_, y) => Array.from({ length: 8 }, (__, x) => (x === 3 || x === 4 || y === 3 || y === 4 ? 1 : 0)));
    expect(measureLabels(grid).axes).toEqual(ALL);
  });

  it('is refused when it has no ink', () => {
    expect(() => measureLabels([[0, 0], [0, 0]])).toThrow(Unsupported);
    expect(() => measureLabels([[0, 0], [0, 0]])).toThrow(/nothing to measure/);
  });
});

describe('a raster', () => {
  /** RGBA bytes for a picture made of `ink` where the function is true. */
  const picture = (size: number, ink: (x: number, y: number) => boolean, over: [number, number, number, number] = [0, 0, 0, 0]) => {
    const rgba = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) rgba.set(ink(x, y) ? [20, 30, 40, 255] : over, (y * size + x) * 4);
    return rgba;
  };

  it('is measured on its alpha when it has transparency', () => {
    const plus = (x: number, y: number) => (x >= 18 && x < 22) || (y >= 18 && y < 22);
    expect(analyzeRaster(labelRaster(picture(40, plus), 40, 40)).axes).toEqual(ALL);
  });

  it('is measured against its corner color when it has none', () => {
    const l = (x: number, y: number) => (x >= 8 && x < 16) || (y >= 32 && x >= 8);
    const result = analyzeRaster(labelRaster(picture(40, l, [255, 255, 255, 255]), 40, 40));
    expect(result.axes).toEqual([]);
    expect(result.grid).toBeNull();
    expect(result.balance.x).toBeLessThan(-0.05);
  });

  it('is scaled down to the working size by averaging, so a large picture measures like a small one', () => {
    const plus = (x: number, y: number) => (x >= 450 && x < 550) || (y >= 450 && y < 550);
    expect(analyzeRaster(labelRaster(picture(1000, plus), 1000, 1000)).axes).toEqual(ALL);
  });

  it('forgives the anti-aliased edge by a cell', () => {
    // A plus whose upright is half a cell off center: an exact comparison fails the mirror, the one-cell slack does not
    const plus = (x: number, y: number) => (x >= 18 && x < 23) || (y >= 18 && y < 22);
    const grid = labelRaster(picture(40, plus), 40, 40);
    expect(measureLabels(grid, 0.97, 0).axes).not.toContain('mirror-x');
    expect(analyzeRaster(grid).axes).toContain('mirror-x');
  });
});

describe('the construction figure', () => {
  const figure = (body = PLUS, name = 'plus') => {
    const { measurement } = analyzeSvg(svg(body));
    return constructionSvg(svg(body), measurement as Measurement & { box: NonNullable<Measurement['box']> }, '#ff5a1f', name);
  };

  it('draws the axes, the grid and the numbers over the artwork', () => {
    const out = figure();
    expect(out.startsWith('<svg')).toBe(true);
    expect(out).toContain('viewBox="');
    expect(out).toContain('#ff5a1f');
    expect(out).toContain('mirror-x');
    expect(out).toContain('data:image/svg+xml;base64,');
    // one line per grid step across a 40 unit mark on a grid of 5: 9 vertical and 9 horizontal
    expect(out.match(/class="grid"/g)).toHaveLength(18);
  });

  it('is the same bytes for the same input', () => expect(figure()).toBe(figure()));
  it('escapes a name with markup', () => expect(figure(PLUS, '<b>&')).not.toContain('<b>'));
});
