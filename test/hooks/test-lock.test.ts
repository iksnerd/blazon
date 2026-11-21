import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync, spawn, spawnSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { BASE, git, hookEnv, repo, stage, write } from '../support/hook-commit';
import * as pushing from '../support/hook-push';
import { tempDir } from '../support/project';

// Test steps run one gate at a time for each repository, across worktrees and sessions: a lock directory in the common git folder
// (lock_dir in .githooks/lib.sh). The stub below stands for the suite: it logs its start and end with the time and sleeps. The cheap steps
// are stubs too, so each hook takes about a second beyond the stub.

const STUB = [
  "const fs = require('fs');",
  "const id = process.env.STUB_ID || '?';",
  'const log = (what) => fs.appendFileSync(process.env.STUB_LOG, what + " " + id + " " + Date.now() + "\\n");',
  "log('start');",
  'if (process.env.STUB_PID_FILE) fs.writeFileSync(process.env.STUB_PID_FILE, String(process.pid));',
  "setTimeout(() => { log('end'); process.exit(Number(process.env.STUB_EXIT || 0)); }, Number(process.env.STUB_MS || 0));",
].join('\n');

const manifest = () => {
  const base = JSON.parse(BASE['package.json']!);
  return JSON.stringify({ ...base, scripts: { ...base.scripts, typecheck: 'true', lint: 'true', 'test:related': 'node stub.js' } });
};

const KNOBS = { BLAZON_HOOK_LOCK_POLL_SECONDS: '1', BLAZON_HOOK_LOCK_NOTICE_SECONDS: '2' };

const logFile = () => path.join(tempDir('blazon-lock-log-'), 'log');
const events = (log: string) =>
  (fs.existsSync(log) ? fs.readFileSync(log, 'utf-8').trim().split('\n').filter(Boolean) : []).map((line) => {
    const [what, id, at] = line.split(' ');
    return { what: what!, id: id!, at: Number(at) };
  });
const order = (log: string) => events(log).map((e) => `${e.what} ${e.id}`);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const until = async (what: string, test: () => boolean, ms = 30_000) => {
  const t0 = Date.now();
  while (!test()) {
    if (Date.now() - t0 > ms) throw new Error(`timed out waiting for ${what}`);
    await sleep(50);
  }
};

const commonDir = (dir: string) => path.resolve(dir, git(dir, ['rev-parse', '--git-common-dir']).stdout.trim());
const lockPath = (dir: string) => path.join(commonDir(dir), 'blazon-hook-test.lock');
const ownerPid = (dir: string) => {
  const file = path.join(lockPath(dir), 'owner');
  return fs.existsSync(file) ? Number(/^pid=(\d+)$/m.exec(fs.readFileSync(file, 'utf-8'))?.[1]) : 0;
};

/** A repository with stub suites, and a second worktree of it (another session of the same checkout). */
function twoWorktrees() {
  const main = repo({ 'package.json': manifest(), 'stub.js': STUB });
  const other = tempDir('blazon-wt-');
  fs.rmSync(other, { recursive: true });
  const added = git(main, ['worktree', 'add', '-q', '-b', 'other', other]);
  expect(added.status, added.stderr).toBe(0);
  fs.symlinkSync(path.join(main, 'node_modules'), path.join(other, 'node_modules'));
  return { main, other };
}

interface Gate {
  child: ChildProcess;
  done: Promise<{ status: number | null; out: string }>;
  out: () => string;
}
const children: ChildProcess[] = [];
const recordedPids: number[] = [];
afterEach(() => {
  for (const pid of recordedPids.splice(0)) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      /* gone already */
    }
  }
  for (const child of children.splice(0)) if (child.exitCode === null) child.kill('SIGKILL');
});

