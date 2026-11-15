import { describe, it, expect } from 'vitest';
import { execFileSync } from '../../support/spawn';
import fs from 'node:fs';
import path from 'node:path';
import { Pin, PinMismatch, Refused, fileDigest, sha256File, treeDigest, MAX_ENTRIES, MAX_BYTES } from '../../../src/plugins/pins/pin.js';
import { run } from '../../../src/plugins/host/call.js';
import { caseFiles, loadCase, materialize, name } from '../support/spec.js';
import { tempDir } from '../../support/project';

// RFC 0005 section 3.4: the digest of a file or a tree, a verified private copy of what a pin names, and
// what a host must refuse. The corpus gives the vectors; the rest are the rules a host's own tests must show.

describe('digests, against the corpus', () => {
  for (const folder of ['valid', 'invalid']) {
    for (const file of caseFiles(folder, 'tree-digest')) {
      it(`agrees with ${name(file)}`, () => {
        const found = loadCase(file, ['about', 'kind', 'root', 'entries', 'digest', 'refuse']);
        const target = materialize(found, tempDir());
        const digest = found.kind === 'tree' ? treeDigest : fileDigest;
        if (folder === 'invalid') expect(() => digest(target), found.about).toThrow(Refused);
        else expect(digest(target), found.about).toBe(found.digest);
      });
    }
  }
});

function original(files: Record<string, { content: string; exec?: boolean }>): string {
  const root = path.join(tempDir(), 'orig');
  fs.mkdirSync(root);
  for (const [rel, file] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), file.content);
    fs.chmodSync(path.join(root, rel), file.exec ? 0o755 : 0o644);
  }
  return root;
}
const write = (root: string, rel: string, content: string, exec = true) => {
  fs.rmSync(path.join(root, rel), { force: true });
  fs.writeFileSync(path.join(root, rel), content);
  fs.chmodSync(path.join(root, rel), exec ? 0o755 : 0o644);
};
const treePin = (root: string, entry: string) => new Pin('tree', root, treeDigest(root), entry);

describe('a pin that no longer matches', () => {
  it('a file pin: bytes changed after pinning are refused, by the check and by verify', () => {
    const root = original({ run: { content: '#!/bin/sh\n', exec: true } });
    const pin = new Pin('file', path.join(root, 'run'), fileDigest(path.join(root, 'run')));
    pin.check();
    write(root, 'run', '#!/bin/sh\necho changed\n');
    expect(() => pin.check()).toThrow(PinMismatch);
    const store = tempDir();
    expect(() => pin.verify(store)).toThrow(PinMismatch);
    expect(fs.readdirSync(store), 'the directory made for the copy is gone').toEqual([]);
  });

  it('a tree pin: a changed file, an added file and a changed execute bit are each a mismatch', () => {
    const root = original({ 'bin/run': { content: '#!/bin/sh\n', exec: true }, 'lib/data': { content: 'x', exec: false } });
    const pin = treePin(root, 'bin/run');
    pin.check();
    write(root, 'lib/data', 'changed', false);
    expect(() => pin.check()).toThrow(PinMismatch);
    write(root, 'lib/data', 'x', false);
    pin.check();
    fs.writeFileSync(path.join(root, 'lib/extra'), 'new');
    expect(() => pin.check()).toThrow(PinMismatch);
    fs.rmSync(path.join(root, 'lib/extra'));
    fs.chmodSync(path.join(root, 'lib/data'), 0o755);
    expect(() => pin.check()).toThrow(PinMismatch);
  });

  it('a mismatch names the plugin by both digests', () => {
    const root = original({ run: { content: '#!/bin/sh\n', exec: true } });
    const pin = treePin(root, 'run');
    write(root, 'run', 'other');
    try {
      pin.check();
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(PinMismatch);
      expect((err as PinMismatch).message).toContain(pin.digest);
      expect((err as PinMismatch).message).toContain((err as PinMismatch).got);
    }
  });
});

