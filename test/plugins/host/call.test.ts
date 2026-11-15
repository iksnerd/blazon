import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { STDERR_KEEP, STDOUT_LIMIT } from '../../../src/plugins/wire/limits.js';
import { run, requestFile } from '../../../src/plugins/host/call.js';
import { caseFiles, loadCase, name } from '../support/spec.js';
import { tempDir } from '../../support/project';

// RFC 0005 sections 4 to 6: one call to a plugin's program, and how it ends. Every corpus case reads the
// same on the way out, an answer with a code or a break; the rest are blazon's own tests for what a
// case file cannot say (process groups, the private request file, the clean environment).

function program(dir: string, script: string): string {
  const file = path.join(dir, 'plugin');
  fs.writeFileSync(file, script);
  fs.chmodSync(file, 0o755);
  return file;
}

describe('a call, against the corpus', () => {
  for (const file of caseFiles('call')) {
    it(`agrees with ${name(file)}`, async () => {
      const found = loadCase(file, ['about', 'rfc', 'program', 'timeout_s', 'stdin', 'env', 'host_env', 'expect']);
      const { expect: want } = found;
      expect(Object.keys(want).filter((key) => !['outcome', 'exit', 'stdout', 'stdout_bytes', 'stderr_bytes_at_most'].includes(key))).toEqual([]);

      const saved = { ...process.env };
      Object.assign(process.env, found.host_env ?? {});
      try {
        const result = await run({ program: program(tempDir(), found.program), stdin: Buffer.from(found.stdin ?? ''), env: found.env ?? {}, timeout: found.timeout_s });
        if (want.outcome === 'exit') {
          expect(result.answered && result.code, `${found.about}: ${JSON.stringify(result)}`).toBe(want.exit);
          if ('stdout' in want) expect(result.stdout.toString()).toBe(want.stdout);
          if ('stdout_bytes' in want) expect(result.stdout.length).toBe(want.stdout_bytes);
          if ('stderr_bytes_at_most' in want) expect(result.stderr.length).toBeLessThanOrEqual(want.stderr_bytes_at_most);
        } else {
          expect(want.outcome).toBe('break');
          expect(result.answered, found.about).toBe(false);
          expect(result.breakReason).not.toBe('');
        }
      } finally {
        for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
        Object.assign(process.env, saved);
      }
    }, 30_000);
  }
});

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function readPid(file: string): Promise<number> {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf-8').trim() : '';
    if (/^\d+$/.test(text)) return Number(text);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`the plugin never wrote its child's pid to ${file}`);
}

async function assertDies(pid: number, when: string): Promise<void> {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    if (!alive(pid)) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  process.kill(pid, 'SIGKILL');
  throw new Error(`process ${pid} is still running ${when}`);
}

describe('the process group', () => {
  it('a timeout kills the whole group: a child the plugin started does not outlive it', async () => {
    const dir = tempDir();
    const pidFile = path.join(dir, 'child.pid');
    // The timeout must outlast a slow process start: a program killed before it wrote the pid proves nothing (it failed one run in three at 0.5 s)
    const result = await run({ program: program(dir, `#!/bin/sh\nsleep 30 &\necho $! > ${pidFile}\nsleep 30\n`), timeout: 2 });
    expect(result.answered).toBe(false);
    await assertDies(await readPid(pidFile), 'after the timeout');
  }, 15_000);

  it('is killed again after the program exits, for anything it left running', async () => {
    const dir = tempDir();
    const pidFile = path.join(dir, 'child.pid');
    const result = await run({ program: program(dir, `#!/bin/sh\nsleep 30 >/dev/null 2>&1 &\necho $! > ${pidFile}\nexit 0\n`), timeout: 5 });
    expect(result.answered).toBe(true);
    await assertDies(await readPid(pidFile), 'after the program exited');
  }, 15_000);
});

