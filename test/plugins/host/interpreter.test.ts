import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_PLUGIN_PATH, InterpreterRefused, chainProblem, launchFor, pluginPath, readShebang } from '../../../src/plugins/pins/interpreter.js';
import { Pin, treeDigest } from '../../../src/plugins/pins/pin.js';
import { run } from '../../../src/plugins/host/call.js';
import { ROOT_DIR } from '../support/spec.js';

// The interpreter of a pinned plugin (RFC 0005 sections 3.4 and 4; Contra ADR 0099). A pin covers the bytes
// of a plugin and not the program that runs them: a launcher that starts `python3` runs whatever that name resolves
// to. So the host reads the `#!` line itself, resolves the interpreter in directories it chooses, checks the whole
// chain to it, and starts the copy through that path with a PATH of those directories alone.

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

/** A scratch folder whose own chain is clean, so that an interpreter put in it can be accepted. /tmp is not: others can write it on Linux. */
function scratch(): string {
  const cache = path.join(ROOT_DIR, 'node_modules/.cache');
  fs.mkdirSync(cache, { recursive: true });
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(cache, 'blazon-interpreter-')));
  dirs.push(dir);
  return dir;
}
const base = scratch();
dirs.length = 0;
const cleanHere = chainProblem(base, { final: 'dir' }) === undefined;
if (!cleanHere) console.warn(`interpreter.test: skipped the tests that need a clean scratch folder: ${chainProblem(base, { final: 'dir' })}`);
const here = cleanHere ? it : it.skip;
fs.rmSync(base, { recursive: true, force: true });

const write = (file: string, content: string, mode = 0o755) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  fs.chmodSync(file, mode);
  return file;
};
const script = (dir: string, firstLine: string) => write(path.join(dir, 'plugin'), `${firstLine}\nexit 0\n`);

describe('reading the #! line', () => {
  const read = (line: string) => {
    const file = script(scratch(), line);
    return readShebang(file);
  };

  it('says a file that does not start with #! is not a script', () => {
    expect(read('echo not a script')).toBeUndefined();
    const binary = path.join(scratch(), 'binary');
    fs.writeFileSync(binary, Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01]));
    expect(readShebang(binary)).toBeUndefined();
    expect(readShebang(write(path.join(scratch(), 'empty'), ''))).toBeUndefined();
  });

  it.each([
    ['#!/bin/sh', { interpreter: '/bin/sh', viaEnv: false }],
    ['#!/bin/sh -e', { interpreter: '/bin/sh', arg: '-e', viaEnv: false }],
    ['#! /bin/sh', { interpreter: '/bin/sh', viaEnv: false }],
    ['#!/bin/sh\t-eu', { interpreter: '/bin/sh', arg: '-eu', viaEnv: false }],
    ['#!/usr/bin/env python3', { interpreter: 'python3', viaEnv: true }],
    ['#!/bin/env node', { interpreter: 'node', viaEnv: true }],
    ['#!/usr/bin/env python3.12', { interpreter: 'python3.12', viaEnv: true }],
  ])('reads %j', (line, want) => {
    expect(read(line)).toEqual(want);
  });

  it.each([
    ['a relative interpreter', '#!sh', /absolute/],
    ['a dot-relative interpreter', '#!./run', /absolute/],
    ['nothing after #!', '#!', /names no interpreter/],
    ['white space only after #!', '#!   ', /names no interpreter/],
    ['two arguments', '#!/bin/sh -e -u', /one argument/],
    ['env with a flag', '#!/usr/bin/env -S python3 -u', /env.*one name/],
    ['env with -i', '#!/usr/bin/env -i python3', /env.*one name/],
    ['env with an option as the only name', '#!/usr/bin/env -S', /env.*one name/],
    ['env with a variable assignment', '#!/usr/bin/env A=b', /env.*one name/],
    ['env with two names', '#!/usr/bin/env python3 -u', /env.*one name/],
    ['env with no name', '#!/usr/bin/env', /env.*one name/],
    ['env with a path as the name', '#!/usr/bin/env /bin/sh', /env.*one name/],
    ['env with a relative path as the name', '#!/usr/bin/env ./tool', /env.*one name/],
    ['a carriage return', '#!/bin/sh\r', /control character/],
    ['a line of more than 256 bytes', `#!/bin/${'a'.repeat(300)}`, /256 bytes/],
  ])('refuses %s', (_name, line, reason) => {
    const file = script(scratch(), line);
    expect(() => readShebang(file)).toThrow(InterpreterRefused);
    expect(() => readShebang(file)).toThrow(reason);
  });

  it('reads a line of exactly 256 bytes, and refuses one of 257', () => {
    const exact = `#!/${'a'.repeat(253)}`; // 256 bytes with the #!
    expect(Buffer.byteLength(exact)).toBe(256);
    expect(readShebang(script(scratch(), exact))).toMatchObject({ viaEnv: false });
    expect(() => readShebang(script(scratch(), `${exact}b`))).toThrow(/256 bytes/);
  });
});

