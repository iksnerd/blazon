import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { REPO } from '../../test/support/paths.js';
import { tempDir } from '../../test/support/project.js';

// Shared by pin.test.ts and pin-broken-token.test.ts: the real stdio server, one session per brand folder, as an agent uses it.

const TSX = pathToFileURL(path.join(REPO, 'node_modules/tsx/dist/esm/index.mjs')).href;
export const PINNED = 'a'.repeat(40);

type Result = { structuredContent: Record<string, any> };
export const TOOLS: [string, Record<string, unknown>][] = [
  ['check_brand', {}],
  ['list_tokens', {}],
  ['get_token', { path: 'text.primary' }],
  ['get_rules', {}],
  ['can_use', { fg: 'text.primary', bg: 'surface.background' }],
  ['get_fonts', {}],
  ['get_logo', {}],
];

/** The blazon program that runs the CLI from source, and a `session(brand)` that opens a stdio server on a brand folder. */
export function pinHarness() {
  const opened: { close(): Promise<void> }[] = [];
  const bin = path.join(tempDir('blazon-mcp-pin-bin-'), 'blazon');
  fs.writeFileSync(bin, `#!/bin/sh\nexec "${process.execPath}" --import ${TSX} "${path.join(REPO, 'scripts/blazon-src.ts')}" "$@"\n`, { mode: 0o755 });

  async function session(brand: string) {
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
    const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ['--import', TSX, path.join(import.meta.dirname, '../src/index.ts'), '--brand', brand],
      env: { ...process.env, BLAZON_BIN: bin } as Record<string, string>,
    });
    const client = new Client({ name: 'test', version: '0.0.0' });
    await client.connect(transport);
    opened.push(client);
    return async (name: string, args: Record<string, unknown>) => (await client.callTool({ name, arguments: args })) as unknown as Result;
  }
  const closeAll = async () => {
    await Promise.all(opened.map((c) => c.close()));
  };
  return { session, closeAll };
}
