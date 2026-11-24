// Covers can_use: roles, batches of pairs, the size limit, and the denial and error answers.
// One of the server-*.test.ts files, kept small so the files run in parallel; the shared setup is in support.ts.

import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { tempDir } from '../../test/support/project.js';
import { MAX_TEXT } from '../src/result.js';
import { connect, fakeBlazon, installed, jsonOf, lastText, refused, startShared, structured, textOf } from './support.js';

describe.skipIf(!installed)('blazon-mcp', () => {
  let client: import('@modelcontextprotocol/sdk/client/index.js').Client;

  beforeAll(async () => {
    ({ client } = await startShared());
  });
  afterAll(async () => {
    await client?.close();
  });

  const call = (name: string, args: Record<string, unknown> = {}) => client.callTool({ name, arguments: args });

  it('can_use returns a denied answer as a result, not an error', async () => {
    const result = await call('can_use', { fg: 'color.signal.orange', bg: 'surface.background' });
    expect(result.isError).toBeFalsy();
    expect(jsonOf(result).allowed).toBe(false);
    const allowed = await call('can_use', { fg: 'text.primary', bg: 'surface.background' });
    expect(jsonOf(allowed).allowed).toBe(true);
  });

  it('measure_contrast measures a blend and answers no verdict; what it cannot measure is a tool error', async () => {
    const plain = jsonOf(await call('measure_contrast', { fg: 'text.primary', bg: 'surface.background' }));
    expect(plain).toMatchObject({ fg: 'text.primary', bg: 'surface.background', note: 'a measurement, not a brand approval' });
    const tinted = jsonOf(await call('measure_contrast', { fg: 'text.primary', bg: 'surface.background', with: 'color.signal.orange', withAlpha: 0.12, alpha: 0.9 }));
    expect(tinted).toMatchObject({ with: 'color.signal.orange', withAlpha: 0.12, alpha: 0.9 });
    expect(typeof tinted.ratio).toBe('number');
    expect(tinted.seen).toEqual({ fg: expect.stringMatching(/^#[0-9a-f]{6}$/), bg: expect.stringMatching(/^#[0-9a-f]{6}$/) });
    for (const answer of [plain, tinted]) {
      expect(Object.keys(answer)).not.toContain('allowed');
      expect(Object.keys(answer)).not.toContain('passed');
    }
    expect(await refused(call('measure_contrast', { fg: 'text.primary', bg: 'surface.background', with: 'color.signal.orange' }))).toBe(true);
    expect(await refused(call('measure_contrast', { fg: 'text.primary', bg: 'surface.background', with: 'color.signal.orange', withAlpha: 1.5 }))).toBe(true);
    expect(await refused(call('measure_contrast', { fg: 'text.primary', bg: 'surface.backgrnd' }))).toBe(true);
  });

  it('can_use takes a role: ui is judged as a non-text element, an unknown role is refused', async () => {
    const ui = jsonOf(await call('can_use', { fg: 'text.primary', bg: 'surface.background', role: 'ui' }));
    expect(ui).toMatchObject({ role: 'ui', contrast: { threshold: 3 } });
    expect((await call('can_use', { fg: 'text.primary', bg: 'surface.background', role: 'icon' })).isError).toBe(true);
  });

  it('can_use judges a batch of pairs, in order, and leaves out the checks of an allowed answer when verbose is false', async () => {
    const pairs = [
      { fg: 'text.primary', bg: 'surface.canvas' },
      { fg: 'color.signal.orange', bg: 'surface.canvas' },
    ];
    const full = structured(await call('can_use', { pairs }));
    expect(full.allowed).toBe(false);
    expect(full.results.map((r: { fg: string; allowed: boolean }) => [r.fg, r.allowed])).toEqual([
      ['text.primary', true],
      ['color.signal.orange', false],
    ]);
    expect(full.results[0].checks.length).toBeGreaterThan(1);
    const brief = structured(await call('can_use', { pairs, verbose: false }));
    expect(brief.results[0].checks).toBeUndefined();
    expect(brief.results[1].checks).toEqual(full.results[1].checks);
    const one = structured(await call('can_use', { fg: 'text.primary', bg: 'surface.canvas', verbose: false }));
    expect(one.checks).toBeUndefined();
    expect(one.allowed).toBe(true);
    const theme = structured(await call('can_use', { pairs: [pairs[0]], theme: 'dark' }));
    expect(theme.results[0].theme).toBe('dark');
  });

  it('can_use wants exactly one of fg and bg, or pairs, refuses a batch over the limit, and names the pair of a batch that has an unknown token', async () => {
    const both = await call('can_use', { fg: 'text.primary', bg: 'surface.canvas', pairs: [{ fg: 'text.primary', bg: 'surface.canvas' }] });
    expect(both.isError).toBe(true);
    expect(textOf(both)).toMatch(/not both/);
    const none = await call('can_use', {});
    expect(none.isError).toBe(true);
    expect(textOf(none)).toMatch(/give fg and bg, or one or more --pair/);
    const half = await call('can_use', { fg: 'text.primary' });
    expect(half.isError).toBe(true);
    const over = Array.from({ length: 51 }, () => ({ fg: 'text.primary', bg: 'surface.canvas' }));
    expect(await refused(call('can_use', { pairs: over }))).toBe(true);
    expect(await refused(call('can_use', { pairs: [] }))).toBe(true);
    const typo = await call('can_use', {
      pairs: [
        { fg: 'text.primary', bg: 'surface.canvas' },
        { fg: 'color.nope', bg: 'surface.canvas' },
      ],
    });
    expect(typo.isError).toBe(true);
    expect(textOf(typo)).toMatch(/pairs\[1\]: .*color\.nope/);
  });

  it('can_use answers the largest batch within the size limit, cutting to whole results if it must', async () => {
    const pairs = Array.from({ length: 50 }, (_, i) => (i % 2 === 0 ? { fg: 'text.primary', bg: 'surface.canvas' } : { fg: 'color.signal.orange', bg: 'surface.canvas' }));
    const result = await call('can_use', { pairs });
    expect(lastText(result).length).toBeLessThanOrEqual(MAX_TEXT + 200);
    const document = structured(result);
    expect(document.results.length).toBeGreaterThan(0);
    if (document.truncated) expect(document.notice).toMatch(/send fewer pairs, or set verbose to false/);
    else expect(document.results).toHaveLength(50);
    const brief = structured(await call('can_use', { pairs, verbose: false }));
    expect(brief.truncated).toBe(false);
    expect(brief.results).toHaveLength(50);
  });

  it('can_use cuts a batch that is over the size limit to whole results, and says how to send less', async () => {
    const big = { allowed: false, results: Array.from({ length: 50 }, (_, i) => ({ fg: `a${i}`, bg: 'b', allowed: false, reason: 'x'.repeat(1000) })) };
    const file = path.join(tempDir('blazon-mcp-big-'), 'answer.json');
    fs.writeFileSync(file, JSON.stringify(big));
    const other = await connect({ bin: fakeBlazon(`cat "${file}"`), brand: process.cwd() });
    const result = await other.callTool({ name: 'can_use', arguments: { fg: 'a', bg: 'b' } });
    await other.close();
    const document = structured(result);
    expect(lastText(result).length).toBeLessThanOrEqual(MAX_TEXT);
    expect(document.truncated).toBe(true);
    expect(document.results.length).toBeLessThan(50);
    expect(document.results.length).toBeGreaterThan(0);
    expect(document.resultsTotal).toBe(50);
    expect(document.notice).toMatch(/Showing \d+ of 50 results; send fewer pairs, or set verbose to false/);
  });

  it('can_use says in a denial that component tokens are not read for pairs', async () => {
    // surface.inverse is a color, but no pair lists it under text.primary
    const denied = structured(await call('can_use', { fg: 'text.primary', bg: 'surface.inverse' }));
    expect(denied.allowed).toBe(false);
    expect(JSON.stringify(denied)).toContain('Component tokens are not read for pairs');
  });

  it('can_use reports an unknown token as an error', async () => {
    const result = await call('can_use', { fg: 'color.nope', bg: 'surface.background' });
    expect(result.isError).toBe(true);
  });
});
