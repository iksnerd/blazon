import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../../../src/core/config/index.js';
import { compileBlazonData } from '../../../src/core/index.js';
import { contrastBetween, parseColor, CONTRAST_MINIMUM, ratioMessage } from '../../../src/core/checker/contrast.js';
import { colorwayResults } from '../../../src/core/logo/colorways.js';
import { BRAND_SCHEMA } from '../../../src/core/brand/schema.js';
import { exampleProject } from '../../support/examples';

// Named colorways of a logo (RFC 0001 §10): a sidecar says which logo variant stands on which color token and how much contrast it must
// reach. The expected ratios come from the repo's own contrast function on the starter's own token values.

const GRAPHITE = '#1E1F21';
const BONE = '#F2F0EB';
const ORANGE = '#FF5A1F';
const ratio = (fg: string, bg: string) => contrastBetween(parseColor(fg)!, parseColor(bg)!)!;

type Data = Awaited<ReturnType<typeof compileBlazonData>>;

async function compile(colorways: unknown, drop: string[] = []): Promise<Data> {
  const root = exampleProject('blazon');
  const logos = path.join(root, 'assets/logos');
  const write = (name: string, patch: Record<string, unknown>, remove: string[] = []) => {
    const file = path.join(logos, `${name}.json`);
    const sidecar = { ...JSON.parse(fs.readFileSync(file, 'utf-8')), ...patch };
    for (const key of remove) delete sidecar[key];
    fs.writeFileSync(file, JSON.stringify(sidecar, null, 2));
  };
  write('blazon-bone', { ink: '{color.base.bone}' });
  write('blazon-graphite', { ink: '{color.ink.graphite}', colorways }, drop);
  return compileBlazonData(await loadConfig(root), root);
}
const graphiteOf = (data: Data) => data.assets.all.find((a) => a.id === 'logos/blazon-graphite')!;
const results = (data: Data, all = data.assets.all) => colorwayResults(graphiteOf(data), all, data.tokens.items);

const ON_BONE = { name: 'Graphite on Bone', on: '{color.base.bone}' };
const BONE_ON_ORANGE = { name: 'Bone on Orange', on: '{color.signal.orange}', variant: 'logos/blazon-bone' };

describe('colorways in a sidecar', () => {
  it('are read as written, with the level AA when none is given and the token path without braces', async () => {
    const data = await compile([ON_BONE, { ...BONE_ON_ORANGE, min: 'AA-large' }]);
    expect(graphiteOf(data).meta!.colorways).toEqual([
      { name: 'Graphite on Bone', on: 'color.base.bone', min: 'AA' },
      { name: 'Bone on Orange', on: 'color.signal.orange', variant: 'logos/blazon-bone', min: 'AA-large' },
    ]);
    expect(data.findings.filter((f) => f.code === 'asset-sidecar-invalid')).toEqual([]);
  });

  it.each([
    ['an entry with an unknown key', [{ ...ON_BONE, colour: 'red' }], /colorways\[0\] has unknown field "colour"; known: name, on, variant, min/],
    ['an entry with no name', [{ on: '{color.base.bone}' }], /colorways\[0\] needs a name/],
    ['an `on` that is not an alias', [{ name: 'X', on: 'color.base.bone' }], /colorways\[0\]\.on must be an alias to a color token/],
    ['an `on` that is no token', [{ name: 'X', on: '{color.nope}' }], /colorways\[0\]\.on: \{color\.nope\} is not a token/],
    ['an `on` that is not a color', [{ name: 'X', on: '{space.4}' }], /colorways\[0\]\.on: \{space\.4\} is not a color token/],
    ['a variant that is not an id', [{ ...ON_BONE, variant: 'bone' }], /colorways\[0\]\.variant must be an asset id written category\/name/],
    ['an unknown level', [{ ...ON_BONE, min: 'AAAA' }], /colorways\[0\]\.min must be one of AA, AA-large, AAA/],
    ['two entries of one name', [ON_BONE, ON_BONE], /colorways names "Graphite on Bone" twice/],
    ['an empty list', [], /colorways must be a non-empty list/],
    ['something that is not a list', { name: 'X' }, /colorways must be a non-empty list/],
  ])('refuse %s as asset-sidecar-invalid', async (_what, colorways, message) => {
    const data = await compile(colorways);
    expect(
      data.findings
        .filter((f) => f.code === 'asset-sidecar-invalid')
        .map((f) => f.message)
        .join('\n'),
    ).toMatch(message);
  });

  it('refuse a variant that names no asset', async () => {
    const data = await compile([{ ...ON_BONE, variant: 'logos/missing' }]);
    const found = data.findings.find((f) => f.code === 'asset-sidecar-invalid');
    expect(found?.message).toMatch(/colorways\[0\]\.variant: no asset at logos\/missing/);
    expect(found?.path).toBe('logos/blazon-graphite.json');
  });
});

