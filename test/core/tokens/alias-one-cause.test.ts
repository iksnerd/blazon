import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { checkTokens } from '../../../src/core/checker/index.js';
import { loadConfig } from '../../../src/core/config/index.js';
import { compileBlazonData } from '../../../src/core/index.js';
import { compileTokens } from '../../support/helpers.js';
import { exampleProject } from '../../support/examples';

// One cause, one finding: an alias that points at nothing is `alias-unresolved`, once. What exists only because of it (a type or value
// problem on that token, a contrast pair or colorway that names it, a token whose alias chain passes through it) is not reported.

const pair = (fg: string, bg: string) => ({ $extensions: { 'dev.blazon': { pairs: [{ fg, bg, min: 'AA' }] } } });
const codesAt = (found: { code: string; path: string }[]) => found.map((f) => `${f.path}:${f.code}`);

describe('an alias that names no token', () => {
  it('is reported once, with no value, type or contrast finding for the same cause', async () => {
    const result = checkTokens(
      await compileTokens({
        'a.json': {
          color: { $type: 'color', ink: { $value: '{color.nope}' }, paper: { $value: '#ffffff' } },
          rules: pair('{color.ink}', '{color.paper}'),
        },
      }),
    );
    expect(codesAt(result.all)).toEqual(['color.ink:alias-unresolved']);
  });

  it('does not report a pair that names the broken token as the background either', async () => {
    const result = checkTokens(
      await compileTokens({
        'a.json': {
          color: { $type: 'color', ink: { $value: '#000000' }, paper: { $value: '{color.nope}' } },
          rules: pair('{color.ink}', '{color.paper}'),
        },
      }),
    );
    expect(codesAt(result.all)).toEqual(['color.paper:alias-unresolved']);
  });

  it('is the only finding for a chain of three aliases through it', async () => {
    const result = checkTokens(
      await compileTokens({
        'a.json': {
          color: {
            $type: 'color',
            root: { $value: '{color.nope}' },
            mid: { $value: '{color.root}' },
            top: { $value: '{color.mid}' },
            paper: { $value: '#ffffff' },
          },
          rules: pair('{color.top}', '{color.paper}'),
        },
      }),
    );
    expect(codesAt(result.all)).toEqual(['color.root:alias-unresolved']);
  });

  it('is the only finding for an untyped token that aliases only the broken one', async () => {
    const result = checkTokens(await compileTokens({ 'a.json': { color: { $type: 'color', root: { $value: '{color.nope}' } }, other: { alias: { $value: '{color.root}' } } } }));
    expect(codesAt(result.all)).toEqual(['color.root:alias-unresolved']);
  });

  it('is the only finding for a composite whose part is the broken alias', async () => {
    const result = checkTokens(
      await compileTokens({
        'a.json': {
          color: { $type: 'color', root: { $value: '{color.nope}' } },
          edge: { $type: 'border', line: { $value: { color: '{color.root}', width: '1px', style: 'solid' } } },
        },
      }),
    );
    expect(codesAt(result.all)).toContain('color.root:alias-unresolved');
    expect(codesAt(result.all)).not.toContain('edge.line:token-value-invalid');
  });

  it('gives a second, independent broken alias its own finding', async () => {
    const result = checkTokens(
      await compileTokens({
        'a.json': { color: { $type: 'color', one: { $value: '{color.nope}' }, two: { $value: '{color.gone}' }, below: { $value: '{color.two}' } } },
      }),
    );
    expect(codesAt(result.all)).toEqual(['color.one:alias-unresolved', 'color.two:alias-unresolved']);
  });

  it('still reports a token with a bad value of its own, and the pair that cannot be measured because of it', async () => {
    const result = checkTokens(
      await compileTokens({
        'a.json': {
          color: { $type: 'color', var: { $value: 'var(--brand)' }, paper: { $value: '#ffffff' }, bad: { $value: 'not a color' }, ink: { $value: '{color.nope}' } },
          rules: { $extensions: { 'dev.blazon': { pairs: [{ fg: '{color.var}', bg: '{color.paper}', min: 'AA' }] } } },
        },
      }),
    );
    expect(codesAt(result.all).sort()).toEqual(['color.bad:token-value-invalid', 'color.ink:alias-unresolved', 'color.paper:contrast-unknown']);
  });

  it('leaves a cycle as its own finding', async () => {
    const result = checkTokens(await compileTokens({ 'a.json': { color: { $type: 'color', a: { $value: '{color.b}' }, b: { $value: '{color.a}' } } } }));
    expect(result.all.map((f) => f.code)).toContain('alias-circular');
    expect(result.all.map((f) => f.code)).not.toContain('alias-unresolved');
  });

  it('is the only finding for a logo colorway on the broken token', async () => {
    const root = exampleProject('blazon');
    const colors = path.join(root, 'tokens/colors.json');
    fs.writeFileSync(colors, fs.readFileSync(colors, 'utf-8').replaceAll('"{color.base.bone}"', '"{color.nope}"'));
    const sidecar = path.join(root, 'assets/logos/blazon-graphite.json');
    fs.writeFileSync(sidecar, JSON.stringify({ ...JSON.parse(fs.readFileSync(sidecar, 'utf-8')), ink: '#000000', colorways: [{ name: 'On paper', on: '{surface.background}' }] }));
    const data = await compileBlazonData(await loadConfig(root), root);
    const broken = data.findings.filter((f) => f.code === 'alias-unresolved').map((f) => f.path);
    expect(broken.length).toBeGreaterThan(0);
    expect(data.findings.filter((f) => f.code === 'contrast-unknown' || f.code === 'token-value-invalid')).toEqual([]);
  });
});