describe('the chain to a file', () => {
  it('accepts a system interpreter: every directory and the file are owned by root and nobody else can write them', () => {
    expect(chainProblem('/bin/sh')).toBeUndefined();
    expect(chainProblem('/usr/bin/env')).toBeUndefined();
  });

  here('refuses what is not there, what is not a regular file, and what is not executable', () => {
    expect(chainProblem('/usr/bin/definitely-not-installed')).toMatch(/does not exist/);
    expect(chainProblem('/usr/bin')).toMatch(/not a regular file/);
    const dir = scratch();
    expect(chainProblem(write(path.join(dir, 'plain'), 'x', 0o644))).toMatch(/not executable/);
  });

  here('accepts a program in a clean folder of mine, and a link to one', () => {
    const dir = scratch();
    const program = write(path.join(dir, 'bin/tool'), '#!/bin/sh\n');
    expect(chainProblem(program)).toBeUndefined();
    fs.symlinkSync(program, path.join(dir, 'link'));
    expect(chainProblem(path.join(dir, 'link'))).toBeUndefined();
  });

  here('refuses a file that group or others can write, and names it', () => {
    const dir = scratch();
    const program = write(path.join(dir, 'tool'), '#!/bin/sh\n', 0o775);
    expect(chainProblem(program)).toBe(`${program} can be written by group or others`);
    fs.chmodSync(program, 0o757);
    expect(chainProblem(program)).toContain('can be written by group or others');
  });

  here('refuses a directory on the way that group or others can write, and names that directory', () => {
    const dir = scratch();
    const inner = path.join(dir, 'open');
    const program = write(path.join(inner, 'tool'), '#!/bin/sh\n');
    fs.chmodSync(inner, 0o775);
    expect(chainProblem(program)).toBe(`${inner} can be written by group or others`);
  });

  here('refuses a file owned by someone who is neither the host user nor root', () => {
    const dir = scratch();
    const program = write(path.join(dir, 'tool'), '#!/bin/sh\n');
    // A test cannot change an owner without root, so it says that a different user is the host's.
    expect(chainProblem(program, { uid: (process.getuid?.() ?? 0) + 1 })).toMatch(/is owned by user \d+, who is neither you nor root/);
  });

  here('follows a link and checks where it leads, and the directories on the way there', () => {
    const dir = scratch();
    const open = path.join(dir, 'open');
    const target = write(path.join(open, 'tool'), '#!/bin/sh\n');
    fs.chmodSync(open, 0o775);
    fs.symlinkSync(target, path.join(dir, 'link'));
    expect(chainProblem(path.join(dir, 'link'))).toBe(`${open} can be written by group or others`);
  });

  here('follows a relative link, and a link to a directory in the middle of the path', () => {
    const dir = scratch();
    write(path.join(dir, 'real/tool'), '#!/bin/sh\n');
    fs.symlinkSync('real', path.join(dir, 'alias'));
    fs.symlinkSync('real/tool', path.join(dir, 'tool-link'));
    expect(chainProblem(path.join(dir, 'alias/tool'))).toBeUndefined();
    expect(chainProblem(path.join(dir, 'tool-link'))).toBeUndefined();
    fs.chmodSync(path.join(dir, 'real'), 0o775);
    expect(chainProblem(path.join(dir, 'alias/tool'))).toContain('can be written by group or others');
  });

  here('refuses a loop of links, and a dangling link', () => {
    const dir = scratch();
    fs.symlinkSync(path.join(dir, 'b'), path.join(dir, 'a'));
    fs.symlinkSync(path.join(dir, 'a'), path.join(dir, 'b'));
    expect(chainProblem(path.join(dir, 'a'))).toMatch(/too many links/);
    fs.symlinkSync(path.join(dir, 'nowhere'), path.join(dir, 'dangling'));
    expect(chainProblem(path.join(dir, 'dangling'))).toMatch(/does not exist/);
  });
});

