import { describe, expect, it } from 'vitest';
import { contrastBetween as core, parseColor } from '../../src/core/checker/contrast';
import { contrastBetween as viewer } from '../../src/viewer/lib/theme/color';

const coreRatio = (fg: string, bg: string) => core(parseColor(fg)!, parseColor(bg)!);

describe('the viewer measures contrast as core does', () => {
  it.each([
    ['rgba(0, 0, 0, 0.5)', '#ffffff'],
    ['#00000080', '#ffffff'],
    ['rgba(255, 255, 255, 0.3)', '#112233'],
    ['#112233', '#ffffff'],
  ])('%s on %s', (fg, bg) => {
    expect(viewer(fg, bg)).toBeCloseTo(coreRatio(fg, bg)!, 6);
  });

  it('blends a translucent foreground over the background', () => {
    expect(viewer('rgba(0, 0, 0, 0.5)', '#ffffff')).toBeLessThan(6);
  });

  it('has no ratio on a translucent background', () => {
    expect(viewer('#000000', 'rgba(255, 255, 255, 0.5)')).toBeUndefined();
    expect(coreRatio('#000000', 'rgba(255, 255, 255, 0.5)')).toBeUndefined();
  });
});