describe('limits', () => {
  it('output over the limit ends the call at once: a plugin that would write forever is not buffered', async () => {
    const start = Date.now();
    const result = await run({ program: program(tempDir(), '#!/bin/sh\nexec yes\n'), timeout: 20 });
    expect(result.answered).toBe(false);
    expect(result.breakReason).toContain('output');
    expect(Date.now() - start).toBeLessThan(5000);
    expect(result.stdout.length).toBeLessThanOrEqual(STDOUT_LIMIT);
  }, 30_000);

  it('a profile may raise the stdout limit for a role', async () => {
    const script = "#!/bin/sh\nhead -c 100000 /dev/zero | tr '\\0' 'a'\n";
    const result = await run({ program: program(tempDir(), script), timeout: 5, stdoutLimit: 262144 });
    expect(result.answered && result.stdout.length).toBe(100000);
  });

  it('keeps the last bytes of stderr, so the end of a long trace is what a person reads', async () => {
    const file = program(tempDir(), "#!/bin/sh\nhead -c 20000 /dev/zero | tr '\\0' a >&2\nprintf 'END-OF-TRACE\\n' >&2\n");
    const result = await run({ program: file, timeout: 5 });
    expect(result.stderr.length).toBe(STDERR_KEEP);
    expect(result.stderr.toString().endsWith('END-OF-TRACE\n')).toBe(true);
  });

  it('a call may keep more stderr than the host default', async () => {
    const file = program(tempDir(), "#!/bin/sh\nhead -c 20000 /dev/zero | tr '\\0' a >&2\n");
    expect((await run({ program: file, timeout: 5 })).stderr.length).toBe(STDERR_KEEP);
    expect((await run({ program: file, timeout: 5, stderrKeep: 16384 })).stderr.length).toBe(16384);
  });
});

describe('ending a call that ran out of time', () => {
  it('asks the group to stop first, so a plugin that traps SIGTERM can clean up what it started', async () => {
    const dir = tempDir();
    const mark = path.join(dir, 'cleaned');
    const file = program(dir, `#!/bin/sh\nsleep 60 &\nchild=$!\ntrap 'kill $child; echo cleaned > ${mark}; exit 0' TERM\nwait\n`);
    const result = await run({ program: file, timeout: 1 });
    expect(result.answered).toBe(false);
    expect(result.cause).toBe('timeout');
    expect(fs.existsSync(mark)).toBe(true);
  }, 20_000);

  it('still kills a plugin that ignores SIGTERM, within the grace', async () => {
    const dir = tempDir();
    const log = path.join(dir, 'alive');
    const file = program(dir, `#!/bin/sh\ntrap '' TERM\nwhile :; do echo x >> ${log}; sleep 0.2; done\n`);
    const start = Date.now();
    const result = await run({ program: file, timeout: 1 });
    expect(result.cause).toBe('timeout');
    expect(Date.now() - start).toBeLessThan(6000);
    const size = fs.statSync(log).size;
    await new Promise((resolve) => setTimeout(resolve, 800));
    expect(fs.statSync(log).size).toBe(size);
  }, 20_000);
});

describe('the request file', () => {
  it('is made in a directory only the host can enter, at a mode only the host can read, and removed after', () => {
    const { path: file, cleanup } = requestFile(Buffer.from('{"a":1}'));
    const directory = path.dirname(file);
    expect(fs.statSync(directory).mode & 0o777).toBe(0o700);
    const stat = fs.statSync(file);
    expect(stat.isFile()).toBe(true);
    expect(stat.mode & 0o777).toBe(0o600);
    expect(fs.readFileSync(file, 'utf-8')).toBe('{"a":1}');
    cleanup();
    expect(fs.existsSync(directory)).toBe(false);
  });

  it('leaves nothing behind in TMPDIR after a call', async () => {
    const file = program(tempDir(), '#!/bin/sh\ncat\n'); // made before TMPDIR moves, so it is not counted
    const where = tempDir();
    const saved = process.env.TMPDIR;
    process.env.TMPDIR = where;
    try {
      const result = await run({ program: file, stdin: Buffer.from('x'), timeout: 5 });
      expect(result.answered).toBe(true);
      expect(fs.readdirSync(where)).toEqual([]);
    } finally {
      if (saved === undefined) delete process.env.TMPDIR;
      else process.env.TMPDIR = saved;
    }
  });
});