/** `git commit` in `dir` with the hook, started and not waited for. */
function startCommit(dir: string, env: Record<string, string>): Gate {
  const child = spawn('git', ['commit', '-q', '-m', 'change'], {
    cwd: dir,
    env: { ...hookEnv, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t', ...KNOBS, ...env } as NodeJS.ProcessEnv,
  });
  children.push(child);
  let out = '';
  child.stdout.on('data', (d) => (out += d));
  child.stderr.on('data', (d) => (out += d));
  const done = new Promise<{ status: number | null; out: string }>((resolve) => child.on('close', (status) => resolve({ status, out })));
  return { child, done, out: () => out };
}
const edit = (dir: string, n: number) => stage(dir, { 'src/a.ts': `export const a: number = ${n};\n` });

/** A process that stays alive, started here, for a lock record to name. Its pid is recorded to be killed at the end. */
function aliveProcess() {
  const child = spawn('sleep', ['120']);
  children.push(child);
  recordedPids.push(child.pid!);
  return child.pid!;
}
const spawnPs = (pid: number) =>
  execFileSync('ps', ['-o', 'lstart=', '-p', String(pid)], { encoding: 'utf-8' })
    .replace(/\s+/g, ' ')
    .trim();
/** Write a lock record by hand: who holds it, and the start time recorded for that pid. */
function plantLock(dir: string, pid: number, lstart: string, hook = 'pre-push') {
  const lock = lockPath(dir);
  fs.mkdirSync(lock);
  fs.writeFileSync(path.join(lock, 'owner'), `pid=${pid}\nhook=${hook}\nworktree=/elsewhere/Acme\nstarted=${Math.floor(Date.now() / 1000) - 250}\nlstart=${lstart}\n`);
}
const deadPid = () => {
  const run = spawnSync('node', ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf-8' });
  return Number(run.stdout);
};

describe('the test lock', () => {
  it('(a) makes the second gate wait for the first one test steps, and both pass', async () => {
    const { main, other } = twoWorktrees();
    const log = logFile();
    edit(main, 2);
    edit(other, 3);
    const first = startCommit(main, { STUB_LOG: log, STUB_ID: 'A', STUB_MS: '2500' });
    await until('the first stub to start', () => order(log).includes('start A'));
    const second = startCommit(other, { STUB_LOG: log, STUB_ID: 'B', STUB_MS: '300' });
    const [one, two] = await Promise.all([first.done, second.done]);
    expect(one.status, one.out).toBe(0);
    expect(two.status, two.out).toBe(0);
    expect(order(log)).toEqual(['start A', 'end A', 'start B', 'end B']);
    expect(two.out).toMatch(/tests: waiting for another gate to finish: pre-commit in \S+, pid \d+, running for \d+s/);
    expect(two.out).toMatch(/waited \d+s for the test lock/);
    expect(one.out).not.toContain('waiting for another gate');
    expect(fs.existsSync(lockPath(main))).toBe(false);
  }, 120_000);

  it('(a2) measures two simultaneous gates, with the lock and without it', async () => {
    const wall = async (env: Record<string, string>) => {
      const { main, other } = twoWorktrees();
      const log = logFile();
      edit(main, 2);
      edit(other, 3);
      const t0 = Date.now();
      const gates = [startCommit(main, { STUB_LOG: log, STUB_ID: 'A', STUB_MS: '2000', ...env }), startCommit(other, { STUB_LOG: log, STUB_ID: 'B', STUB_MS: '2000', ...env })];
      const results = await Promise.all(gates.map((g) => g.done));
      for (const r of results) expect(r.status, r.out).toBe(0);
      const e = events(log);
      const span = (id: string) => ({ start: e.find((x) => x.what === 'start' && x.id === id)!.at, end: e.find((x) => x.what === 'end' && x.id === id)!.at });
      const a = span('A');
      const b = span('B');
      return { seconds: (Date.now() - t0) / 1000, overlap: a.start < b.end && b.start < a.end };
    };
    const without = await wall({ BLAZON_HOOK_NO_LOCK: '1' });
    const locked = await wall({});
    console.log(`two gates at once, stub suites of 2s: without the lock ${without.seconds.toFixed(1)}s, with it ${locked.seconds.toFixed(1)}s`);
    expect(without.overlap).toBe(true);
    expect(locked.overlap).toBe(false);
  }, 180_000);

  it('(b) is released when the holder tests fail, and the waiting gate goes on', async () => {
    const { main, other } = twoWorktrees();
    const log = logFile();
    edit(main, 2);
    edit(other, 3);
    const first = startCommit(main, { STUB_LOG: log, STUB_ID: 'A', STUB_MS: '2000', STUB_EXIT: '1' });
    await until('the first stub to start', () => order(log).includes('start A'));
    const second = startCommit(other, { STUB_LOG: log, STUB_ID: 'B', STUB_MS: '200' });
    const [one, two] = await Promise.all([first.done, second.done]);
    expect(one.status).not.toBe(0);
    expect(one.out).toContain('✗ tests: related to the staged files');
    expect(two.status, two.out).toBe(0);
    expect(order(log)).toEqual(['start A', 'end A', 'start B', 'end B']);
    expect(fs.existsSync(lockPath(main))).toBe(false);
  }, 120_000);

  it('(c) takes over a lock whose pid is dead, with a notice and no waiting', async () => {
    const { main } = twoWorktrees();
    const log = logFile();
    plantLock(main, deadPid(), 'Mon Jan  1 00:00:00 2001');
    edit(main, 2);
    const gate = startCommit(main, { STUB_LOG: log, STUB_ID: 'A', STUB_MS: '100' });
    const result = await gate.done;
    expect(result.status, result.out).toBe(0);
    expect(result.out).toMatch(/taking it over/);
    expect(result.out).not.toContain('waiting for another gate');
    expect(order(log)).toEqual(['start A', 'end A']);
    expect(fs.existsSync(lockPath(main))).toBe(false);
  }, 120_000);

  it('(d) takes over a lock whose pid is alive but started at another time (the pid was reused)', async () => {
    const { main } = twoWorktrees();
    const log = logFile();
    plantLock(main, aliveProcess(), 'Mon Jan  1 00:00:00 2001');
    edit(main, 2);
    const result = await startCommit(main, { STUB_LOG: log, STUB_ID: 'A', STUB_MS: '100' }).done;
    expect(result.status, result.out).toBe(0);
    expect(result.out).toMatch(/taking it over/);
    expect(result.out).not.toContain('waiting for another gate');
    expect(order(log)).toEqual(['start A', 'end A']);
  }, 120_000);

  it('(c2) reads the age of a bare lock directory with a GNU stat too, where `stat -f` is the filesystem report and not a time', async () => {
    // On Linux `stat -f %m dir` succeeds and prints a multi-line report; a script that takes its output as a number fails there. This stat
    // stands for GNU coreutils: -f prints the report, -c %Y prints the modification time.
    const bin = tempDir('blazon-gnu-stat-');
    const shim = [
      '#!/bin/sh',
      'if [ "$1" = "-c" ]; then',
      '  [ "$2" = "%Y" ] || exit 1',
      '  exec perl -e \'print((stat($ARGV[0]))[9], "\\n")\' "$3"',
      'fi',
      'if [ "$1" = "-f" ]; then',
      '  printf \'  File: "%s"\\n    ID: 0 Namelen: 255 Type: ext2/ext3\\n\' "$3"',
      '  exit 0',
      'fi',
      'exec /usr/bin/stat "$@"',
    ].join('\n');
    fs.writeFileSync(path.join(bin, 'stat'), shim, { mode: 0o755 });
    const { main } = twoWorktrees();
    const log = logFile();
    const lock = lockPath(main);
    fs.mkdirSync(lock);
    const old = new Date(Date.now() - 60_000);
    fs.utimesSync(lock, old, old);
    edit(main, 2);
    const result = await startCommit(main, { STUB_LOG: log, STUB_ID: 'A', STUB_MS: '100', PATH: `${bin}:${hookEnv.PATH ?? process.env.PATH ?? ''}` }).done;
    expect(result.status, result.out).toBe(0);
    expect(result.out).not.toContain('unbound variable');
    expect(order(log)).toEqual(['start A', 'end A']);
    expect(fs.existsSync(lockPath(main))).toBe(false);
  }, 120_000);

  it('(e) takes no lock on a cache hit', async () => {
    const { main } = twoWorktrees();
    const log = logFile();
    edit(main, 2);
    const first = await startCommit(main, { STUB_LOG: log, STUB_ID: 'A', STUB_MS: '100' }).done;
    expect(first.status, first.out).toBe(0);
    expect(git(main, ['reset', '-q', '--soft', 'HEAD~1']).status).toBe(0);
    // A live holder would make a gate that asked for the lock wait; patience of 3 s would show as a fallback line
    const pid = aliveProcess();
    plantLock(main, pid, spawnPs(pid));
    const again = await startCommit(main, { STUB_LOG: log, STUB_ID: 'B', STUB_MS: '100', BLAZON_HOOK_LOCK_WAIT_SECONDS: '3' }).done;
    expect(again.status, again.out).toBe(0);
    expect(again.out).toMatch(/tests: related to the staged files \(this tree passed before\)/);
    expect(again.out).not.toMatch(/waiting|without the lock|test lock/);
    expect(order(log)).toEqual(['start A', 'end A']);
    expect(fs.readFileSync(path.join(lockPath(main), 'owner'), 'utf-8')).toContain(`pid=${pid}`);
  }, 120_000);

  it('(f) BLAZON_HOOK_NO_LOCK=1 takes none and waits for none', async () => {
    const { main } = twoWorktrees();
    const log = logFile();
    const pid = aliveProcess();
    plantLock(main, pid, spawnPs(pid));
    edit(main, 2);
    const result = await startCommit(main, { STUB_LOG: log, STUB_ID: 'A', STUB_MS: '100', BLAZON_HOOK_NO_LOCK: '1' }).done;
    expect(result.status, result.out).toBe(0);
    expect(result.out).not.toMatch(/waiting|test lock/);
    expect(order(log)).toEqual(['start A', 'end A']);
    expect(ownerPid(main)).toBe(pid);
  }, 120_000);

  it('(g) runs its tests without the lock when the patience is over, and leaves the holder alone', async () => {
    const { main } = twoWorktrees();
    const log = logFile();
    const pid = aliveProcess();
    plantLock(main, pid, spawnPs(pid));
    edit(main, 2);
    const t0 = Date.now();
    const result = await startCommit(main, { STUB_LOG: log, STUB_ID: 'A', STUB_MS: '100', BLAZON_HOOK_LOCK_WAIT_SECONDS: '3' }).done;
    expect(result.status, result.out).toBe(0);
    expect(result.out).toContain('tests: waiting for another gate to finish: pre-push in /elsewhere/Acme');
    expect(result.out).toMatch(/waited \d+s for the test lock; running the tests without it/);
    expect(order(log)).toEqual(['start A', 'end A']);
    expect(Date.now() - t0).toBeLessThan(60_000);
    expect(ownerPid(main)).toBe(pid);
  }, 120_000);

  it('(h) does not hold the cheap steps behind the lock', async () => {
    const { main } = twoWorktrees();
    const log = logFile();
    const pid = aliveProcess();
    plantLock(main, pid, spawnPs(pid));
    edit(main, 2);
    const result = await startCommit(main, { STUB_LOG: log, STUB_ID: 'A', STUB_MS: '100', BLAZON_HOOK_LOCK_WAIT_SECONDS: '3' }).done;
    const at = (text: string) => result.out.indexOf(text);
    expect(at('✓ typecheck')).toBeGreaterThanOrEqual(0);
    expect(at('✓ lint')).toBeGreaterThanOrEqual(0);
    expect(at('✓ format')).toBeGreaterThanOrEqual(0);
    expect(at('waiting for another gate')).toBeGreaterThan(at('✓ format'));
    expect(at('waiting for another gate')).toBeGreaterThan(at('✓ lint'));
  }, 120_000);

  it('(i) a hook that gets SIGTERM releases the lock; one that gets SIGKILL leaves a lock the next gate takes over', async () => {
    const { main, other } = twoWorktrees();
    const log = logFile();
    const pidFile = path.join(path.dirname(log), 'stub-pid');
    edit(main, 2);
    edit(other, 3);
    const first = startCommit(main, { STUB_LOG: log, STUB_ID: 'A', STUB_MS: '60000', STUB_PID_FILE: pidFile });
    await until('the first stub to start', () => order(log).includes('start A') && ownerPid(main) > 0);
    const hookPid = ownerPid(main);
    recordedPids.push(hookPid, Number(fs.readFileSync(pidFile, 'utf-8')));
    process.kill(hookPid, 'SIGTERM');
    process.kill(Number(fs.readFileSync(pidFile, 'utf-8')), 'SIGKILL');
    await first.done;
    await until('the lock to go', () => !fs.existsSync(lockPath(main)), 10_000);

    // SIGKILL: no trap can run, so the record stays and the next gate recovers it
    const log2 = logFile();
    const pidFile2 = path.join(path.dirname(log2), 'stub-pid');
    const killed = startCommit(main, { STUB_LOG: log2, STUB_ID: 'C', STUB_MS: '60000', STUB_PID_FILE: pidFile2 });
    await until('the stub to start', () => order(log2).includes('start C') && ownerPid(main) > 0);
    const victim = ownerPid(main);
    recordedPids.push(victim, Number(fs.readFileSync(pidFile2, 'utf-8')));
    process.kill(victim, 'SIGKILL');
    process.kill(Number(fs.readFileSync(pidFile2, 'utf-8')), 'SIGKILL');
    await killed.done;
    expect(fs.existsSync(lockPath(main))).toBe(true);
    const next = await startCommit(other, { STUB_LOG: log2, STUB_ID: 'D', STUB_MS: '100' }).done;
    expect(next.status, next.out).toBe(0);
    expect(next.out).toMatch(/taking it over/);
    expect(next.out).not.toContain('waiting for another gate');
  }, 180_000);
});

describe('the test lock in pre-push', () => {
  it('is taken by the push, and gives way after the patience', () => {
    const counter = pushing.counterFile();
    const { dir } = pushing.clone(counter);
    pushing.git(dir, ['push', '--no-verify', '-q', 'origin', 'main']);
    pushing.commit(dir, { 'examples/x/blazon.json': '// a brand\n' });
    const common = path.resolve(dir, pushing.git(dir, ['rev-parse', '--git-common-dir']).stdout.trim());
    const holder = aliveProcess();
    fs.mkdirSync(path.join(common, 'blazon-hook-test.lock'));
    write(path.join(common, 'blazon-hook-test.lock'), {
      owner: `pid=${holder}\nhook=pre-commit\nworktree=/elsewhere/Acme\nstarted=${Math.floor(Date.now() / 1000)}\nlstart=${spawnPs(holder)}\n`,
    });
    const result = pushing.git(dir, ['push', 'origin', 'main'], { ...KNOBS, BLAZON_HOOK_LOCK_WAIT_SECONDS: '2' });
    const out = result.stdout + result.stderr;
    expect(result.status, out).toBe(0);
    expect(out).toContain('tests: waiting for another gate to finish: pre-commit in /elsewhere/Acme');
    expect(out).toMatch(/running the tests without it/);
    expect(pushing.count(counter)).toBeGreaterThan(0);
  }, 120_000);
});
