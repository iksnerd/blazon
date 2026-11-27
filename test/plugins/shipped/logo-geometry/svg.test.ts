import { describe, it, expect } from 'vitest';
import { Unsupported } from '../../../../src/shipped/logo-geometry/geometry.js';
import { analyzeSvg } from '../../../../src/shipped/logo-geometry/measure.js';
import { arcPoints, pathSubpaths } from '../../../../src/shipped/logo-geometry/path.js';
import { readSvg } from '../../../../src/shipped/logo-geometry/svg.js';
import { parseTransform } from '../../../../src/shipped/logo-geometry/transform.js';
import { parseXml } from '../../../../src/core/svg/xml.js';

// What the reader takes from an SVG, and what it refuses by name. The expected values come from the drawing.

const svg = (body: string, attrs = 'viewBox="0 0 40 40"') => `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${body}</svg>`;
const measure = (body: string, attrs?: string) => analyzeSvg(svg(body, attrs)).measurement;
const ALL = ['mirror-x', 'mirror-y', 'rot180', 'rot90'];
const T = '<rect x="0" y="0" width="40" height="10"/><rect x="15" y="10" width="10" height="30"/>';

describe('shapes', () => {
  it('reads absolute and relative commands and curves', () => {
    // A circle from four cubic curves mirrors every way
    expect(measure('<path d="M20 0C31 0 40 9 40 20C40 31 31 40 20 40C9 40 0 31 0 20C0 9 9 0 20 0Z"/>').axes).toEqual(ALL);
    expect(measure('<path d="m0 0 h40 v10 h-40 z"/>').axes).toEqual(['mirror-x', 'mirror-y', 'rot180']);
  });

  it('keeps a hole a hole under the even-odd rule', () => {
    const frame = '<path fill-rule="evenodd" d="M0 0H40V40H0ZM10 10V30H30V10Z"/>';
    expect(measure(frame).axes).toEqual(ALL);
    expect(measure(frame).ink).toBeCloseTo(1200 / 1600, 1);
    expect(measure(`<g style="fill-rule:evenodd">${frame.replace(' fill-rule="evenodd"', '')}</g>`).ink).toBeCloseTo(1200 / 1600, 1);
  });

  it('does not count fill none, a definition, a hidden shape or a shape with no opacity as ink', () => {
    const L = '<rect x="0" y="0" width="10" height="40"/><rect x="10" y="30" width="30" height="10"/>';
    const hidden = [
      '<defs><rect x="0" y="0" width="40" height="40"/></defs>',
      '<rect x="0" y="0" width="40" height="40" fill="none"/>',
      '<rect x="0" y="0" width="40" height="40" display="none"/>',
      '<rect x="0" y="0" width="40" height="40" style="visibility:hidden"/>',
      '<g opacity="0"><rect x="0" y="0" width="40" height="40"/></g>',
      '<rect x="0" y="0" width="40" height="40" fill-opacity="0"/>',
    ];
    expect(measure(hidden.join('') + L).axes).toEqual([]);
    expect(measure(hidden.join('') + L).ink).toBe(measure(L).ink);
  });

  it('hands a group fill to its shapes, and a style beats an attribute', () => {
    const body = '<g fill="#f00"><rect x="0" y="0" width="20" height="10"/></g><rect x="20" y="0" width="20" height="10" fill="#00f"/><rect x="15" y="10" width="10" height="30" style="fill:#f00"/>';
    expect(measure(body).symmetry['mirror-x']!.color).toBeLessThan(0.8);
    expect(readSvg(svg('<rect width="1" height="1" fill="#000" style="fill:#F00"/>')).shapes[0]!.fill).toBe('#f00');
  });

  it('rounds the corners of a rectangle', () => {
    const m = measure('<rect width="40" height="40" rx="10"/>');
    expect(m.axes).toEqual(ALL);
    expect(m.ink).toBeGreaterThan(0.93);
    expect(m.ink).toBeLessThan(0.96);
    expect(measure('<rect width="40" height="40" ry="10"/>').ink).toBe(m.ink);
  });

  it('reads a polygon, a polyline, a circle and an ellipse', () => {
    expect(measure('<polygon points="0,0 40,0 40,40 0,40"/>').ink).toBe(1);
    expect(measure('<circle cx="20" cy="20" r="20"/>').axes).toEqual(ALL);
    expect(measure('<ellipse cx="20" cy="10" rx="20" ry="10"/>').axes).toEqual(['mirror-x', 'mirror-y', 'rot180']);
  });

  it('takes the size from width and height when there is no viewBox', () => {
    expect(readSvg(svg('<rect width="10" height="10"/>', 'width="40px" height="20px"')).viewBox).toEqual([0, 0, 40, 20]);
  });
});

