import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { LOCK_FILE, pinFor, readLock, recordPin, writeLock, type Lock } from '../../../src/plugins/pins/lock.js';
import { fileDigest, treeDigest, treeLines } from '../../../src/plugins/pins/pin.js';
import { tempDir } from '../../support/project';

// blazon.plugins.lock records, for each plugin, what it must contain (RFC 0005 section 3.4: the pin lives on
// the host's side, in a file the host checks like the program itself, and records whether the digest was vouched or
// computed). It is read strictly, written atomically, and refused when others can write it.

const lockPath = (cwd: string) => path.join(cwd, LOCK_FILE);

function plugin(cwd: string, name = 'acme.house-style'): string {
  const dir = path.join(cwd, 'plugins', name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `blazon-${name}`), '#!/bin/sh\nexit 0\n');
  fs.chmodSync(path.join(dir, `blazon-${name}`), 0o755);
  return dir;
}

const HEX = 'a'.repeat(64);
const write = (cwd: string, content: unknown, mode = 0o644) => {
  fs.writeFileSync(lockPath(cwd), typeof content === 'string' ? content : JSON.stringify(content));
  fs.chmodSync(lockPath(cwd), mode);
};

describe('reading the lock', () => {
  it('is empty when there is no file, and that is not a problem', () => {
    const { lock, problems } = readLock(tempDir());
    expect(lock).toEqual({ v: 1, plugins: {} });
    expect(problems).toEqual([]);
  });

  it('reads an entry for a tree and one for a file', () => {
    const cwd = tempDir();
    write(cwd, {
      v: 1,
      plugins: {
        'acme.house-style': { kind: 'tree', path: 'plugins/acme.house-style', entry: 'blazon-acme.house-style', digest: `t1:${HEX}`, source: 'computed' },
        'acme.deck': { kind: 'file', path: '/opt/acme/blazon-acme.deck', digest: `sha256:${HEX}`, source: 'vouched' },
      },
    });
    const { lock, problems } = readLock(cwd);
    expect(problems).toEqual([]);
    expect(Object.keys(lock.plugins)).toEqual(['acme.house-style', 'acme.deck']);
    expect(lock.plugins['acme.deck']).toMatchObject({ kind: 'file', source: 'vouched' });
  });

  it.each<[string, unknown, string]>([
    ['text that is not JSON', 'not json', 'is not valid JSON'],
    ['a top level that is not an object', [], 'must be an object'],
    ['an unknown top-level key', { v: 1, plugins: {}, extra: 1 }, 'unknown key "extra"; known: v, plugins'],
    ['a version other than 1', { v: 2, plugins: {} }, 'v must be 1'],
    ['plugins that is not an object', { v: 1, plugins: [] }, 'plugins must be an object keyed by plugin name'],
    ['a name that is not a plugin name', { v: 1, plugins: { Bad: { kind: 'file', path: 'x', digest: `sha256:${HEX}`, source: 'computed' } } }, '"Bad" is not a plugin name'],
    ['an entry that is not an object', { v: 1, plugins: { 'acme.a': 'x' } }, 'acme.a: must be an object'],
    ['an unknown field in an entry', { v: 1, plugins: { 'acme.a': { kind: 'file', path: 'x', digest: `sha256:${HEX}`, source: 'computed', note: 'x' } } }, 'acme.a: unknown field "note"; known: kind, path, entry, digest, files, source'],
    ['a kind that is not file or tree', { v: 1, plugins: { 'acme.a': { kind: 'zip', path: 'x', digest: `sha256:${HEX}`, source: 'computed' } } }, 'acme.a: kind must be file or tree'],
    ['an empty path', { v: 1, plugins: { 'acme.a': { kind: 'file', path: '', digest: `sha256:${HEX}`, source: 'computed' } } }, 'acme.a: path must be a non-empty string'],
    ['a digest of the wrong scheme for a file', { v: 1, plugins: { 'acme.a': { kind: 'file', path: 'x', digest: `t1:${HEX}`, source: 'computed' } } }, 'acme.a: a file pin has a digest written sha256:<64 hex digits>'],
    ['a digest of the wrong scheme for a tree', { v: 1, plugins: { 'acme.a': { kind: 'tree', path: 'x', entry: 'e', digest: `sha256:${HEX}`, source: 'computed' } } }, 'acme.a: a tree pin has a digest written t1:<64 hex digits>'],
    ['a digest in capitals', { v: 1, plugins: { 'acme.a': { kind: 'file', path: 'x', digest: `sha256:${'A'.repeat(64)}`, source: 'computed' } } }, 'acme.a: a file pin has a digest written sha256:<64 hex digits>'],
    ['a source that is not vouched or computed', { v: 1, plugins: { 'acme.a': { kind: 'file', path: 'x', digest: `sha256:${HEX}`, source: 'trust-me' } } }, 'acme.a: source must be vouched or computed'],
    ['a tree with no entry', { v: 1, plugins: { 'acme.a': { kind: 'tree', path: 'x', digest: `t1:${HEX}`, source: 'computed' } } }, 'acme.a: a tree pin needs an entry: the relative path of the program inside it'],
    ['a tree entry that leaves the tree', { v: 1, plugins: { 'acme.a': { kind: 'tree', path: 'x', entry: '../outside', digest: `t1:${HEX}`, source: 'computed' } } }, 'acme.a: entry must be a relative path inside the tree'],
    ['an absolute tree entry', { v: 1, plugins: { 'acme.a': { kind: 'tree', path: 'x', entry: '/bin/sh', digest: `t1:${HEX}`, source: 'computed' } } }, 'acme.a: entry must be a relative path inside the tree'],
    ['an entry on a file pin', { v: 1, plugins: { 'acme.a': { kind: 'file', path: 'x', entry: 'e', digest: `sha256:${HEX}`, source: 'computed' } } }, 'acme.a: a file pin has no entry'],
  ])('refuses %s, as plugin-lock-invalid, naming the plugin and the mistake', (_name, content, message) => {
    const cwd = tempDir();
    write(cwd, content);
    const { problems } = readLock(cwd);
    expect(problems.map((p) => [p.code, p.severity, p.path])).toEqual([['plugin-lock-invalid', 'error', LOCK_FILE]]);
    expect(problems[0]!.message).toContain(message);
  });

  it('lists every mistake, not the first', () => {
    const cwd = tempDir();
    write(cwd, { v: 1, plugins: { 'acme.a': { kind: 'zip', path: '', digest: 'x', source: 'no' } } });
    expect(readLock(cwd).problems.length).toBeGreaterThanOrEqual(4);
  });

  it('refuses a lock that group or others can write, like the program itself', () => {
    const cwd = tempDir();
    write(cwd, { v: 1, plugins: {} }, 0o664);
    const { problems } = readLock(cwd);
    expect(problems).toHaveLength(1);
    expect(problems[0]!.message).toContain('is writable by group or others');
  });

  it('gives an empty lock when it is invalid, so no plugin is trusted by a lock that cannot be read', () => {
    const cwd = tempDir();
    write(cwd, { v: 1, plugins: { 'acme.a': { kind: 'file', path: 'x', digest: 'bad', source: 'computed' } } });
    expect(readLock(cwd).lock.plugins).toEqual({});
  });
});

