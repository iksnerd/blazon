import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { compileBlazonData, emitTokenOutputs } from '../../src/core/index.js';
import { writeTokenProject, TEST_CONFIG } from '../support/helpers.js';

const project = {
  'a.json': {
    color: {
      $type: 'color',
      indigo: {
        $value: '#635DFF',
        $description: 'Interaction',
        $extensions: { 'dev.blazon': { print: { pms: '2726 C' } } },
      },
      aqua: { $value: '#3EC6EB' },
    },
    text: { $type: 'color', brand: { $value: '{color.indigo}' } },
    gradient: {
      $type: 'gradient',
      indigoAqua: {
        $value: [
          { color: '{color.indigo}', position: 0 },
          { color: '{color.aqua}', position: 1 },
        ],
      },
    },
    type: {
      $type: 'typography',
      h1: {
        $value: {
          fontFamily: 'Inter',
          fontSize: { value: 64, unit: 'px' },
          fontWeight: 600,
          letterSpacing: { value: 0, unit: 'px' },
          lineHeight: 1.125,
        },
      },
    },
  },
};

async function emit() {
  const root = writeTokenProject(project);
  const config = { ...TEST_CONFIG };
  const data = await compileBlazonData(config, root);
  const paths = await emitTokenOutputs(data, config, root);
  const read = (p: string) => fs.readFileSync(p, 'utf-8');
  return { root, paths, read };
}

describe('emitTokenOutputs (RFC 0001 §5)', () => {
  it('writes CSS variables named by token path, composites as values plus parts', async () => {
    const { paths, read } = await emit();
    const css = read(paths.cssPath);

    expect(css).toContain('--color-indigo: #635DFF;');
    expect(css).toContain('--text-brand: #635DFF;');
    expect(css).toContain('--gradient-indigo-aqua: linear-gradient(180deg, #635DFF 0%, #3EC6EB 100%);');
    expect(css).toContain('--type-h1: 600 64px/1.125 Inter;');
    expect(css).toContain('--type-h1-letter-spacing: 0px;');
    expect(css).toContain('--type-h1-line-height: 1.125;');
  });

  it('writes typography.css with one class per typography token', async () => {
    const { paths, read } = await emit();

    expect(paths.typographyPath).toBeDefined();
    expect(read(paths.typographyPath!)).toContain('.type-h1 {\n  font: var(--type-h1);\n  letter-spacing: var(--type-h1-letter-spacing);\n}');
  });

  it('writes tokens.json as DTCG with aliases resolved and $extensions kept', async () => {
    const { paths, read } = await emit();
    const json = JSON.parse(read(paths.jsonPath));

    expect(json.text.brand).toEqual({ $type: 'color', $value: '#635DFF' });
    expect(json.color.indigo).toEqual({
      $type: 'color',
      $value: '#635DFF',
      $description: 'Interaction',
      $extensions: { 'dev.blazon': { print: { pms: '2726 C' } } },
    });
    expect(json.gradient.indigoAqua.$value[1]).toEqual({ color: '#3EC6EB', position: 1 });
  });

  it('writes tokens.ts with typed paths and composite parts', async () => {
    const { paths, read } = await emit();
    const ts = read(paths.tsPath);

    expect(ts).toContain('"text.brand": "#635DFF"');
    expect(ts).toContain('"text.brand": "--text-brand"');
    expect(ts).toMatch(/"h1": \{\s+"fontFamily": "Inter",\s+"fontSize": "64px",\s+"fontWeight": 600/);
    expect(path.basename(paths.tsPath)).toBe('tokens.ts');
  });
});
