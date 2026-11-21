import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { replaceFolder, writeFolder } from '../../../src/shipped/shared/folder.js';

const roots: string[] = [];
const temp = (): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blazon-folder-'));
  roots.push(root);
  return root;
};
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function* failing(): Generator<[string, string]> {
  yield ['a.txt', 'one'];
  throw new Error('disk full');
}

describe('replaceFolder', () => {
  it('replaces the folder with exactly the set, nested files included', () => {
    const root = temp();
    const dir = path.join(root, 'Acme');
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'stale.txt'), 'old');
    replaceFolder(dir, [
      ['a.txt', 'one'],
      ['sub/b.bin', Buffer.from([1, 2])],
    ]);
    expect(fs.readdirSync(dir).sort()).toEqual(['a.txt', 'sub']);
    expect(fs.readFileSync(path.join(dir, 'sub/b.bin'))).toEqual(Buffer.from([1, 2]));
    expect(fs.readdirSync(root)).toEqual(['Acme']);
  });

  it('leaves the old folder and no temp folder when the set cannot be written', () => {
    const root = temp();
    const dir = path.join(root, 'Acme');
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'keep.txt'), 'old');
    expect(() => replaceFolder(dir, failing())).toThrow('disk full');
    expect(fs.readdirSync(dir)).toEqual(['keep.txt']);
    expect(fs.readdirSync(root)).toEqual(['Acme']);
  });
});

describe('writeFolder', () => {
  it('adds the set and keeps other files, with no temp folder left', () => {
    const dir = temp();
    fs.writeFileSync(path.join(dir, 'other.txt'), 'x');
    writeFolder(dir, [['a.txt', 'one']]);
    expect(fs.readdirSync(dir).sort()).toEqual(['a.txt', 'other.txt']);
  });

  it('writes nothing when the set cannot be made', () => {
    const dir = temp();
    expect(() => writeFolder(dir, failing())).toThrow('disk full');
    expect(fs.readdirSync(dir)).toEqual([]);
  });
});
