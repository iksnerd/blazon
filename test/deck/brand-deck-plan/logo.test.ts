import { describe, it, expect } from 'vitest';
import { brand, kinds, logoAsset, ofKind, planOf, type J } from './helpers.js';

describe('logos', () => {
  const META = {
    unit: { value: 579, unit: 'px' },
    clearSpace: { units: 1 },
    lockup: 'horizontal',
    placement: ['top-left', 'bottom-left'],
    background: 'light',
    description: 'Use on light backgrounds.',
    minSize: { width: { value: 24, unit: 'px' } },
    partnership: { gap: { units: 1 }, dividerHeight: { value: 717, unit: 'px' } },
  };
  const logos = (assets: J[]) => ofKind(planOf(brand([], { assets })), 'logo');
  const rules = (slide: { rules: { label: string; text: string }[] }) => Object.fromEntries(slide.rules.map((r) => [r.label, r.text]));

  it('each logo is a slide with its rules written out', () => {
    const slide = logos([logoAsset('black', META)])[0]!;
    expect([slide.title, slide.file, slide.background, slide.note, slide.clear_space_px]).toEqual([
      'Black',
      'brand-assets/logos/black.png',
      'light',
      'Use on light backgrounds.',
      579,
    ]);
    expect(rules(slide)).toEqual({
      Lockup: 'horizontal',
      'Clear space': '579px (1 unit)',
      'Minimum size': 'width 24px',
      Placement: 'top-left, bottom-left',
      Partnership: 'gap 579px, divider height 717px',
    });
  });

  it('a logo is titled by its sidecar or by its name made readable', () => {
    expect(logos([logoAsset('horizontal-color', { title: 'Horizontal logo' }), logoAsset('stacked-white')]).map((s) => s.title)).toEqual(['Horizontal logo', 'Stacked white']);
  });

  it('a logo states its largest size and the logo to use below a size', () => {
    const small = logoAsset('small-mark', { title: 'Small mark' });
    const mark = logoAsset('mark', { maxSize: { height: { value: 20, unit: 'px' } }, replacedBelow: { width: { value: 30, unit: 'px' }, by: 'logos/small-mark' } });
    const missing = logoAsset('other', { replacedBelow: { height: { value: 2, unit: 'rem' }, by: 'logos/gone' } });
    const byTitle = Object.fromEntries(logos([mark, small, missing]).map((s) => [s.title, rules(s)]));
    expect(byTitle.Mark).toEqual({ 'Maximum size': 'height 20px', 'Smaller sizes': 'below width 30px, use Small mark' });
    expect(byTitle.Other).toEqual({ 'Smaller sizes': 'below height 32px, use logos/gone' });
  });

  it('a partnership with no divider says so', () => {
    const slide = logos([logoAsset('wide', { unit: { value: 318, unit: 'px' }, partnership: { gap: { units: 1 } } })])[0]!;
    expect(rules(slide).Partnership).toBe('gap 318px, no divider');
  });

  it('a logo whose sidecar states nothing has no rules and no clear space', () => {
    const slide = logos([logoAsset('plain')])[0]!;
    expect([slide.rules, slide.clear_space_px, slide.background]).toEqual([[], null, 'light']);
  });

  it('a logo that is not in the logos category is not a logo slide', () => {
    const icon = { ...logoAsset('star'), id: 'icons/star', category: 'icons' };
    expect(kinds(planOf(brand([], { assets: [icon] })))).not.toContain('logo');
  });
});

describe('a logo that states an initiative', () => {
  const slide = (initiative: object) => ofKind(planOf(brand([], { assets: [logoAsset('lab', { unit: { value: 100, unit: 'px' }, initiative })] })), 'logo')[0]!;

  it('names the program, where its mark goes and the gap', () => {
    expect(slide({ name: 'Open Banking Lab', mark: 'initiatives/lab', gap: { units: 2 } }).rules).toEqual([
      { label: 'Program', text: 'Open Banking Lab, mark beside the logo, gap 200px' },
    ]);
    expect(slide({ name: 'Lab', mark: 'initiatives/lab', gap: { value: 8, unit: 'px' }, position: 'below' }).rules).toEqual([
      { label: 'Program', text: 'Lab, mark below the logo, gap 8px' },
    ]);
  });
});
