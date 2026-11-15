import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { LOCK_FILE, pinFor, readLock, recordPin } from '../../../src/plugins/pins/lock.js';
import { Pin, PinMismatch, diffTree, linesDigest, treeDigest, treeLines } from '../../../src/plugins/pins/pin.js';
import { tempDir } from '../../support/project';

// A pin mismatch used to say "pinned t1:..., found t1:...": two hashes, no file. The tree digest is the SHA-256 of one line for each file,
// and the lock can keep those lines. They check themselves against the digest, so naming the files that changed takes no new trust.

function tree(files: Record<string, { content: string; exec?: boolean }>): string {
  const root = path.join(tempDir(), 'orig');
  fs.mkdirSync(root);
  for (const [rel, file] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), file.content);
    fs.chmodSync(path.join(root, rel), file.exec ? 0o755 : 0o644);
  }
  return root;
}
const FILES = { 'bin/run': { content: '#!/bin/sh\n', exec: true }, 'lib/data': { content: 'x' }, 'lib/other': { content: 'y' } };
const message = (fn: () => void): string => {
  try {
    fn();
  } catch (err) {
    return (err as Error).message;
  }
  throw new Error('expected a PinMismatch');
};

describe('the lines of a tree digest', () => {
  it('are what the digest is the SHA-256 of', () => {
    const root = tree(FILES);
    const lines = treeLines(root)!;
    expect(lines).toContain(`f x bin/run ${crypto.createHash('sha256').update('#!/bin/sh\n').digest('hex')}`);
    expect(lines).toContainEqual(expect.stringMatching(/^d [x-] lib -$/));
    expect(linesDigest(lines)).toBe(treeDigest(root));
  });

  it('are not offered for a name that is not valid UTF-8, which JSON cannot hold', (ctx) => {
    const root = tree(FILES);
    try {
      fs.writeFileSync(Buffer.concat([Buffer.from(`${root}/`), Buffer.from([0xff, 0xfe])]), 'z');
    } catch {
      ctx.skip(); // this file system (APFS) refuses such a name, so there is no tree to try
    }
    expect(treeLines(root)).toBeUndefined();
    expect(treeDigest(root)).toMatch(/^t1:[0-9a-f]{64}$/);
  });
});

describe('a mismatch that names the files', () => {
  const pinned = () => {
    const root = tree(FILES);
    return { root, pin: new Pin('tree', root, treeDigest(root), 'bin/run', treeLines(root)) };
  };

  it('says modified, added, removed and mode changed, each with its path', () => {
    const { root, pin } = pinned();
    fs.writeFileSync(path.join(root, 'lib/data'), 'changed');
    fs.writeFileSync(path.join(root, 'lib/new'), 'n');
    fs.rmSync(path.join(root, 'lib/other'));
    fs.chmodSync(path.join(root, 'bin/run'), 0o644);
    const text = message(() => pin.check());
    expect(text).toMatch(/^pin mismatch: pinned t1:[0-9a-f]{64}, found t1:[0-9a-f]{64}; /);
    expect(text).toContain('mode changed bin/run');
    expect(text).toContain('modified lib/data');
    expect(text).toContain('added lib/new');
    expect(text).toContain('removed lib/other');
    expect(text).toContain('review the change and pin it again');
  });

  it('is the same from verify, which hashes the copy', () => {
    const { root, pin } = pinned();
    fs.writeFileSync(path.join(root, 'lib/data'), 'changed');
    expect(message(() => pin.verify(tempDir()))).toContain('modified lib/data');
  });

  it('gives the changes as data, sorted by path', () => {
    const { root, pin } = pinned();
    fs.writeFileSync(path.join(root, 'lib/other'), 'o');
    fs.writeFileSync(path.join(root, 'lib/data'), 'd');
    try {
      pin.check();
    } catch (err) {
      expect((err as PinMismatch).changes).toEqual([
        { path: 'lib/data', change: 'modified' },
        { path: 'lib/other', change: 'modified' },
      ]);
    }
  });

  it('names the first ten and counts the rest', () => {
    const many = Object.fromEntries(Array.from({ length: 14 }, (_, i) => [`f${String(i).padStart(2, '0')}`, { content: 'a' }]));
    const root = tree({ ...many, run: { content: '#!/bin/sh\n', exec: true } });
    const pin = new Pin('tree', root, treeDigest(root), 'run', treeLines(root));
    for (const name of Object.keys(many)) fs.writeFileSync(path.join(root, name), 'b');
    const text = message(() => pin.check());
    expect(text).toContain('modified f09');
    expect(text).not.toContain('f10');
    expect(text).toContain('and 4 more');
  });

  it('keeps the hint of a pin without the list: a file changed, so review it and pin it again', () => {
    const root = tree(FILES);
    const pin = new Pin('tree', root, treeDigest(root), 'bin/run');
    fs.writeFileSync(path.join(root, 'lib/data'), 'changed');
    const text = message(() => pin.check());
    expect(text).toContain('a file in the plugin changed after it was pinned');
    expect(text).not.toContain('modified');
  });
});

