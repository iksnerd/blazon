import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { compileTokens as compile } from '../../support/helpers.js';
import { TAILWIND_NAMESPACES, formatTailwindReset, formatTailwindTheme } from '../../../src/core/tokens/formatters/tailwind.js';
import { formatCssTokens } from '../../../src/core/tokens/formatters/css.js';

const compileTokens = async (files: Record<string, unknown>) => (await compile(files)).tokens;
const px = (value: number) => ({ value, unit: 'px' });
const BASE = {
  color: { $type: 'color', ink: { $value: '#111111' } },
  surface: { $type: 'color', canvas: { $value: '{color.ink}' } },
};
const SHADOW = { shadow: { $type: 'shadow', plate: { $value: { color: '{color.ink}', offsetX: px(4), offsetY: px(4), blur: px(0), spread: px(0) } } } };
const MOTION = {
  motion: {
    duration: { $type: 'duration', default: { $value: { value: 200, unit: 'ms' } }, snap: { $value: { value: 120, unit: 'ms' } } },
    easing: { $type: 'cubicBezier', mechanical: { $value: [0.2, 0, 0, 1] } },
  },
};
const TYPE = {
  font: {
    weight: { $type: 'fontWeight', heavy: { $value: 800 } },
    size: { $type: 'dimension', lg: { $value: px(20) } },
  },
};

describe('tailwind.css and tailwind-reset.css', () => {
  it('fills shadow, ease, font-weight, text and the default transition duration', async () => {
    const parsed = await compileTokens({ 'a.json': { ...BASE, ...SHADOW, ...MOTION, ...TYPE } });
    const css = formatTailwindTheme(parsed)!;
    expect(css).toContain('--shadow-plate: 4px 4px 0px 0px #111111;');
    expect(css).toContain('--ease-mechanical: cubic-bezier(0.2, 0, 0, 1);');
    expect(css).toContain('--default-transition-duration: 200ms;');
    expect(css).toContain('--font-weight-heavy: 800;');
    expect(css).toContain('--text-lg: 20px;');
    // a duration that is not the default has no Tailwind namespace
    expect(css).not.toContain('snap');
  });

  it('keeps an inset shadow inset in tailwind.css and theme.css, as the starter writes shadow.recess', async () => {
    const recess = { color: '{color.ink}', inset: true, offsetX: px(2), offsetY: px(2), blur: px(0), spread: px(0) };
    const parsed = await compileTokens({ 'a.json': { ...BASE, shadow: { $type: 'shadow', recess: { $value: recess } } } });
    expect(formatTailwindTheme(parsed)).toContain('--shadow-recess: inset 2px 2px 0px 0px #111111;');
    expect(formatCssTokens(parsed)).toContain('--shadow-recess: inset 2px 2px 0px 0px #111111;');
  });

  it('resets exactly the namespaces the brand fills', async () => {
    const withShadow = formatTailwindReset(await compileTokens({ 'a.json': { ...BASE, ...SHADOW } }))!;
    expect(withShadow).toContain('--color-*: initial;');
    expect(withShadow).toContain('--shadow-*: initial;');
    expect(withShadow).not.toContain('--radius-*');
    expect(withShadow).toContain('after tailwindcss and before tailwind.css');

    const without = formatTailwindReset(await compileTokens({ 'a.json': BASE }))!;
    expect(without).toContain('--color-*: initial;');
    expect(without).not.toContain('--shadow-*: initial;');
  });

  it('writes no reset when only the default transition duration maps', async () => {
    const parsed = await compileTokens({ 'a.json': { motion: { duration: MOTION.motion.duration } } });
    expect(formatTailwindTheme(parsed)).toContain('--default-transition-duration');
    expect(formatTailwindReset(parsed)).toBeUndefined();
  });

  it('writes nothing for a brand with no mapped token', async () => {
    const parsed = await compileTokens({ 'a.json': { z: { $type: 'number', base: { $value: 1 } } } });
    expect(formatTailwindTheme(parsed)).toBeUndefined();
    expect(formatTailwindReset(parsed)).toBeUndefined();
  });
});

describe('the Tailwind namespaces are documented', () => {
  const chapter = fs.readFileSync(path.join(__dirname, '../../../docs/manual/08-using-the-outputs.md'), 'utf-8');
  it.each(TAILWIND_NAMESPACES.map((ns) => [ns.prefix, ns.reset ?? `--${ns.prefix}`] as const))('names %s in chapter 8', (_prefix, variable) => {
    expect(chapter).toContain(`\`${variable}\``);
  });
});