describe('the contrast of a colorway', () => {
  it('is the ratio of the logo ink over the background token, by the repo contrast function', async () => {
    const data = await compile([ON_BONE, BONE_ON_ORANGE]);
    const [first, second] = results(data);
    expect(first!.name).toBe('Graphite on Bone');
    expect(first!.ratio).toBeCloseTo(ratio(GRAPHITE, BONE), 6);
    expect(first!.pass).toBe(true);
    expect(first!.variant.id).toBe('logos/blazon-graphite');
    // The variant's own ink is the one measured, not the logo's
    expect(second!.ratio).toBeCloseTo(ratio(BONE, ORANGE), 6);
    expect(second!.variant.id).toBe('logos/blazon-bone');
    expect(second!.pass).toBe(false);
  });

  it('is judged against the level of the colorway', async () => {
    // Bone on Orange is between 2 and 3: it fails AA and AA-large alike, and a lower reading would pass nothing here
    const low = ratio(BONE, ORANGE);
    expect(low).toBeLessThan(CONTRAST_MINIMUM['AA-large']);
    // Graphite on Orange passes AA-large and AA both, so the level only matters where the ratio is between them
    const mid = ratio(GRAPHITE, ORANGE);
    const data = await compile([
      { name: 'Graphite on Orange', on: '{color.signal.orange}', min: 'AAA' },
      { name: 'Graphite on Orange, large', on: '{color.signal.orange}', min: 'AA-large' },
    ]);
    const [strict, large] = results(data);
    expect(strict!.pass).toBe(mid >= CONTRAST_MINIMUM.AAA);
    expect(large!.pass).toBe(mid >= CONTRAST_MINIMUM['AA-large']);
    expect(mid).toBeGreaterThanOrEqual(CONTRAST_MINIMUM['AA-large']);
    expect(mid).toBeLessThan(CONTRAST_MINIMUM.AAA);
  });
});

describe('the finding for a colorway below its level', () => {
  it('is contrast-insufficient on the sidecar, naming the colorway and the ratio, for the failing one only', async () => {
    const data = await compile([ON_BONE, BONE_ON_ORANGE]);
    const found = data.findings.filter((f) => f.code === 'contrast-insufficient');
    expect(found).toHaveLength(1);
    expect(found[0]!.path).toBe('logos/blazon-graphite.json');
    expect(found[0]!.message).toContain('Bone on Orange');
    expect(found[0]!.message).toContain(`${ratioMessage(ratio(BONE, ORANGE))}:1`);
    expect(found[0]!.message).toContain(`AA needs ${CONTRAST_MINIMUM.AA}:1`);
  });

  it('is contrast-unknown, a warning, when the logo has no ink and no background to judge it by', async () => {
    const data = await compile([ON_BONE], ['ink', 'background']);
    const found = data.findings.find((f) => f.code === 'contrast-unknown');
    expect(found?.severity).toBe('warning');
    expect(found?.path).toBe('logos/blazon-graphite.json');
  });

  it('falls back to black on a light background when no ink is declared', async () => {
    const data = await compile([ON_BONE], ['ink']);
    expect(results(data)[0]!.ratio).toBeCloseTo(ratio('#000000', BONE), 6);
  });
});

describe('a variant id with several files', () => {
  it('is drawn from the file the shared picker chooses, whatever order the assets are listed in', async () => {
    const data = await compile([BONE_ON_ORANGE]);
    const bone = data.assets.all.find((a) => a.id === 'logos/blazon-bone')!;
    const png = { ...bone, format: 'png' as const, filePath: 'logos/blazon-bone.png', mediaType: 'image/png', url: 'brand-assets/logos/blazon-bone.png' };
    for (const all of [
      [...data.assets.all, png],
      [png, ...data.assets.all],
    ]) {
      expect(results(data, all)[0]!.variant.format).toBe('svg');
    }
  });
});

describe('a brand without colorways', () => {
  it('has no colorway results', async () => {
    const root = exampleProject('blazon');
    const data = await compileBlazonData(await loadConfig(root), root);
    expect(data.assets.all.some((a) => a.meta?.colorways)).toBe(false);
    expect(colorwayResults(data.assets.all[0]!, data.assets.all, data.tokens.items)).toEqual([]);
  });
});

describe('the brand.json schema', () => {
  it('lists the colorway fields and the same levels the check knows', () => {
    const item = (BRAND_SCHEMA as any).$defs.assetMeta.properties.colorways.items;
    expect(Object.keys(item.properties)).toEqual(['name', 'on', 'variant', 'min']);
    expect(item.properties.min.enum).toEqual(Object.keys(CONTRAST_MINIMUM));
    expect(item.required).toEqual(['name', 'on', 'min']);
  });
});
