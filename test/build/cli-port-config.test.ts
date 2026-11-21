import { describe, it, expect, afterEach } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { REPO } from '../support/paths';
import { starterProject } from '../support/init-project';

// The port of `blazon dev` and `blazon preview` is the `port` in blazon.json, else 3000, and `-p` wins over both. The option
// once carried a default of 3000 of its own, so a port passed on the command line always won and the config's was never read.

const children: ChildProcess[] = [];

afterEach(() => {
  for (const child of children.splice(0)) if (child.exitCode === null) child.kill('SIGKILL');
});

/** A port nothing is listening on right now. */
async function freePort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((ready) => server.listen(0, ready));
  const { port } = server.address() as net.AddressInfo;
  await new Promise((done) => server.close(done));
  return port;
}

/** Runs a command and resolves with the port its "Local:" line names, or undefined if it ends without one. */
function listensOn(args: string[]): Promise<number | undefined> {
  const child = spawn(process.execPath, ['--import', 'tsx', path.join(REPO, 'scripts/blazon-src.ts'), ...args], {
    cwd: REPO,
    env: { ...process.env, NO_COLOR: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(child);
  return new Promise((done) => {
    let out = '';
    child.stdout!.on('data', (chunk) => {
      out += chunk;
      const found = /Local:\s+http:\/\/localhost:(\d+)\//.exec(out);
      if (found) done(Number(found[1]));
    });
    child.on('exit', () => done(undefined));
  });
}

/** A starter with a built page, so `preview` has something to serve, and `port` set in its config. */
async function projectOnPort(port: number): Promise<string> {
  const root = await starterProject();
  fs.mkdirSync(path.join(root, 'dist/site'), { recursive: true });
  fs.writeFileSync(path.join(root, 'dist/site/index.html'), '<!doctype html><title>x</title>');
  fs.writeFileSync(path.join(root, 'blazon.json'), `${JSON.stringify({ title: 'T', outDir: 'dist/site', port })}\n`);
  return root;
}

describe.each(['dev', 'preview'] as const)('blazon %s and the port in blazon.json', (command) => {
  it('listens on the config port when -p is not given', { timeout: 60_000 }, async () => {
    const configPort = await freePort();
    const root = await projectOnPort(configPort);
    expect(await listensOn([command, root, '--strict-port'])).toBe(configPort);
  });

  it('listens on -p, not the config port, when both are given', { timeout: 60_000 }, async () => {
    const configPort = await freePort();
    const flagPort = await freePort();
    expect(flagPort).not.toBe(configPort);
    const root = await projectOnPort(configPort);
    expect(await listensOn([command, root, '-p', String(flagPort), '--strict-port'])).toBe(flagPort);
  });
});
