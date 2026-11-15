import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer, type ViteDevServer } from 'vite';
import { loadConfig } from '../../../src/core/config/index.js';
import { LOCK_FILE, recordPin } from '../../../src/plugins/pins/lock.js';
import { createBlazonVitePlugin } from '../../../src/server/plugin.js';
import type { Finding } from '../../../src/types/index.js';
import { answer, cleanup, dirs, install, script } from '../support/fixtures.js';
import { initStarter } from '../../support/project';

// blazon dev runs the check plugins (RFC 0002 of blazon, section 2). The viewer gets the core's findings at once, as it
// always did, and a second update with the plugins' findings when they have finished. A real Vite dev server on a real
// project, a real fixture plugin, and a websocket client that sees what an open page sees.

const FOUND = { code: 'acme.a/x', severity: 'warning', path: 'brand.primary', message: 'found' };

let server: ViteDevServer | undefined;
const sockets: WebSocket[] = [];
afterEach(async () => {
  sockets.splice(0).forEach((socket) => socket.close());
  await server?.close();
  server = undefined;
  vi.restoreAllMocks();
  cleanup();
});

const until = async <T>(read: () => T | undefined | false, what: string, ms = 15_000): Promise<T> => {
  const end = Date.now() + ms;
  for (;;) {
    const value = read();
    if (value) return value;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
};

/** Resolves once no update has arrived for `quietMs`, so a count taken after it is of everything the change caused, not of what came by a fixed time. */
const quiet = async (updates: unknown[], quietMs = 1500, ms = 30_000): Promise<void> => {
  const end = Date.now() + ms;
  let seen = updates.length;
  let quietFrom = Date.now();
  while (Date.now() - quietFrom < quietMs) {
    if (Date.now() > end) throw new Error('the updates did not stop arriving');
    await new Promise((resolve) => setTimeout(resolve, 50));
    if (updates.length !== seen) {
      seen = updates.length;
      quietFrom = Date.now();
    }
  }
};

interface Dev {
  root: string;
  url: (pathname: string) => string;
  updates: { findings: Finding[] }[];
  /** The findings in the data an open page would be given if it loaded now */
  page: () => Promise<Finding[]>;
  change: () => void;
  /** Writes every page and token file of the project in one go, as a `git checkout` does; returns how many files it wrote */
  burst: () => number;
}

/** The starter with these plugins, the dev server on it, and a client that records every `blazon:update`. */
async function dev(plugins: Parameters<typeof install>[0]): Promise<Dev> {
  const installed = install(plugins);
  const root = installed.cwd;
  await initStarter(root, { plugins: Object.entries(plugins).map(([name, plugin]) => ({ name, options: plugin.options })) });
  const viewer = path.join(root, 'viewer');
  fs.mkdirSync(viewer);
  fs.writeFileSync(path.join(viewer, 'index.html'), '<!DOCTYPE html><html><head><title>x</title></head><body></body></html>');
  server = await createServer({ configFile: false, root: viewer, logLevel: 'silent', server: { port: 0, strictPort: false }, plugins: [createBlazonVitePlugin(await loadConfig(root), root)] });
  await server.listen();
  const base = server.resolvedUrls!.local[0]!;
  const url = (pathname: string) => new URL(pathname, base).href;

  const socket = new WebSocket(url('/').replace(/^http/, 'ws'), 'vite-hmr');
  sockets.push(socket);
  const updates: Dev['updates'] = [];
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    if (message.type === 'custom' && message.event === 'blazon:update') updates.push(message.data);
  });
  await new Promise((resolve) => socket.addEventListener('open', resolve, { once: true }));

  const page = async (): Promise<Finding[]> => {
    const html = await (await fetch(url('/'))).text();
    return JSON.parse(html.match(/<script id="blazon-data" type="application\/json">(.*?)<\/script>/s)![1]!).findings;
  };
  let n = 0;
  const colors = path.join(root, 'tokens/colors.json');
  const change = () => fs.writeFileSync(colors, fs.readFileSync(colors, 'utf-8').replace(/#[0-9a-f]{6}/, `#${(++n).toString(16).padStart(6, '0')}`));
  // The files `blazon init` wrote a moment ago can still reach the watcher as add events, one for each file, when the machine is busy.
  // Wait for a quiet stretch and start counting after it, so what a test counts is what its own change caused.
  const began = Date.now();
  let seen = -1;
  let quietFrom = Date.now();
  while (Date.now() - quietFrom < 700 && Date.now() - began < 25_000) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (updates.length !== seen) {
      seen = updates.length;
      quietFrom = Date.now();
    }
  }
  updates.length = 0;
  const burst = () => {
    let written = 0;
    for (const folder of ['docs', 'tokens'])
      for (const entry of fs.readdirSync(path.join(root, folder), { withFileTypes: true })) {
        // The files directly in the folder; a folder in it (tokens/theme) is left alone
        if (!entry.isFile()) continue;
        fs.appendFileSync(path.join(root, folder, entry.name), '\n');
        written += 1;
      }
    return written;
  };
  return { root, url, updates, page, change, burst };
}
const has = (findings: Finding[], code: string, containing = '') => findings.some((f) => f.code === code && f.message.includes(containing));

