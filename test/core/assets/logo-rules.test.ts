import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { logoConfig } from '../../support/helpers.js';
import { compileBlazonData } from '../../../src/core/index.js';
import { tempDir } from '../../support/project';

// Logo rules in a sidecar (RFC 0001 §10): a `unit` the brand measures its logo in, rules written as
// multiples of it, and the lockup, placement and partnership a logo states.

// 100 x 40 artwork: a unit of 12px is its star, say
const SVG = '<svg viewBox="0 0 100 40" width="100" height="40" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="40"/></svg>';

function project(sidecar: unknown, tokens?: unknown): string {
  const root = tempDir();
  fs.mkdirSync(path.join(root, 'assets/logos'), { recursive: true });
  fs.writeFileSync(path.join(root, 'assets/logos/mark.svg'), SVG);
  fs.writeFileSync(path.join(root, 'assets/logos/mark.json'), typeof sidecar === 'string' ? sidecar : JSON.stringify(sidecar));
  if (tokens) {
    fs.mkdirSync(path.join(root, 'tokens'));
    fs.writeFileSync(path.join(root, 'tokens/t.json'), JSON.stringify(tokens));
  }
  return root;
}

const px = (value: number) => ({ value, unit: 'px' });
const compile = (root: string) => compileBlazonData(logoConfig(root), root);
const sidecarFindings = async (root: string) => (await compile(root)).findings.filter((f) => f.code.startsWith('asset-sidecar'));
const meta = async (root: string) => (await compile(root)).assets.logos[0]!.meta;

describe("a sidecar states the logo's unit and rules in multiples of it", () => {
  it('reads a unit, and clearSpace as a multiple of it', async () => {
    const root = project({ unit: px(12), clearSpace: { units: 1 } });
    expect(await sidecarFindings(root)).toEqual([]);
    expect(await meta(root)).toEqual({ unit: px(12), clearSpace: { units: 1 } });
  });

  it('still reads an absolute clearSpace, and a unit that aliases a dimension token', async () => {
    const root = project({ unit: '{logo.star}', clearSpace: px(20) }, { logo: { star: { $type: 'dimension', $value: px(12) } } });
    expect(await sidecarFindings(root)).toEqual([]);
    expect(await meta(root)).toEqual({ unit: px(12), clearSpace: px(20) });
  });

  it.each([
    ['clearSpace', { units: 1 }],
    ['partnership', { gap: { units: 1 }, dividerHeight: px(40) }],
  ])('rejects a multiple in %s when the sidecar states no unit', async (field, value) => {
    const [finding] = await sidecarFindings(project({ [field]: value }));
    expect(finding).toMatchObject({ code: 'asset-sidecar-invalid', severity: 'error', path: 'logos/mark.json' });
    expect(finding!.message).toMatch(/needs a "unit"/);
  });

  it.each([
    ['zero', { units: 0 }, /units must be a number above 0/],
    ['negative', { units: -1 }, /units must be a number above 0/],
    ['not a number', { units: '1' }, /units must be a number above 0/],
    ['with another key', { units: 1, value: 3 }, /only "units"/],
  ])('rejects a multiple that is %s', async (_, value, message) => {
    const [finding] = await sidecarFindings(project({ unit: px(12), clearSpace: value }));
    expect(finding!.message).toMatch(message);
  });

  it('rejects a unit taller than the artwork, which is a unit in the wrong size', async () => {
    const [finding] = await sidecarFindings(project({ unit: px(41) }));
    expect(finding).toMatchObject({ code: 'asset-sidecar-invalid', severity: 'error', path: 'logos/mark.json' });
    expect(finding!.message).toMatch(/unit 41px is taller than the artwork \(40px\)/);
  });

  it('accepts a unit exactly as tall as the artwork', async () => {
    expect(await sidecarFindings(project({ unit: px(40) }))).toEqual([]);
  });
});