describe('arcs', () => {
  it('reads an arc: a circle drawn as two half circles mirrors every way and covers a circle', () => {
    const m = measure('<path d="M20 0A20 20 0 0 1 20 40A20 20 0 0 1 20 0Z"/>');
    expect(m.axes).toEqual(ALL);
    expect(m.ink).toBeCloseTo(Math.PI / 4, 1);
  });

  it('reads an arc whose flags are written with nothing between them, as minified data does', () => {
    expect(measure('<path d="M0 20a20 20 0 1140 0a20 20 0 11-40 0z"/>').ink).toBeCloseTo(Math.PI / 4, 1);
  });

  it('draws a half circle on the side the sweep flag says', () => {
    const [mid] = arcPoints(0, 0, 20, 20, 0, false, true, 40, 0).slice(Math.floor(arcPoints(0, 0, 20, 20, 0, false, true, 40, 0).length / 2) - 1);
    // sweep 1 goes clockwise on screen (y down), so from (0,0) to (40,0) it passes above, at negative y
    expect(mid![1]).toBeLessThan(0);
    const [below] = arcPoints(0, 0, 20, 20, 0, false, false, 40, 0).slice(Math.floor(arcPoints(0, 0, 20, 20, 0, false, false, 40, 0).length / 2) - 1);
    expect(below![1]).toBeGreaterThan(0);
  });

  it('ends exactly at the end point, scales up radii that are too small, and draws a line for a zero radius', () => {
    const points = arcPoints(0, 0, 1, 1, 0, false, true, 40, 0);
    expect(points[points.length - 1]).toEqual([40, 0]);
    expect(Math.min(...points.map((p) => p[1]))).toBeCloseTo(-20, 5);
    expect(arcPoints(0, 0, 0, 5, 0, false, true, 40, 0)).toEqual([[40, 0]]);
    expect(arcPoints(3, 3, 5, 5, 0, false, true, 3, 3)).toEqual([]);
  });

  it('refuses an arc flag that is not 0 or 1', () => {
    expect(() => pathSubpaths('M0 0A5 5 0 2 1 10 0')).toThrow(/arc flag/);
  });
});

describe('transforms', () => {
  it('moves the points before anything is measured', () => {
    const { shapes } = readSvg(svg('<rect width="10" height="10" transform="translate(5 5)"/>'));
    expect(shapes[0]!.polygons[0]).toEqual([[5, 5], [15, 5], [15, 15], [5, 15]]);
    expect(shapes[0]!.anchors).toEqual([[5, 5], [15, 5], [15, 15], [5, 15]]);
  });

  it('composes a group transform with its children, outermost first', () => {
    const { shapes } = readSvg(svg('<g transform="translate(10 0)"><rect width="10" height="10" transform="scale(2)"/></g>'));
    expect(shapes[0]!.polygons[0]![2]).toEqual([30, 20]);
  });

  it('turns a T on its side with a rotation about a point', () => {
    const turned = measure(`<g transform="rotate(90 20 20)">${T}</g>`);
    expect(turned.axes).toEqual(['mirror-y']);
    expect(turned.box).toEqual({ x: 0, y: 0, w: 40, h: 40 });
  });

  it('reads matrix, skew and a list of them', () => {
    expect(parseTransform('matrix(1 0 0 1 3 4)', 'g')).toEqual([1, 0, 0, 1, 3, 4]);
    expect(parseTransform('translate(10) scale(2, 3)', 'g')).toEqual([2, 0, 0, 3, 10, 0]);
    expect(parseTransform('skewX(45)', 'g')[2]).toBeCloseTo(1, 10);
  });

  it('refuses what it does not understand, by name', () => {
    expect(() => parseTransform('wobble(3)', 'g')).toThrow(/wobble\(\), which is not an SVG transform/);
    expect(() => parseTransform('rotate(1 2)', 'g')).toThrow(/takes 1 or 3 numbers, not 2/);
    expect(() => parseTransform('translate(', 'g')).toThrow(Unsupported);
  });
});

