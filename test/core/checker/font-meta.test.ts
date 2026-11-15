import { describe, it, expect } from 'vitest';
import { fontMetaFindings } from '../../../src/core/checker/font-meta.js';
import { compileTokens } from '../../support/helpers.js';

// `font` on a typeface token (RFC 0001 §2): where it comes from and under what license. A press kit prints it as the brand's word.

const compile = async (font: Record<string, unknown>) => (await compileTokens({ 'a.json': { font: { $type: 'fontFamily', ...font } } })).tokens;
const brand = (meta: unknown, extra: Record<string, unknown> = {}) => ({ brand: { $value: ['Kinto', 'sans-serif'], $extensions: { 'dev.blazon': { font: meta } }, ...extra } });

describe('fontMetaFindings', () => {
  const findings = async (font: Record<string, unknown>) => {
    const { items, groupMeta, problems } = await compile(font);
    return [...problems, ...fontMetaFindings(items, groupMeta)].map((f) => `${f.path}:${f.code}`);
  };

  it('accepts a source, an SPDX id or a name, and an address, alone or together', async () => {
    expect(await findings(brand({ source: 'https://fonts.example/kinto', license: 'OFL-1.1', licenseUrl: 'https://openfontlicense.org' }))).toEqual([]);
    expect(await findings(brand({ source: 'Kinto Type Foundry' }))).toEqual([]);
    expect(await findings(brand({ license: 'Commercial desktop and web license, 5 seats' }))).toEqual([]);
    expect(await findings(brand({ licenseUrl: 'http://example.com/eula' }))).toEqual([]);
  });

  it('says nothing for a token with no font extension', async () => {
    expect(await findings({ plain: { $value: ['Inter', 'sans-serif'] } })).toEqual([]);
  });

  it.each([
    ['a string', 'OFL-1.1'],
    ['an array', ['OFL-1.1']],
    ['an empty object', {}],
    ['a field blazon does not know', { source: 'x', file: 'a.woff2' }],
    ['a license that is not text', { license: 3 }],
    ['a blank source', { source: '  ' }],
    ['a license with a line break', { license: 'OFL\n1.1' }],
    ['a license address that is not http(s)', { licenseUrl: 'ftp://example.com/l' }],
    ['a license address that is not an address', { licenseUrl: 'ofl.txt' }],
    ['a source that looks like an address and is not http(s)', { source: 'file:///etc/passwd' }],
  ])('refuses %s', async (_what, meta) => {
    expect(await findings(brand(meta))).toEqual(['font.brand:invalid-font-meta']);
  });

  it('notes, but does not refuse, a license that looks like an SPDX id and is not one', async () => {
    const { items, groupMeta } = await compile(brand({ license: 'OFL-1.2' }));
    expect(fontMetaFindings(items, groupMeta)).toEqual([
      expect.objectContaining({ path: 'font.brand', code: 'font-license-unknown', severity: 'info', message: expect.stringContaining('did you mean') }),
    ]);
  });

  it('says nothing about a license that is a name, and judges an invalid font before its license', async () => {
    expect(await findings(brand({ license: 'Proprietary' }))).toEqual([]);
    expect(await findings(brand({ license: 'OFL-1.2', licenseUrl: 'nope' }))).toEqual(['font.brand:invalid-font-meta']);
  });

  it('refuses it on a token that is not a typeface, and reports a group once', async () => {
    const color = await compileTokens({ 'a.json': { color: { $type: 'color', ink: { $value: '#000000', $extensions: { 'dev.blazon': { font: { license: 'OFL-1.1' } } } } } } });
    expect(fontMetaFindings(color.tokens.items, color.tokens.groupMeta).map((f) => f.path)).toEqual(['color.ink']);
    const group = await findings({ $extensions: { 'dev.blazon': { font: { license: 3 } } }, a: { $value: ['A', 'serif'] }, b: { $value: ['B', 'serif'] } });
    expect(group).toEqual(['font:invalid-font-meta']);
  });
});

describe('in a compiled project', () => {
  it('reports a bad font fact with the file and line of the token, and carries a good one in the data', async () => {
    const data = await compileTokens({
      'type.json': {
        font: {
          $type: 'fontFamily',
          bad: { $value: ['A', 'serif'], $extensions: { 'dev.blazon': { font: { licenseUrl: 'nope' } } } },
          good: { $value: ['B', 'serif'], $extensions: { 'dev.blazon': { font: { license: 'OFL-1.1' } } } },
        },
      },
    });
    const found = data.findings.filter((f) => f.code === 'invalid-font-meta');
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ path: 'font.bad', severity: 'error', file: 'tokens/type.json' });
    expect(found[0]!.line).toBeGreaterThan(0);
    expect(data.tokens.byPath.get('font.good')!.blazon.font).toEqual({ license: 'OFL-1.1' });
  });
});
