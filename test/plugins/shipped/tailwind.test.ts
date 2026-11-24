import { describe, it, expect } from 'vitest';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from '../../support/spawn';
import { compileTokens as compile } from '../../support/helpers.js';
import { readBrand } from '../../../src/shipped/tailwind/brand.js';
import { TAILWIND_NAMESPACES, collisions, formatTailwindReset, formatTailwindTheme } from '../../../src/shipped/tailwind/theme.js';
import { formatCssTokens } from '../../../src/core/tokens/formatters/css.js';
import { NAME } from '../../../src/shipped/tailwind/request.js';
import { ROOT_DIR } from '../support/spec.js';
import { tempDir } from '../../support/project';

// blazon.tailwind, the plugin blazon ships to write a brand's tokens as a Tailwind v4 theme. The pure parts (namespaces, the two files, the
// collision check) are read from tokens compiled as blazon compiles them and shown as brand.json shows them; the entry is run as blazon
// runs it; and the files written for two real brands are compared byte for byte with what blazon's own formatter wrote before the plugin existed.

const ENTRY = path.join(ROOT_DIR, 'src/shipped/tailwind/main.ts');
const TSX = pathToFileURL(path.join(ROOT_DIR, 'node_modules/tsx/dist/esm/index.mjs')).href;
const FIXTURES = path.join(ROOT_DIR, 'test/plugins/shipped/fixtures/tokens-plugins');

/** The tokens as brand.json holds them, from token files compiled by blazon. */
const brandOf = async (files: Record<string, unknown>) => {
  const parsed = (await compile(files)).tokens;
  return {
    parsed,
    brand: {
      format: 'blazon-brand',
      version: 2,
      tokens: parsed.items.map((item) => ({ path: item.path, type: item.type, value: item.value, cssVariable: item.cssVariable })),
    },
  };
};
const tokensOf = async (files: Record<string, unknown>) => readBrand((await brandOf(files)).brand);

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
    const css = formatTailwindTheme(await tokensOf({ 'a.json': { ...BASE, ...SHADOW, ...MOTION, ...TYPE } }))!;
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
    const files = { 'a.json': { ...BASE, shadow: { $type: 'shadow', recess: { $value: recess } } } };
    expect(formatTailwindTheme(await tokensOf(files))).toContain('--shadow-recess: inset 2px 2px 0px 0px #111111;');
    expect(formatCssTokens((await brandOf(files)).parsed)).toContain('--shadow-recess: inset 2px 2px 0px 0px #111111;');
  });

  it('resets exactly the namespaces the brand fills', async () => {
    const withShadow = formatTailwindReset(await tokensOf({ 'a.json': { ...BASE, ...SHADOW } }))!;
    expect(withShadow).toContain('--color-*: initial;');
    expect(withShadow).toContain('--shadow-*: initial;');
    expect(withShadow).not.toContain('--radius-*');
    expect(withShadow).toContain('after tailwindcss and before tailwind.css');

    const without = formatTailwindReset(await tokensOf({ 'a.json': BASE }))!;
    expect(without).toContain('--color-*: initial;');
    expect(without).not.toContain('--shadow-*: initial;');
  });

  it('writes no reset when only the default transition duration maps', async () => {
    const tokens = await tokensOf({ 'a.json': { motion: { duration: MOTION.motion.duration } } });
    expect(formatTailwindTheme(tokens)).toContain('--default-transition-duration');
    expect(formatTailwindReset(tokens)).toBeUndefined();
  });

  it('writes nothing for a brand with no mapped token', async () => {
    const tokens = await tokensOf({ 'a.json': { z: { $type: 'number', base: { $value: 1 } } } });
    expect(formatTailwindTheme(tokens)).toBeUndefined();
    expect(formatTailwindReset(tokens)).toBeUndefined();
  });
});

describe('the Tailwind namespaces are documented', () => {
  const chapter = fs.readFileSync(path.join(ROOT_DIR, 'docs/manual/08-using-the-outputs.md'), 'utf-8');
  it.each(TAILWIND_NAMESPACES.map((ns) => [ns.prefix, ns.reset ?? `--${ns.prefix}`] as const))('names %s in chapter 8', (_prefix, variable) => {
    expect(chapter).toContain(`\`${variable}\``);
  });
});