describe('what it says it did not read', () => {
  it('refuses a logo drawn with strokes only, and says to outline them', () => {
    expect(() => measure('<circle cx="20" cy="20" r="15" fill="none" stroke="#000" stroke-width="4"/>')).toThrow(/strokes only[^]*outline/);
  });

  it('notes the strokes of a shape that also has a fill, and the strokes a group hands down', () => {
    expect(readSvg(svg('<rect width="10" height="10" fill="#000" stroke="#f00"/>')).notes).toEqual([expect.stringMatching(/1 shape is drawn with a stroke/)]);
    expect(readSvg(svg('<g stroke="#f00"><rect width="10" height="10"/><rect x="20" width="10" height="10"/></g>')).notes).toEqual([expect.stringMatching(/2 shapes are drawn with a stroke/)]);
    expect(readSvg(svg('<rect width="10" height="10"/>')).notes).toEqual([]);
  });

  it('notes a stylesheet that colors by class, because the fills it sets are not read', () => {
    const notes = readSvg(svg('<style>.a{fill:red}</style><rect class="a" width="10" height="10"/>')).notes;
    expect(notes).toEqual([expect.stringMatching(/<style> element colors shapes by class/)]);
    expect(readSvg(svg('<rect class="a" width="10" height="10"/>')).notes).toEqual([]);
  });

  it.each([
    ['<text x="0" y="10">Acme</text>', /live text/],
    ['<use href="#a"/>', /<use> points at another element/],
    ['<image href="a.png" width="10" height="10"/>', /<image> is a picture/],
  ])('refuses %s by name', (body, message) => {
    expect(() => readSvg(svg(body))).toThrow(message);
  });

  it('has nothing to measure when no shape paints', () => {
    expect(() => measure('<rect width="10" height="10" fill="none"/>')).toThrow(/nothing to measure/);
  });
});

describe('a file that is not a usable SVG', () => {
  it('is refused with the reason', () => {
    expect(() => readSvg('<html><body/></html>')).toThrow(/the root element is html/);
    expect(() => readSvg('not xml')).toThrow(/not an SVG/);
    expect(() => readSvg('<svg viewBox="0 0 10 10"><g></svg>')).toThrow(/closes <g>|never closed/);
    expect(() => readSvg('<svg><rect width="1" height="1"/></svg>')).toThrow(/no viewBox or size/);
    expect(() => readSvg('<svg viewBox="0 0 0 10"><rect/></svg>')).toThrow(/no viewBox or size/);
  });

  it('is refused when its elements are nested absurdly deep', () => {
    expect(() => readSvg(svg('<g>'.repeat(300) + '</g>'.repeat(300)))).toThrow(/nested more than 200/);
  });

  it('is refused for path data that is cut short or starts with a number', () => {
    expect(() => measure('<path d="M0 0 L 10"/>')).toThrow(/path data is cut short/);
    expect(() => measure('<path d="10 10"/>')).toThrow(/does not start with a command/);
    expect(() => measure('<path d="M0 0 Z 5 5"/>')).toThrow(/numbers after a close/);
    expect(() => measure('<path d="M0 0 X 5 5"/>')).toThrow(/the command X/);
  });
});

describe('the reader is only a reader', () => {
  it('does not expand an entity a DOCTYPE defines, and does not read a DOCTYPE at all', () => {
    const attack = '<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY boom SYSTEM "file:///etc/passwd"><!ENTITY big "ha">]><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="&boom;"/></svg>';
    expect(readSvg(attack).shapes[0]!.fill).toBe('&boom;');
  });

  it('decodes the five entities and character references in an attribute', () => {
    expect(parseXml('<a b="&lt;&amp;&gt;&quot;&apos;&#65;&#x42;&nope;"/>').attrs.get('b')).toBe('<&>"\'AB&nope;');
  });

  it('drops comments, CDATA, processing instructions and text, and a namespace prefix on a tag', () => {
    const root = parseXml('﻿<?xml version="1.0"?><!-- c --><svg:svg xmlns:svg="x"><![CDATA[ <rect/> ]]>text<svg:rect a="1"/></svg:svg>');
    expect(root.tag).toBe('svg');
    expect(root.children.map((c) => c.tag)).toEqual(['rect']);
  });
});
