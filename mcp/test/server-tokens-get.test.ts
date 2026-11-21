// Covers get_token, get_rules and the pointers to list_tokens that their errors carry.
// One of the server-*.test.ts files, kept small so the files run in parallel; the shared setup is in support.ts.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { installed, jsonOf, startShared, textOf } from './support.js';

describe.skipIf(!installed)('blazon-mcp', () => {
  let client: import('@modelcontextprotocol/sdk/client/index.js').Client;

  beforeAll(async () => {
    ({ client } = await startShared());
  });
  afterAll(async () => {
    await client?.close();
  });

  const call = (name: string, args: Record<string, unknown> = {}) => client.callTool({ name, arguments: args });

  it('get_token returns the token as blazon describes it', async () => {
    const result = await call('get_token', { path: 'text.primary' });
    expect(result.isError).toBeFalsy();
    expect(jsonOf(result).token.path).toBe('text.primary');
  });

  it("turns an unknown token into a tool error with blazon's message", async () => {
    const result = await call('get_token', { path: 'color.nope' });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/color\.nope/);
  });

  it('get_token refuses a group path and points to list_tokens', async () => {
    const result = await call('get_token', { path: 'color' });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/group of tokens.*list_tokens with group "color"/);
  });

  it('says to call list_tokens when a token, a pair or a rules path is unknown', async () => {
    for (const [name, args] of [
      ['get_token', { path: 'color.nope' }],
      ['get_rules', { path: 'color.nope' }],
      ['can_use', { fg: 'color.nope', bg: 'surface.background' }],
    ] as const) {
      const result = await call(name, args);
      expect(result.isError, name).toBe(true);
      expect(textOf(result), name).toMatch(/color\.nope.*To find a token path, call list_tokens\./);
    }
  });

  it('get_rules works with and without a path', async () => {
    expect(jsonOf(await call('get_rules')).kind).toBe('brand');
    expect(jsonOf(await call('get_rules', { path: 'color' })).kind).toBe('group');
  });
});
