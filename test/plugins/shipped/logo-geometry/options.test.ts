import { describe, it, expect } from 'vitest';
import { isColor, parseOptions } from '../../../../src/shipped/logo-geometry/options.js';
import { NAME } from '../../../../src/shipped/logo-geometry/request.js';

const known = new Set(['logos/mark', 'logos/wordmark', 'partners/acme']);

describe('options', () => {
  it('has defaults: every logo, no required axis, the 0.97 tolerance, a figure and a report', () => {
    expect(parseOptions({}, known)).toEqual({ options: { targets: undefined, figures: true, report: true, all: { require: [], tolerance: 0.97 } }, findings: [] });
  });

  it('takes what is right, for all the logos and for one', () => {
    const { options, findings } = parseOptions(
      { require: ['mirror-x'], tolerance: 0.9, grid: 4, accent: '#0af', figures: false, logos: ['logos/mark', { id: 'logos/wordmark', require: ['rot180'], grid: 2, crop: [0, 0, 40, 40], tolerance: 0.5 }] },
      known,
    );
    expect(findings).toEqual([]);
    expect(options.accent).toBe('#0af');
    expect(options.figures).toBe(false);
    expect(options.targets).toEqual([
      { id: 'logos/mark', named: true, require: ['mirror-x'], tolerance: 0.9, grid: 4 },
      { id: 'logos/wordmark', named: true, require: ['rot180'], tolerance: 0.5, grid: 2, crop: [0, 0, 40, 40] },
    ]);
  });

  it('reports each mistake as a finding, and keeps the rest', () => {
    const { options, findings } = parseOptions(
      { bogus: 1, require: ['mirror-z'], tolerance: 2, grid: 0, accent: 'url(javascript:alert(1))', figures: 'yes', logos: ['logos/nope', { id: 'logos/mark', crop: [0, 0, 0, 5], extra: 1 }, 7] },
      known,
    );
    expect(findings.every((f) => f.code === `${NAME}/option-invalid` && f.severity === 'error' && f.path === 'options')).toBe(true);
    expect(findings.map((f) => f.message).join('\n')).toMatch(
      /unknown option "bogus"[^]*require must be a list[^]*tolerance must be[^]*grid must be[^]*accent must be a color[^]*figures must be true or false[^]*"logos\/nope"[^]*unknown field "extra"[^]*crop must be \[x, y, width, height\][^]*logos\[2\] must be an asset id/,
    );
    expect(options.accent).toBeUndefined();
    expect(options.figures).toBe(true);
    expect(options.targets!.map((t) => t.id)).toEqual(['logos/mark']);
  });

  it('answers options that are not an object with one finding', () => expect(parseOptions([], known).findings).toHaveLength(1));
  it('answers logos that are not a list with one finding', () => expect(parseOptions({ logos: 'logos/mark' }, known).findings).toHaveLength(1));

  it('lets a color into the figure only when it cannot close the attribute it is written in', () => {
    for (const ok of ['#ff5a1f', '#f00', 'rebeccapurple', 'rgb(255, 90, 31)', 'hsl(20 100% 56% / 0.5)']) expect(isColor(ok), ok).toBe(true);
    for (const bad of ['red" onload="x', 'url(#a)', '', '#', 'rgb(1,2,3);x', '<svg>']) expect(isColor(bad), bad).toBe(false);
  });
});
