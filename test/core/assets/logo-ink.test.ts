import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_CONFIG } from '../../../src/core/config/index.js';
import { compileBlazonData } from '../../../src/core/index.js';
import { buildBrandExport } from '../../../src/core/brand/export.js';
import type { BlazonConfig } from '../../../src/types/index.js';
import { tempDir } from '../../support/project';

// The configured logo files are judged as black on light and white on dark unless their sidecar declares an
// ink. The compiled logo carries that ink, found by matching the configured file to its `logos` asset.

const svg = (fill: string) => `<svg viewBox="0 0 100 40" width="100" height="40" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="40" fill="${fill}"/></svg>`;

function project(sidecars: Record<string, unknown>): string {
  const root = tempDir();
  fs.mkdirSync(path.join(root, 'assets/logos'), { recursive: true });
  fs.mkdirSync(path.join(root, 'tokens'));
  fs.writeFileSync(path.join(root, 'tokens/colors.json'), JSON.stringify({ color: { blue: { $type: 'color', $value: '#3F73F8' } } }));
  for (const name of ['blue', 'white', 'black']) fs.writeFileSync(path.join(root, `assets/logos/${name}.svg`), svg(name));
  for (const [name, content] of Object.entries(sidecars)) fs.writeFileSync(path.join(root, `assets/logos/${name}.json`), JSON.stringify(content));
  return root;
}

const compile = (root: string, logo: BlazonConfig['logo']) => compileBlazonData({ ...DEFAULT_CONFIG, logo }, root);

describe('the configured logo carries the ink its sidecar declares', () => {
  it('names the asset behind each configured file, and its ink, by file and not by content', async () => {
    const root = project({ blue: { ink: '{color.blue}' }, white: { ink: '#FFFFFF' } });
    const { logo } = await compile(root, { onLight: './assets/logos/blue.svg', onDark: './assets/../assets/logos/white.svg' });
    expect(logo).toMatchObject({ onLightAsset: 'logos/blue', onLightInk: '#3F73F8', onDarkAsset: 'logos/white', onDarkInk: '#FFFFFF' });
  });

  it('carries no ink for a configured file whose sidecar declares none, so it stays black on light and white on dark', async () => {
    const root = project({});
    const { logo } = await compile(root, { onLight: './assets/logos/black.svg', onDark: './assets/logos/white.svg' });
    expect(logo).toMatchObject({ onLightAsset: 'logos/black', onDarkAsset: 'logos/white' });
    expect(logo).not.toHaveProperty('onLightInk');
    expect(logo).not.toHaveProperty('onDarkInk');
  });

  it('takes the ink of one configured file without lending it to the other', async () => {
    const root = project({ blue: { ink: '#3F73F8' } });
    const { logo } = await compile(root, { onLight: './assets/logos/blue.svg', onDark: './assets/logos/white.svg' });
    expect(logo?.onLightInk).toBe('#3F73F8');
    expect(logo).not.toHaveProperty('onDarkInk');
  });

  it('reads a single configured logo as onLight', async () => {
    const root = project({ blue: { ink: '#3F73F8' } });
    expect((await compile(root, './assets/logos/blue.svg')).logo).toMatchObject({ onLightAsset: 'logos/blue', onLightInk: '#3F73F8' });
  });

  it('leaves a logo outside the assets folder as it was', async () => {
    const root = project({});
    fs.writeFileSync(path.join(root, 'outside.svg'), svg('red'));
    const { logo } = await compile(root, './outside.svg');
    expect(Object.keys(logo!)).toEqual(['onLight']);
  });

  it('puts the ink in brand.json beside the paths, and nothing when there is none', async () => {
    const root = project({ blue: { ink: '#3F73F8' } });
    const config = { ...DEFAULT_CONFIG, logo: { onLight: './assets/logos/blue.svg', onDark: './assets/logos/white.svg' } };
    const brand = buildBrandExport(await compileBlazonData(config, root), config, root);
    expect(brand.logo).toEqual({ onLight: 'brand-assets/logos/blue.svg', onDark: 'brand-assets/logos/white.svg', onLightInk: '#3F73F8' });
  });
});