describe('what a host refuses', () => {
  it('a pinned path replaced by a symlink to another file', () => {
    const root = original({ run: { content: '#!/bin/sh\n', exec: true }, other: { content: '#!/bin/sh\n', exec: true } });
    const pin = new Pin('file', path.join(root, 'run'), fileDigest(path.join(root, 'run')));
    fs.rmSync(path.join(root, 'run'));
    fs.symlinkSync(path.join(root, 'other'), path.join(root, 'run'));
    expect(() => pin.check()).toThrow(Refused);
    expect(() => pin.verify(tempDir())).toThrow(Refused);
  });

  it('a symlink put into a pinned tree', () => {
    const root = original({ 'bin/run': { content: '#!/bin/sh\n', exec: true } });
    const pin = treePin(root, 'bin/run');
    fs.symlinkSync('bin/run', path.join(root, 'link'));
    expect(() => pin.check()).toThrow(Refused);
    expect(() => pin.verify(tempDir())).toThrow(Refused);
  });

  it('a FIFO swapped in after the tree was recognized, without blocking on it', () => {
    const root = original({ run: { content: '#!/bin/sh\n', exec: true } });
    fs.rmSync(path.join(root, 'run'));
    execFileSync('mkfifo', [path.join(root, 'run')]);
    expect(() => sha256File(path.join(root, 'run'))).toThrow(/not a regular file/);
  });

  it('a file that grew after it was measured, past the byte budget', () => {
    const root = original({ data: { content: 'x'.repeat(9) } });
    expect(() => sha256File(path.join(root, 'data'), { left: 8 })).toThrow(/too big/);
  });

  it(`a tree of more than ${MAX_ENTRIES} entries`, () => {
    const root = path.join(tempDir(), 'many');
    fs.mkdirSync(root);
    for (let i = 0; i <= MAX_ENTRIES; i++) fs.writeFileSync(path.join(root, `f${i}`), '');
    expect(() => treeDigest(root)).toThrow(/too many entries/);
  }, 60_000); // writes more than 10,000 files: well over the 5s default on a slow disk

  it(`a tree of more than ${MAX_BYTES} bytes, measured by stat before anything is read`, () => {
    const root = original({ run: { content: '#!/bin/sh\n', exec: true } });
    fs.truncateSync(path.join(root, 'run'), MAX_BYTES + 1); // a sparse file: nothing is written
    expect(() => treeDigest(root)).toThrow(/too big/);
  });
});

describe('a verified copy', () => {
  it('is made in a private directory the original is never run from', () => {
    const root = original({ 'bin/run': { content: '#!/bin/sh\n', exec: true } });
    const { directory, program } = treePin(root, 'bin/run').verify(tempDir());
    expect(fs.statSync(directory).mode & 0o777).toBe(0o700);
    expect(program.startsWith(root)).toBe(false);
    expect(treeDigest(path.dirname(path.dirname(program)))).toBe(treeDigest(root));
  });

  it('keeps the execute bit of a directory, as the digest counts it', () => {
    const root = original({ run: { content: '#!/bin/sh\n', exec: true } });
    fs.mkdirSync(path.join(root, 'empty'), { mode: 0o600 });
    fs.chmodSync(path.join(root, 'empty'), 0o600);
    const pin = treePin(root, 'run');
    const { directory, program } = pin.verify();
    try {
      expect(treeDigest(path.dirname(program))).toBe(pin.digest);
      expect(fs.statSync(path.join(path.dirname(program), 'empty')).mode & 0o100).toBe(0);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it.each([
    ['an absolute entry', '/etc/passwd'],
    ['an entry that leaves the tree', '../outside'],
    ['an entry that is not there', 'bin/missing'],
    ['an entry that is a directory', 'bin'],
  ])('refuses %s, and leaves nothing behind', (_name, entry) => {
    const root = original({ 'bin/run': { content: '#!/bin/sh\n', exec: true } });
    const store = tempDir();
    expect(() => treePin(root, entry).verify(store)).toThrow(Refused);
    expect(fs.readdirSync(store)).toEqual([]);
  });
});

describe('a pinned call', () => {
  it('runs the verified copy from its own directory, and removes the copy', async () => {
    const root = original({ 'bin/plugin': { content: '#!/bin/sh\npwd -P\n', exec: true } });
    const store = tempDir();
    const result = await run({ timeout: 5, pin: treePin(root, 'bin/plugin'), store });
    expect(result.answered, result.breakReason).toBe(true);
    const ranIn = result.stdout.toString().trim();
    expect(ranIn.startsWith(fs.realpathSync(store))).toBe(true);
    expect(ranIn.endsWith('/tree/bin')).toBe(true);
    expect(ranIn.startsWith(root)).toBe(false);
    expect(fs.readdirSync(store), 'the copy was not removed').toEqual([]);
  });

  it('a pin that no longer matches is unavailable, and nothing runs', async () => {
    const marker = path.join(tempDir(), 'ran');
    const root = original({ plugin: { content: `#!/bin/sh\ntouch ${marker}\n`, exec: true } });
    const pin = treePin(root, 'plugin');
    write(root, 'plugin', `#!/bin/sh\ntouch ${marker}\necho changed\n`);
    const result = await run({ timeout: 5, pin, store: tempDir() });
    expect(result.answered).toBe(false);
    expect(result.breakReason.startsWith('unavailable: pin:')).toBe(true);
    expect(fs.existsSync(marker)).toBe(false);
  });

  it('a pinned call has no program or directory of its own', async () => {
    const root = original({ plugin: { content: '#!/bin/sh\n', exec: true } });
    const result = await run({ timeout: 5, pin: treePin(root, 'plugin'), program: '/bin/true', store: tempDir() });
    expect(result.answered).toBe(false);
    expect(result.breakReason).toContain('pinned call');
  });
});
