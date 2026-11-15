import { describe, it, expect } from 'vitest';
import { logoDenial, logoRuleFindings } from '../../../src/core/checker/logo-rules.js';
import { compileTokens } from '../../support/helpers.js';

// Forbidden logo backgrounds (RFC 0001 §2): `logo.deny` on a background token or its group.

const VARIANTS = ['onLight', 'onDark', 'logos/white'];

const compile = async (color: Record<string, unknown>) => (await compileTokens({ 'a.json': { color: { $type: 'color', ...color } } })).tokens;
const magenta = (logo: unknown) => ({ magenta: { $value: '#E6007E', $extensions: { 'dev.blazon': { logo } } } });

describe('logoDenial', () => {
  it('finds a variant the token denies, with the reason', async () => {
    const { items } = await compile(magenta({ deny: ['onDark'], reason: 'Never white on Magenta' }));
    const token = items.find((t) => t.path === 'color.magenta')!;
    expect(logoDenial(token, items, 'onDark')).toEqual({ path: 'color.magenta', reason: 'Never white on Magenta' });
    expect(logoDenial(token, items, 'onLight')).toBeUndefined();
  });

  it('reaches a token through its group and through an alias', async () => {
    const { items } = await compile({
      loud: { $extensions: { 'dev.blazon': { logo: { deny: ['logos/white'] } } }, pink: { $value: '#FF44DD' } },
      accent: { $value: '{color.loud.pink}' },
    });
    const get = (path: string) => items.find((t) => t.path === path)!;
    expect(logoDenial(get('color.loud.pink'), items, 'logos/white')).toEqual({ path: 'color.loud.pink' });
    expect(logoDenial(get('color.accent'), items, 'logos/white')).toEqual({ path: 'color.loud.pink' });
  });

  it('says nothing for a token with no rule', async () => {
    const { items } = await compile({ ink: { $value: '#000000' } });
    expect(logoDenial(items[0]!, items, 'onDark')).toBeUndefined();
  });
});

describe('logoRuleFindings', () => {
  const findings = async (color: Record<string, unknown>) => {
    const { items, groupMeta } = await compile(color);
    return logoRuleFindings(items, groupMeta, VARIANTS).map((f) => `${f.path}:${f.code}`);
  };

  it('accepts a rule that names real variants', async () => {
    expect(await findings(magenta({ deny: ['onDark', 'logos/white'] }))).toEqual([]);
  });

  it('is an error to name a variant no logo has: the rule would forbid nothing and say nothing', async () => {
    expect(await findings(magenta({ deny: ['onDrak'] }))).toEqual(['color.magenta:unknown-logo-variant']);
  });

  it('is an error when it is not { deny: strings, reason?: string }', async () => {
    expect(await findings(magenta({ deny: 'onDark' }))).toEqual(['color.magenta:invalid-logo-rule']);
    expect(await findings(magenta({ deny: ['onDark'], reason: 3 }))).toEqual(['color.magenta:invalid-logo-rule']);
    expect(await findings(magenta('onDark'))).toEqual(['color.magenta:invalid-logo-rule']);
  });

  it('reports a group once, not each token under it', async () => {
    const group = { $extensions: { 'dev.blazon': { logo: { deny: ['nope'] } } }, a: { $value: '#111111' }, b: { $value: '#222222' } };
    expect(await findings({ loud: group })).toEqual(['color.loud:unknown-logo-variant']);
  });
});