describe('diffTree', () => {
  const line = (type: string, x: string, p: string, h: string) => `${type} ${x} ${p} ${h}`;
  const A = 'a'.repeat(64);
  const B = 'b'.repeat(64);

  it('reads a path that has spaces in it', () => {
    expect(diffTree([line('f', '-', 'a b/c d', A)], [line('f', '-', 'a b/c d', B)])).toEqual([{ path: 'a b/c d', change: 'modified' }]);
  });

  it('is empty for two equal lists', () => {
    expect(diffTree([line('f', 'x', 'run', A)], [line('f', 'x', 'run', A)])).toEqual([]);
  });
});

describe('the lock', () => {
  const lockOf = (cwd: string) => JSON.parse(fs.readFileSync(path.join(cwd, LOCK_FILE), 'utf-8'));

  function pinned() {
    const cwd = tempDir();
    const dir = path.join(cwd, 'plugins/acme.house-style');
    fs.mkdirSync(path.dirname(dir), { recursive: true });
    fs.cpSync(tree({ 'blazon-acme.house-style': { content: '#!/bin/sh\nexit 0\n', exec: true }, 'lib/x': { content: 'x' } }), dir, { recursive: true });
    return { cwd, dir };
  }

  it('keeps the lines of a tree pin, and they hash to its digest', () => {
    const { cwd, dir } = pinned();
    const entry = recordPin(cwd, 'acme.house-style', dir);
    expect(entry.files).toEqual(treeLines(dir));
    expect(linesDigest(entry.files!)).toBe(entry.digest);
    expect(lockOf(cwd).plugins['acme.house-style'].files).toEqual(entry.files);
  });

  it('gives a pin that names the files when a pinned file changes', () => {
    const { cwd, dir } = pinned();
    recordPin(cwd, 'acme.house-style', dir);
    fs.writeFileSync(path.join(dir, 'lib/x'), 'changed');
    const { lock } = readLock(cwd);
    expect(message(() => pinFor(cwd, lock.plugins['acme.house-style']!).check())).toContain('modified lib/x');
  });

  it('keeps no list for a file pin', () => {
    const cwd = tempDir();
    const file = path.join(cwd, 'blazon-acme.one');
    fs.writeFileSync(file, '#!/bin/sh\n');
    fs.chmodSync(file, 0o755);
    expect(recordPin(cwd, 'acme.one', file).files).toBeUndefined();
  });

  it('refuses a list that does not hash to the digest, so a tampered list is not believed', () => {
    const { cwd, dir } = pinned();
    recordPin(cwd, 'acme.house-style', dir);
    const lock = lockOf(cwd);
    lock.plugins['acme.house-style'].files[0] = lock.plugins['acme.house-style'].files[0].replace(/ [0-9a-f]{64}$/, ` ${'0'.repeat(64)}`);
    fs.writeFileSync(path.join(cwd, LOCK_FILE), JSON.stringify(lock));
    const { problems } = readLock(cwd);
    expect(problems.map((p) => p.message).join('\n')).toContain('files do not hash to the digest');
  });

  it('refuses a list that is not a list of lines, and one on a file pin', () => {
    const { cwd, dir } = pinned();
    recordPin(cwd, 'acme.house-style', dir);
    const lock = lockOf(cwd);
    lock.plugins['acme.house-style'].files = ['not a line'];
    fs.writeFileSync(path.join(cwd, LOCK_FILE), JSON.stringify(lock));
    expect(readLock(cwd).problems.map((p) => p.message).join('\n')).toContain('files must be lines');
    lock.plugins['acme.house-style'] = { kind: 'file', path: 'x', digest: `sha256:${'a'.repeat(64)}`, source: 'computed', files: [] };
    fs.writeFileSync(path.join(cwd, LOCK_FILE), JSON.stringify(lock));
    expect(readLock(cwd).problems.map((p) => p.message).join('\n')).toContain('a file pin has no files');
  });

  it('still reads a lock without the list', () => {
    const { cwd, dir } = pinned();
    const { files: _omitted, ...entry } = recordPin(cwd, 'acme.house-style', dir);
    fs.writeFileSync(path.join(cwd, LOCK_FILE), JSON.stringify({ v: 1, plugins: { 'acme.house-style': entry } }));
    expect(readLock(cwd).problems).toEqual([]);
  });
});
