import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { CACHE_MS, TIMEOUT_MS } from '../src/blazon.js';
import { INSTRUCTIONS } from '../src/prompts.js';
import { DEFAULT_LIMIT, MAX_LIMIT, MAX_TEXT } from '../src/result.js';

// The agent-facing surface as a client receives it: tools/list, linted the way the mcp-server-design playbook lints it, and compared with a
// committed snapshot so a change to a name, a field or a description shows in review. No blazon program runs here.

const installed = (() => {
  try {
    createRequire(import.meta.url).resolve('@modelcontextprotocol/sdk/package.json');
    return true;
  } catch {
    return false;
  }
})();
if (!installed && process.env.CI) throw new Error('The MCP SDK is not installed, and CI must run the blazon-mcp tests: npm ci at the repo root installs it.');

/** The most tools the server may register. Every definition costs tokens on every request; raise this on purpose, in a reviewed change. */
const TOOL_BUDGET = 12;
/** Claude Code cuts a tool description, and the server instructions, at 2 KB. */
const MAX_DESCRIPTION = 2048;
const NAME = /^[a-z][a-z0-9_]{0,63}$/;
const SNAPSHOT = path.join(import.meta.dirname, '__snapshots__/tools-list.json');

interface Schema {
  type?: string;
  description?: string;
  properties?: Record<string, Schema>;
  items?: Schema;
  [key: string]: unknown;
}
interface ListedTool {
  name: string;
  title?: string;
  description?: string;
  inputSchema: Schema;
  outputSchema?: Schema;
  annotations?: { title?: string; readOnlyHint?: boolean; destructiveHint?: boolean };
}

/** Dotted paths of every property with no description, and every anyOf, oneOf or allOf, found by walking properties and array items. */
function walk(schema: Schema | undefined, at: string, found: { undescribed: string[]; combinators: string[] }): void {
  if (!schema || typeof schema !== 'object') return;
  for (const key of ['anyOf', 'oneOf', 'allOf']) if (key in schema) found.combinators.push(`${at || '(top)'}.${key}`);
  for (const [name, prop] of Object.entries(schema.properties ?? {})) {
    const here = at ? `${at}.${name}` : name;
    if (!prop.description?.trim()) found.undescribed.push(here);
    walk(prop, here, found);
  }
  if (schema.items) walk(schema.items, `${at}[]`, found);
}

async function listTools(): Promise<ListedTool[]> {
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');
  const { createServer } = await import('../src/server.js');
  const [a, b] = InMemoryTransport.createLinkedPair();
  await createServer({ bin: 'blazon', brand: import.meta.dirname }).connect(b);
  const client = new Client({ name: 'test', version: '0.0.0' });
  await client.connect(a);
  const { tools } = await client.listTools();
  await client.close();
  return tools as ListedTool[];
}

