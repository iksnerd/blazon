import { describe, it, expect } from 'vitest';
import { NAME } from '../../../../src/shipped/social-cards/request.js';
import { logoCornerFinding, logoFinding, logoNoCornerFinding, logoWidthFinding, planLogo } from '../../../../src/shipped/social-cards/checks.js';
import { logoInset, pageHtml, type Look } from '../../../../src/shipped/social-cards/layout.js';
import { rule } from './helpers.js';

// blazon.social-cards, the plugin blazon ships to compose marketing images from a brand's tokens, logo and a background.
// Seam: where the logo goes, how big it is and what is left for the text.

describe('the logo', () => {
  const format = { width: 1200, height: 630, margin: 64, columns: 6 };
  const logo = { width: 364, height: 80 };

  it('sits in the first corner the sidecar lists, inside the margin, at least as wide as its minimum size', () => {
    const plan = planLogo(format, logo, { placement: ['bottom-right', 'top-left'], minSize: { width: { value: 240, unit: 'px' } }, clearSpace: { value: 24, unit: 'px' } });
    expect(plan.corner).toBe('bottom-right');
    expect(plan.rect.width).toBeGreaterThanOrEqual(240);
    expect(plan.rect.x + plan.rect.width).toBe(1200 - 64);
    expect(plan.rect.y + plan.rect.height).toBe(630 - 64);
    expect(plan.clearSpace).toBeCloseTo(24 * (plan.rect.width / 364), 5);
  });

  it('moves the logo to the edge opposite the text when the card sets an anchor', () => {
    const meta = { placement: ['top-left', 'bottom-right'] as string[] };
    expect(planLogo(format, logo, meta, 'top').corner).toBe('bottom-right');
    expect(planLogo(format, logo, meta, 'bottom').corner).toBe('top-left');
    expect(planLogo(format, logo, { placement: ['top-right', 'bottom-left'] }, 'top').corner).toBe('bottom-left');
    expect(planLogo(format, logo, undefined, 'top').corner).toBe('bottom-left');
    expect(planLogo(format, logo, meta).corner).toBe('top-left');
  });

  it('measures a clear space of units in the logo\'s own unit, and falls back to the top left with no sidecar', () => {
    const plan = planLogo(format, logo, { unit: { value: 20, unit: 'px' }, clearSpace: { units: 1 } });
    expect(plan.corner).toBe('top-left');
    expect(plan.clearSpace).toBeCloseTo(20 * (plan.rect.width / 364), 5);
    expect(planLogo(format, logo, undefined).clearSpace).toBeGreaterThan(0);
  });

  it('never draws a logo wider than the card, however much logoWidth asks, so the browser is never asked for a canvas of that size', () => {
    const meta = { placement: ['top-left'], minSize: { width: rule(120) }, clearSpace: rule(24) };
    for (const width of [5000, 50_000, 1e9]) expect(planLogo(format, logo, meta, undefined, { width }).rect.width).toBe(format.width);
    // A logo that wide is outside the safe area, and the check says so
    const plan = planLogo(format, logo, meta, undefined, { width: 1e9 });
    expect(logoFinding('c', { logo: plan.rect, clearSpace: plan.clearSpace, text: box(0, 0, 1, 1), safe: box(64, 64, 1072, 502), card: box(0, 0, 1200, 630) })).toMatchObject({ code: `${NAME}/card-logo-clear-space` });
  });

  it('sizes the logo from the shorter side with logoWidth, as a percentage or in px, and keeps 14% of the width without it', () => {
    const banner = { width: 1584, height: 396, margin: 24, columns: 6 };
    const meta = { placement: ['top-left'], minSize: { width: rule(120) }, clearSpace: rule(69) };
    // 14% of the width is what overran the margin
    expect(planLogo(banner, logo, meta).rect.width).toBe(222);
    expect(planLogo({ ...banner, height: 800 }, logo, meta, undefined, { width: '22%' }).rect.width).toBe(Math.round(0.22 * 800));
    expect(planLogo(format, logo, meta, undefined, { width: 200 }).rect.width).toBe(200);
    expect(planLogo(format, logo, meta, undefined, { width: 200 }).rect.height).toBe(Math.round(200 * (80 / 364)));
    const plan = planLogo(banner, logo, meta, undefined, { width: '40%' });
    expect(plan.rect.width).toBe(Math.round(0.4 * 396));
    expect(plan.clearSpace).toBeCloseTo(69 * (plan.rect.width / 364), 5);
  });

  it('never draws the logo under its minimum size, and reports a width in px that asked for less', () => {
    const banner = { width: 1584, height: 396, margin: 24, columns: 6 };
    const meta = { placement: ['top-left'], minSize: { width: rule(120) }, clearSpace: rule(69) };
    // 22% of 396 is 87: the brand's own rule is "22%, at least 120px", so a percentage lands on the minimum quietly
    const share = planLogo(banner, logo, meta, undefined, { width: '22%' });
    expect(share.rect.width).toBe(120);
    expect(share.clampedFrom).toBeUndefined();
    const px = planLogo(banner, logo, meta, undefined, { width: 80 });
    expect(px.rect.width).toBe(120);
    expect(px.clampedFrom).toBe(80);
    expect(planLogo(banner, logo, meta, undefined, { width: 120 }).clampedFrom).toBeUndefined();
    // a minimum stated in height counts too
    expect(planLogo(banner, logo, { minSize: { height: rule(40) } }, undefined, { width: 50 }).rect.width).toBe(Math.round(40 / (80 / 364)));
    expect(logoWidthFinding('c', 0.5, 120).message).toContain('0.5px');
    expect(logoWidthFinding('c', 80, 120)).toMatchObject({ code: `${NAME}/card-logo-width-clamped`, severity: 'warning', path: 'c.png', message: expect.stringContaining('80px') });
  });

  it('puts the logo in the corner the card names, over the sidecar and over the text edge', () => {
    const meta = { placement: ['top-left'] };
    for (const corner of ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const) {
      const { rect, corner: got } = planLogo(format, logo, meta, undefined, { corner, width: 200 });
      expect(got).toBe(corner);
      expect(rect.x).toBe(corner.endsWith('left') ? 64 : 1200 - 64 - 200);
      expect(rect.y).toBe(corner.startsWith('top') ? 64 : 630 - 64 - rect.height);
    }
    expect(planLogo(format, logo, meta, 'top', { corner: 'top-right' }).corner).toBe('top-right');
    expect(planLogo(format, logo, undefined, 'top', {}).corner).toBe('bottom-left');
  });

  it('never picks a corner the placement does not list', () => {
    // text from the top, the sidecar lists only top corners: the preferred corner stays and the plan says why
    const plan = planLogo(format, logo, { placement: ['top-right'] }, 'top');
    expect(plan.corner).toBe('top-right');
    expect(plan.noCornerOnEdge).toEqual({ edge: 'top', listed: ['top-right'] });
    expect(logoNoCornerFinding('c', 'top', 'top-right', ['top-right'])).toMatchObject({ code: `${NAME}/card-logo-corner-unlisted`, severity: 'warning', path: 'c.png' });
    // a listed corner on the other edge is still taken, with nothing to report
    expect(planLogo(format, logo, { placement: ['top-right', 'bottom-left'] }, 'top').noCornerOnEdge).toBeUndefined();
    // no placement: today's behaviour
    expect(planLogo(format, logo, undefined, 'top').noCornerOnEdge).toBeUndefined();
  });

  it('keeps an explicit logoCorner the placement does not list, and reports it', () => {
    const plan = planLogo(format, logo, { placement: ['top-left'] }, undefined, { corner: 'bottom-right' });
    expect(plan.corner).toBe('bottom-right');
    expect(plan.outsideRule).toEqual(['top-left']);
    expect(logoCornerFinding('c', 'bottom-right', ['top-left'])).toMatchObject({ code: `${NAME}/card-logo-corner-unlisted`, severity: 'warning', message: expect.stringContaining('bottom-right') });
    expect(planLogo(format, logo, { placement: ['top-left'] }, undefined, { corner: 'top-left' }).outsideRule).toBeUndefined();
    expect(planLogo(format, logo, undefined, undefined, { corner: 'top-left' }).outsideRule).toBeUndefined();
  });

  it('gives the text room across, not down, when the logo is on its edge', () => {
    const plan = { corner: 'top-right' as const, rect: { x: 1440, y: 24, width: 120, height: 26 }, clearSpace: 22.7 };
    expect(logoInset('left', 'top', plan)).toEqual({ left: 0, right: 143 });
    expect(logoInset('center', 'top', plan)).toEqual({ left: 143, right: 143 });
    // not on the text's edge: nothing to make room for. On the side the text starts from: nothing can be made
    expect(logoInset('left', 'bottom', plan)).toEqual({ left: 0, right: 0 });
    expect(logoInset('left', 'top', { ...plan, corner: 'top-left' })).toEqual({ left: 0, right: 0 });
  });

  const look = (over: Partial<Look> = {}): Look => ({
    format: { width: 1584, height: 396, margin: 24, columns: 6 },
    card: { id: 'c', format: 'f', background: 'b', headline: 'H', logo: 'auto', align: 'left' },
    display: { start: 96, floor: 40, family: 'Georgia', weight: 700, lineHeight: 1, letterSpacing: '0em' },
    bodyFamily: 'Arial', fonts: [], background: '#123', ground: '#000', textColor: '#fff', accent: '#f50', size: 96, anchor: 'top', maxHeight: 348,
    ...over,
  });
  const textBox = (html: string) => /#text \{ position: absolute; (top|bottom): 24px; left: (\d+)px; width: (\d+)px;( right: (\d+)px;)?/.exec(html)!;

  it('draws the text block as before without an inset, and narrower and further in with one', () => {
    expect(textBox(pageHtml(look())).slice(1, 4)).toEqual(['top', '24', '1280']);
    expect(textBox(pageHtml(look({ inset: { left: 0, right: 0 } }))).slice(1, 4)).toEqual(['top', '24', '1280']);
    // the room for a logo that the block already leaves is not taken twice
    expect(textBox(pageHtml(look({ inset: { left: 0, right: 143 } }))).slice(1, 4)).toEqual(['top', '24', '1280']);
    expect(textBox(pageHtml(look({ inset: { left: 0, right: 400 } }))).slice(1, 4)).toEqual(['top', '24', '1136']);
    const centered = textBox(pageHtml(look({ card: { ...look().card, align: 'center' }, inset: { left: 143, right: 143 } })));
    expect(centered.slice(1, 6)).toEqual(['top', '167', '1250', ' right: 167px;', '167']);
  });

  const safe = { x: 64, y: 64, width: 1072, height: 502 };
  const box = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });
  it('passes a logo whose clear space is free', () => {
    expect(logoFinding('c', { logo: box(64, 64, 168, 37), clearSpace: 12, text: box(64, 400, 600, 160), safe, card: box(0, 0, 1200, 630) })).toBeUndefined();
  });

  it('reports a logo whose clear space overlaps the text', () => {
    const finding = logoFinding('c', { logo: box(64, 64, 168, 37), clearSpace: 12, text: box(64, 110, 600, 160), safe, card: box(0, 0, 1200, 630) });
    expect(finding).toMatchObject({ code: `${NAME}/card-logo-clear-space`, severity: 'error', path: 'c.png' });
    expect(finding!.message).toContain('text');
  });

  it('reports text inside the clear space of a logo on its own edge under a code of its own', () => {
    const drawn = { logo: box(64, 64, 168, 37), clearSpace: 12, text: box(64, 110, 600, 160), safe, card: box(0, 0, 1200, 630) };
    const finding = logoFinding('c', { ...drawn, shared: true });
    expect(finding).toMatchObject({ code: `${NAME}/card-text-logo-overlap`, severity: 'error', path: 'c.png' });
    expect(finding!.message).toContain('same edge');
    expect(logoFinding('c', { ...drawn, shared: true, text: box(300, 64, 600, 40) })).toBeUndefined();
    // the checks that are not about the text keep their code
    expect(logoFinding('c', { ...drawn, shared: true, logo: box(20, 20, 168, 37) })).toMatchObject({ code: `${NAME}/card-logo-clear-space` });
  });

  it('reports a logo that leaves the safe area, or whose clear space leaves the card', () => {
    const outside = logoFinding('c', { logo: box(20, 20, 168, 37), clearSpace: 12, text: box(64, 400, 600, 160), safe, card: box(0, 0, 1200, 630) });
    expect(outside!.message).toContain('safe area');
    const edge = logoFinding('c', { logo: box(64, 64, 168, 37), clearSpace: 80, text: box(64, 400, 600, 160), safe, card: box(0, 0, 1200, 630) });
    expect(edge!.message).toContain('edge');
  });
});
