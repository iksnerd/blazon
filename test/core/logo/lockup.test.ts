import { describe, it, expect } from 'vitest';
import { planInitiative, planPartnership } from '../../../src/core/logo/lockup.js';

// The numbers are the ones the brand book's partnership figure is pinned to (test/viewer/logo-rules-viewer.test.tsx): the viewer and
// the logo kit use this one layout.

const px = (value: number) => ({ value, unit: 'px' as const });
const MARK = { unit: px(12), partnership: { gap: { units: 1 }, dividerHeight: px(40) } };
const logo = (meta: object = MARK, size = { width: 100, height: 40 }) => ({ size, meta });

describe('planPartnership', () => {
  it('lays the logo, a divider and the partner on one baseline: gap 1 unit = 12px, partner scaled to the logo height', () => {
    const plan = planPartnership(logo(), { size: { width: 50, height: 20 } })!;
    // 100 (logo) + 12 + 1 (divider) + 12 + 100 (partner at 40 high) = 225 wide, 40 high
    expect([plan.width, plan.height]).toEqual([225, 40]);
    expect(plan.logo).toEqual({ x: 0, y: 0, width: 100, height: 40 });
    expect(plan.partner).toEqual({ x: 125, y: 0, width: 100, height: 40 });
    expect(plan.divider).toEqual({ x: 112.5, y1: 0, y2: 40, stroke: 1 });
  });

  it('stands both logos on the bottom edge when the divider is taller, and honours partnerHeight', () => {
    const meta = { unit: px(12), partnership: { gap: px(10), dividerHeight: px(60), partnerHeight: { units: 3 } } };
    const plan = planPartnership(logo(meta), { size: { width: 50, height: 20 } })!;
    expect([plan.width, plan.height]).toEqual([211, 60]);
    expect(plan.logo).toMatchObject({ y: 20, height: 40 });
    expect(plan.partner).toEqual({ x: 121, y: 24, width: 90, height: 36 });
    expect([plan.divider!.y1, plan.divider!.y2]).toEqual([0, 60]);
  });

  it('makes the divider 1% as thick as the logo is high', () => {
    const meta = { unit: px(100), partnership: { gap: { units: 1 }, dividerHeight: px(400) } };
    const plan = planPartnership(logo(meta, { width: 1000, height: 400 }), { size: { width: 50, height: 20 } })!;
    expect(plan.width).toBe(2204);
    expect(plan.divider).toMatchObject({ x: 1102, stroke: 4 });
  });

  it('has no divider when the rule states none, and keeps one gap between the logos', () => {
    const plan = planPartnership(logo({ unit: px(12), partnership: { gap: { units: 1 } } }), { size: { width: 50, height: 20 } })!;
    expect(plan.divider).toBeUndefined();
    expect(plan.partner.x).toBe(112);
    expect(plan.width).toBe(212);
  });

  it('is undefined for a logo that states no partnership', () => {
    expect(planPartnership(logo({ unit: px(12) }), { size: { width: 50, height: 20 } })).toBeUndefined();
  });
});

describe('planInitiative', () => {
  const rule = (extra: object) => ({ unit: px(12), initiative: { name: 'Lab', mark: 'initiatives/lab', gap: { units: 2 }, ...extra } });
  const mark = { size: { width: 60, height: 20 } };

  it('puts the mark beside the logo on one baseline, as tall as the logo: gap 2 units = 24px', () => {
    const plan = planInitiative(logo(rule({})), mark)!;
    // 100 (logo) + 24 + 120 (mark at 40 high: 60 * 40/20) = 244 wide, 40 high
    expect([plan.width, plan.height]).toEqual([244, 40]);
    expect(plan.logo).toEqual({ x: 0, y: 0, width: 100, height: 40 });
    expect(plan.mark).toEqual({ x: 124, y: 0, width: 120, height: 40 });
  });

  it('stands both on the bottom edge when markHeight is taller than the logo', () => {
    const plan = planInitiative(logo(rule({ markHeight: { units: 5 } })), mark)!;
    // mark 60 high so 180 wide
    expect([plan.width, plan.height]).toEqual([304, 60]);
    expect(plan.logo).toMatchObject({ y: 20, height: 40 });
    expect(plan.mark).toEqual({ x: 124, y: 0, width: 180, height: 60 });
  });

  it('puts the mark under the logo, left edges aligned, when the position is below', () => {
    const plan = planInitiative(logo(rule({ position: 'below' })), mark)!;
    // 40 (logo) + 24 + 40 (mark) = 104 high; the mark is 120 wide, wider than the logo
    expect([plan.width, plan.height]).toEqual([120, 104]);
    expect(plan.logo).toEqual({ x: 0, y: 0, width: 100, height: 40 });
    expect(plan.mark).toEqual({ x: 0, y: 64, width: 120, height: 40 });
  });

  it("keeps the logo's width when the mark is narrower, below", () => {
    const plan = planInitiative(logo(rule({ position: 'below', markHeight: px(10) })), mark)!;
    expect([plan.width, plan.height]).toEqual([100, 74]);
    expect(plan.mark).toEqual({ x: 0, y: 64, width: 30, height: 10 });
  });

  it('is undefined for a logo that states no initiative', () => {
    expect(planInitiative(logo({ unit: px(12) }), mark)).toBeUndefined();
  });
});
