import { describe, it, expect, afterEach } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { REPO } from '../support/paths';
import { starterProject } from '../support/project';

// Without --strict-port a busy port moves on to the next one (and says so). With it, a busy port is a wrong use of the
// command line: exit 2, one line on standard error, nothing started.

const children: ChildProcess[] = [];
const listeners: net.Server[] = [];

afterEach(async () => {
  for (const child of children.splice(0)) if (child.exitCode === null) child.kill('SIGKILL');
  await Promise.all(listeners.splice(0).map((server) => new Promise((done) => server.close(done))));
});

/** A port that something of ours is listening on. */
async function busyPort(): Promise<number> {
  const server = net.createServer();
  listeners.push(server);
  // On the address the dev server binds by default: a wildcard listener does not block a bind to localhost on macOS
  await new Promise<void>((ready) => server.listen(0, 'localhost', ready));
  return (server.address() as net.AddressInfo).port;
}

function blazon(...args: string[]) {
  const child = spawn(process.execPath, ['--import', 'tsx', path.join(REPO, 'scripts/blazon-src.ts'), ...args], {
    cwd: REPO,
    env: { ...process.env, NO_COLOR: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(child);
  const out = { stdout: '', stderr: '' };
  child.stdout!.on('data', (chunk) => (out.stdout += chunk));
  child.stderr!.on('data', (chunk) => (out.stderr += chunk));
  const exited = new Promise<number | null>((done) => child.on('exit', (code) => done(code)));
  /** Resolves once the output holds a "Local:" address, or the process ends. */
  const listening = new Promise<void>((done) => {
    const look = () => /Local:/.test(out.stdout) && done();
    child.stdout!.on('data', look);
    child.on('exit', () => done());
  });
  return { child, out, exited, listening };
}

/** A starter with a built page, so `preview` has something to serve. The starter's own config is kept, only with `outDir`: a bare config leaves the project with errors, which `blazon dev` says in its terminal. */
async function builtProject(): Promise<string> {
  const root = await starterProject();
  fs.mkdirSync(path.join(root, 'dist/site'), { recursive: true });
  fs.writeFileSync(path.join(root, 'dist/site/index.html'), '<!doctype html><title>x</title>');
  const config = path.join(root, 'blazon.config.ts');
  const text = fs.readFileSync(config, 'utf-8');
  expect(text).toContain('export default defineConfig({');
  fs.writeFileSync(config, text.replace('export default defineConfig({', "export default defineConfig({\n  outDir: 'dist/site',"));
  return root;
}

describe.each(['dev', 'preview'] as const)('blazon %s on a busy port', (command) => {
  it('moves on to the next port without --strict-port', async () => {
    const port = await busyPort();
    const root = await builtProject();
    const run = blazon(command, root, '--port', String(port));
    await run.listening;
    expect(run.child.exitCode).toBeNull();
    const shown = /Local:\s+http:\/\/localhost:(\d+)/.exec(run.out.stdout);
    expect(shown, run.out.stdout + run.out.stderr).not.toBeNull();
    expect(Number(shown![1])).not.toBe(port);
  }, 60_000);

  it('exits 2 with what happened and the fix, and starts nothing with --strict-port', async () => {
    const port = await busyPort();
    const root = await builtProject();
    const run = blazon(command, root, '--port', String(port), '--strict-port');
    expect(await run.exited).toBe(2);
    expect(run.out.stderr.trim().split('\n')).toEqual([
      `blazon ${command}: port ${port} is in use`,
      '  Pick another with --port, or leave out --strict-port to take the next free one.',
    ]);
    expect(run.out.stdout).not.toContain('Local:');
  }, 60_000);

  it('starts on a free port with --strict-port', async () => {
    const taken = await busyPort();
    const free = taken + 1 === 65536 ? taken - 1 : taken + 1;
    const root = await builtProject();
    const run = blazon(command, root, '--port', String(free), '--strict-port');
    await run.listening;
    expect(run.child.exitCode).toBeNull();
    expect(run.out.stdout).toContain(`:${free}`);
  }, 60_000);
});