describe('two tokens that write one Tailwind variable', () => {
  it('is an error that names tailwind.css and the token written second', async () => {
    const found = collisions(await tokensOf({ 'a.json': { color: { $type: 'color', brand: { $value: '#111111' } }, colors: { $type: 'color', brand: { $value: '#222222' } } } }));
    expect(found).toEqual([
      {
        code: 'blazon.tailwind/variable-duplicate',
        severity: 'error',
        path: 'colors.brand',
        message: 'colors.brand and color.brand both write the CSS variable --color-brand in tailwind.css; rename one',
      },
    ]);
  });

  it('lets a semantic alias share its primitive name, since both hold one value', async () => {
    const files = { 'a.json': { color: { $type: 'color', brand: { primary: { $value: '#111111' } } }, brand: { $type: 'color', primary: { $value: '{color.brand.primary}' } } } };
    expect(collisions(await tokensOf(files))).toEqual([]);
  });

  it('is an error when a fontFamily and a fontWeight both generate the utility font-display', async () => {
    const files = { 'a.json': { font: { $type: 'fontFamily', display: { $value: 'Acme Sans' } }, weight: { $type: 'fontWeight', display: { $value: 800 } } } };
    const tokens = await tokensOf(files);
    expect(formatTailwindTheme(tokens)).toContain('--font-display: ');
    expect(formatTailwindTheme(tokens)).toContain('--font-weight-display: ');
    expect(collisions(tokens)).toEqual([
      {
        code: 'blazon.tailwind/variable-duplicate',
        severity: 'error',
        path: 'weight.display',
        message: 'weight.display and font.display both generate the Tailwind utility font-display (--font-weight-display and --font-display); rename one',
      },
    ]);
  });

  it('lets a font family and a font weight of different names stand', async () => {
    const files = { 'a.json': { font: { $type: 'fontFamily', display: { $value: 'Acme Sans' } }, weight: { $type: 'fontWeight', heavy: { $value: 800 } } } };
    expect(collisions(await tokensOf(files))).toEqual([]);
  });

  it('leaves a pair that also shares its theme.css variable to the core check, which names it already', () => {
    const token = (p: string, value: string) => ({ path: p, type: 'color', value, cssVariable: '--color-brand' });
    expect(collisions(readBrand({ format: 'blazon-brand', version: 2, tokens: [token('color.brand', '#111111'), token('colors.brand', '#222222')] }))).toEqual([]);
  });
});

describe('the entry', () => {
  function run(request: object | string) {
    const out = tempDir('blazon-tailwind-out-');
    const input = typeof request === 'string' ? request : JSON.stringify({ v: 2, type: 'build', out_dir: out, options: {}, ...request });
    const ran = spawnSync(process.execPath, ['--import', TSX, ENTRY], { input, encoding: 'utf-8', env: { PATH: '/usr/bin:/bin', HOME: os.homedir() } });
    const files: Record<string, string> = {};
    for (const name of fs.readdirSync(out)) files[name] = fs.readFileSync(path.join(out, name), 'utf-8');
    return { status: ran.status, answer: ran.status === 0 ? JSON.parse(ran.stdout) : ran.stdout, files };
  }

  it.each(['example', 'starter'])('writes, for the %s brand, the bytes the core formatter wrote before the plugin existed, and no finding', (name) => {
    const brand = JSON.parse(fs.readFileSync(path.join(FIXTURES, name, 'brand.json'), 'utf-8'));
    const { status, answer, files } = run({ brand });
    expect(status).toBe(0);
    expect(answer).toEqual({ findings: [] });
    expect(Object.keys(files).sort()).toEqual(['tailwind-reset.css', 'tailwind.css']);
    expect(files['tailwind.css']).toBe(fs.readFileSync(path.join(FIXTURES, name, 'tailwind.css'), 'utf-8'));
    expect(files['tailwind-reset.css']).toBe(fs.readFileSync(path.join(FIXTURES, name, 'tailwind-reset.css'), 'utf-8'));
  });

  it('writes nothing for a brand with no mapped token', () => {
    const { status, answer, files } = run({ brand: { format: 'blazon-brand', version: 2, tokens: [{ path: 'z.base', type: 'number', value: 1 }] } });
    expect(status).toBe(0);
    expect(answer).toEqual({ findings: [] });
    expect(files).toEqual({});
  });

  it('says an option is wrong in a finding, and still writes the files', () => {
    const { status, answer, files } = run({ brand: { format: 'blazon-brand', version: 2, tokens: [{ path: 'color.ink', type: 'color', value: '#111' }] }, options: { prefix: 'x' } });
    expect(status).toBe(0);
    expect(answer.findings).toEqual([{ code: `${NAME}/option-invalid`, severity: 'error', path: 'options', message: 'unknown option "prefix"; this plugin has no options' }]);
    expect(Object.keys(files)).toContain('tailwind.css');
  });

  it('reports a collision as an error finding and keeps the first token in tailwind.css', () => {
    const tokens = [
      { path: 'color.brand', type: 'color', value: '#111111', cssVariable: '--color-brand' },
      { path: 'colors.brand', type: 'color', value: '#222222', cssVariable: '--colors-brand' },
    ];
    const { answer, files } = run({ brand: { format: 'blazon-brand', version: 2, tokens } });
    expect(answer.findings.map((f: { code: string }) => f.code)).toEqual([`${NAME}/variable-duplicate`]);
    expect(files['tailwind.css']).toContain('--color-brand: #111111;');
    expect(files['tailwind.css']).not.toContain('#222222');
  });

  it('needs no site_dir, and refuses a request of version 1 or a brand of version 1', () => {
    const brand = { format: 'blazon-brand', version: 2, tokens: [] };
    expect(run({ brand }).status).toBe(0);
    expect(run({ v: 1, brand }).answer).toBe('the request is version 1; this plugin speaks version 2\n');
    expect(run({ brand: { ...brand, version: 1 } }).answer).toBe('the brand in the request is version 1; this reader understands version 2\n');
  });

  it('declares the build role, no environment variable, and runs in blazon tokens: a manifest with no site in it', () => {
    const ran = spawnSync(process.execPath, ['--import', TSX, ENTRY, '--blazon-manifest'], { encoding: 'utf-8', env: { PATH: '/usr/bin:/bin' } });
    expect(JSON.parse(ran.stdout)).toMatchObject({ v: 2, roles: ['build'], env: [] });
  });
});
