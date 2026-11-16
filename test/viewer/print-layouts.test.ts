import { describe, it, expect } from 'vitest';
import { LAYOUTS, layoutNamed } from '../../src/viewer/pages/print/layouts';
import { printCss } from '../../src/viewer/pages/print/css';
import { parsePrintHash } from '../../src/viewer/pages/print/selection';

// The two layouts of the print book are one object each; the hash names one, the CSS and the squeeze read it.

describe('the print layouts', () => {
  it('reads the layout from the hash, and takes the compact one for a missing or unknown name', () => {
    expect(parsePrintHash('#print?layout=roomy').layout).toBe('roomy');
    expect(parsePrintHash('#print/essentials?title=A&layout=roomy')).toEqual({ selection: 'essentials', title: 'A', layout: 'roomy' });
    expect(parsePrintHash('#print').layout).toBeUndefined();
    expect(parsePrintHash('#print?layout=tight').layout).toBe('compact');
    expect(layoutNamed('toString')).toBe('compact');
  });

  it('squeezes no picture in the roomy layout, and some in the compact one', () => {
    expect(LAYOUTS.roomy.squeezeFloor).toBe(1);
    expect(LAYOUTS.compact.squeezeFloor).toBeLessThan(1);
  });

  it('sets the spacing of the layout it is given', () => {
    const [compact, roomy] = [printCss('compact'), printCss('roomy')];
    expect(compact).toContain('padding: 12px 0');
    expect(compact).toContain('line-height: 1.4');
    expect(compact).toContain('max-height: 380px');
    expect(compact).toContain('margin-bottom: 0.6em');
    expect(roomy).toContain('padding: 24px 0');
    expect(roomy).toContain('line-height: 1.5');
    expect(roomy).toContain('max-height: 420px');
    expect(roomy).not.toContain('margin-bottom: 0.6em');
  });
});
