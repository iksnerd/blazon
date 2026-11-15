import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { DEFAULT_CONFIG } from '../../../src/core/config/index.js';
import { compileBlazonData } from '../../../src/core/index.js';
import { compileTokens, writeTokenProject } from '../../support/helpers.js';

describe('compileBlazonData: token model (RFC 0001 §1)', () => {
  it('merges all token files into one tree, without the file name in the path', async () => {
    const data = await compileTokens({
      'base.json': { color: { $type: 'color', indigo: { $value: '#635DFF' } } },
      'roles.json': { text: { $type: 'color', brand: { $value: '{color.indigo}' } } },
    });

    const brand = data.tokens.byPath.get('text.brand');
    expect(brand?.value).toBe('#635DFF');
    expect(brand?.cssVariable).toBe('--text-brand');
    expect(data.tokens.byPath.has('base.color.indigo')).toBe(false);
  });

  it('takes $type from the token, a parent group, or the aliased token; never from the file name', async () => {
    const data = await compileTokens({
      'typography.json': {
        size: { base: { $value: { value: 16, unit: 'px' } } },
        font: { $type: 'fontFamily', body: { $value: 'Inter' }, ui: { $value: '{font.body}' } },
        heading: { $value: '{font.body}' },
      },
    });

    const codes = (path: string) => data.tokens.problems.filter((p) => p.path === path).map((p) => p.code);
    expect(codes('size.base')).toEqual(['missing-type']);
    expect(data.tokens.byPath.get('font.ui')?.type).toBe('fontFamily');
    expect(data.tokens.byPath.get('heading')?.type).toBe('fontFamily');
  });

  it('reports bad aliases as problems instead of throwing', async () => {
    const data = await compileTokens({
      'a.json': {
        $type: 'color',
        missing: { $value: '{color.nope}' },
        loopA: { $value: '{loopB}' },
        loopB: { $value: '{loopA}' },
        mixed: { $value: 'linear-gradient({missing}, red)' },
      },
    });

    const codes = data.tokens.problems.map((p) => `${p.path}:${p.code}`);
    expect(codes).toContain('missing:unresolved-alias');
    expect(codes.some((c) => c.endsWith(':circular-alias'))).toBe(true);
    expect(codes).toContain('mixed:embedded-alias');
  });

  it('rejects bare values and unknown types, which DTCG does not allow', async () => {
    const data = await compileTokens({
      'a.json': { color: { primary: '#2563eb', odd: { $type: 'spacing', $value: '4px' } } },
    });

    const codes = data.tokens.problems.map((p) => `${p.path}:${p.code}`);
    expect(codes).toContain('color.primary:invalid-token');
    expect(codes).toContain('color.odd:unknown-type');
  });

  it('keeps $extensions and merges dev.blazon fields down from groups', async () => {
    const data = await compileTokens({
      'a.json': {
        color: {
          $type: 'color',
          $extensions: { 'dev.blazon': { tier: 'primitive', usage: { deny: ['text'] } } },
          pink: {
            $value: '#FF44DD',
            $extensions: {
              'dev.blazon': { print: { pms: '239 C' } },
              'com.figma': { id: '1:2' },
            },
          },
        },
      },
    });

    const pink = data.tokens.byPath.get('color.pink')!;
    expect(pink.blazon).toEqual({ tier: 'primitive', usage: { deny: ['text'] }, print: { pms: '239 C' } });
    expect(pink.extensions?.['com.figma']).toEqual({ id: '1:2' });
  });

  it('a later file replaces an earlier definition of the same path, with a warning', async () => {
    const data = await compileTokens({
      'a.json': { color: { $type: 'color', x: { $value: '#000000' } } },
      'b.json': { color: { $type: 'color', x: { $value: '#ffffff' } } },
    });

    expect(data.tokens.byPath.get('color.x')?.value).toBe('#ffffff');
    expect(data.tokens.problems).toContainEqual(expect.objectContaining({ code: 'duplicate-definition', severity: 'warning', path: 'color.x' }));
  });
});

