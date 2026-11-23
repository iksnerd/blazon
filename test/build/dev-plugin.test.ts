import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createServer, type ViteDevServer } from 'vite';
import { starterProject } from '../support/init-project';
import { loadConfig } from '../../src/core/config/index.js';
import { mcpServerName } from '../../src/core/mcp-config.js';
import { createBlazonVitePlugin } from '../../src/server/plugin.js';

describe('blazon dev: the Vite plugin', () => {
  let project: string;
  let server: ViteDevServer;

  beforeAll(async () => {
    project = await starterProject();
    const viewer = path.join(project, 'viewer');
    fs.mkdirSync(viewer);
    fs.writeFileSync(path.join(viewer, 'index.html'), '<!DOCTYPE html><html><head><title>x</title></head><body></body></html>');

    server = await createServer({
      configFile: false,
      root: viewer,
      logLevel: 'silent',
      server: { port: 0, strictPort: false },
      plugins: [createBlazonVitePlugin(await loadConfig(project), project)],
    });
    await server.listen();
  }, 30_000);

  afterAll(async () => {
    await server.close();
  });

  function url(pathname: string): string {
    return new URL(pathname, server.resolvedUrls!.local[0]).href;
  }

  it('serves index.html with the brand book data and a live-update bridge', async () => {
    const html = await (await fetch(url('/'))).text();

    const json = html.match(/<script id="blazon-data" type="application\/json">(.*?)<\/script>/s)?.[1];
    expect(JSON.parse(json ?? 'null').tokens.items.length).toBeGreaterThan(10);
    // Vite turns the inline bridge into a module it serves, so it gets import.meta.hot
    expect(html).toMatch(/<script type="module" src="\/index\.html\?html-proxy&(amp;)?index=\d\.js">/);
  });

  it('serves the MCP config of each client for this project folder', async () => {
    const answer = await fetch(url('/__blazon/mcp-config'));
    expect(answer.headers.get('content-type')).toContain('application/json');
    const body = await answer.json();
    expect(body).toMatchObject({ format: 'blazon-mcp-config', version: 1, brand: path.resolve(project) });
    expect(body.clients.map((c: { client: string }) => c.client)).toEqual(['claude-code', 'claude-desktop', 'cursor', 'vscode']);
    expect(JSON.stringify(body.clients)).toContain(path.resolve(project));
    // the command is node and the server file of this blazon, never the npx form of a package that is not on npm
    expect(JSON.stringify(body.clients)).not.toMatch(/npx|blazon-mcp@|not published/);
    expect(JSON.stringify(body.clients)).toContain('mcp/dist/index.js');
    // the server is registered under the brand's name, as `blazon mcp --print-config` does, and not as blazon
    const name = mcpServerName((await loadConfig(project)).title);
    expect(name).not.toBe('blazon');
    const claude = body.clients.find((c: { client: string }) => c.client === 'claude-code');
    const registered = JSON.parse(claude.snippets.find((snippet: { kind: string }) => snippet.kind === 'json').text);
    expect(Object.keys(registered.mcpServers)).toEqual([name]);
  });

  it('pushes fresh data to open pages when a token file changes', async () => {
    const socket = new WebSocket(url('/').replace(/^http/, 'ws'), 'vite-hmr');
    await new Promise((resolve) => socket.addEventListener('open', resolve, { once: true }));

    const update = new Promise<{ tokens: { items: { path: string; value: string }[] } }>((resolve) => {
      socket.addEventListener('message', (event) => {
        const message = JSON.parse(String(event.data));
        if (message.type === 'custom' && message.event === 'blazon:update') resolve(message.data);
      });
    });

    const colors = path.join(project, 'tokens/colors.json');
    fs.writeFileSync(colors, fs.readFileSync(colors, 'utf-8').replace('#FF5A1F', '#00aa55'));

    const data = await update;
    socket.close();
    expect(data.tokens.items.find((token) => token.path === 'interactive.primary')?.value).toBe('#00aa55');
  }, 15_000);
});

