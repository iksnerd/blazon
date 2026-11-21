import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { REPO } from '../../test/support/paths.js';
import { tempDir } from '../../test/support/project.js';
import { starterProject } from '../../test/support/init-project.js';

// Shared by the server-*.test.ts files: the server against the real blazon CLI, run from source on a project `blazon init` wrote. The SDK's
// in-memory pair stands in for stdio; one test in server-process.test.ts starts the real entry point over stdio.
// mcp/ is an npm workspace of the repo, so the SDK comes with the root install. A checkout without any install skips the files with a notice.

export const installed = (() => {
  try {
    createRequire(import.meta.url).resolve('@modelcontextprotocol/sdk/package.json');
    return true;
  } catch {
    return false;
  }
})();
// On CI a missing SDK must not look like a pass: the suite would be green with none of the server covered.
if (!installed && process.env.CI) throw new Error('The MCP SDK is not installed, and CI must run the blazon-mcp tests: npm ci at the repo root installs it.');
if (!installed) process.stderr.write('The MCP SDK is not installed: the blazon-mcp tests are skipped (run npm install at the repo root).\n');

// Loaded only when the SDK is there: the server imports it, and a static import would fail the whole file before the skip.
export const loadServer = async () => (await import('../src/server.js')).createServer;

export const TSX = pathToFileURL(path.join(REPO, 'node_modules/tsx/dist/esm/index.mjs')).href;

/** An executable that runs the CLI from source, which is what BLAZON_BIN names. */
export function blazonFromSource(): string {
  const file = path.join(tempDir('blazon-mcp-bin-'), 'blazon');
  fs.writeFileSync(file, `#!/bin/sh\nexec "${process.execPath}" --import ${TSX} "${path.join(REPO, 'scripts/blazon-src.ts')}" "$@"\n`, { mode: 0o755 });
  return file;
}

export type Content = { type: string; text: string }[];
export const textOf = (result: unknown): string => ((result as { content: Content }).content[0] as { text: string }).text;
export const jsonOf = (result: unknown) => JSON.parse(textOf(result)) as Record<string, any>;
export const structured = (result: unknown) => (result as { structuredContent: Record<string, any> }).structuredContent;
/** The text block that is the JSON: the last one, since a warning comes first. */
export const lastText = (result: unknown): string => {
  const c = (result as { content: Content }).content;
  return c[c.length - 1]!.text;
};

/** An executable that runs a shell body in place of blazon. */
export function fakeBlazon(body: string): string {
  const file = path.join(tempDir('blazon-mcp-fake-'), 'blazon');
  fs.writeFileSync(file, `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  return file;
}

/** A client on a server built over `target`, for a test that needs its own blazon program or limits. */
export async function connect(target: Record<string, unknown>) {
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');
  const [a, b] = InMemoryTransport.createLinkedPair();
  const createServer = await loadServer();
  await createServer(target as never).connect(b);
  const other = new Client({ name: 'test', version: '0.0.0' });
  await other.connect(a);
  return other;
}

/** True when a call is refused, whether as a protocol error or as a tool error. */
export const refused = (promise: Promise<unknown>): Promise<boolean> =>
  promise.then(
    (r) => (r as { isError?: boolean }).isError === true,
    () => true,
  );

/** The client, brand folder and blazon program that a file's tests share: one server for the file, started in its `beforeAll`. */
export async function startShared() {
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');
  const brand = await starterProject();
  const bin = blazonFromSource();
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const createServer = await loadServer();
  await createServer({ bin, brand }).connect(serverSide);
  const client = new Client({ name: 'test', version: '0.0.0' });
  await client.connect(clientSide);
  return { client, brand, bin };
}
