import { describe, it, expect } from 'vitest';
import { NAME } from '../../../../src/shipped/social-cards/request.js';
import { backgroundFindings, contrastFinding, intrusion, keepClearFindings, logoContrastFinding, overflowFinding } from '../../../../src/shipped/social-cards/checks.js';

// blazon.social-cards, the plugin blazon ships to compose marketing images from a brand's tokens, logo and a background.
// Seam: the findings the checks map to the codes the docs list.

describe('findings', () => {
  it('maps a contrast miss, an overflow and an unreviewed background to the codes the docs list', () => {
    expect(contrastFinding('launch', 3.2, 0.75)).toEqual({
      code: `${NAME}/card-text-contrast`, severity: 'error', path: 'launch.png',
      message: 'card "launch": the headline is 3.2:1 against the picture even with the strongest scrim (0.75), under 4.5:1',
    });
    expect(logoContrastFinding('launch', 1.14)).toEqual({
      code: `${NAME}/card-logo-contrast`, severity: 'error', path: 'launch.png',
      message: 'card "launch": the logo is 1.1:1 against the picture under it, under 3:1; use a logo variant made for that surface (logo.onLight, logo.onDark), move the logo with anchor or logoCorner, or pick another background',
    });
    expect(overflowFinding('launch', 40)).toMatchObject({ code: `${NAME}/card-text-overflow`, severity: 'error', path: 'launch.png' });
    expect(overflowFinding('launch', 40).message).toContain('40px');
  });

  const asset = (extra: object = {}) => ({ id: 'backgrounds/x', name: 'x', category: 'backgrounds', file: 'brand-assets/backgrounds/x.png', format: 'png', mediaType: 'image/png', bytes: 1, width: 1200, height: 630, ...extra });
  it('flags a generated background that nobody has reviewed, and passes one marked ok', () => {
    const unreviewed = backgroundFindings('c', asset({ meta: { generated: { tool: 'x' } } }), { width: 1200, height: 630 });
    expect(unreviewed.map((f) => f.code)).toEqual([`${NAME}/card-background-generated-unreviewed`]);
    expect(unreviewed[0]!.severity).toBe('error');
    expect(unreviewed[0]!.message).toContain('it has no review');
    const needs = backgroundFindings('c', asset({ meta: { generated: true, review: { status: 'needs-review' } } }), { width: 1200, height: 630 });
    expect(needs).toHaveLength(1);
    expect(needs[0]!.message).toContain('review.status is "needs-review", not "ok"');
    expect(backgroundFindings('c', asset({ meta: { generated: true, review: { status: 'ok' } } }), { width: 1200, height: 630 })).toEqual([]);
  });

  it('treats an asset with no generated field as not generated, so it works before the field exists', () => {
    expect(backgroundFindings('c', asset({ meta: { review: { status: 'needs-review' } } }), { width: 1200, height: 630 })).toEqual([]);
    expect(backgroundFindings('c', asset(), { width: 1200, height: 630 })).toEqual([]);
  });

  it('warns when the image has fewer pixels than the card needs, never for vector art', () => {
    const small = backgroundFindings('c', asset({ width: 600, height: 315 }), { width: 1200, height: 630 });
    expect(small).toEqual([expect.objectContaining({ code: `${NAME}/card-background-small`, severity: 'warning', path: 'c.png' })]);
    expect(backgroundFindings('c', asset({ width: 1200, height: 400 }), { width: 1200, height: 630 })).toHaveLength(1);
    expect(backgroundFindings('c', asset({ width: 1200, height: 630 }), { width: 1200, height: 630 })).toEqual([]);
    expect(backgroundFindings('c', asset({ format: 'svg', width: 100, height: 50 }), { width: 1200, height: 630 })).toEqual([]);
  });
});

describe('the areas kept clear', () => {
  const box = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });
  // the avatar area on a 1584 x 396 cover: x 0 to 396, y 198 to 396
  const zones = [{ name: 'avatar' as const, x: 0, y: 50, width: 25, height: 50 }];
  const card = { width: 1584, height: 396 };
  const check = (over: { headline?: ReturnType<typeof box>[]; subline?: ReturnType<typeof box>[]; logo?: ReturnType<typeof box> }) =>
    keepClearFindings('cover', { card, zones, lines: { headline: over.headline ?? [], subline: over.subline ?? [] }, ...(over.logo && { logo: over.logo }) });

  it('measures how far a box reaches into an area: the smaller of the overlap\'s two sides', () => {
    expect(intrusion(box(0, 150, 600, 100), box(0, 198, 396, 198))).toBe(52);
    expect(intrusion(box(300, 150, 600, 100), box(0, 198, 396, 198))).toBe(52);
    expect(intrusion(box(380, 150, 600, 100), box(0, 198, 396, 198))).toBe(16);
    expect(intrusion(box(10, 210, 20, 20), box(0, 198, 396, 198))).toBe(20);
  });

  it('does not count boxes that only touch an edge, or lie apart', () => {
    expect(intrusion(box(0, 100, 600, 98), box(0, 198, 396, 198))).toBe(0);
    expect(intrusion(box(396, 250, 100, 100), box(0, 198, 396, 198))).toBe(0);
    expect(intrusion(box(500, 300, 100, 50), box(0, 198, 396, 198))).toBe(0);
    expect(check({ headline: [box(0, 100, 600, 98)], logo: box(396, 300, 120, 26) })).toEqual([]);
  });

  it('lets a box reach 2 px into an area, and reports it from more than 2', () => {
    expect(check({ headline: [box(24, 100, 600, 100)] })).toEqual([]);
    expect(check({ headline: [box(24, 100, 600, 100.5)] })).toHaveLength(1);
    expect(check({ headline: [box(394, 250, 100, 60)] })).toEqual([]);
    expect(check({ headline: [box(393, 250, 100, 60)] })).toHaveLength(1);
  });

  it('reports the headline, the subline and the logo under their own codes, naming the card and the area', () => {
    const found = check({ headline: [box(24, 24, 800, 100), box(24, 124, 500, 100)], subline: [box(24, 230, 300, 40)], logo: box(20, 300, 120, 26) });
    expect(found.map((f) => f.code)).toEqual([`${NAME}/card-text-keep-clear`, `${NAME}/card-text-keep-clear`, `${NAME}/card-logo-keep-clear`]);
    expect(found.every((f) => f.severity === 'error' && f.path === 'cover.png' && f.message.startsWith('card "cover": '))).toBe(true);
    expect(found[0]!.message).toContain('the headline reaches 26px into the area kept clear "avatar" (x 0%, y 50%, 25% by 50%)');
    expect(found[1]!.message).toContain('the subline reaches 40px');
    expect(found[2]!.message).toContain('the logo reaches 26px');
  });

  it('checks each line, so a short first line beside the area is not reported for the wider line above it', () => {
    expect(check({ headline: [box(24, 24, 1000, 100), box(500, 124, 400, 100)] })).toEqual([]);
  });

  it('reports one finding for each area a part reaches into, and names a rectangle by its numbers', () => {
    const both = keepClearFindings('cover', { card, zones: [...zones, { x: 0, y: 0, width: 50, height: 50 }], lines: { headline: [box(24, 150, 600, 100)], subline: [] } });
    expect(both).toHaveLength(2);
    expect(both[1]!.message).toContain('reaches 48px into the area kept clear (x 0%, y 0%, 50% by 50%)');
  });
});
