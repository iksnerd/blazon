import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync, spawn, spawnSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { BASE, HOOKS, git, hookEnv, repo, stage, write } from '../support/hook-commit';
import * as pushing from '../support/hook-push';
import { tempDir } from '../support/project';

// Test steps run in one of a few slots for each repository, across worktrees and sessions: slot-<i> directories in the common git folder
// (acquire_test_lock in .githooks/lib.sh), with a queue so that a gate that comes later does not go first. The end-to-end tests below run
// real commits with one slot (KNOBS); the stub stands for the suite: it logs its start and end with the time and sleeps. The cheap steps
// are stubs too, so each hook takes about a second beyond the stub. Every repository here is a throwaway one with its own common git
// folder, so these tests never queue on the slots of the checkout that runs them. The tests of the slots and the queue themselves
// ("the test slots") call lib.sh directly and wait on files the test writes, not on time.

const STUB = [
  "const fs = require('fs');",
  "const id = process.env.STUB_ID || '?';",
  'const log = (what) => fs.appendFileSync(process.env.STUB_LOG, what + " " + id + " " + Date.now() + "\\n");',
  "log('start');",
  'if (process.env.STUB_PID_FILE) fs.writeFileSync(process.env.STUB_PID_FILE, String(process.pid));',
  "const finish = () => { log('end'); process.exit(Number(process.env.STUB_EXIT || 0)); };",
  // STUB_GO holds the step until the test writes that file, so a test that needs the holder to still be holding does not race a timer
  'if (process.env.STUB_GO) { const t = setInterval(() => { if (fs.existsSync(process.env.STUB_GO)) { clearInterval(t); finish(); } }, 50); } else setTimeout(finish, Number(process.env.STUB_MS || 0));',
].join('\n');

const manifest = () => {
  const base = JSON.parse(BASE['package.json']!);
  return JSON.stringify({ ...base, scripts: { ...base.scripts, typecheck: 'true', lint: 'true', 'test:related': 'node stub.js' } });
};

const KNOBS = { BLAZON_HOOK_LOCK_POLL_SECONDS: '1', BLAZON_HOOK_LOCK_NOTICE_SECONDS: '2', BLAZON_HOOK_TEST_SLOTS: '1' };

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
const slotsPath = (dir: string) => path.join(commonDir(dir), 'blazon-hook-test-slots');
const lockPath = (dir: string) => path.join(slotsPath(dir), 'slot-0');
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
  fs.mkdirSync(lock, { recursive: true });
  fs.writeFileSync(path.join(lock, 'owner'), `pid=${pid}\nhook=${hook}\nworktree=/elsewhere/Acme\nstarted=${Math.floor(Date.now() / 1000) - 250}\nlstart=${lstart}\n`);
}
const deadPid = () => {
  const run = spawnSync('node', ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf-8' });
  return Number(run.stdout);
};

describe('the test slots, end to end', () => {
  it('(a) makes the second gate wait for the first one test steps, and both pass', async () => {
    const { main, other } = twoWorktrees();
    const log = logFile();
    edit(main, 2);
    edit(other, 3);
    // The first gate holds its test step until the second has said it waits: a fixed hold raced the second gate's own earlier
    // steps (secret scan, typecheck, lint, format), which on a loaded machine take longer than the hold, so it never waited.
    const go = `${log}.go`;
    const first = startCommit(main, { STUB_LOG: log, STUB_ID: 'A', STUB_GO: go });
    await until('the first stub to start', () => order(log).includes('start A'));
    const second = startCommit(other, { STUB_LOG: log, STUB_ID: 'B', STUB_MS: '300' });
    await until('the second gate to say it waits', () => second.out().includes('waiting for a test slot'), 120_000);
    fs.writeFileSync(go, '');
    const [one, two] = await Promise.all([first.done, second.done]);
    expect(one.status, one.out).toBe(0);
    expect(two.status, two.out).toBe(0);
    expect(order(log)).toEqual(['start A', 'end A', 'start B', 'end B']);
    expect(two.out).toMatch(/tests: waiting for a test slot: 1 of 1 in use, 0 ahead of this one\n {6}pre-commit in \S+, pid \d+, for \d+s/);
    expect(two.out).toMatch(/waited \d+s for a test slot/);
    expect(one.out).not.toContain('waiting for a test slot');
    expect(fs.existsSync(lockPath(main))).toBe(false);
  }, 120_000);

  it('(a2) measures two simultaneous gates: without slots, with one, and with two', async () => {
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
    const one = await wall({});
    const two = await wall({ BLAZON_HOOK_TEST_SLOTS: '2' });
    console.log(`two gates at once, stub suites of 2s: without slots ${without.seconds.toFixed(1)}s, one slot ${one.seconds.toFixed(1)}s, two slots ${two.seconds.toFixed(1)}s`);
    expect(without.overlap).toBe(true);
    expect(one.overlap).toBe(false);
    expect(two.overlap).toBe(true);
  }, 240_000);

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
    expect(result.out).not.toContain('waiting for a test slot');
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
    expect(result.out).not.toContain('waiting for a test slot');
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
    fs.mkdirSync(lock, { recursive: true });
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
    expect(again.out).not.toMatch(/waiting|without one|test slot/);
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
    expect(result.out).not.toMatch(/waiting|test slot/);
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
    expect(result.out).toMatch(/tests: waiting for a test slot: 1 of 1 in use, 0 ahead of this one\n {6}pre-push in \/elsewhere\/Acme, pid \d+, for 4m\d\ds/);
    expect(result.out).toMatch(/waited \d+s for a test slot; running the tests without one/);
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
    expect(at('waiting for a test slot')).toBeGreaterThan(at('✓ format'));
    expect(at('waiting for a test slot')).toBeGreaterThan(at('✓ lint'));
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
    expect(next.out).not.toContain('waiting for a test slot');
  }, 180_000);
});

