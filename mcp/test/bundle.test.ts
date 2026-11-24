import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { REPO } from '../../test/support/paths.js';
import { tempDir } from '../../test/support/project.js';
import { starterProject } from '../../test/support/init-project.js';

// The server as it ships: the one built file mcp/dist/index.js, with the MCP SDK and zod bundled in. These tests build it into a
// temporary folder and run it from there, where no node_modules can be found, so a package the bundle forgot to carry fails here
// and not on a user's machine. The `server-*.test.ts` files cover the same behaviour from the TypeScript sources.

const TSX = pathToFileURL(path.join(REPO, 'node_modules/tsx/dist/esm/index.mjs')).href;

type Content = { type: string; text: string }[];
const textOf = (result: unknown): string => {
  const c = (result as { content: Content }).content;
  return c[c.length - 1]!.text;
};
const structured = (result: unknown) => (result as { structuredContent: Record<string, any> }).structuredContent;

/** An executable that runs a shell body in place of blazon. */
function fakeBlazon(body: string, dir = tempDir('blazon-mcp-bundle-fake-'), name = 'blazon'): string {
  const file = path.join(dir, name);
  fs.writeFileSync(file, `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  return file;
}

let built: string;
let second: string;
let brand: string;
let bin: string;
// A copy of the built file in a folder with no node_modules in it or above it.
let run: string;

beforeAll(async () => {
  const { buildMcp } = await import('../../scripts/build-mcp.mjs');
  built = await buildMcp(tempDir('blazon-mcp-build-a-'));
  second = await buildMcp(tempDir('blazon-mcp-build-b-'));
  brand = await starterProject();
  bin = path.join(tempDir('blazon-mcp-bundle-bin-'), 'blazon');
  fs.writeFileSync(bin, `#!/bin/sh\nexec "${process.execPath}" --import ${TSX} "${path.join(REPO, 'scripts/blazon-src.ts')}" "$@"\n`, { mode: 0o755 });
  run = tempDir('blazon-mcp-bundle-run-');
  fs.copyFileSync(built, path.join(run, 'index.js'));
}, 120_000);
afterAll(() => undefined);

const connect = async (env: Record<string, string>, entry = path.join(run, 'index.js'), brandDir = brand) => {
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
  const transport = new StdioClientTransport({ command: process.execPath, args: [entry, '--brand', brandDir], env, cwd: path.dirname(entry) });
  const client = new Client({ name: 'test', version: '0.0.0' });
  await client.connect(transport);
  return client;
};
const baseEnv = (extra: Record<string, string> = {}): Record<string, string> => ({ PATH: process.env.PATH ?? '', HOME: os.homedir(), ...extra });

