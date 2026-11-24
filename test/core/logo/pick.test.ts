import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../../../src/core/config/index.js';
import { compileBlazonData } from '../../../src/core/index.js';
import { pickLogo, type LogoPick } from '../../../src/core/logo/pick.js';
import { LookupError } from '../../../src/core/read/index.js';
import { exampleProject } from '../../support/examples';

// One rule picks a logo for a background token: the configured files first, `logo.deny` under either of a file's names, the shared contrast measure,
// the colorway's level when one names the background. The fixture is a copy of the starter with three extra background tokens.

const DARK = 'color.base.carbon';
const MID = 'color.test.mid';

type Setup = {
  sidecars?: Record<string, Record<string, unknown>>;
  deny?: Record<string, string[]>;
  extraLogo?: Record<string, Record<string, unknown>>;
};

async function fixture({ sidecars = {}, deny = {}, extraLogo = {} }: Setup = {}) {
  const root = exampleProject('blazon');
  const logos = path.join(root, 'assets/logos');
  const patch = (name: string, change: Record<string, unknown>) => {
    const file = path.join(logos, `${name}.json`);
    fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(fs.readFileSync(file, 'utf-8')), ...change }, null, 2));
  };
  patch('blazon-bone', { ink: '{color.base.bone}' });
  patch('blazon-graphite', { ink: '{color.ink.graphite}' });
  for (const [name, change] of Object.entries(sidecars)) patch(name, change);
  for (const [name, sidecar] of Object.entries(extraLogo)) {
    fs.copyFileSync(path.join(logos, 'blazon-bone.svg'), path.join(logos, `${name}.svg`));
    fs.writeFileSync(path.join(logos, `${name}.json`), JSON.stringify(sidecar));
  }
  const tokens = path.join(root, 'tokens/colors.json');
  const json = JSON.parse(fs.readFileSync(tokens, 'utf-8'));
  json.color.test = {
    mid: { $value: '#808080' },
    glass: { $value: '#80808080' },
  };
  json.gradient = {
    $type: 'gradient',
    fade: {
      $value: [
        { color: '#000000', position: 0 },
        { color: '#ffffff', position: 1 },
      ],
    },
  };
  for (const [at, variants] of Object.entries(deny)) {
    let node = json;
    for (const part of at.split('.')) node = node[part];
    node.$extensions = { ...node.$extensions, 'dev.blazon': { ...node.$extensions?.['dev.blazon'], logo: { deny: variants, reason: 'brand rule' } } };
  }
  fs.writeFileSync(tokens, JSON.stringify(json, null, 2));
  const config = await loadConfig(root);
  return { data: await compileBlazonData(config, root), config, root };
}

const pick = async (setup: Setup, on: string, lockup?: string) => {
  const { data, config, root } = await fixture(setup);
  return pickLogo(data, config, root, { on, ...(lockup && { lockup }) });
};
const refusal = (answer: LogoPick) => ('refused' in answer ? answer.refused : undefined);

describe('pickLogo', () => {
  it('picks the configured file that reads on the background, with its ratio and the default bar', async () => {
    const answer = await pick({}, DARK);
    expect(answer).toMatchObject({ file: 'assets/logos/blazon-bone.svg', asset: 'logos/blazon-bone', min: 3 });
    expect((answer as { ratio: number }).ratio).toBeGreaterThan(10);
  });

  it('drops a candidate denied by its asset id', async () => {
    const answer = await pick({ deny: { [MID]: ['logos/blazon-graphite'] } }, MID);
    expect(answer).toMatchObject({ asset: 'logos/blazon-bone' });
  });

  it('drops a candidate denied by its variant name, and says deny when nothing is left', async () => {
    expect(await pick({ deny: { [MID]: ['onLight'] } }, MID)).toMatchObject({ asset: 'logos/blazon-bone' });
    const answer = await pick({ deny: { [DARK]: ['onDark'] } }, DARK);
    expect(refusal(answer)).toMatchObject({ rule: 'deny', from: DARK });
    expect(refusal(answer)!.reason).toContain('onDark');
  });

  it('holds a candidate to the level of the colorway that names the background, not the default bar', async () => {
    const colorway = (min: string) => ({ colorways: [{ name: 'Bone on Mid', on: `{${MID}}`, min }] });
    const deny = { [MID]: ['onLight'] };
    // bone on #808080 is about 3.5:1: it passes AA-large and fails AA
    expect(await pick({ sidecars: { 'blazon-bone': colorway('AA-large') }, deny }, MID)).toMatchObject({ asset: 'logos/blazon-bone', min: 3, colorway: 'Bone on Mid' });
    const strict = await pick({ sidecars: { 'blazon-bone': colorway('AA') }, deny }, MID);
    // the graphite file is denied and bone misses the colorway's 4.5:1: the refusal says both
    expect(refusal(strict)).toMatchObject({ rule: 'deny' });
    expect(refusal(strict)!.reason).toContain('below 4.5:1');
  });

  it('gives unknown for a gradient and for a translucent background', async () => {
    expect(refusal(await pick({}, 'gradient.fade'))).toMatchObject({ rule: 'unknown', from: 'gradient.fade' });
    expect(refusal(await pick({}, 'color.test.glass'))).toMatchObject({ rule: 'unknown' });
  });

  it('refuses an unknown token and an unknown lockup', async () => {
    await expect(pick({}, 'color.nope')).rejects.toBeInstanceOf(LookupError);
    await expect(pick({}, DARK, 'round')).rejects.toBeInstanceOf(LookupError);
  });

  it('chooses among the logo assets of a lockup, whether or not they are configured', async () => {
    const mark = { 'blazon-mark': { ink: '{color.base.bone}' } };
    expect(await pick({ sidecars: mark }, DARK, 'mark')).toMatchObject({ asset: 'logos/blazon-mark' });
    // the mark as the starter has it is graphite, which does not read on carbon
    expect(refusal(await pick({}, DARK, 'mark'))).toMatchObject({ rule: 'contrast' });
    // a lockup no logo has leaves nothing to pick
    expect(refusal(await pick({}, DARK, 'stacked'))).toMatchObject({ rule: 'contrast' });
    expect(await pick({ sidecars: { 'blazon-bone': { lockup: 'horizontal' } } }, DARK, 'horizontal')).toMatchObject({ asset: 'logos/blazon-bone' });
  });

  it('gives a tie to the configured file', async () => {
    // blazon-aaa sorts before the configured bone file and has the same ink: only the rule can make bone win
    const extraLogo = { 'blazon-aaa': { ink: '{color.base.bone}', lockup: 'horizontal' } };
    const answer = await pick({ extraLogo, sidecars: { 'blazon-bone': { lockup: 'horizontal' } } }, DARK, 'horizontal');
    expect(answer).toMatchObject({ file: 'assets/logos/blazon-bone.svg' });
  });

  it('says contrast when no candidate reaches the bar', async () => {
    const strict = { colorways: [{ name: 'Strict', on: `{${MID}}`, min: 'AAA' }] };
    const answer = await pick({ sidecars: { 'blazon-bone': strict, 'blazon-graphite': strict } }, MID);
    expect(refusal(answer)).toMatchObject({ rule: 'contrast', from: MID });
  });
});