describe('lockup, placement and partnership', () => {
  it('reads each', async () => {
    const root = project({
      unit: px(12),
      lockup: 'stacked',
      placement: ['top-left', 'bottom-left'],
      partnership: { gap: { units: 1 }, dividerHeight: px(40), partnerHeight: { units: 3 } },
    });
    expect(await sidecarFindings(root)).toEqual([]);
    expect(await meta(root)).toMatchObject({
      lockup: 'stacked',
      placement: ['top-left', 'bottom-left'],
      partnership: { gap: { units: 1 }, dividerHeight: px(40), partnerHeight: { units: 3 } },
    });
  });

  it.each([
    ['an unknown lockup', { lockup: 'diagonal' }, /lockup must be one of horizontal, stacked, mark, wordmark/],
    ['a placement that is not a list', { placement: 'top-left' }, /placement must be a list of corners/],
    ['an empty placement', { placement: [] }, /placement must be a list of corners/],
    ['an unknown corner', { placement: ['middle'] }, /placement corner "middle" is not one of top-left, top-right, bottom-left, bottom-right/],
    ['a repeated corner', { placement: ['top-left', 'top-left'] }, /placement names top-left twice/],
    ['a partnership without a gap', { unit: px(12), partnership: { dividerHeight: px(40) } }, /partnership needs a gap/],
    ['an unknown partnership field', { unit: px(12), partnership: { gap: px(12), dividerHeight: px(40), colour: 'red' } }, /partnership has unknown field "colour"/],
    ['a partnership that is not an object', { partnership: 3 }, /partnership must be an object/],
    ['a bad measure inside a partnership', { partnership: { gap: 'wide', dividerHeight: px(40) } }, /partnership\.gap: must be/],
  ])('rejects %s', async (_, sidecar, message) => {
    const findings = await sidecarFindings(project(sidecar));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ code: 'asset-sidecar-invalid', severity: 'error' });
    expect(findings[0]!.message).toMatch(message);
  });

  it('reads a partnership with no divider: the gap is then the space between the two logos', async () => {
    const root = project({ unit: px(12), partnership: { gap: { units: 1 } } });
    expect(await sidecarFindings(root)).toEqual([]);
    // strict: no dividerHeight key at all, so a reader cannot mistake it for a divider of no height
    expect(await meta(root)).toStrictEqual({ unit: px(12), partnership: { gap: { units: 1 } } });
  });

  it('lists the new fields among the known ones when a field is unknown', async () => {
    const [finding] = await sidecarFindings(project({ clearspace: px(1) }));
    expect(finding!.message).toMatch(/unknown field "clearspace"; known: .*\bunit\b.*\blockup\b.*\bplacement\b.*\bpartnership\b/);
  });
});

describe('a sidecar states the sizes a logo is for', () => {
  const withSmall = (sidecar: unknown) => {
    const root = project(sidecar);
    fs.writeFileSync(path.join(root, 'assets/logos/small.svg'), SVG);
    return root;
  };

  it('reads a largest size, and the asset to use below a size', async () => {
    const root = withSmall({ maxSize: { width: px(90) }, replacedBelow: { width: px(30), by: 'logos/small' } });
    expect(await sidecarFindings(root)).toEqual([]);
    expect((await compile(root)).assets.logos.find((a) => a.name === 'mark')!.meta).toStrictEqual({
      maxSize: { width: px(90) },
      replacedBelow: { width: px(30), by: 'logos/small' },
    });
  });

  it.each([
    ['an empty maxSize', { maxSize: {} }, /maxSize must be an object with a width, a height or both/],
    ['a replacedBelow with no size', { replacedBelow: { by: 'logos/small' } }, /replacedBelow needs a width or a height, and by/],
    ['a replacedBelow with no by', { replacedBelow: { width: px(30) } }, /replacedBelow needs a width or a height, and by/],
    ['a by that is not an asset id', { replacedBelow: { width: px(30), by: 'small' } }, /replacedBelow\.by must be an asset id written category\/name/],
    ['an unknown replacedBelow field', { replacedBelow: { width: px(30), by: 'logos/small', use: 'x' } }, /replacedBelow has unknown field "use"; known: width, height, by/],
    ['a bad size in replacedBelow', { replacedBelow: { width: { units: 1 }, by: 'logos/small' } }, /replacedBelow\.width: must be/],
  ])('rejects %s', async (_, sidecar, message) => {
    const findings = await sidecarFindings(withSmall(sidecar));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ code: 'asset-sidecar-invalid', severity: 'error', path: 'logos/mark.json' });
    expect(findings[0]!.message).toMatch(message);
  });

  it('reports a replacement that names no asset', async () => {
    expect(await sidecarFindings(project({ replacedBelow: { width: px(30), by: 'logos/smal' } }))).toEqual([
      { code: 'asset-sidecar-invalid', severity: 'error', path: 'logos/mark.json', message: 'replacedBelow.by: no asset at logos/smal' },
    ]);
  });

  it('does not report a replacement in a local category whose images are not here', async () => {
    const root = project({ replacedBelow: { width: px(30), by: 'small-use/icon' } });
    fs.mkdirSync(path.join(root, 'assets/small-use'));
    fs.writeFileSync(path.join(root, 'assets/small-use/icon.json'), '{}');
    const data = await compileBlazonData({ ...logoConfig(root), assets: { 'small-use': { local: 'Render it.' } } }, root);
    expect(data.findings.filter((f) => f.severity !== 'info' && f.code !== 'tokens-missing')).toEqual([]);
  });
});

