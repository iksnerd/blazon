// Covers get_fonts, get_logo, check_brand, token path refusals, a missing blazon program, shutdown on stdin close and SIGTERM, the real stdio entry point, and the settings of the server.
// One of the server-*.test.ts files, kept small so the files run in parallel; the shared setup is in support.ts.

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { tempDir } from '../../test/support/project.js';
import { starterProject } from '../../test/support/init-project.js';
import { BlazonRunner, CACHE_MAX, childEnv, targetFrom } from '../src/blazon.js';
import { blazonFromSource, connect, fakeBlazon, installed, jsonOf, startShared, structured, textOf, TSX, loadServer } from './support.js';

describe.skipIf(!installed)('blazon-mcp', () => {
  let client: import('@modelcontextprotocol/sdk/client/index.js').Client;
  let brand: string;
  let bin: string;

  beforeAll(async () => {
    ({ client, brand, bin } = await startShared());
  });
  afterAll(async () => {
    await client?.close();
  });

  const call = (name: string, args: Record<string, unknown> = {}) => client.callTool({ name, arguments: args });

  it("get_fonts and get_logo return blazon's documents", async () => {
    expect(jsonOf(await call('get_fonts')).command).toBe('fonts');
    expect(jsonOf(await call('get_logo')).command).toBe('logo');
  });

  it('check_brand returns findings, and a failing check is still an answer', async () => {
    const result = await call('check_brand', { severity: 'error' });
    expect(result.isError).toBeFalsy();
    expect(jsonOf(result).command).toBe('check');
  });

  it.each(['--help', '-x', '.hidden', 'a b', '../x', 'color.primary; ls', ''])('refuses %j as a token path before blazon runs', async (value) => {
    const result = await call('get_token', { path: value });
    expect(result.isError).toBe(true);
  });

  it('says what is wrong when the blazon program is missing', async () => {
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
    const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');
    const [a, b] = InMemoryTransport.createLinkedPair();
    const createServer = await loadServer();
    await createServer({ bin: path.join(brand, 'no-such-blazon'), brand }).connect(b);
    const other = new Client({ name: 'test', version: '0.0.0' });
    await other.connect(a);
    const result = await other.callTool({ name: 'get_fonts', arguments: {} });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/BLAZON_BIN/);
    await other.close();
  });

  it.each(['stdin closes', 'SIGTERM'])(
    'kills a running blazon command and exits when %s',
    async (how) => {
      const dir = tempDir('blazon-mcp-stop-');
      const pidFile = path.join(dir, 'pid');
      const slow = fakeBlazon(`echo $$ > "${pidFile}"\nexec sleep 60`);
      const child = spawn(process.execPath, ['--import', TSX, path.join(import.meta.dirname, '../src/index.ts'), '--brand', brand], {
        env: { ...process.env, BLAZON_BIN: slow },
        stdio: ['pipe', 'ignore', 'ignore'],
      });
      const exited = new Promise<number | null>((resolve) => child.on('exit', (code) => resolve(code)));
      const send = (message: object) => child.stdin.write(`${JSON.stringify(message)}\n`);
      send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } } });
      send({ jsonrpc: '2.0', method: 'notifications/initialized' });
      send({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'get_fonts', arguments: {} } });
      let pid = 0;
      await vi.waitFor(
        () => {
          pid = Number(fs.readFileSync(pidFile, 'utf8'));
          expect(pid).toBeGreaterThan(0);
        },
        { timeout: 20_000, interval: 100 },
      );
      if (how === 'SIGTERM') child.kill('SIGTERM');
      else child.stdin.end();
      expect(await exited).toBe(0);
      expect(() => process.kill(pid, 0)).toThrow();
    },
    40_000,
  );

  it('serves over stdio, with the brand from --brand and the program from BLAZON_BIN', async () => {
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
    const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ['--import', TSX, path.join(import.meta.dirname, '../src/index.ts'), '--brand', brand],
      env: { ...process.env, BLAZON_BIN: bin } as Record<string, string>,
    });
    const over = new Client({ name: 'test', version: '0.0.0' });
    await over.connect(transport);
    // Over the real transport the lists must parse in the client's own schemas, which a null or a snake_case field would fail.
    expect((await over.listTools()).tools.map((t) => t.name)).toContain('list_tokens');
    expect((await over.listResources()).resources.map((r) => r.uri).sort()).toEqual(['blazon://brand', 'blazon://rules']);
    expect((await over.listPrompts()).prompts.map((p) => p.name)).toEqual(['build_page']);
    expect(over.getInstructions()).toMatch(/Order: check_brand/);
    const result = await over.callTool({ name: 'get_token', arguments: { path: 'text.primary' } });
    expect(jsonOf(result).token.path).toBe('text.primary');
    const list = await over.callTool({ name: 'list_tokens', arguments: { group: 'text', type: 'color' } });
    expect(structured(list).tokens.map((t: { path: string }) => t.path)).toContain('text.primary');
    await over.close();
  });
});