describe('the directories a pinned plugin may find a program in', () => {
  it('are, with nothing set, the defaults that exist and are clean, in order', () => {
    const { dirs: found } = pluginPath({});
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((dir) => DEFAULT_PLUGIN_PATH.includes(dir))).toBe(true);
    expect(found).toContain('/usr/bin');
    expect(found).toContain('/bin');
    expect([...found].sort((a, b) => DEFAULT_PLUGIN_PATH.indexOf(a) - DEFAULT_PLUGIN_PATH.indexOf(b))).toEqual(found);
  });

  here('put the operator\'s BLAZON_PLUGIN_PATH first, in order, then the defaults', () => {
    const one = path.join(scratch(), 'one');
    const two = path.join(scratch(), 'two');
    fs.mkdirSync(one);
    fs.mkdirSync(two);
    const { dirs: found } = pluginPath({ BLAZON_PLUGIN_PATH: `${one}:${two}` });
    expect(found.slice(0, 2)).toEqual([one, two]);
    expect(found).toContain('/usr/bin');
  });

  here('drop a directory that is not clean, and a relative one, and say why', () => {
    const open = path.join(scratch(), 'open');
    fs.mkdirSync(open);
    fs.chmodSync(open, 0o775);
    const { dirs: found, dropped } = pluginPath({ BLAZON_PLUGIN_PATH: `${open}:relative/dir:/does/not/exist` });
    expect(found).not.toContain(open);
    expect(dropped.map((d) => d.dir)).toEqual([open, 'relative/dir', '/does/not/exist']);
    expect(dropped[0]!.why).toContain('can be written by group or others');
    expect(dropped[1]!.why).toContain('absolute');
    expect(dropped[2]!.why).toContain('does not exist');
  });
});

describe('launching a script through its interpreter', () => {
  const entry = (line: string) => script(scratch(), line);

  it('starts a program that is not a script as it is, with the chosen PATH', () => {
    const binary = path.join(scratch(), 'binary');
    fs.writeFileSync(binary, Buffer.from([0x7f, 0x45, 0x4c, 0x46]));
    fs.chmodSync(binary, 0o755);
    const launch = launchFor(binary, {});
    expect(launch).toMatchObject({ program: binary, args: [] });
    expect(launch.path).toBe(pluginPath({}).dirs.join(':'));
  });

  it('runs an absolute interpreter as <interpreter> [arg] <copy>', () => {
    const file = entry('#!/bin/sh -e');
    expect(launchFor(file, {})).toMatchObject({ program: '/bin/sh', args: ['-e', file] });
    expect(launchFor(entry('#!/bin/sh'), {}).args).toHaveLength(1);
  });

  it('finds a name after env in the chosen directories only, and starts what it found, not env', () => {
    const launch = launchFor(entry('#!/usr/bin/env sh'), {});
    expect(path.isAbsolute(launch.program)).toBe(true);
    expect(path.basename(launch.program)).toBe('sh');
    expect(DEFAULT_PLUGIN_PATH.some((dir) => launch.program.startsWith(`${dir}/`))).toBe(true);
  });

  here('finds a name in the operator\'s directory, and not without it', () => {
    const dir = path.join(scratch(), 'bin');
    write(path.join(dir, 'mytool'), '#!/bin/sh\n');
    const file = entry('#!/usr/bin/env mytool');
    expect(launchFor(file, { BLAZON_PLUGIN_PATH: dir }).program).toBe(path.join(dir, 'mytool'));
    expect(() => launchFor(file, {})).toThrow(InterpreterRefused);
  });

  it('refuses a name it cannot find, and says how to fix it', () => {
    expect(() => launchFor(entry('#!/usr/bin/env definitely-not-installed'), {})).toThrow(/definitely-not-installed is not in the directories blazon trusts for a pinned plugin \(.+\); add the directory that holds it to BLAZON_PLUGIN_PATH/);
  });

  here('does not take a name from a directory that is not clean, and says the directory was dropped', () => {
    const open = path.join(scratch(), 'open');
    write(path.join(open, 'mytool'), '#!/bin/sh\n');
    fs.chmodSync(open, 0o775);
    expect(() => launchFor(entry('#!/usr/bin/env mytool'), { BLAZON_PLUGIN_PATH: open })).toThrow(/can be written by group or others/);
  });

  here('does not take a program from a clean directory when the program itself is not clean', () => {
    const dir = path.join(scratch(), 'bin');
    write(path.join(dir, 'mytool'), '#!/bin/sh\n', 0o775);
    expect(() => launchFor(entry('#!/usr/bin/env mytool'), { BLAZON_PLUGIN_PATH: dir })).toThrow(InterpreterRefused);
  });

  here('refuses an absolute interpreter whose chain is not clean, and names the place', () => {
    const open = path.join(scratch(), 'open');
    const interpreter = write(path.join(open, 'sh2'), '#!/bin/sh\n');
    fs.chmodSync(open, 0o775);
    expect(() => launchFor(entry(`#!${interpreter}`), {})).toThrow(`${open} can be written by group or others`);
  });

  it('refuses a #! line that breaks the rules, with the line named', () => {
    expect(() => launchFor(entry('#!/usr/bin/env -S python3'), {})).toThrow(InterpreterRefused);
  });

  it('gives the plugin only the chosen directories as its PATH, never the host\'s own', () => {
    const launch = launchFor(entry('#!/bin/sh'), { PATH: '/some/host/dir:/another' });
    expect(launch.path).not.toContain('/some/host/dir');
    expect(launch.path.split(':')).toEqual(pluginPath({}).dirs);
  });
});