describe('initiative: the program a brand runs, drawn with its logo', () => {
  const ARTWORK = '<svg viewBox="0 0 60 20" width="60" height="20" xmlns="http://www.w3.org/2000/svg"><rect width="60" height="20"/></svg>';
  const withMark = (sidecar: unknown) => {
    const root = project(sidecar);
    fs.mkdirSync(path.join(root, 'assets/initiatives'), { recursive: true });
    fs.writeFileSync(path.join(root, 'assets/initiatives/lab.svg'), ARTWORK);
    return root;
  };
  const RULE = { name: 'Open Banking Lab', mark: 'initiatives/lab', gap: { units: 2 } };

  it('reads a name, a mark and a gap, and nothing else is added', async () => {
    const root = withMark({ unit: px(12), initiative: RULE });
    expect(await sidecarFindings(root)).toEqual([]);
    // strict: no position or markHeight key, so a reader cannot take an absent one for a stated one
    expect(await meta(root)).toStrictEqual({ unit: px(12), initiative: RULE });
  });

  it('reads a position and a markHeight', async () => {
    const root = withMark({ unit: px(12), initiative: { ...RULE, position: 'below', markHeight: { units: 3 } } });
    expect(await sidecarFindings(root)).toEqual([]);
    expect(await meta(root)).toMatchObject({ initiative: { position: 'below', markHeight: { units: 3 } } });
  });

  it('leaves a sidecar with no initiative exactly as it was', async () => {
    const root = project({ unit: px(12), partnership: { gap: { units: 1 } } });
    expect(await sidecarFindings(root)).toEqual([]);
    expect(await meta(root)).toStrictEqual({ unit: px(12), partnership: { gap: { units: 1 } } });
  });

  it.each([
    ['not an object', { initiative: 'lab' }, /initiative must be an object/],
    ['without a name', { initiative: { mark: 'initiatives/lab', gap: px(8) } }, /initiative needs a name/],
    ['with an empty name', { initiative: { ...RULE, gap: px(8), name: ' ' } }, /initiative needs a name/],
    ['without a mark', { initiative: { name: 'Lab', gap: px(8) } }, /initiative needs a mark/],
    ['with a mark that is not an asset id', { initiative: { ...RULE, gap: px(8), mark: 'lab' } }, /initiative needs a mark[^]*category\/name/],
    ['without a gap', { initiative: { name: 'Lab', mark: 'initiatives/lab' } }, /initiative needs a gap/],
    ['with a multiple and no unit', { initiative: RULE }, /initiative\.gap: .*needs a "unit"/],
    ['with a bad measure', { initiative: { ...RULE, gap: 'wide' } }, /initiative\.gap: must be/],
    ['with an unknown position', { unit: px(12), initiative: { ...RULE, position: 'above' } }, /initiative\.position must be one of beside, below/],
    ['with a bad markHeight', { unit: px(12), initiative: { ...RULE, markHeight: 'tall' } }, /initiative\.markHeight: must be/],
    ['with an unknown field', { unit: px(12), initiative: { ...RULE, colour: 'red' } }, /initiative has unknown field "colour"; known: name, mark, gap, position, markHeight/],
  ])('rejects an initiative %s', async (_, sidecar, message) => {
    const findings = await sidecarFindings(withMark(sidecar));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ code: 'asset-sidecar-invalid', severity: 'error', path: 'logos/mark.json' });
    expect(findings[0]!.message).toMatch(message);
  });

  it('rejects a mark that names no asset, on the logo that names it', async () => {
    const [finding] = await sidecarFindings(project({ unit: px(12), initiative: RULE }));
    expect(finding).toMatchObject({ code: 'asset-sidecar-invalid', severity: 'error', path: 'logos/mark.json' });
    expect(finding!.message).toBe('initiative.mark: no asset at initiatives/lab');
  });
});