describe('compileBlazonData: what the brand book needs', () => {
  it('keeps group descriptions and dev.blazon fields by group path', async () => {
    const data = await compileTokens({
      'a.json': {
        color: {
          $type: 'color',
          secondary: {
            $description: 'Never text',
            $extensions: { 'dev.blazon': { usage: { deny: ['text'] } } },
            pink: { $value: '#FF44DD' },
          },
        },
      },
    });

    expect(data.tokens.groupMeta).toContainEqual({
      path: 'color.secondary',
      description: 'Never text',
      blazon: { usage: { deny: ['text'] } },
    });
  });

  it('resolves the brand book theme from token paths in config, reporting paths that do not exist', async () => {
    const root = writeTokenProject({
      'a.json': {
        color: { $type: 'color', indigo: { $value: '#635DFF' } },
        font: { $type: 'fontFamily', display: { $value: ['Space Grotesk', 'sans-serif'] } },
      },
    });
    const data = await compileBlazonData(
      {
        ...DEFAULT_CONFIG,
        theme: { accent: 'color.indigo', fontDisplay: 'font.display', text: 'color.missing' },
        fonts: ['https://fonts.example/space-grotesk.css'],
      },
      root,
    );

    expect(data.theme).toEqual({ accent: '#635DFF', fontDisplay: "'Space Grotesk', sans-serif" });
    expect(data.fonts).toEqual(['https://fonts.example/space-grotesk.css']);
    expect(data.findings).toContainEqual(expect.objectContaining({ code: 'theme-unresolved', path: 'color.missing' }));
  });

  it('inlines the logo variants for light and dark backgrounds, reporting a missing file', async () => {
    const root = writeTokenProject({});
    fs.mkdirSync(path.join(root, 'logos'));
    fs.writeFileSync(path.join(root, 'logos/black.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    const data = await compileBlazonData({ ...DEFAULT_CONFIG, logo: { onLight: 'logos/black.svg', onDark: 'logos/white.png' } }, root);

    expect(data.logo?.onLight).toBe(`data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString('base64')}`);
    expect(data.logo?.onDark).toBeUndefined();
    expect(data.findings).toContainEqual(expect.objectContaining({ code: 'logo-missing', path: 'logos/white.png' }));
  });

  it('carries check findings so the brand book can show them', async () => {
    const data = await compileTokens({ 'a.json': { color: { $type: 'color', x: { $value: '{nope}' } } } });

    expect(data.findings).toContainEqual(expect.objectContaining({ path: 'color.x', code: 'unresolved-alias' }));
  });
});

describe('compileBlazonData: CSS-ready values (RFC 0001 §5)', () => {
  it('converts DTCG color and dimension objects', async () => {
    const data = await compileTokens({
      'a.json': {
        c: { $type: 'color', hex: { $value: { colorSpace: 'srgb', components: [0.388, 0.365, 1], hex: '#635DFF' } } },
        p3: { $type: 'color', $value: { colorSpace: 'display-p3', components: [1, 0, 0], alpha: 0.5 } },
        d: { $type: 'dimension', $value: { value: 1.5, unit: 'rem' } },
      },
    });

    expect(data.tokens.byPath.get('c.hex')?.value).toBe('#635DFF');
    expect(data.tokens.byPath.get('p3')?.value).toBe('color(display-p3 1 0 0 / 0.5)');
    expect(data.tokens.byPath.get('d')?.value).toBe('1.5rem');
  });

  it('turns a typography composite into a font shorthand and keeps its parts for tokens.ts', async () => {
    const data = await compileTokens({
      'a.json': {
        font: { $type: 'fontFamily', display: { $value: ['Space Grotesk', 'sans-serif'] } },
        type: {
          $type: 'typography',
          display: {
            $value: {
              fontFamily: '{font.display}',
              fontSize: { value: 72, unit: 'px' },
              fontWeight: 'semi-bold',
              letterSpacing: { value: -0.01, unit: 'em' },
              lineHeight: 1.111,
            },
          },
        },
      },
    });

    expect(data.tokens.byPath.get('type.display')?.value).toBe("600 72px/1.111 'Space Grotesk', sans-serif");
    expect(data.tokens.nested).toMatchObject({
      type: { display: { fontWeight: 600, fontSize: '72px', letterSpacing: '-0.01em' } },
    });
  });

  it('turns a gradient into linear-gradient, using dev.blazon angle or 180deg', async () => {
    const stops = [
      { color: '{c.indigo}', position: 0 },
      { color: '{c.aqua}', position: 1 },
    ];
    const data = await compileTokens({
      'a.json': {
        c: { $type: 'color', indigo: { $value: '#635DFF' }, aqua: { $value: '#3EC6EB' } },
        g: {
          $type: 'gradient',
          plain: { $value: stops },
          angled: { $value: stops, $extensions: { 'dev.blazon': { angle: 90 } } },
        },
      },
    });

    expect(data.tokens.byPath.get('g.plain')?.value).toBe('linear-gradient(180deg, #635DFF 0%, #3EC6EB 100%)');
    expect(data.tokens.byPath.get('g.angled')?.value).toBe('linear-gradient(90deg, #635DFF 0%, #3EC6EB 100%)');
  });

  it('reports a value that does not fit its $type', async () => {
    const data = await compileTokens({ 'a.json': { d: { $type: 'dimension', $value: 16 } } });

    expect(data.tokens.problems).toContainEqual(expect.objectContaining({ path: 'd', code: 'invalid-value' }));
  });

  it.each(['notacolor', '#12', '#12345', '#gggggg', 'rgb(banana)', 'hsl(1 2)', '12'])('refuses the color value %s, and says what a color can be', async (value) => {
    const data = await compileTokens({ 'a.json': { c: { $type: 'color', $value: value } } });

    expect(data.tokens.problems).toContainEqual(
      expect.objectContaining({ path: 'c', code: 'invalid-value', message: `"${value}" is not a color: write hex (#2563eb), rgb(), hsl(), oklch() or a CSS color name` }),
    );
  });

  it.each([
    '#fff',
    '#FFFFFF',
    '#ffff',
    '#ffffff80',
    'rgb(37 99 235)',
    'rgba(0, 0, 0, 0.5)',
    'hsl(220 90% 56%)',
    'oklch(60% 0.2 250)',
    'red',
    'rebeccapurple',
    'transparent',
    'currentColor',
    'var(--brand)',
    'color-mix(in srgb, red, blue)',
    'linear-gradient(red, blue)',
  ])('accepts the color value %s', async (value) => {
    const data = await compileTokens({ 'a.json': { c: { $type: 'color', $value: value } } });

    expect(data.tokens.problems.filter((p) => p.code === 'invalid-value')).toEqual([]);
  });

  it('refuses a print unit in a dimension and names the px it stands for', async () => {
    const data = await compileTokens({
      'a.json': {
        d: { $type: 'dimension', pt: { $value: { value: 7, unit: 'pt' } }, mm: { $value: '10mm' }, em: { $value: { value: -0.01, unit: 'em' } } },
        type: { $type: 'typography', p: { $value: { fontFamily: 'Circular', fontSize: { value: 36, unit: 'pt' }, fontWeight: 400, lineHeight: 1.2 } } },
      },
    });

    expect(data.tokens.problems.filter((p) => p.code === 'invalid-value').map((p) => [p.path, p.message])).toEqual([
      ['d.pt', '7pt is a print unit; write 9.333px (1pt = 1.333px). A DTCG dimension is px or rem'],
      ['d.mm', '10mm is a print unit; write 37.795px (1mm = 3.78px). A DTCG dimension is px or rem'],
      ['type.p', '36pt is a print unit; write 48px (1pt = 1.333px). A DTCG dimension is px or rem'],
    ]);
  });
});