describe('blazon dev: the resolver and the files it names', () => {
  let project: string;
  let server: ViteDevServer;
  let socket: WebSocket;
  const updates: { tokens: { items: { path: string; value: string }[] } }[] = [];

  const resolver = (...refs: string[]) =>
    JSON.stringify({
      version: '2025.10',
      resolutionOrder: [{ $ref: '#/sets/base' }],
      sets: { base: { sources: refs.map((ref) => ({ $ref: ref })) } },
    });
  const extra = (value: string) => JSON.stringify({ brand: { extra: { $type: 'color', $value: value } } });
  const valueOf = (data: (typeof updates)[number]) => data.tokens.items.find((token) => token.path === 'brand.extra')?.value;
  const nextUpdate = async (wanted: (data: (typeof updates)[number]) => boolean): Promise<(typeof updates)[number]> => {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const found = updates.find(wanted);
      if (found) return found;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error('no live update arrived');
  };
  // The server adds a file the resolver has just started to name to its watcher before it sends that update, but the watcher takes
  // the file's first reading a moment later, and a write before it is not an event. So a write to such a file is repeated until its
  // update arrives; each write has the same content, so the repeats change nothing but the file's time.
  const writeUntilSeen = async (file: string, content: string, wanted: (data: (typeof updates)[number]) => boolean) => {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      fs.writeFileSync(file, content);
      const end = Date.now() + 500;
      while (Date.now() < end) {
        const found = updates.find(wanted);
        if (found) return found;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
    throw new Error('no live update arrived');
  };
  const quiet = async () => {
    updates.length = 0;
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return updates.length;
  };

  beforeAll(async () => {
    project = await starterProject();
    fs.mkdirSync(path.join(project, 'extras'));
    fs.writeFileSync(path.join(project, 'extras/more.json'), extra('#111111'));
    fs.writeFileSync(path.join(project, 'extras/other.json'), extra('#222222'));
    fs.writeFileSync(path.join(project, 'blazon.resolver.json'), resolver('tokens/colors.json', 'extras/more.json'));
    const viewer = path.join(project, 'viewer');
    fs.mkdirSync(viewer);
    fs.writeFileSync(path.join(viewer, 'index.html'), '<!DOCTYPE html><html><head><title>x</title></head><body></body></html>');

    server = await createServer({
      configFile: false,
      root: viewer,
      logLevel: 'silent',
      server: { port: 0, strictPort: false },
      plugins: [createBlazonVitePlugin(await loadConfig(project), project)],
    });
    await server.listen();
    socket = new WebSocket(new URL('/', server.resolvedUrls!.local[0]).href.replace(/^http/, 'ws'), 'vite-hmr');
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      if (message.type === 'custom' && message.event === 'blazon:update') updates.push(message.data);
    });
    await new Promise((resolve) => socket.addEventListener('open', resolve, { once: true }));
  }, 30_000);

  afterAll(async () => {
    socket.close();
    await server.close();
  });

  it('sends an update when the resolver document changes', async () => {
    fs.writeFileSync(path.join(project, 'blazon.resolver.json'), resolver('tokens/colors.json', 'extras/more.json', 'extras/other.json'));
    // other.json comes last and wins brand.extra
    expect(valueOf(await nextUpdate((d) => valueOf(d) === '#222222'))).toBe('#222222');
  }, 15_000);

  it('sends an update when a file the resolver names changes, outside the tokens folder', async () => {
    // other.json became a watched file with the previous test's update, which may not be watching it yet
    const seen = await writeUntilSeen(path.join(project, 'extras/other.json'), extra('#333333'), (d) => valueOf(d) === '#333333');
    expect(valueOf(seen)).toBe('#333333');
  }, 15_000);

  it('sends nothing for a file the resolver does not name', async () => {
    fs.writeFileSync(path.join(project, 'extras/unrelated.json'), extra('#444444'));
    expect(await quiet()).toBe(0);
  }, 15_000);

  it('stops watching a file once the resolver no longer names it', async () => {
    fs.writeFileSync(path.join(project, 'blazon.resolver.json'), resolver('tokens/colors.json', 'extras/more.json'));
    await nextUpdate((d) => valueOf(d) === '#111111');
    await quiet();
    fs.writeFileSync(path.join(project, 'extras/other.json'), extra('#555555'));
    expect(await quiet()).toBe(0);
  }, 15_000);

  it('survives a resolver that does not parse, and reports it', async () => {
    fs.writeFileSync(path.join(project, 'blazon.resolver.json'), '{ not json');
    const data = await nextUpdate(() => true);
    expect((data as unknown as { findings: { code: string }[] }).findings.some((f) => f.code === 'resolver-invalid')).toBe(true);
    fs.writeFileSync(path.join(project, 'blazon.resolver.json'), resolver('tokens/colors.json', 'extras/more.json'));
    expect(valueOf(await nextUpdate((d) => valueOf(d) === '#111111'))).toBe('#111111');
  }, 15_000);
});