describe('blazon dev with check plugins', () => {
  it('gives a page that loads after the first run the plugins\' findings, after the core\'s', async () => {
    const d = await dev({ 'acme.a': { script: script({ v: 2, roles: ['check'] }, answer([FOUND])) } });
    const findings = await untilAsync(() => d.page().then((f) => (has(f, 'acme.a/x') ? f : undefined)));
    expect(findings.at(-1)).toEqual(FOUND);
    expect(findings.findIndex((f) => f.code === 'acme.a/x')).toBe(findings.length - 1);
  }, 60_000);

  it('sends the core\'s findings at once and the plugins\' in a second update, for one change', async () => {
    const d = await dev({ 'acme.a': { script: script({ v: 2, roles: ['check'] }, `sleep 0.5\n${answer([FOUND])}`) } });
    await untilAsync(() => d.page().then((f) => has(f, 'acme.a/x') || undefined));
    d.updates.length = 0;
    d.change();
    // A save can reach the watcher as more than one event, so there may be several updates with the core's findings alone.
    // What holds: the first update has none of the plugin's, one that follows has them, and it begins with the core's.
    const withPlugin = await until(() => d.updates.find((update) => has(update.findings, 'acme.a/x')), 'the update with the plugin findings');
    const first = d.updates[0]!;
    expect(has(first.findings, 'acme.a/x')).toBe(false);
    expect(d.updates.indexOf(withPlugin)).toBeGreaterThan(0);
    expect(withPlugin.findings.slice(0, first.findings.length)).toEqual(first.findings);
  }, 60_000);

  it('sends exactly one update for a change when the project allows no plugin', async () => {
    const d = await dev({});
    d.change();
    await until(() => d.updates.length >= 1, 'an update');
    // Not a fixed wait: a save can reach the watcher as two events further apart than the burst pause when the machine is busy, so the
    // count is taken once the updates have stopped arriving, and what it says is that the change caused one.
    await quiet(d.updates);
    expect(d.updates).toHaveLength(1);
  }, 60_000);

  it('sends one update for a burst of changes to many files, as a git checkout makes', async () => {
    const d = await dev({});
    const written = d.burst();
    expect(written).toBeGreaterThan(10);
    await until(() => d.updates.length >= 1, 'an update');
    await quiet(d.updates);
    // Each file's event used to compile the brand and send an update of its own, so this was one for every file written. The events of one
    // batch of writes reach the watcher together and are one update; a slow machine may deliver them in two or three groups.
    expect(d.updates.length).toBeLessThanOrEqual(3);
  }, 60_000);

  it('still sends the update for a single change promptly: the pause for a burst is 75 ms and not seconds', async () => {
    const d = await dev({});
    // The time from a change to its update is the burst pause plus whatever the machine adds. Load adds to one reading and not to
    // all of them, so the test takes the quickest of three, each started from quiet, and asks that to be under 2 s: a pause of seconds
    // makes every reading slow, and a busy machine does not.
    const latencies: number[] = [];
    for (let i = 0; i < 3; i++) {
      await quiet(d.updates, 500);
      d.updates.length = 0;
      const began = Date.now();
      d.change();
      await until(() => d.updates.length >= 1, 'an update', 20_000);
      latencies.push(Date.now() - began);
    }
    expect(Math.min(...latencies)).toBeLessThan(2000);
  }, 120_000);

  it('shows a plugin that breaks as a plugin-failed finding, keeps serving, and rests the plugin', async () => {
    const log = path.join(os.tmpdir(), `blazon-dev-server-${process.pid}-${Date.now()}`);
    dirs.push(log);
    const d = await dev({ 'acme.a': { script: script({ v: 2, roles: ['check'] }, `echo x >> ${log}\nexit 3`) } });
    await untilAsync(() => d.page().then((f) => has(f, 'plugin-failed', 'exited with 3') || undefined));
    expect((await fetch(d.url('/'))).status).toBe(200);
    d.updates.length = 0;
    d.change();
    const update = await until(() => d.updates.find((u) => has(u.findings, 'plugin-failed', 'stopped after a break')), 'a resting update');
    expect(update.findings.find((f) => f.code === 'plugin-failed')).toMatchObject({ severity: 'error', path: 'acme.a' });
    expect(fs.readFileSync(log, 'utf-8').trim().split('\n')).toHaveLength(1);
  }, 60_000);

  it('runs once for a burst of changes: a result made stale is not sent', async () => {
    const log = path.join(os.tmpdir(), `blazon-dev-burst-${process.pid}-${Date.now()}`);
    dirs.push(log);
    const d = await dev({ 'acme.a': { script: script({ v: 2, roles: ['check'] }, `echo x >> ${log}\nsleep 0.6\n${answer([FOUND])}`) } });
    await untilAsync(() => d.page().then((f) => has(f, 'acme.a/x') || undefined));
    const before = fs.readFileSync(log, 'utf-8').trim().split('\n').length;
    d.updates.length = 0;
    d.change();
    await new Promise((resolve) => setTimeout(resolve, 250));
    d.change();
    await until(() => d.updates.filter((u) => has(u.findings, 'acme.a/x')).length >= 1, 'the plugin update');
    await quiet(d.updates);
    expect(d.updates.filter((u) => has(u.findings, 'acme.a/x'))).toHaveLength(1);
    expect(fs.readFileSync(log, 'utf-8').trim().split('\n')).toHaveLength(before + 2);
  }, 60_000);

  it('does not send the result of a check that was running when the plugins were switched off', async () => {
    const d = await dev({ 'acme.a': { script: script({ v: 2, roles: ['check'] }, `sleep 1\n${answer([FOUND])}`) } });
    await untilAsync(() => d.page().then((f) => has(f, 'acme.a/x') || undefined));
    d.updates.length = 0;
    d.change();
    await new Promise((resolve) => setTimeout(resolve, 300));
    // The project stops allowing the plugin while its check is still running
    const config = path.join(d.root, 'blazon.config.ts');
    fs.writeFileSync(config, fs.readFileSync(config, 'utf-8').replace(/\n {2}plugins: \[[^\n]*\],/, ''));
    await until(() => d.updates.length >= 2, 'the updates for the change and for the new config');
    await quiet(d.updates, 2000);
    // The running check ended after the new config's update, and its answer, which has the old findings, must not follow it
    expect(d.updates.some((update) => has(update.findings, 'acme.a/x'))).toBe(false);
    expect(has(await d.page(), 'acme.a/x')).toBe(false);
  }, 60_000);

  it('says a failure once while it reads the same', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const d = await dev({ 'acme.a': { script: script({ v: 2, roles: ['check'] }, 'echo "no rules"\nexit 2') } });
    await until(() => err.mock.calls.some(([line]) => String(line).includes('could not answer: no rules')), 'the first line');
    for (let i = 0; i < 2; i++) {
      d.updates.length = 0;
      d.change();
      await until(() => d.updates.some((u) => has(u.findings, 'plugin-failed', 'no rules')), 'an update after a change');
    }
    expect(err.mock.calls.filter(([line]) => String(line).includes('could not answer: no rules'))).toHaveLength(1);
  }, 60_000);

  it('picks up a change to the plugin\'s options in blazon.config.ts without a restart', async () => {
    const copy = path.join(os.tmpdir(), `blazon-dev-options-${process.pid}-${Date.now()}`);
    dirs.push(copy);
    process.env.REQUEST_COPY = copy;
    try {
      const d = await dev({ 'acme.a': { script: script({ v: 2, roles: ['check'], env: ['REQUEST_COPY'] }, answer([])), options: { headingFont: 'Inter' } } });
      // The plugin is writing the file while this reads it, so a half-written copy is not an answer yet
      const font = (): string | undefined => {
        try {
          return JSON.parse(fs.readFileSync(copy, 'utf-8')).options.headingFont;
        } catch {
          return undefined;
        }
      };
      await until(() => font() === 'Inter', 'the first request');
      const configFile = path.join(d.root, 'blazon.config.ts');
      fs.writeFileSync(configFile, fs.readFileSync(configFile, 'utf-8').replace('Inter', 'Lora'));
      await until(() => font() === 'Lora', 'a request with the new options');
    } finally {
      delete process.env.REQUEST_COPY;
    }
  }, 60_000);

  it('picks up a change to the lock without a restart', async () => {
    const d = await dev({ 'acme.a': { script: script({ v: 2, roles: ['check'] }, answer([FOUND])) } });
    await untilAsync(() => d.page().then((f) => has(f, 'acme.a/x') || undefined));
    d.updates.length = 0;
    fs.writeFileSync(path.join(d.root, LOCK_FILE), JSON.stringify({ v: 1, plugins: {} }));
    await until(() => d.updates.find((u) => has(u.findings, 'plugin-failed', 'is not pinned')), 'an update that says it is not pinned');
    recordPin(d.root, 'acme.a', path.join(d.root, 'plugins', 'acme.a'));
    await until(() => d.updates.find((u) => has(u.findings, 'acme.a/x')), 'an update with the finding back');
  }, 60_000);

  it('picks up blazon.lock without a restart: a pin that is not this blazon, a pin that is broken, no pin', async () => {
    const d = await dev({});
    const pin = path.join(d.root, 'blazon.lock');
    expect(has(await d.page(), 'blazon-pin-mismatch')).toBe(false);
    fs.writeFileSync(pin, JSON.stringify({ v: 1, commit: 'a'.repeat(40) }));
    await until(() => d.updates.find((u) => has(u.findings, 'blazon-pin-mismatch', 'pinned to blazon aaaaaaaaaaaa')), 'an update that says the pin is another blazon');
    expect(has(await d.page(), 'blazon-pin-mismatch')).toBe(true);
    fs.writeFileSync(pin, '{ "v": 1, "commit": "nope" }');
    await until(() => d.updates.find((u) => has(u.findings, 'blazon-pin-invalid', 'commit must be')), 'an update that says the pin is invalid');
    d.updates.length = 0;
    fs.rmSync(pin);
    await until(() => d.updates.find((u) => !has(u.findings, 'blazon-pin-mismatch') && !has(u.findings, 'blazon-pin-invalid')), 'an update with the pin gone');
    expect(has(await d.page(), 'blazon-pin-invalid')).toBe(false);
  }, 60_000);

  it('says on the terminal what the plugins found, once per change of result, and why one failed', async () => {
    const out = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const d = await dev({
      'acme.a': { script: script({ v: 2, roles: ['check'] }, answer([FOUND, { ...FOUND, severity: 'error' }])) },
      'acme.b': { script: script({ v: 2, roles: ['check'] }, 'exit 3') },
    });
    await until(() => out.mock.calls.some(([line]) => String(line).includes('[blazon] plugins:')), 'the summary');
    const lines = out.mock.calls.map(([line]) => String(line)).filter((line) => line.includes('[blazon] plugins:'));
    expect(lines).toEqual(['[blazon] plugins: 2 errors, 1 warning']);
    expect(err.mock.calls.map(([line]) => String(line))).toContain('[blazon] acme.b: exited with 3');
    d.change();
    await until(() => d.updates.length >= 2, 'the update after a change');
    await quiet(d.updates, 500);
    // The same result prints no second summary
    expect(out.mock.calls.map(([line]) => String(line)).filter((line) => line.includes('[blazon] plugins:'))).toHaveLength(1);
    // A failure that now reads differently is said again: the plugin is resting
    await until(() => err.mock.calls.some(([line]) => String(line).startsWith('[blazon] acme.b: stopped after a break')), 'the resting line');
  }, 60_000);
});

async function untilAsync<T>(read: () => Promise<T | undefined>, ms = 15_000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const value = await read();
    if (value) return value;
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
