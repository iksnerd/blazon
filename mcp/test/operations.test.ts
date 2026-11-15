import path from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { OPERATIONS as LIST, toolOf, toolOperations } from '../../src/core/operations/index.js';
import { OPERATIONS } from '../src/operations.js';
import { commandFor } from '../src/operations.js';

// The tools the server lists are the operations of src/core/operations/list.ts that have one, in its order, each with the list's own words.

const installed = (() => {
  try {
    createRequire(import.meta.url).resolve('@modelcontextprotocol/sdk/package.json');
    return true;
  } catch {
    return false;
  }
})();

describe.skipIf(!installed)('blazon-mcp tools come from the operations list', () => {
  async function listed() {
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
    const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');
    const { createServer } = await import('../src/server.js');
    const [a, b] = InMemoryTransport.createLinkedPair();
    await createServer({ bin: 'blazon', brand: path.dirname(import.meta.dirname) }).connect(b);
    const client = new Client({ name: 'test', version: '0.0.0' });
    await client.connect(a);
    return client;
  }

  it('lists a tool for each operation that has one, in order, with its title, description, schemas and annotations', async () => {
    const client = await listed();
    const { tools } = await client.listTools();
    await client.close();
    const wanted = toolOperations(LIST).map((op) => toolOf(op));
    expect(tools.map((t) => t.name)).toEqual(wanted.map((t) => t.name));
    for (const [i, tool] of tools.entries()) {
      const want = wanted[i]!;
      const { $schema: inputDialect, ...input } = tool.inputSchema as Record<string, unknown>;
      const { $schema: outputDialect, ...output } = tool.outputSchema as Record<string, unknown>;
      expect([inputDialect, outputDialect]).toEqual(['http://json-schema.org/draft-07/schema#', 'http://json-schema.org/draft-07/schema#']);
      expect({ name: tool.name, title: tool.title, description: tool.description, inputSchema: input, outputSchema: output, annotations: tool.annotations }).toEqual(want);
    }
  });

  it('carries the same operations as the list, as the generated copy', () => {
    expect(OPERATIONS).toEqual(toolOperations(LIST));
  });

  it('refuses the folder argument the command line takes, before blazon runs', async () => {
    const client = await listed();
    const result = (await client.callTool({ name: 'get_token', arguments: { path: 'text.primary', dir: '/etc' } })) as { isError?: boolean; content: { text: string }[] };
    await client.close();
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toMatch(/dir is not an argument of this tool/);
  });
});

describe('the blazon command a tool runs', () => {
  const op = (name: string) => OPERATIONS.find((o) => o.name === name)!;
  it.each([
    ['get_token', { path: 'a.b' }, ['get', 'a.b'], {}],
    ['list_tokens', { group: 'color', type: 'color' }, ['list', 'color', '--type', 'color'], {}],
    ['list_tokens', {}, ['list'], {}],
    ['get_rules', {}, ['rules'], {}],
    ['can_use', { fg: 'a', bg: 'b' }, ['can', 'a', 'b'], { answers: [1] }],
    ['can_use', { fg: 'a', bg: 'b', role: 'ui' }, ['can', 'a', 'b', '--role', 'ui'], { answers: [1] }],
    ['get_fonts', {}, ['fonts'], {}],
    ['get_logo', {}, ['logo'], {}],
    ['get_shadcn', {}, ['brand', '--key', 'theme.shadcn'], { json: false }],
    ['check_brand', { severity: 'error', limit: 5 }, ['check', '--no-plugins', '--severity', 'error'], { answers: [1], stderr: 'ignore' }],
  ])('%s %j runs blazon %j', (name, args, argv, options) => {
    expect(commandFor(op(name), args)).toEqual({ argv, options });
  });
});