describe('the test slots in pre-push', () => {
  it('is taken by the push, and gives way after the patience', () => {
    const counter = pushing.counterFile();
    const { dir } = pushing.clone(counter);
    pushing.git(dir, ['push', '--no-verify', '-q', 'origin', 'main']);
    pushing.commit(dir, { 'examples/x/blazon.json': '// a brand\n' });
    const common = path.resolve(dir, pushing.git(dir, ['rev-parse', '--git-common-dir']).stdout.trim());
    const holder = aliveProcess();
    fs.mkdirSync(path.join(common, 'blazon-hook-test-slots', 'slot-0'), { recursive: true });
    write(path.join(common, 'blazon-hook-test-slots', 'slot-0'), {
      owner: `pid=${holder}\nhook=pre-commit\nworktree=/elsewhere/Acme\nstarted=${Math.floor(Date.now() / 1000)}\nlstart=${spawnPs(holder)}\n`,
    });
    const result = pushing.git(dir, ['push', 'origin', 'main'], { ...KNOBS, BLAZON_HOOK_LOCK_WAIT_SECONDS: '2' });
    const out = result.stdout + result.stderr;
    expect(result.status, out).toBe(0);
    expect(out).toContain('pre-commit in /elsewhere/Acme, pid');
    expect(out).toMatch(/running the tests without one/);
    expect(pushing.count(counter)).toBeGreaterThan(0);
  }, 120_000);
});

// The slots and the queue, through lib.sh itself: a gate here is `bash` that sources lib.sh in a throwaway repository, takes a slot, logs
// `start <id>`, and holds the slot until the test writes the file go/<id>. Nothing waits on a clock: each step waits for a line the gate
// printed or a file it wrote.
const LIB = path.join(HOOKS, 'lib.sh');
const GATE = [
  '. "$LIB"',
  'trap release_test_lock EXIT',
  'acquire_test_lock',
  'echo "start $ID" >> "$LOG"',
  'while [ ! -e "$GO/$ID" ]; do sleep 0.1; done',
  'echo "end $ID" >> "$LOG"',
].join('\n');