describe('a program that cannot start', () => {
  it.each(['missing', 'not-executable', 'empty'])('is a break and not an exception: %s', async (kind) => {
    const dir = tempDir();
    let file = '';
    if (kind === 'missing') file = '/nonexistent/plugin';
    else if (kind === 'not-executable') {
      file = path.join(dir, 'p');
      fs.writeFileSync(file, '#!/bin/sh\n');
      fs.chmodSync(file, 0o644);
    }
    const result = await run({ program: file, timeout: 1 });
    expect(result.answered).toBe(false);
    expect(result.breakReason).not.toBe('');
  });
});

describe('a program that cannot start: what the reason says to do', () => {
  it('says to make a file executable with chmod +x', async () => {
    const file = path.join(tempDir(), 'p');
    fs.writeFileSync(file, '#!/bin/sh\n');
    fs.chmodSync(file, 0o644);
    const result = await run({ program: file, timeout: 1 });
    expect(result.breakReason).toContain(`cannot start the program: `);
    expect(result.breakReason).toContain(`; make it executable with: chmod +x ${file}`);
  });

  it('says to check the path of a program that is not there', async () => {
    const result = await run({ program: '/nonexistent/plugin', timeout: 1 });
    expect(result.breakReason).toContain('; there is no program at /nonexistent/plugin');
  });
});

describe('the environment', () => {
  const keys = ['PATH', 'HOME', 'LANG', 'OTHER'];
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const key of keys) saved[key] = process.env[key];
  });
  afterEach(() => {
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it('is only what the host has set of PATH, HOME, LANG and TMPDIR, plus what the manifest lists', async () => {
    process.env.PATH = '/usr/bin:/bin';
    process.env.HOME = '/home/someone';
    delete process.env.LANG;
    process.env.OTHER = 'leaks';
    const result = await run({ program: program(tempDir(), '#!/bin/sh\n/usr/bin/env\n'), timeout: 5 });
    const lines = result.stdout.toString().split('\n');
    expect(result.answered).toBe(true);
    expect(lines).toContain('PATH=/usr/bin:/bin');
    expect(lines).toContain('HOME=/home/someone');
    expect(lines.some((line) => line.startsWith('LANG=') || line.startsWith('OTHER='))).toBe(false);
  });
});

describe('how a call ends', () => {
  it('a plugin killed by a signal is a break', async () => {
    const result = await run({ program: program(tempDir(), "#!/bin/sh\necho '{\"ok\":true}'\nkill -9 $$\n"), timeout: 5 });
    expect(result.answered).toBe(false);
    expect(result.breakReason).toContain('signal');
  });

  it("a role's table decides which exit codes are answers: the core's (0, 1, 2) by default", async () => {
    const dir = tempDir();
    const one = program(dir, '#!/bin/sh\nexit 1\n');
    expect((await run({ program: one, timeout: 5 })).answered).toBe(true);
    const refused = await run({ program: one, timeout: 5, answers: [0, 2] });
    expect(refused.answered).toBe(false);
    expect(refused.breakReason).toContain('exited with 1');
    expect((await run({ program: program(tempDir(), '#!/bin/sh\nexit 2\n'), timeout: 5, answers: [0, 2] })).answered).toBe(true);
    expect((await run({ program: program(tempDir(), '#!/bin/sh\nexit 0\n'), timeout: 5, answers: [1, 2] })).answered).toBe(false);
  });

  it('a call runs from the directory it names, and a directory that does not exist is a break', async () => {
    const dir = tempDir();
    const where = path.join(dir, 'where');
    fs.mkdirSync(where);
    const file = program(dir, '#!/bin/sh\npwd -P\n');
    expect((await run({ program: file, timeout: 5, directory: where })).stdout.toString().trim()).toBe(fs.realpathSync(where));
    expect((await run({ program: file, timeout: 5, directory: path.join(dir, 'gone') })).answered).toBe(false);
  });
});
