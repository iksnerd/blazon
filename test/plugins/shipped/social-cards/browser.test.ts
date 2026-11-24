import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { NAME } from '../../../../src/shipped/social-cards/request.js';
import { CHROME, cardOf, fmt, lightBox, pngSize, readPng, rule, run, tok, world } from './helpers.js';

// blazon.social-cards, the plugin blazon ships to compose marketing images from a brand's tokens, logo and a background.
// Seam: the entry, run as blazon runs it, in a real browser.
if (!CHROME) {
  if (process.env.BLAZON_REQUIRE_CHROME) throw new Error('BLAZON_REQUIRE_CHROME is set, and there is no Chrome to draw with');
  console.warn('social-cards plugin test: browser tests skipped, no Chrome to draw with (set BLAZON_CHROME)');
}

describe.skipIf(!CHROME)('the social-cards plugin, in a real browser', () => {
  it('draws a card at the format\'s size, and at twice that with scale 2, with no findings for a good card', () => {
    const { ran, outDir, findings } = run(world(), { scale: 2, cards: [cardOf(), cardOf({ id: 'post', format: 'square', background: 'backgrounds/light' })] });
    expect(ran.status, ran.out + ran.err).toBe(0);
    expect(findings).toEqual([]);
    expect(fs.readdirSync(outDir).sort()).toEqual(['launch.png', 'launch@2x.png', 'post.png', 'post@2x.png']);
    expect(pngSize(path.join(outDir, 'launch.png'))).toEqual({ width: 1200, height: 630 });
    expect(pngSize(path.join(outDir, 'launch@2x.png'))).toEqual({ width: 2400, height: 1260 });
    expect(pngSize(path.join(outDir, 'post.png'))).toEqual({ width: 600, height: 600 });
  }, 120_000);

  it('draws the other cards, and reports the one, when a logoWidth is far too large', () => {
    const { ran, findings, outDir } = run(world(), { cards: [cardOf({ id: 'big', logoWidth: 1e9 }), cardOf({ id: 'fine', background: 'backgrounds/light' })] });
    expect(ran.status, ran.out + ran.err).toBe(0);
    expect(findings).toEqual(expect.arrayContaining([expect.objectContaining({ code: `${NAME}/card-logo-clear-space`, path: 'big.png' })]));
    expect(fs.readdirSync(outDir).sort()).toEqual(['big.png', 'fine.png']);
  }, 120_000);

  it('adds a scrim to a light picture so the headline reads, rather than reporting it', () => {
    const { findings, outDir } = run(world(), { cards: [cardOf({ background: 'backgrounds/light' })] });
    expect(findings).toEqual([]);
    expect(fs.existsSync(path.join(outDir, 'launch.png'))).toBe(true);
  }, 120_000);

  it('reports card-text-contrast when even the strongest scrim cannot reach 4.5:1, and still draws the card', () => {
    const { findings, outDir } = run(world(), { cards: [cardOf({ background: 'backgrounds/light', textColor: 'color.mid' })] });
    expect(findings).toEqual([expect.objectContaining({ code: `${NAME}/card-text-contrast`, severity: 'error', path: 'launch.png' })]);
    expect(fs.existsSync(path.join(outDir, 'launch.png'))).toBe(true);
  }, 120_000);

  it('reports card-text-overflow when the headline does not fit at the type floor, and still draws the card', () => {
    const headline = 'A headline that goes on and on and on, far past anything a card this small could ever hold at its smallest type step';
    const { findings, outDir } = run(world(), { cards: [cardOf({ format: 'tiny', headline })] });
    expect(findings.map((f) => f.code)).toContain(`${NAME}/card-text-overflow`);
    expect(fs.existsSync(path.join(outDir, 'launch.png'))).toBe(true);
  }, 120_000);

  it('reports card-logo-clear-space when the logo\'s clear space does not fit between the edge and the safe area', () => {
    const w = world({ logoMeta: { placement: ['top-left'], minSize: { width: rule(160) }, clearSpace: rule(200) } });
    const { findings } = run(w, { cards: [cardOf()] });
    expect(findings.map((f) => f.code)).toEqual([`${NAME}/card-logo-clear-space`]);
  }, 120_000);

  it('picks the logo that reads under auto, and reports card-logo-contrast when the one asked for does not', () => {
    const w = world();
    const auto = run(w, { cards: [cardOf()] });
    expect(auto.findings).toEqual([]);
    const asked = run(w, { cards: [cardOf({ logo: 'light' })] });
    expect(asked.findings).toEqual([expect.objectContaining({ code: `${NAME}/card-logo-contrast`, severity: 'error', path: 'launch.png' })]);
    expect(fs.existsSync(path.join(asked.outDir, 'launch.png'))).toBe(true);
  }, 120_000);

  it('reports an unreviewed generated background, and a small one, naming the card', () => {
    const w = world({ assets: [{ id: 'backgrounds/gen', name: 'gen', category: 'backgrounds', file: 'brand-assets/backgrounds/dark.svg', format: 'png', mediaType: 'image/png', bytes: 1, width: 300, height: 100, meta: { generated: { tool: 'x' } } }] });
    const { findings } = run(w, { cards: [cardOf({ background: 'backgrounds/gen' })] });
    expect(findings.map((f) => f.code).sort()).toEqual([`${NAME}/card-background-generated-unreviewed`, `${NAME}/card-background-small`]);
    expect(findings.every((f) => f.path === 'launch.png')).toBe(true);
  }, 120_000);

  describe('a wide banner with the logo at the top right', () => {
    // The brand's rule for a cover: logo 22% of the shorter side, at least 120px, whose 1x clear space (19% of the width) fits the 24px margin
    const PLATE = 'linear-gradient(100deg, #101c26 0%, #1d3a4a 55%, #0d1216 100%)';
    const banner = () =>
      world({
        logoMeta: { placement: ['top-left', 'top-right', 'bottom-left'], minSize: { width: rule(120) }, clearSpace: rule(69) },
        tokens: [...fmt('banner', 1584, 396, 24), tok('gradient.plate', 'gradient', PLATE)],
      });
    const cover = (extra: object = {}) => ({ id: 'cover', format: 'banner', background: 'gradient.plate', headline: 'Your money. One app.', logoWidth: '22%', logoCorner: 'top-right', anchor: 'top', ...extra });

    it('sizes the logo from the shorter side, keeps it and its clear space in the margin, the text clear of it, and the bottom left free', () => {
      const { ran, findings, outDir } = run(banner(), { cards: [cover()] });
      expect(ran.status, ran.out + ran.err).toBe(0);
      expect(findings).toEqual([]);
      const image = readPng(path.join(outDir, 'cover.png'));
      expect(image).toMatchObject({ width: 1584, height: 396 });
      // the logo and the text are the only light pixels on the plate: the logo is the part right of x = 1300
      const logo = lightBox(image, 1300, 0, 1584, 396)!;
      const text = lightBox(image, 0, 0, 1300, 396)!;
      // the fixture's artwork is letterboxed in a box of 120 x 26 px, so its own pixels are about 118 wide
      expect(Math.abs(logo.right - logo.left - 120)).toBeLessThanOrEqual(2);
      expect(Math.abs(logo.right - (1584 - 24))).toBeLessThanOrEqual(1);
      expect(logo.top).toBe(24);
      const clear = (69 * 120) / 364;
      expect(logo.left - clear).toBeGreaterThanOrEqual(0);
      expect(logo.top - clear).toBeGreaterThan(0);
      expect(logo.right + clear).toBeLessThanOrEqual(1584);
      // a glyph may overhang the edge of its box by a few px
      expect(text.left).toBeGreaterThanOrEqual(24 - 4);
      expect(text.top).toBeGreaterThanOrEqual(24);
      expect(text.right + clear).toBeLessThan(logo.left);
      // the quarter of the width and half of the height at the bottom left: only the plate
      expect(lightBox(image, 0, 198, 396, 396)).toBeUndefined();
    }, 120_000);

    it('keeps centered text centered and out of the logo\'s clear space', () => {
      const { findings, outDir } = run(banner(), { cards: [cover({ align: 'center', headline: 'Brand work that keeps up for good.' })] });
      expect(findings).toEqual([]);
      const text = lightBox(readPng(path.join(outDir, 'cover.png')), 0, 0, 1300, 396)!;
      const clear = (69 * 120) / 364;
      const room = 24 + 120 + clear;
      expect(text.left).toBeGreaterThanOrEqual(room - 1);
      expect(1584 - text.right).toBeGreaterThanOrEqual(room - 1);
    }, 120_000);

    it('reports card-text-logo-overlap when the logo is in the corner the text starts from', () => {
      const { findings, outDir } = run(banner(), { cards: [cover({ logoCorner: 'top-left' })] });
      expect(findings).toEqual([expect.objectContaining({ code: `${NAME}/card-text-logo-overlap`, severity: 'error', path: 'cover.png' })]);
      expect(fs.existsSync(path.join(outDir, 'cover.png'))).toBe(true);
    }, 120_000);

    it('reports a width in px under the logo\'s minimum, and draws the minimum', () => {
      const { findings, outDir } = run(banner(), { cards: [cover({ logoWidth: 60 })] });
      expect(findings).toEqual([expect.objectContaining({ code: `${NAME}/card-logo-width-clamped`, severity: 'warning', path: 'cover.png' })]);
      const logo = lightBox(readPng(path.join(outDir, 'cover.png')), 1300, 0, 1584, 396)!;
      expect(Math.abs(logo.right - logo.left - 120)).toBeLessThanOrEqual(2);
    }, 120_000);
  });

  describe('a cover with the avatar area kept clear', () => {
    const PLATE = 'linear-gradient(100deg, #101c26 0%, #1d3a4a 55%, #0d1216 100%)';
    const cover = (extra: object = {}) =>
      run(
        world({ logoMeta: { placement: ['top-left', 'top-right', 'bottom-left'], minSize: { width: rule(120) }, clearSpace: rule(69) }, tokens: [...fmt('banner', 1584, 396, 24), tok('gradient.plate', 'gradient', PLATE)] }),
        { cards: [{ id: 'cover', format: 'banner', background: 'gradient.plate', headline: 'Your money. One app.', logoWidth: '22%', logoCorner: 'top-right', anchor: 'top', keepClear: ['avatar'], ...extra }] },
      );

    it('reports a headline whose second line enters the avatar area, and still draws the card', () => {
      const { findings, outDir } = cover({ headline: 'Brand work that keeps up with every one of you.' });
      expect(findings).toEqual([expect.objectContaining({ code: `${NAME}/card-text-keep-clear`, severity: 'error', path: 'cover.png', message: expect.stringContaining('the headline reaches') })]);
      expect(findings[0]!.message).toContain('card "cover"');
      expect(findings[0]!.message).toContain('"avatar" (x 0%, y 50%, 25% by 50%)');
      // the second line is drawn in the area: there are light pixels in the left quarter of the bottom half
      expect(lightBox(readPng(path.join(outDir, 'cover.png')), 0, 198, 396, 396)).toBeDefined();
    }, 120_000);

    it('passes a headline on one line, and draws the same pixels as without keepClear', () => {
      const kept = cover();
      expect(kept.findings).toEqual([]);
      const plain = run(
        world({ logoMeta: { placement: ['top-left', 'top-right', 'bottom-left'], minSize: { width: rule(120) }, clearSpace: rule(69) }, tokens: [...fmt('banner', 1584, 396, 24), tok('gradient.plate', 'gradient', PLATE)] }),
        { cards: [{ id: 'cover', format: 'banner', background: 'gradient.plate', headline: 'Your money. One app.', logoWidth: '22%', logoCorner: 'top-right', anchor: 'top' }] },
      );
      expect(fs.readFileSync(path.join(kept.outDir, 'cover.png')).equals(fs.readFileSync(path.join(plain.outDir, 'cover.png')))).toBe(true);
    }, 120_000);

    it('reports the logo when it sits in the area, and the subline when it does', () => {
      const logo = cover({ logoCorner: 'bottom-left', anchor: 'top' });
      expect(logo.findings.map((f) => f.code)).toEqual([`${NAME}/card-logo-keep-clear`]);
      const subline = cover({ subline: 'One line under it. Another line under that one, and a third bit to make it wrap well past the edge.' });
      expect(subline.findings.map((f) => f.code)).toContain(`${NAME}/card-text-keep-clear`);
      expect(subline.findings.some((f) => f.message.includes('the subline reaches'))).toBe(true);
    }, 120_000);
  });

  it('draws on a color token as its background', () => {
    const { findings, outDir } = run(world(), { cards: [cardOf({ background: 'color.mid' })] });
    expect(findings.map((f) => f.code)).toEqual([]);
    expect(fs.existsSync(path.join(outDir, 'launch.png'))).toBe(true);
  }, 120_000);
});