describe('blazon dev: a config that moves the tokens folder', () => {
  it('keeps live updates working in the new folder, which the watcher must start to watch', async () => {
    const project = await starterProject();
    // tokensDir is what a project without a resolver document reads; the starter's resolver names its files itself, so it goes
    fs.rmSync(path.join(project, 'blazon.resolver.json'));
    fs.rmSync(path.join(project, 'tokens/theme'), { recursive: true });
    const viewer = path.join(project, 'viewer');
    fs.mkdirSync(viewer);
    fs.writeFileSync(path.join(viewer, 'index.html'), '<!DOCTYPE html><html><head><title>x</title></head><body></body></html>');
    const server = await createServer({
      configFile: false,
      root: viewer,
      logLevel: 'silent',
      server: { port: 0, strictPort: false },
      plugins: [createBlazonVitePlugin(await loadConfig(project), project)],
    });
    await server.listen();
    const socket = new WebSocket(new URL('/', server.resolvedUrls!.local[0]).href.replace(/^http/, 'ws'), 'vite-hmr');
    const updates: { tokens: { items: { path: string; value: string }[] } }[] = [];
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      if (message.type === 'custom' && message.event === 'blazon:update') updates.push(message.data);
    });
    await new Promise((resolve) => socket.addEventListener('open', resolve, { once: true }));
    const primary = (data: (typeof updates)[number]) => data.tokens.items.find((token) => token.path === 'interactive.primary')?.value;
    const waitFor = async (value: string) => {
      const deadline = Date.now() + 10_000;
      while (Date.now() < deadline) {
        if (updates.some((data) => primary(data) === value)) return true;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      return false;
    };

    // A watcher that is slow to start on a folder (a loaded machine) is made slow here, so the order does not depend on the load
    const addToWatcher = server.watcher.add.bind(server.watcher);
    server.watcher.add = (paths) => {
      setTimeout(() => addToWatcher(paths), 400);
      return server.watcher;
    };
    const watching = (folder: string) => Object.keys(server.watcher.getWatched()).some((dir) => dir.endsWith(folder));

    try {
      // The tokens move to another folder, and the config says so
      fs.cpSync(path.join(project, 'tokens'), path.join(project, 'moved-tokens'), { recursive: true });
      const config = path.join(project, 'blazon.json');
      fs.writeFileSync(config, fs.readFileSync(config, 'utf-8').replace('"tokensDir": "./tokens"', '"tokensDir": "./moved-tokens"'));
      const moved = path.join(project, 'moved-tokens/colors.json');
      fs.writeFileSync(moved, fs.readFileSync(moved, 'utf-8').replace('#FF5A1F', '#112233'));
      expect(await waitFor('#112233')).toBe(true);
      // The page is told only once the new folder is watched: an edit made as soon as it has the update is not lost
      expect(watching('moved-tokens')).toBe(true);

      // An edit in the new folder, later, must still reach the page
      fs.writeFileSync(moved, fs.readFileSync(moved, 'utf-8').replace('#112233', '#445566'));
      expect(await waitFor('#445566')).toBe(true);
    } finally {
      socket.close();
      await server.close();
    }
  }, 45_000);
});

describe('blazon dev: a config that does not load', () => {
  it('still sends an update, compiled with the last good config', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const project = await starterProject();
    const viewer = path.join(project, 'viewer');
    fs.mkdirSync(viewer);
    fs.writeFileSync(path.join(viewer, 'index.html'), '<!DOCTYPE html><html><head><title>x</title></head><body></body></html>');
    const server = await createServer({
      configFile: false,
      root: viewer,
      logLevel: 'silent',
      server: { port: 0, strictPort: false },
      plugins: [createBlazonVitePlugin(await loadConfig(project), project)],
    });
    await server.listen();
    const socket = new WebSocket(new URL('/', server.resolvedUrls!.local[0]).href.replace(/^http/, 'ws'), 'vite-hmr');
    let updates = 0;
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      if (message.type === 'custom' && message.event === 'blazon:update') updates++;
    });
    await new Promise((resolve) => socket.addEventListener('open', resolve, { once: true }));
    try {
      fs.writeFileSync(path.join(project, 'blazon.json'), '{{{ not a config');
      const deadline = Date.now() + 10_000;
      while (updates === 0 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 50));
      expect(updates).toBeGreaterThan(0);
    } finally {
      socket.close();
      await server.close();
      vi.restoreAllMocks();
    }
  }, 30_000);
});