describe.skipIf(!installed)('blazon-mcp tool surface', () => {
  it('has a title and readOnlyHint on every tool, and stays inside the tool budget', async () => {
    const tools = await listTools();
    expect(tools.length).toBeLessThanOrEqual(TOOL_BUDGET);
    for (const tool of tools) {
      expect(tool.title?.trim() || tool.annotations?.title, `${tool.name}: no title`).toBeTruthy();
      expect(tool.annotations?.readOnlyHint, `${tool.name}: readOnlyHint unset`).toBe(true);
    }
  });

  it('describes every input and output field, nested ones too', async () => {
    const problems: string[] = [];
    for (const tool of await listTools()) {
      for (const [kind, schema] of [
        ['input', tool.inputSchema],
        ['output', tool.outputSchema],
      ] as const) {
        expect(schema, `${tool.name}: no ${kind} schema`).toBeDefined();
        const found = { undescribed: [] as string[], combinators: [] as string[] };
        walk(schema, '', found);
        problems.push(...found.undescribed.map((f) => `${tool.name}: ${kind} field '${f}' has no description`));
      }
    }
    expect(problems).toEqual([]);
  });

  it('uses no anyOf, oneOf or allOf in any schema', async () => {
    const problems: string[] = [];
    for (const tool of await listTools())
      for (const [kind, schema] of [
        ['input', tool.inputSchema],
        ['output', tool.outputSchema],
      ] as const) {
        const found = { undescribed: [] as string[], combinators: [] as string[] };
        walk(schema, '', found);
        problems.push(...found.combinators.map((c) => `${tool.name}: ${kind} ${c}`));
      }
    expect(problems).toEqual([]);
  });

  it('names tools in snake_case of at most 64 characters, with a description of at most 2 KB', async () => {
    const tools = await listTools();
    expect(new Set(tools.map((t) => t.name)).size).toBe(tools.length);
    for (const tool of tools) {
      expect(tool.name, tool.name).toMatch(NAME);
      expect(tool.description?.trim(), `${tool.name}: no description`).toBeTruthy();
      expect(tool.description!.length, `${tool.name}: description length`).toBeLessThanOrEqual(MAX_DESCRIPTION);
    }
  });

  it('keeps the instructions inside 2 KB, with the tool order in the first 512 characters, naming only registered tools', async () => {
    const names = (await listTools()).map((t) => t.name);
    expect(INSTRUCTIONS.length).toBeLessThanOrEqual(MAX_DESCRIPTION);
    expect(INSTRUCTIONS.slice(0, 512)).toMatch(/Order: check_brand/);
    const mentioned = INSTRUCTIONS.match(/\b(?:check|list|get|can)_[a-z]+\b/g) ?? [];
    expect(mentioned.length).toBeGreaterThan(0);
    for (const name of mentioned) expect(names, `instructions name ${name}, which is not registered`).toContain(name);
  });

  it('names only registered tools in every description, and gives no orders in capitals', async () => {
    const tools = await listTools();
    const names = tools.map((t) => t.name);
    for (const tool of tools) {
      for (const name of tool.description!.match(/\b(?:check|list|get|can)_[a-z]+\b/g) ?? []) expect(names, `${tool.name} names ${name}`).toContain(name);
      expect(tool.description, tool.name).not.toMatch(/\b(ALWAYS|NEVER|MUST|IMPORTANT)\b/);
    }
  });

  it('states the numbers the code enforces, from the constants', async () => {
    const tools = await listTools();
    const text = (name: string) => tools.find((t) => t.name === name)!.description!;
    expect(text('check_brand')).toContain(`default ${DEFAULT_LIMIT}`);
    expect(text('check_brand')).toContain(`at most ${MAX_LIMIT}`);
    for (const name of ['list_tokens', 'get_rules']) expect(text(name), name).toContain(String(MAX_TEXT));
    expect(INSTRUCTIONS).toContain(String(MAX_TEXT));
    expect(INSTRUCTIONS).toContain(`${TIMEOUT_MS / 1000} seconds`);
    const limit = tools.find((t) => t.name === 'check_brand')!.inputSchema.properties!.limit as Schema & { maximum: number; default: number };
    expect([limit.maximum, limit.default]).toEqual([MAX_LIMIT, DEFAULT_LIMIT]);
  });

  it('matches the committed snapshot of tools/list; UPDATE_SNAPSHOT=1 rewrites it after a deliberate change', async () => {
    const tools = await listTools();
    if (process.env.UPDATE_SNAPSHOT) fs.writeFileSync(SNAPSHOT, `${JSON.stringify(tools, null, 2)}\n`);
    expect(fs.existsSync(SNAPSHOT), 'no snapshot: run with UPDATE_SNAPSHOT=1').toBe(true);
    expect(tools).toEqual(JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8')));
  });
});

describe('blazon-mcp documents the numbers the code enforces', () => {
  const root = path.join(import.meta.dirname, '../..');
  const files = ['mcp/README.md', 'docs/manual/20-blazon-for-agents.md'];
  it.each(files)('%s states the size cap, the limit and the timeout and the cache time', (file) => {
    const text = fs.readFileSync(path.join(root, file), 'utf8').replace(/[\u202f\u00a0]/g, ' ');
    expect(text).toContain(`${MAX_TEXT.toLocaleString('en-US').replace(/,/g, ' ')} characters`);
    expect(text).toContain(`default ${DEFAULT_LIMIT}, at most ${MAX_LIMIT}`);
    expect(text).toMatch(new RegExp(`${TIMEOUT_MS / 1000} seconds`));
    expect(text).toMatch(new RegExp(`${CACHE_MS / 1000} seconds|${['zero', 'one', 'two', 'three'][CACHE_MS / 1000]} seconds`));
  });
});