describe('writing the lock', () => {
  it('is sorted by plugin name, two-space JSON with a final newline, and the same bytes every time', () => {
    const cwd = tempDir();
    const lock: Lock = {
      v: 1,
      plugins: {
        'zeta.b': { kind: 'file', path: 'b', digest: `sha256:${HEX}`, source: 'computed' },
        'acme.a': { kind: 'file', path: 'a', digest: `sha256:${HEX}`, source: 'vouched' },
      },
    };
    writeLock(cwd, lock);
    const first = fs.readFileSync(lockPath(cwd), 'utf-8');
    expect(first.endsWith('}\n')).toBe(true);
    expect(Object.keys(JSON.parse(first).plugins)).toEqual(['acme.a', 'zeta.b']);
    writeLock(cwd, lock);
    expect(fs.readFileSync(lockPath(cwd), 'utf-8')).toBe(first);
  });

  it('is atomic: nothing is left beside it, and the mode is not writable by group or others', () => {
    const cwd = tempDir();
    writeLock(cwd, { v: 1, plugins: {} });
    expect(fs.readdirSync(cwd)).toEqual([LOCK_FILE]);
    expect(fs.statSync(lockPath(cwd)).mode & 0o022).toBe(0);
  });
});

describe('recording a pin', () => {
  it('computes the digest of a tree, with its entry, and says it was computed', () => {
    const cwd = tempDir();
    const dir = plugin(cwd);
    const entry = recordPin(cwd, 'acme.house-style', dir);
    expect(entry).toEqual({ kind: 'tree', path: 'plugins/acme.house-style', entry: 'blazon-acme.house-style', digest: treeDigest(dir), files: treeLines(dir), source: 'computed' });
    expect(readLock(cwd).lock.plugins['acme.house-style']).toEqual(entry);
  });

  it('computes the digest of a file', () => {
    const cwd = tempDir();
    const file = path.join(plugin(cwd), 'blazon-acme.house-style');
    expect(recordPin(cwd, 'acme.house-style', file)).toMatchObject({ kind: 'file', digest: fileDigest(file), source: 'computed' });
  });

  it('takes the entry from the caller when the program is not named blazon-<name>', () => {
    const cwd = tempDir();
    const dir = plugin(cwd);
    fs.renameSync(path.join(dir, 'blazon-acme.house-style'), path.join(dir, 'run'));
    expect(() => recordPin(cwd, 'acme.house-style', dir)).toThrow(/needs --entry/);
    expect(recordPin(cwd, 'acme.house-style', dir, { entry: 'run' })).toMatchObject({ entry: 'run' });
  });

  it('records a digest the operator vouched for when the bytes match it, and says so', () => {
    const cwd = tempDir();
    const dir = plugin(cwd);
    expect(recordPin(cwd, 'acme.house-style', dir, { digest: treeDigest(dir) })).toMatchObject({ source: 'vouched' });
  });

  it('refuses a digest the operator vouched for when the bytes are not those, and writes nothing', () => {
    const cwd = tempDir();
    const dir = plugin(cwd);
    expect(() => recordPin(cwd, 'acme.house-style', dir, { digest: `t1:${HEX}` })).toThrow(/not the t1:a+ you vouched for/);
    expect(fs.existsSync(lockPath(cwd))).toBe(false);
  });

  it('keeps the other entries, and replaces one of the same name', () => {
    const cwd = tempDir();
    recordPin(cwd, 'acme.a', plugin(cwd, 'acme.a'));
    const b = plugin(cwd, 'acme.b');
    recordPin(cwd, 'acme.b', b);
    fs.appendFileSync(path.join(b, 'blazon-acme.b'), '# changed\n');
    recordPin(cwd, 'acme.b', b);
    const { lock } = readLock(cwd);
    expect(Object.keys(lock.plugins)).toEqual(['acme.a', 'acme.b']);
    expect(lock.plugins['acme.b']!.digest).toBe(treeDigest(b));
  });

  it('refuses a name that is not a plugin name, a symlink, and a lock it cannot read', () => {
    const cwd = tempDir();
    const dir = plugin(cwd);
    expect(() => recordPin(cwd, 'Bad Name', dir)).toThrow(/not a plugin name/);
    fs.symlinkSync(dir, path.join(cwd, 'link'));
    expect(() => recordPin(cwd, 'acme.house-style', path.join(cwd, 'link'))).toThrow(/refused: symlink/);
    write(cwd, 'not json');
    expect(() => recordPin(cwd, 'acme.house-style', dir)).toThrow(/blazon\.plugins\.lock/);
  });

  it('stores a path inside the project relative to it, and one outside as it is', () => {
    const cwd = tempDir();
    const outside = tempDir();
    const dir = plugin(outside, 'acme.other');
    expect(recordPin(cwd, 'acme.house-style', plugin(cwd)).path).toBe('plugins/acme.house-style');
    expect(recordPin(cwd, 'acme.other', dir).path).toBe(dir);
  });

  it('gives back a pin that verifies, from the lock', () => {
    const cwd = tempDir();
    recordPin(cwd, 'acme.house-style', plugin(cwd));
    const pin = pinFor(cwd, readLock(cwd).lock.plugins['acme.house-style']!);
    expect(() => pin.check()).not.toThrow();
    expect(pin.path).toBe(path.join(cwd, 'plugins/acme.house-style'));
  });
});
