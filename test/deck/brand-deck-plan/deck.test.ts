import { describe, it, expect } from 'vitest';
import { brand, color, kinds, logoAsset, planOf } from './helpers.js';

describe('the cover', () => {
  it('an empty brand is a cover and an empty contents', () => {
    const slides = planOf(brand());
    expect(kinds(slides)).toEqual(['cover', 'contents']);
    expect(slides[0]).toMatchObject({ title: 'Acme Brand Book', logo: null });
    expect((slides[1] as any).items).toEqual([]);
  });

  it('has the description and the logo for a light page', () => {
    const slides = planOf(brand([], { description: 'How Acme looks.', logo: { onLight: 'brand-assets/logos/a.svg', onDark: 'brand-assets/logos/b.svg' } }));
    expect((slides[0] as any).subtitle).toBe('How Acme looks.');
    expect((slides[0] as any).logo).toEqual({ file: 'brand-assets/logos/a.svg', background: 'light' });
  });

  it('puts a brand with only a dark logo on a dark cover', () => {
    const slides = planOf(brand([], { logo: { onDark: 'brand-assets/logos/b.svg' } }));
    expect((slides[0] as any).logo).toEqual({ file: 'brand-assets/logos/b.svg', background: 'dark' });
  });
});

describe('order', () => {
  it('logo then colors then typography, and the contents names their pages', () => {
    const FAMILY = { path: 'font.family.display', type: 'fontFamily', value: 'Inter', resolvedValue: ['Inter'], rawValue: [] };
    const STYLE = {
      path: 'type.display',
      type: 'typography',
      value: 'x',
      resolvedValue: { fontFamily: ['Inter'], fontSize: { value: 72, unit: 'px' }, fontWeight: 600 },
      rawValue: {},
    };
    const slides = planOf(brand([color('color.a.x', '#111111'), FAMILY, STYLE], { assets: [logoAsset('black', {})] }));
    expect(kinds(slides)).toEqual(['cover', 'contents', 'logo', 'colors', 'fonts', 'type-scale']);
    expect((slides[1] as any).items).toEqual([
      { title: 'Logo', page: 3 },
      { title: 'Colors', page: 4 },
      { title: 'Typography', page: 5 },
    ]);
  });
});