describe('the built blazon-mcp file', () => {
  it('is one file: a shebang, no source map, no import of a package, no machine path', () => {
    const text = fs.readFileSync(built, 'utf8');
    expect(text.startsWith('#!/usr/bin/env node\n')).toBe(true);
    expect(fs.statSync(built).mode & 0o111).not.toBe(0);
    expect(fs.readdirSync(path.dirname(built))).toEqual(['index.js']);
    expect(text).not.toContain('sourceMappingURL');
    const imports = [...text.matchAll(/^import .* from "([^"]+)";$/gm)].map((m) => m[1]);
    expect(imports.length).toBeGreaterThan(0);
    for (const spec of imports) expect(spec).toMatch(/^node:/);
    for (const needle of [REPO, os.homedir(), '/Users/']) expect(text).not.toContain(needle);
  });

  it('is the same bytes from two builds', () => {
    expect(fs.readFileSync(built).equals(fs.readFileSync(second))).toBe(true);
  });

  it('says what it bundles with --version', () => {
    const out = execFileSync(process.execPath, [path.join(run, 'index.js'), '--version'], { encoding: 'utf8', cwd: run }).trim();
    const sdk = (JSON.parse(fs.readFileSync(path.join(REPO, 'node_modules/@modelcontextprotocol/sdk/package.json'), 'utf8')) as { version: string }).version;
    const zod = (JSON.parse(fs.readFileSync(path.join(REPO, 'node_modules/zod/package.json'), 'utf8')) as { version: string }).version;
    const own = (JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8')) as { version: string }).version;
    expect(out).toBe(`blazon-mcp ${own} (bundles @modelcontextprotocol/sdk ${sdk}, zod ${zod})`);
  });

  it('serves the eight tools over stdio from a folder with no node_modules, and answers real calls', async () => {
    const client = await connect(baseEnv({ BLAZON_BIN: bin }));
    try {
      expect(client.getServerVersion()?.name).toBe('blazon');
      const tools = (await client.listTools()).tools;
      expect(tools.map((t) => t.name).sort()).toEqual(['can_use', 'check_brand', 'get_fonts', 'get_logo', 'get_rules', 'get_token', 'list_tokens', 'measure_contrast']);
      for (const tool of tools) expect((tool.inputSchema as { additionalProperties?: boolean }).additionalProperties).toBe(false);
      expect((await client.listResources()).resources.map((r) => r.uri).sort()).toEqual(['blazon://brand', 'blazon://rules']);
      expect((await client.listPrompts()).prompts.map((p) => p.name)).toEqual(['build_page']);
      const token = await client.callTool({ name: 'get_token', arguments: { path: 'text.primary' } });
      expect(JSON.parse(textOf(token)).token.path).toBe('text.primary');
      const check = await client.callTool({ name: 'check_brand', arguments: { limit: 1 } });
      expect(structured(check).passed).toBe(true);
      // zod, bundled, still closes the input: an argument the tool does not take is refused
      const refused = await client.callTool({ name: 'get_token', arguments: { path: 'text.primary', extra: 1 } }).then(
        (r) => (r as { isError?: boolean }).isError === true,
        () => true,
      );
      expect(refused).toBe(true);
    } finally {
      await client.close();
    }
  }, 60_000);

  it('runs no plugin the brand config names, whichever tool is called', async () => {
    const project = await starterProject();
    const bins = tempDir('blazon-mcp-bundle-plugin-');
    const marker = path.join(bins, 'ran');
    fs.writeFileSync(path.join(bins, 'blazon-evil.mark'), `#!/bin/sh\ntouch "${marker}"\nexit 2\n`, { mode: 0o755 });
    const config = path.join(project, 'blazon.json');
    fs.writeFileSync(config, JSON.stringify({ ...JSON.parse(fs.readFileSync(config, 'utf8')), plugins: [{ name: 'evil.mark' }] }));
    const client = await connect(baseEnv({ BLAZON_BIN: bin, PATH: `${bins}${path.delimiter}${process.env.PATH}` }), undefined, project);
    try {
      for (const [name, args] of [
        ['check_brand', {}],
        ['list_tokens', {}],
        ['get_token', { path: 'color.brand.primary' }],
        ['get_rules', {}],
        ['can_use', { fg: 'text.primary', bg: 'surface.background' }],
        ['get_fonts', {}],
        ['get_logo', {}],
      ] as const)
        await client.callTool({ name, arguments: args });
      expect(fs.existsSync(marker)).toBe(false);
    } finally {
      await client.close();
    }
  }, 120_000);

  it('gives the blazon child only the allowed environment', async () => {
    const dump = path.join(tempDir('blazon-mcp-bundle-env-'), 'env.txt');
    const fake = fakeBlazon(`env > "${dump}"\necho '{"kind":"brand","path":""}'`);
    const client = await connect(baseEnv({ BLAZON_BIN: fake, AWS_SECRET_ACCESS_KEY: 'nope', NODE_AUTH_TOKEN: 'nope', GITHUB_TOKEN: 'nope' }));
    try {
      await client.callTool({ name: 'get_rules', arguments: {} });
      const seen = fs.readFileSync(dump, 'utf8');
      expect(seen).toMatch(/^NO_COLOR=1$/m);
      expect(seen).toMatch(/^BLAZON_BIN=/m);
      expect(seen).not.toMatch(/AWS_SECRET|NODE_AUTH_TOKEN|GITHUB_TOKEN/);
    } finally {
      await client.close();
    }
  }, 60_000);

  it('finds the blazon program beside it in an installed package when BLAZON_BIN is not set', async () => {
    const pkg = tempDir('blazon-mcp-bundle-pkg-');
    fs.mkdirSync(path.join(pkg, 'mcp/dist'), { recursive: true });
    fs.mkdirSync(path.join(pkg, 'bin'));
    fs.copyFileSync(built, path.join(pkg, 'mcp/dist/index.js'));
    fakeBlazon(`echo '{"kind":"brand","path":"","own":true}'`, path.join(pkg, 'bin'), 'blazon.js');
    const client = await connect({ PATH: '/usr/bin:/bin', HOME: os.homedir() }, path.join(pkg, 'mcp/dist/index.js'));
    try {
      const result = await client.callTool({ name: 'get_rules', arguments: {} });
      expect(result.isError).toBeFalsy();
      expect(textOf(result)).toContain('"own":true');
    } finally {
      await client.close();
    }
  }, 60_000);
});