describe('a pinned call', () => {
  function pinned(firstLine: string, body = 'echo "$0"; echo "$PATH"'): { pin: Pin; root: string; entry: string } {
    const root = path.join(scratch(), 'tree');
    const entry = write(path.join(root, 'plugin'), `${firstLine}\n${body}\n`);
    return { pin: new Pin('tree', root, treeDigest(root), 'plugin'), root, entry };
  }

  it('runs the copy through the interpreter, with a PATH of the chosen directories', async () => {
    const { pin } = pinned('#!/bin/sh');
    const result = await run({ pin, timeout: 5, store: scratch() });
    expect(result.answered, result.breakReason).toBe(true);
    const [ran, shellPath] = result.stdout.toString().trim().split('\n');
    expect(ran).toContain('/pin-');
    expect(shellPath).toBe(pluginPath(process.env).dirs.join(':'));
  });

  it('does not give a pinned plugin the host\'s PATH, even a directory only the host has', async () => {
    const saved = process.env.PATH;
    process.env.PATH = `/only/the/host/has:${saved}`;
    try {
      const { pin } = pinned('#!/bin/sh');
      const result = await run({ pin, timeout: 5, store: scratch() });
      expect(result.stdout.toString()).not.toContain('/only/the/host/has');
    } finally {
      process.env.PATH = saved;
    }
  });

  here('is unavailable when the interpreter is not clean, and the plugin does not run', async () => {
    const open = path.join(scratch(), 'open');
    const interpreter = write(path.join(open, 'sh2'), '#!/bin/sh\necho ran > "$MARKER"\n');
    fs.chmodSync(open, 0o775);
    const marker = path.join(scratch(), 'ran');
    const { pin } = pinned(`#!${interpreter}`, `echo ran > ${marker}`);
    const result = await run({ pin, timeout: 5, store: scratch() });
    expect(result.answered).toBe(false);
    expect(result.breakReason).toContain('unavailable: interpreter:');
    expect(result.breakReason).toContain(`${open} can be written by group or others`);
    expect(fs.existsSync(marker)).toBe(false);
  });

  here('checks again before every launch: an interpreter replaced between two calls is caught', async () => {
    const dir = scratch();
    const open = path.join(dir, 'open');
    const unsafe = write(path.join(open, 'sh2'), '#!/bin/sh\nexec /bin/sh "$@"\n');
    fs.chmodSync(open, 0o775);
    const link = path.join(dir, 'interp');
    fs.symlinkSync('/bin/sh', link);
    const { pin } = pinned(`#!${link}`, 'echo ok');
    const first = await run({ pin, timeout: 5, store: scratch() });
    expect(first.answered, first.breakReason).toBe(true);
    fs.rmSync(link);
    fs.symlinkSync(unsafe, link);
    const second = await run({ pin, timeout: 5, store: scratch() });
    expect(second.answered).toBe(false);
    expect(second.breakReason).toContain('unavailable: interpreter:');
  });

  it('leaves an unpinned call alone: it runs by the kernel, with the host\'s PATH', async () => {
    const file = script(scratch(), '#!/bin/sh');
    fs.writeFileSync(file, '#!/bin/sh\necho "$PATH"\n');
    const saved = process.env.PATH;
    process.env.PATH = `/only/the/host/has:${saved}`;
    try {
      const result = await run({ program: file, timeout: 5 });
      expect(result.stdout.toString()).toContain('/only/the/host/has');
    } finally {
      process.env.PATH = saved;
    }
  });
});