function slotRepo() {
  const dir = tempDir('blazon-slots-');
  expect(git(dir, ['init', '-q', '-b', 'main']).status).toBe(0);
  const signals = path.join(dir, '.git', 'go');
  fs.mkdirSync(signals);
  return { dir, go: signals, log: path.join(dir, '.git', 'log') };
}
type Slots = ReturnType<typeof slotRepo>;
const lines = (log: string) => (fs.existsSync(log) ? fs.readFileSync(log, 'utf-8').trim().split('\n').filter(Boolean) : []);

function gate(at: Slots, id: string, env: Record<string, string> = {}): Gate {
  const child = spawn('bash', ['-c', GATE], {
    cwd: at.dir,
    env: { ...hookEnv, LIB, ID: id, LOG: at.log, GO: at.go, BLAZON_HOOK_LOCK_POLL_SECONDS: '0.2', BLAZON_HOOK_LOCK_NOTICE_SECONDS: '600', ...env } as NodeJS.ProcessEnv,
  });
  children.push(child);
  let out = '';
  child.stdout.on('data', (d) => (out += d));
  child.stderr.on('data', (d) => (out += d));
  const done = new Promise<{ status: number | null; out: string }>((resolve) => child.on('close', (status) => resolve({ status, out })));
  return { child, done, out: () => out };
}
const go = (at: Slots, id: string) => fs.writeFileSync(path.join(at.go, id), '');
const started = (at: Slots) => lines(at.log).filter((l) => l.startsWith('start '));
// the notice is several lines; its last one starts with 'stuck?'
const waiting = (g: Gate) => g.out().includes('waiting for a test slot') && g.out().includes('stuck?');

