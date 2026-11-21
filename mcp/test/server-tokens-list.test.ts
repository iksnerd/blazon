// Covers list_tokens (groups, types, size limit, tier) and the theme argument of list_tokens and get_token.
// One of the server-*.test.ts files, kept small so the files run in parallel; the shared setup is in support.ts.

import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { tempDir } from '../../test/support/project.js';
import { MAX_TEXT } from '../src/result.js';
import { connect, fakeBlazon, installed, lastText, refused, startShared, structured, textOf } from './support.js';

describe.skipIf(!installed)('blazon-mcp', () => {
  let client: import('@modelcontextprotocol/sdk/client/index.js').Client;
  let brand: string;

  beforeAll(async () => {
    ({ client, brand } = await startShared());
  });
  afterAll(async () => {
    await client?.close();
  });

  const call = (name: string, args: Record<string, unknown> = {}) => client.callTool({ name, arguments: args });

  it('list_tokens lists the brand, a group, a type, or a group of one type', async () => {
    const all = structured(await call('list_tokens'));
    expect(all.tokens.length).toBeGreaterThan(10);
    expect(all.tokens[0]).toMatchObject({ path: expect.any(String), value: expect.anything() });
    expect(all.tokensTotal).toBe(all.tokens.length);
    expect(all.truncated).toBe(false);
    const group = structured(await call('list_tokens', { group: 'text' }));
    expect(group.group).toBe('text');
    expect(group.tokens.every((t: { path: string }) => t.path.startsWith('text.'))).toBe(true);
    const colors = structured(await call('list_tokens', { type: 'color' }));
    expect(colors.type).toBe('color');
    expect(colors.tokens.every((t: { type: string }) => t.type === 'color')).toBe(true);
    const both = structured(await call('list_tokens', { group: 'text', type: 'color' }));
    expect(both.tokens.map((t: { path: string }) => t.path)).toContain('text.primary');
  });

  it('list_tokens turns an unknown type into an error that names the next step', async () => {
    const type = await call('list_tokens', { type: 'colour' });
    expect(type.isError).toBe(true);
    expect(textOf(type)).toMatch(/the types are color,/);
    expect(textOf(type)).toMatch(/Call list_tokens with no arguments/);
    expect(await refused(call('list_tokens', { group: '../x' }))).toBe(true);
  });

  it('cuts a list_tokens answer over the size limit to whole tokens and says how to narrow it', async () => {
    const tokens = Array.from({ length: 2000 }, (_, i) => ({ path: `space.t${i}`, type: 'dimension', value: `${i}px` }));
    const big = path.join(tempDir('blazon-mcp-list-'), 'big.json');
    fs.writeFileSync(big, JSON.stringify({ command: 'list', passed: true, tokens }));
    const other = await connect({ bin: fakeBlazon(`cat "${big}"`), brand });
    const result = await other.callTool({ name: 'list_tokens', arguments: {} });
    expect(result.isError).toBeFalsy();
    const list = structured(result);
    expect(list.truncated).toBe(true);
    expect(list.tokens.length).toBeGreaterThan(0);
    expect(list.tokens.length).toBeLessThan(2000);
    expect(list.tokensTotal).toBe(2000);
    expect(list.notice).toMatch(/Showing \d+ of 2000 tokens; narrow with group or type/);
    expect(lastText(result).length).toBeLessThanOrEqual(MAX_TEXT);
    await other.close();
  });

  it('list_tokens keeps to a tier, lists the tier of each token and the themes the brand has', async () => {
    const semantic = structured(await call('list_tokens', { tier: 'semantic' }));
    expect(semantic.tier).toBe('semantic');
    expect(semantic.tokens.length).toBeGreaterThan(0);
    expect(semantic.tokens.every((t: { tier?: string }) => t.tier === 'semantic')).toBe(true);
    const all = structured(await call('list_tokens'));
    expect(all.tokens.length).toBeGreaterThan(semantic.tokens.length);
    expect(all.themes).toEqual(['light', 'dark']);
    const bad = await call('list_tokens', { tier: 'atom' });
    expect(bad.isError).toBe(true);
    expect(textOf(bad)).toContain('the tiers are primitive, semantic, component');
  });

  it('list_tokens and get_token take a theme: the value as the theme resolves it, the default value where it differs, an unknown theme is refused', async () => {
    const dark = structured(await call('list_tokens', { group: 'surface', theme: 'dark' }));
    expect(dark.theme).toBe('dark');
    expect(dark.tokens.find((t: { path: string }) => t.path === 'surface.canvas')).toMatchObject({ value: '#101113', defaultValue: expect.any(String) });
    const light = structured(await call('get_token', { path: 'surface.canvas' }));
    const themed = structured(await call('get_token', { path: 'surface.canvas', theme: 'dark' }));
    expect(themed.token).toMatchObject({ theme: 'dark', value: '#101113', defaultValue: light.token.value });
    expect(light.token.theme).toBeUndefined();
    for (const [name, args] of [
      ['list_tokens', { theme: 'sepia' }],
      ['get_token', { path: 'surface.canvas', theme: 'sepia' }],
    ] as const) {
      const unknown = await call(name, args);
      expect(unknown.isError, name).toBe(true);
      expect(textOf(unknown), name).toContain('The themes are "light", "dark"');
    }
  });
});
