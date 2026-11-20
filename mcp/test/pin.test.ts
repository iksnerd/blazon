import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { REPO } from '../../test/support/paths.js';
import { starterProject, tempDir } from '../../test/support/project.js';

// One meaning of `brandHasErrors` for every tool: the brand's own data has error findings. A blazon.lock that names another blazon build is
// not that, so it is reported on its own as `pinMismatch`. Driven through the real stdio server, as an agent uses it.

const installed = (() => {
  try {
    createRequire(import.meta.url).resolve('@modelcontextprotocol/sdk/package.json');
    return true;
  } catch {
    return false;
  }
})();
if (!installed && process.env.CI) throw new Error('The MCP SDK is not installed, and CI must run the blazon-mcp tests: npm ci at the repo root installs it.');

const TSX = pathToFileURL(path.join(REPO, 'node_modules/tsx/dist/esm/index.mjs')).href;
const PINNED = 'a'.repeat(40);

type Result = { structuredContent: Record<string, any> };
const TOOLS: [string, Record<string, unknown>][] = [
  ['check_brand', {}],
  ['list_tokens', {}],
  ['get_token', { path: 'text.primary' }],
  ['get_rules', {}],
  ['can_use', { fg: 'text.primary', bg: 'surface.background' }],
  ['get_fonts', {}],
  ['get_logo', {}],
];

describe.skipIf(!installed)('brandHasErrors and pinMismatch over stdio', () => {
  const opened: { close(): Promise<void> }[] = [];
  let bin: string;

  beforeAll(() => {
    bin = path.join(tempDir('blazon-mcp-pin-bin-'), 'blazon');
    fs.writeFileSync(bin, `#!/bin/sh\nexec "${process.execPath}" --import ${TSX} "${path.join(REPO, 'scripts/blazon-src.ts')}" "$@"\n`, { mode: 0o755 });
  });
  afterAll(async () => {
    await Promise.all(opened.map((c) => c.close()));
  });

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

  it('says brandHasErrors false and names the pin in every tool when only blazon.lock disagrees', async () => {
    const brand = await starterProject();
    fs.writeFileSync(path.join(brand, 'blazon.lock'), `${JSON.stringify({ v: 1, commit: PINNED })}\n`);
    const call = await session(brand);
    for (const [name, args] of TOOLS) {
      const result = (await call(name, args)).structuredContent;
      expect(result.brandHasErrors, name).toBe(false);
      expect(result.pinMismatch, name).toMatchObject({ pinned: PINNED.slice(0, 12), message: expect.stringContaining('pinned to blazon') });
      expect(typeof result.pinMismatch.running, name).toBe('string');
    }
    const check = (await call('check_brand', {})).structuredContent;
    expect(check.passed).toBe(true);
    expect(check.findings.map((f: { code: string }) => f.code)).toContain('pin-mismatch');
  }, 60_000);

  it('has no pinMismatch when there is no pin', async () => {
    const call = await session(await starterProject());
    for (const [name, args] of TOOLS) expect((await call(name, args)).structuredContent, name).not.toHaveProperty('pinMismatch');
  }, 60_000);

  it('says brandHasErrors true in every tool when a token is wrong, pin or not', async () => {
    const brand = await starterProject();
    const file = path.join(brand, 'tokens/colors.json');
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('"{color.ink.steel}"', '"{color.does.not.exist}"'));
    fs.writeFileSync(path.join(brand, 'blazon.lock'), `${JSON.stringify({ v: 1, commit: PINNED })}\n`);
    const call = await session(brand);
    for (const [name, args] of TOOLS) {
      const result = (await call(name, args)).structuredContent;
      expect(result.brandHasErrors, name).toBe(true);
      expect(result.pinMismatch, name).toBeDefined();
    }
    expect((await call('check_brand', {})).structuredContent.passed).toBe(false);
  }, 60_000);
});
