// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import path from 'node:path';
import { REPO } from '../support/paths';
import { hasReference, referencePath } from '../support/reference';
import { cleanup, render, screen, within } from '@testing-library/react';
import { loadConfig } from '../../src/core/config/index.js';
import { compileBlazonData } from '../../src/core/index.js';
import { injectBlazonData } from '../../src/server/data-script.js';
import type { BlazonData, TokenItem, TokenType } from '../../src/types/index.js';
import { App } from '../../src/viewer/App';

// The reference brand when a maintainer has it, else blazon's own: a describe that needs the reference is skipped without it
const PRESENT = hasReference('examples/auth0');
const EXAMPLE = PRESENT ? referencePath('examples/auth0') : path.join(REPO, 'examples/blazon');
let base: BlazonData;

beforeAll(async () => {
  base = await compileBlazonData(await loadConfig(EXAMPLE), EXAMPLE);
});

afterEach(() => {
  cleanup();
  document.head.innerHTML = '';
  localStorage.clear();
});

/** A token as core compiles it, for types the Auth0 example does not have yet. */
function token(tokenPath: string, type: TokenType, value: string | number, resolvedValue: unknown = value, parts?: TokenItem['parts']): TokenItem {
  const segments = tokenPath.split('.');
  return {
    path: tokenPath,
    group: segments[0]!,
    name: segments[segments.length - 1]!,
    file: 'test.json',
    rawValue: resolvedValue,
    resolvedValue,
    value,
    parts,
    type,
    blazon: {},
    cssVariable: `--${segments.join('-')}`,
  };
}

const MOTION = [
  token('motion.duration.calm', 'duration', '350ms', { value: 350, unit: 'ms' }),
  token('motion.easing.smooth', 'cubicBezier', 'cubic-bezier(0.25, 0.1, 0.25, 1)', [0.25, 0.1, 0.25, 1]),
  token(
    'motion.transition.enter',
    'transition',
    '350ms cubic-bezier(0.25, 0.1, 0.25, 1) 0ms',
    {},
    {
      duration: '350ms',
      timingFunction: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
      delay: '0ms',
    },
  ),
];

const EFFECTS = [
  token('stroke.style.dashed', 'strokeStyle', 'dashed'),
  token('stroke.style.illustration', 'strokeStyle', 'dashed', { dashArray: ['0.4px', '2px'], lineCap: 'round' }),
  token('border.card', 'border', '1px solid #BDC4CF', {}, { width: '1px', style: 'solid', color: '#BDC4CF' }),
  token('shadow.raised', 'shadow', '0px 4px 12px 0px #0000001a'),
];

function withTokens(extra: TokenItem[]): BlazonData {
  return { ...base, tokens: { ...base.tokens, items: [...base.tokens.items, ...extra] } };
}

function openViewer(hash: string, brand: BlazonData) {
  document.head.innerHTML = new DOMParser().parseFromString(injectBlazonData('<html><head></head><body></body></html>', brand), 'text/html').head.innerHTML;
  window.location.hash = hash;
  return render(<App />);
}

function main() {
  return within(screen.getByRole('main'));
}

function nav() {
  return within(screen.getByRole('navigation', { name: 'Brand book' }));
}

describe.skipIf(!PRESENT)('motion', () => {
  it('appears in the navigation only when the brand has motion tokens', () => {
    // By href: the Auth0 example also has a Motion guideline page
    const motionLink = () =>
      nav()
        .queryAllByRole('link')
        .find((a) => a.getAttribute('href') === '#tokens/motion');
    openViewer('#tokens/colors', base);
    expect(motionLink()).toBeUndefined();
    cleanup();
    openViewer('#tokens/colors', withTokens(MOTION));
    expect(motionLink()).toBeTruthy();
  });

  it('shows each duration with a demo that runs for that long', () => {
    openViewer('#tokens/motion', withTokens(MOTION));
    const row = main().getByText('motion.duration.calm').closest('[data-token]') as HTMLElement;
    expect(within(row).getByText('350ms')).toBeTruthy();
    expect((row.querySelector('[data-demo]') as HTMLElement).style.animationDuration).toBe('350ms');
  });

  it('draws each easing as a curve', () => {
    openViewer('#tokens/motion', withTokens(MOTION));
    const curve = main().getByRole('img', { name: 'Easing curve cubic-bezier(0.25, 0.1, 0.25, 1)' });
    expect(curve.querySelector('path')!.getAttribute('d')).toBe('M0,100 C25,90 25,0 100,0');
  });

  it('lists the parts of a transition and animates with all of them', () => {
    openViewer('#tokens/motion', withTokens(MOTION));
    const row = main().getByText('motion.transition.enter').closest('[data-token]') as HTMLElement;
    expect(within(row).getByText('Duration 350ms')).toBeTruthy();
    expect(within(row).getByText('Delay 0ms')).toBeTruthy();
    const demo = row.querySelector('[data-demo]') as HTMLElement;
    expect(demo.style.animationTimingFunction).toBe('cubic-bezier(0.25, 0.1, 0.25, 1)');
  });
});