describe('the test slots', () => {
  it('takes the slot count from BLAZON_HOOK_TEST_SLOTS, else a quarter of the cores, between 1 and 3', () => {
    const bin = tempDir('blazon-getconf-');
    const slots = (cores: string, override?: string) => {
      fs.writeFileSync(path.join(bin, 'getconf'), `#!/bin/sh\necho ${cores}\n`, { mode: 0o755 });
      const env: Record<string, string> = { ...(hookEnv as Record<string, string>), PATH: `${bin}:${process.env.PATH ?? ''}` };
      if (override !== undefined) env.BLAZON_HOOK_TEST_SLOTS = override;
      const run = spawnSync('bash', ['-c', `. '${LIB}'; test_slots`], { encoding: 'utf-8', env });
      expect(run.status, run.stderr).toBe(0);
      return run.stdout.trim();
    };
    expect([slots('12'), slots('16'), slots('64'), slots('8'), slots('4'), slots('2'), slots('1')]).toEqual(['3', '3', '3', '2', '1', '1', '1']);
    expect(slots('12', '5')).toBe('5');
    expect(slots('12', '08')).toBe('8');
    expect([slots('12', '0'), slots('12', 'many'), slots('12', '')]).toEqual(['3', '3', '3']);
  });

  it('lets as many gates run as there are slots; the next one waits, says who holds them, and goes when one is given back', async () => {
    const at = slotRepo();
    const env = { BLAZON_HOOK_TEST_SLOTS: '2' };
    const a = gate(at, 'A', env);
    const b = gate(at, 'B', env);
    await until('two gates to start', () => started(at).length === 2);
    const c = gate(at, 'C', env);
    await until('the third gate to wait', () => waiting(c));
    expect(started(at)).not.toContain('start C');
    const out = c.out();
    expect(out).toMatch(/tests: waiting for a test slot: 2 of 2 in use, 0 ahead of this one\n/);
    // one line for each holder: which hook, which worktree, its pid, and for how long
    expect(out.match(/^ {6}bash in \S+, pid \d+, for \d+s$/gm)).toHaveLength(2);
    // and what to do if it looks stuck: where to look, the command that shows whether the holders live, and that a dead one is freed without help
    expect(out).toContain('blazon-hook-test-slots');
    expect(out).toMatch(/ps -o pid,lstart,command -p \d+,\d+/);
    expect(out).toMatch(/freed by the next gate/);
    expect(out).not.toMatch(/rm -rf/);
    const first = started(at)[0]!.split(' ')[1]!;
    go(at, first);
    await until('the third gate to start', () => started(at).includes('start C'));
    for (const id of ['A', 'B', 'C']) go(at, id);
    for (const g of [a, b, c]) expect((await g.done).status).toBe(0);
    const root = path.join(commonDir(at.dir), 'blazon-hook-test-slots');
    expect(fs.readdirSync(root)).toEqual(['queue']);
    expect(fs.readdirSync(path.join(root, 'queue'))).toEqual([]);
  }, 120_000);

  it('gives a freed slot to the gate that has waited longest, not to one that came later and asks more often', async () => {
    const at = slotRepo();
    const one = { BLAZON_HOOK_TEST_SLOTS: '1' };
    const holder = gate(at, 'H', one);
    await until('the holder to start', () => started(at).includes('start H'));
    const early = gate(at, 'EARLY', { ...one, BLAZON_HOOK_LOCK_POLL_SECONDS: '1' });
    await until('the first waiter to queue', () => waiting(early));
    const late = gate(at, 'LATE', { ...one, BLAZON_HOOK_LOCK_POLL_SECONDS: '0.1' });
    await until('the second waiter to queue', () => waiting(late));
    expect(late.out()).toMatch(/1 of 1 in use, 1 ahead of this one/);
    go(at, 'H');
    await until('a waiter to start', () => started(at).length === 2);
    expect(started(at)).toEqual(['start H', 'start EARLY']);
    go(at, 'EARLY');
    await until('the later waiter to start', () => started(at).length === 3);
    go(at, 'LATE');
    for (const g of [holder, early, late]) expect((await g.done).status).toBe(0);
  }, 120_000);

  it('does not count a queued gate whose process is gone, and frees a slot whose holder is gone; a live holder keeps its slot', async () => {
    const at = slotRepo();
    const root = path.join(commonDir(at.dir), 'blazon-hook-test-slots');
    // a ticket left by a gate that was killed, older than any other
    const dead = deadPid();
    const ticket = path.join(root, 'queue', `${'0'.repeat(19)}1-${dead}`);
    fs.mkdirSync(ticket, { recursive: true });
    fs.writeFileSync(path.join(ticket, 'owner'), `pid=${dead}\nhook=pre-commit\nworktree=/elsewhere/Acme\nstarted=1\nlstart=Mon Jan  1 00:00:00 2001\n`);
    // slot-0 held by a live process, slot-1 by a dead one
    const live = aliveProcess();
    for (const [slot, pid, lstart] of [
      ['slot-0', live, spawnPs(live)],
      ['slot-1', dead, 'Mon Jan  1 00:00:00 2001'],
    ] as const) {
      fs.mkdirSync(path.join(root, slot));
      fs.writeFileSync(path.join(root, slot, 'owner'), `pid=${pid}\nhook=pre-push\nworktree=/elsewhere/Acme\nstarted=1\nlstart=${lstart}\n`);
    }
    const g = gate(at, 'A', { BLAZON_HOOK_TEST_SLOTS: '2' });
    await until('the gate to start', () => started(at).includes('start A'));
    expect(g.out()).toMatch(/the test slot slot-1 was left by pid \d+, which is not running; taking it over/);
    expect(g.out()).not.toContain('waiting for a test slot');
    expect(fs.existsSync(ticket)).toBe(false);
    expect(fs.readFileSync(path.join(root, 'slot-0', 'owner'), 'utf-8')).toContain(`pid=${live}`);
    expect(fs.readFileSync(path.join(root, 'slot-1', 'owner'), 'utf-8')).toContain(`pid=${g.child.pid}`);
    go(at, 'A');
    expect((await g.done).status).toBe(0);
    expect(fs.readFileSync(path.join(root, 'slot-0', 'owner'), 'utf-8')).toContain(`pid=${live}`);
  }, 120_000);
});
