import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../../src/core/config/index.js';
import { compileBlazonData } from '../../../src/core/index.js';
import { checkTokens } from '../../../src/core/checker/index.js';
import { tempProject } from '../../support/project';

// `print.ral` is a RAL number such as "5012": a non-empty single-line string, written without the RAL prefix the book adds.
// `print.cmyk` is four numbers from 0 to 100 (percent), and `print.pms` is a non-empty single-line string.

const colorWith = (print: unknown) => ({
  color: { a: { $type: 'color', $value: '#005387', $extensions: { 'dev.blazon': { print } } } },
});

async function compiled(print: unknown) {
  const root = tempProject({ 'tokens/brand.json': colorWith(print) });
  return compileBlazonData(await loadConfig(root), root);
}

describe('print.ral', () => {
  it('reaches the token as written', async () => {
    const data = await compiled({ cmyk: [100, 60, 0, 30], pms: '2945 C', ral: '5012' });
    expect(data.tokens.byPath.get('color.a')!.blazon.print).toEqual({ cmyk: [100, 60, 0, 30], pms: '2945 C', ral: '5012' });
    expect(checkTokens(data).all).toEqual([]);
  });

  it.each([['5012'], ['9005'], ['050 40 30'], ['5012 '], ['RALLY']])('accepts %s', async (ral) => {
    expect(checkTokens(await compiled({ ral })).all).toEqual([]);
  });

  it.each([[''], ['   '], [5012], [['5012']], ['5012\n5013'], ['RAL 5012'], ['ral 5012'], ['RAL5012'], ['ral5012'], ['RAL-5012'], [' RAL5012'], ['RAL']])(
    'is an error for %j',
    async (ral) => {
      const found = checkTokens(await compiled({ ral })).all.filter((f) => f.code === 'print-ral-invalid');
      expect(found.map((f) => [f.severity, f.path])).toEqual([['error', 'color.a']]);
      expect(found[0]!.message).toMatch(/print\.ral/);
    },
  );

  it('is not required: a color with no ral has no finding', async () => {
    expect(checkTokens(await compiled({ pms: '2945 C' })).all).toEqual([]);
  });
});

describe('print.cmyk', () => {
  it.each([[[0, 0, 0, 0]], [[100, 100, 100, 100]], [[84, 70, 0, 0]], [[12.5, 0, 0.5, 99.9]]])('accepts %j', async (cmyk) => {
    expect(checkTokens(await compiled({ cmyk })).all).toEqual([]);
  });

  it.each([
    ['not an array', '100,60,0,30'],
    ['an object', { c: 1, m: 2, y: 3, k: 4 }],
    ['an empty array', []],
    ['three numbers', [100, 60, 0]],
    ['five numbers', [100, 60, 0, 30, 0]],
    ['a string element', [100, '60', 0, 30]],
    ['a null element', [100, null, 0, 30]],
    ['a negative number', [-1, 60, 0, 30]],
    ['a number over 100', [100, 60, 0, 101]],
    ['a 0 to 255 value', [255, 0, 0, 0]],
  ])('is an error for %s', async (_why, cmyk) => {
    const found = checkTokens(await compiled({ cmyk })).all.filter((f) => f.code === 'print-cmyk-invalid');
    expect(found.map((f) => [f.severity, f.path])).toEqual([['error', 'color.a']]);
    expect(found[0]!.message).toMatch(/print\.cmyk/);
  });

  it('is not required: a color with no cmyk has no finding', async () => {
    expect(checkTokens(await compiled({ ral: '5012' })).all).toEqual([]);
  });
});

describe('print.pms', () => {
  it.each([['2945 C'], ['Black'], ['Pro Black C'], ['7409']])('accepts %s', async (pms) => {
    expect(checkTokens(await compiled({ pms })).all).toEqual([]);
  });

  it.each([[''], ['   '], [2945], [['2945 C']], ['2945\nC'], ['2945\rC'], [null]])('is an error for %j', async (pms) => {
    const found = checkTokens(await compiled({ pms })).all.filter((f) => f.code === 'print-pms-invalid');
    expect(found.map((f) => [f.severity, f.path])).toEqual([['error', 'color.a']]);
    expect(found[0]!.message).toMatch(/print\.pms/);
  });

  it('is not required: a color with no pms has no finding', async () => {
    expect(checkTokens(await compiled({ cmyk: [0, 0, 0, 100] })).all).toEqual([]);
  });
});

describe('print, several values at once', () => {
  it('reports each bad value on its own code', async () => {
    const found = checkTokens(await compiled({ cmyk: [1, 2, 3], pms: '', ral: 'RAL5012' })).all;
    expect(found.map((f) => f.code).sort()).toEqual(['print-cmyk-invalid', 'print-pms-invalid', 'print-ral-invalid']);
  });
});