describe.skipIf(!PRESENT)('strokes and effects', () => {
  it('appears in the navigation only when the brand has those tokens', () => {
    // The Auth0 example has border and number tokens (illustration strokes, icon opacity), so strip them
    const without = { ...base, tokens: { ...base.tokens, items: base.tokens.items.filter((t) => !['strokeStyle', 'border', 'shadow', 'number'].includes(t.type ?? '')) } };
    openViewer('#tokens/colors', without);
    expect(nav().queryByRole('link', { name: 'Strokes & effects' })).toBeNull();
    cleanup();
    openViewer('#tokens/colors', withTokens(EFFECTS));
    expect(nav().getByRole('link', { name: 'Strokes & effects' })).toBeTruthy();
  });

  it('draws a stroke style, using the dash array and line cap of the object form', () => {
    openViewer('#tokens/effects', withTokens(EFFECTS));
    const named = main().getByText('stroke.style.dashed').closest('[data-token]') as HTMLElement;
    expect((named.querySelector('[data-demo]') as HTMLElement).style.borderTopStyle).toBe('dashed');

    const custom = main().getByText('stroke.style.illustration').closest('[data-token]') as HTMLElement;
    const line = custom.querySelector('line')!;
    expect(line.getAttribute('stroke-dasharray')).toBe('0.4px 2px');
    expect(line.getAttribute('stroke-linecap')).toBe('round');
  });

  it('draws borders with their width and color, and applies shadows to a sample surface', () => {
    openViewer('#tokens/effects', withTokens(EFFECTS));
    const border = main().getByText('border.card').closest('[data-token]') as HTMLElement;
    const path = border.querySelector('[data-preview="border"] path')!;
    expect(path.getAttribute('stroke-width')).toBe('1');
    expect(path.getAttribute('stroke')).toBe('#BDC4CF');
    const shadow = main().getByText('shadow.raised').closest('[data-token]') as HTMLElement;
    expect((shadow.querySelector('[data-demo]') as HTMLElement).style.boxShadow).toContain('12px');
  });

  it('shows numbers as they are', () => {
    // The Auth0 example's own token (slide 45)
    openViewer('#tokens/effects', base);
    const row = main().getByText('icon.marketing.inactiveOpacity').closest('[data-token]') as HTMLElement;
    expect(within(row).getAllByText('0.6').length).toBeGreaterThan(0);
  });
});

describe.skipIf(!PRESENT)('proportions', () => {
  it('shows every group that documents a proportion, not just the first', () => {
    const surface = { path: 'composition.surface', description: 'Approximate color ratio', blazon: { proportion: { 'color.neutral': 0.5, 'color.primary': 0.5 } } };
    openViewer('#tokens/colors', { ...base, tokens: { ...base.tokens, groupMeta: [...base.tokens.groupMeta, surface] } });
    expect(main().getAllByText('60% Neutral').length).toBeGreaterThan(0);
    expect(main().getByText('composition.surface')).toBeTruthy();
    expect(main().getAllByText('50% Neutral').length).toBeGreaterThan(0);
  });
});

describe.skipIf(!PRESENT)('previews chosen by meaning', () => {
  function preview(tokenPath: string): HTMLElement {
    const row = main().getByText(tokenPath).closest('[data-token]') as HTMLElement;
    return row.querySelector('[data-preview]') as HTMLElement;
  }

  it('draws sizes and grids as squares with a grid, not as bars', () => {
    openViewer('#tokens/dimensions', base);
    for (const p of ['icon.system.size', 'icon.marketing.grid', 'icon.feature.grid']) {
      const square = preview(p);
      expect(square.dataset.preview, p).toBe('square');
      expect(square.querySelectorAll('line').length, p).toBeGreaterThan(0);
    }
  });

  it('draws a stroke width as a shape stroked at that weight, magnified on its grid', () => {
    openViewer('#tokens/dimensions', base);
    const stroke = preview('icon.system.strokeWidth');
    expect(stroke.dataset.preview).toBe('stroke');
    // The shape, not the faint frame of the grid
    expect(stroke.querySelector('g')!.getAttribute('stroke-width')).toBe('1.5');
  });

  it('sets letter spacing and font size on live text, and frames a canvas', () => {
    openViewer('#tokens/dimensions', base);
    const tracking = preview('type.kinetic.letterSpacing');
    expect(tracking.dataset.preview).toBe('tracking');
    expect(tracking.style.letterSpacing).toBe('-0.015em');

    const size = preview('type.kinetic.fontSize');
    expect(size.dataset.preview).toBe('fontSize');
    expect(size.style.fontSize).toBe('100px');

    expect(preview('illustration.canvas').dataset.preview).toBe('frame');
  });

  it('fades a swatch to an opacity number', () => {
    openViewer('#tokens/effects', base);
    const opacity = preview('icon.marketing.inactiveOpacity');
    expect(opacity.dataset.preview).toBe('opacity');
    expect((opacity.querySelector('[data-faded]') as HTMLElement).style.opacity).toBe('0.6');
  });

  it('draws an illustration stroke as a magnified path with its width and color', () => {
    openViewer('#tokens/effects', base);
    const stroke = preview('illustration.stroke.default');
    expect(stroke.dataset.preview).toBe('border');
    const path = stroke.querySelector('path')!;
    expect(path.getAttribute('stroke-width')).toBe('0.4');
    expect(path.getAttribute('stroke')).toBe('#000000');
  });

  it('lets dev.blazon.preview override the guess, and sizes a plain bar by magnitude, negative em included', () => {
    const tight = token('spacing.tight', 'dimension', '-0.5em', { value: -0.5, unit: 'em' });
    const forced = { ...token('icon.badge.size', 'dimension', '24px', { value: 24, unit: 'px' }), blazon: { preview: 'bar' as const } };
    openViewer('#tokens/dimensions', withTokens([tight, forced]));

    const bar = preview('spacing.tight');
    expect(bar.dataset.preview).toBe('bar');
    expect(bar.style.width).toBe('8px');
    expect(preview('icon.badge.size').dataset.preview).toBe('bar');
  });
});