describe('blazon-mcp settings', () => {
  const cwd = '/work';
  it.each([
    [['--brand', 'b'], {}, '/work/b'],
    [['--brand=b'], {}, '/work/b'],
    [['--brand', '/abs/b'], {}, '/abs/b'],
    [[], { BLAZON_BRAND: 'e' }, '/work/e'],
    [['--brand', 'b'], { BLAZON_BRAND: 'e' }, '/work/b'],
    [[], {}, '/work'],
  ])('reads the brand folder from %j with env %j', (argv, env, expected) => {
    expect(targetFrom(argv, env, cwd).brand).toBe(expected);
  });

  it.each([[['--brand']], [['--brand', '--other']], [['--brand=--x']], [['--brand=']], [['--nope']], [['stray']]])('refuses %j', (argv) => {
    expect(() => targetFrom(argv, {}, cwd)).toThrow();
  });

  it('takes the blazon program from BLAZON_BIN', () => {
    expect(targetFrom([], { BLAZON_BIN: '/x/blazon' }, cwd).bin).toBe('/x/blazon');
    expect(targetFrom([], {}, cwd).bin).toBe('blazon');
  });

  it('passes an allowlist of the environment', () => {
    const env = childEnv({
      PATH: '/bin',
      HOME: '/h',
      LC_ALL: 'C',
      NODE_OPTIONS: '--x',
      NODE_AUTH_TOKEN: 'n',
      BLAZON_BIN: 'f',
      SECRET: 's',
      GITHUB_TOKEN: 't',
      AWS_ACCESS_KEY_ID: 'a',
    });
    expect(Object.keys(env).sort()).toEqual(['BLAZON_BIN', 'HOME', 'LC_ALL', 'NO_COLOR', 'PATH']);
    expect(env.NODE_AUTH_TOKEN).toBeUndefined();
  });

  it('hands the blazon child BLAZON_ALLOW_DIRS exactly as the operator set it in the server environment, and nothing when they did not', async () => {
    const dir = tempDir('blazon-mcp-allow-');
    const log = path.join(dir, 'seen');
    const bin = fakeBlazon(`printf '%s' "\${BLAZON_ALLOW_DIRS-unset}" > "${log}"\necho '{"kind":"brand","path":""}'`);
    const before = process.env.BLAZON_ALLOW_DIRS;
    try {
      process.env.BLAZON_ALLOW_DIRS = `/shared/a${path.delimiter}/shared/b`;
      await new BlazonRunner({ bin, brand: process.cwd(), cacheMs: 0 }).run(['get', 'x']);
      expect(fs.readFileSync(log, 'utf8')).toBe(`/shared/a${path.delimiter}/shared/b`);
      delete process.env.BLAZON_ALLOW_DIRS;
      await new BlazonRunner({ bin, brand: process.cwd(), cacheMs: 0 }).run(['get', 'x']);
      expect(fs.readFileSync(log, 'utf8')).toBe('unset');
    } finally {
      if (before === undefined) delete process.env.BLAZON_ALLOW_DIRS;
      else process.env.BLAZON_ALLOW_DIRS = before;
    }
  });

  it('keeps at most CACHE_MAX answers, the oldest out first', async () => {
    const log = path.join(tempDir('blazon-mcp-cache-'), 'runs');
    const runner = new BlazonRunner({ bin: fakeBlazon(`echo run >> "${log}"\necho '{"kind":"brand","path":""}'`), brand: process.cwd(), cacheMs: 600_000, maxParallel: 4 });
    const runs = () => fs.readFileSync(log, 'utf8').split('\n').filter(Boolean).length;
    for (let i = 0; i <= CACHE_MAX; i++) await runner.run([`get`, `a${i}`]);
    expect(runs()).toBe(CACHE_MAX + 1);
    await runner.run(['get', `a${CACHE_MAX}`]);
    expect(runs()).toBe(CACHE_MAX + 1);
    await runner.run(['get', 'a0']);
    expect(runs()).toBe(CACHE_MAX + 2);
  });

  it('cannot be made to change folder by a value that starts with a dash', async () => {
    const dump = path.join(tempDir('blazon-mcp-argv-'), 'argv');
    const other = await connect({ bin: fakeBlazon(`printf '%s\\n' "$@" > "${dump}"\necho '{"allowed":true,"reason":"x"}'`), brand: process.cwd() });
    const result = await other.callTool({ name: 'can_use', arguments: { fg: 'a', bg: 'b', theme: '--cwd=/other/dir' } }).catch(() => ({ isError: true }));
    expect((result as { isError?: boolean }).isError).toBe(true);
    expect(fs.existsSync(dump)).toBe(false);
    await other.close();
  });

  it('runs the real CLI on the brand folder when a value that starts with a dash gets past the schema', async () => {
    const { commandFor, operationNamed } = await import('../src/operations.js');
    const runner = new BlazonRunner({ bin: blazonFromSource(), brand: await starterProject() });
    const { argv, options } = commandFor(operationNamed('can_use')!, { fg: 'text.primary', bg: 'surface.canvas', theme: '--cwd=/does/not/exist' });
    const error = await runner.run(argv, options).catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/^no theme /);
  }, 60_000);
});
