import { describe, it, expect } from 'vitest';
import { formatJsonTokens } from '../../../src/core/tokens/formatters/json.js';
import { contextItems } from '../../../src/core/tokens/contexts.js';
import { compileTokens } from '../../support/helpers.js';

const TOOL = (id: string) => ({ 'com.acme.tool': { id } });
const PX = (value: number) => ({ value, unit: 'px' });

/** RFC 0001 section 1, decision 4: `$extensions` blazon does not understand pass through to tokens.json, on a group as on a token. */
describe('tokens.json keeps group $extensions', () => {
  async function emitted(files: Record<string, unknown>) {
    const data = await compileTokens(files);
    return { data, json: JSON.parse(formatJsonTokens(data.tokens)) as Record<string, any> };
  }

  it('keeps a vendor extension on a group and on its token, each at its authored path', async () => {
    const { json } = await emitted({
      'spacing.json': { space: { $type: 'dimension', $extensions: TOOL('group'), small: { $value: PX(4), $extensions: TOOL('token') } } },
    });
    expect(json.space.$extensions).toEqual(TOOL('group'));
    expect(json.space.small.$extensions).toEqual(TOOL('token'));
  });

  it('keeps it on a nested group, ahead of that group tokens', async () => {
    const { json } = await emitted({
      'spacing.json': { space: { $type: 'dimension', inner: { $extensions: TOOL('inner'), a: { $value: PX(1) } }, b: { $value: PX(2) } } },
    });
    expect(json.space.inner.$extensions).toEqual(TOOL('inner'));
    expect(Object.keys(json.space.inner)).toEqual(['$extensions', 'a']);
  });

  it('keeps the vendor keys and drops the group dev.blazon key, which blazon reads itself', async () => {
    const { json } = await emitted({
      'spacing.json': {
        space: { $type: 'dimension', $extensions: { 'dev.blazon': { tier: 'primitive' }, ...TOOL('group') }, small: { $value: PX(4) } },
      },
    });
    expect(json.space.$extensions).toEqual(TOOL('group'));
  });

  it('writes no $extensions on a group that has only dev.blazon', async () => {
    const { json } = await emitted({
      'spacing.json': { space: { $type: 'dimension', $extensions: { 'dev.blazon': { tier: 'primitive' } }, small: { $value: PX(4) } } },
    });
    expect(json.space.$extensions).toBeUndefined();
  });

  it('keeps it in a context document, for the groups that document has tokens in', async () => {
    const data = await compileTokens({ 'spacing.json': { space: { $type: 'dimension', $extensions: TOOL('group'), small: { $value: PX(4) } } } });
    const json = JSON.parse(formatJsonTokens({ ...data.tokens, items: contextItems(data.tokens.items, []) })) as Record<string, any>;
    expect(json.space.$extensions).toEqual(TOOL('group'));
  });
});
