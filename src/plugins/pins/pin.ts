import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Pins (RFC 0005 section 3.4): the digest of a file or a tree, a verified private copy of what a pin
// names, and the refusals a host must make. A pin is a value the caller holds; the lock file that records one is
// the host's own business.

export const MAX_ENTRIES = 10_000;
export const MAX_BYTES = 256 * 1024 * 1024;

/** A path a host must refuse to hash or copy. */
export class Refused extends Error {
  constructor(
    readonly reason: string,
    where: string | Buffer
  ) {
    super(`refused: ${reason}: ${JSON.stringify(where.toString())}`);
    this.name = 'Refused';
  }
}

/** What differs between the pinned tree and the one found: one path and how it changed. */
export interface TreeChange {
  path: string;
  change: 'modified' | 'added' | 'removed' | 'mode changed';
}

const NAMED = 10;

/** "modified lib/data, added lib/new" for the first ten changes, then how many more. */
function describeChanges(changes: TreeChange[]): string {
  const shown = changes
    .slice(0, NAMED)
    .map((c) => `${c.change} ${c.path}`)
    .join(', ');
  return changes.length > NAMED ? `${shown} and ${changes.length - NAMED} more` : shown;
}

/** A pin that no longer matches: the plugin is not run. `changes` names the files, when the pin kept the list of them. */
export class PinMismatch extends Error {
  constructor(
    readonly want: string,
    readonly got: string,
    readonly changes?: TreeChange[]
  ) {
    const what =
      changes && changes.length > 0
        ? `${describeChanges(changes)}; review the change and pin it again`
        : 'a file in the plugin changed after it was pinned (an edit, or a formatter run over the folder), so review the change and pin it again';
    super(`pin mismatch: pinned ${want}, found ${got}; ${what}`);
    this.name = 'PinMismatch';
  }
}

interface Entry {
  isDir: boolean;
  exec: boolean;
  /** Relative to the tree, with `/` as the separator. Held as bytes, because a name is bytes and the digest sorts by them */
  rel: Buffer;
  abs: Buffer;
}

const SLASH = Buffer.from('/');
const join = (directory: Buffer | string, rel: Buffer): Buffer => Buffer.concat([Buffer.isBuffer(directory) ? directory : Buffer.from(directory), SLASH, rel]);

/**
 * The tree as a list sorted by the bytes of the relative path. Read with lstat, never following a symlink, and
 * refused before anything is hashed or copied.
 */
function recognize(root: string): Entry[] {
  const stat = fs.lstatSync(root);
  if (stat.isSymbolicLink()) throw new Refused('symlink', root);
  if (!stat.isDirectory()) throw new Refused('not a directory', root);
  const entries: Entry[] = [];
  let total = 0;
  const stack: Buffer[] = [Buffer.alloc(0)];
  while (stack.length > 0) {
    const relDir = stack.pop()!;
    const names = fs.readdirSync(relDir.length > 0 ? join(root, relDir) : root, { encoding: 'buffer' });
    for (const name of names) {
      const rel = relDir.length > 0 ? Buffer.concat([relDir, SLASH, name]) : Buffer.from(name);
      if (name.some((byte) => byte < 0x20 || byte === 0x7f)) throw new Refused('name', rel);
      const abs = join(root, rel);
      const info = fs.lstatSync(abs);
      const exec = (info.mode & 0o100) !== 0;
      if (info.isSymbolicLink()) throw new Refused('symlink', rel);
      if (info.isDirectory()) {
        entries.push({ isDir: true, exec, rel, abs });
        stack.push(rel);
      } else if (info.isFile()) {
        entries.push({ isDir: false, exec, rel, abs });
        total += info.size;
      } else throw new Refused('special', rel);
      if (entries.length > MAX_ENTRIES) throw new Refused('too many entries', root);
      if (total > MAX_BYTES) throw new Refused('too big', root);
    }
  }
  return entries.sort((a, b) => Buffer.compare(a.rel, b.rel));
}

/**
 * Feed a regular file to `consume`, and return how many bytes it held. `budget` is what is left of the byte limit,
 * which the file may not exceed even if it grew after it was measured. The open refuses a symlink and does not block
 * on a FIFO swapped in after the tree was recognized.
 */
function readInto(file: string | Buffer, consume: (block: Buffer) => void, budget?: { left: number }): number {
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    if (!fs.fstatSync(fd).isFile()) throw new Refused('not a regular file', file);
    const block = Buffer.allocUnsafe(1 << 16);
    let total = 0;
    for (;;) {
      const n = fs.readSync(fd, block, 0, block.length, null);
      if (n === 0) return total;
      total += n;
      if (budget && total > budget.left) throw new Refused('too big', file);
      consume(block.subarray(0, n));
    }
  } finally {
    fs.closeSync(fd);
  }
}

/** The sha256, as hex, of a regular file. `budget`, when given, is reduced by the bytes read. */
export function sha256File(file: string | Buffer, budget?: { left: number }): string {
  const hash = crypto.createHash('sha256');
  const size = readInto(file, (block) => hash.update(block), budget);
  if (budget) budget.left -= size;
  return hash.digest('hex');
}

/** One line for each entry of the tree, sorted by path, each ending in LF: `<f|d> <x|-> <path> <sha256 of the file, or ->`. */
function manifest(root: string): Buffer[] {
  const budget = { left: MAX_BYTES };
  return recognize(root).map(({ isDir, exec, rel, abs }) => {
    const last = isDir ? '-' : sha256File(abs, budget);
    return Buffer.concat([Buffer.from(`${isDir ? 'd' : 'f'} ${exec ? 'x' : '-'} `), rel, Buffer.from(` ${last}\n`)]);
  });
}

/** The `t1:` digest of a directory: the sha256 of the lines `<f|d> <x|-> <path> <sha256 of the file, or ->` LF, sorted by path. */
export function treeDigest(root: string): string {
  const summary = crypto.createHash('sha256');
  for (const line of manifest(root)) summary.update(line);
  return `t1:${summary.digest('hex')}`;
}

/**
 * The lines the tree digest is the hash of, without their LF, so a lock can keep them and a mismatch can name the files. Undefined when
 * a name is not valid UTF-8, which JSON cannot hold: that tree is pinned by its digest alone.
 */
export function treeLines(root: string): string[] | undefined {
  const lines = manifest(root).map((line) => line.subarray(0, line.length - 1));
  const text = lines.map((line) => line.toString('utf8'));
  return text.every((t, i) => Buffer.from(t, 'utf8').equals(lines[i]!)) ? text : undefined;
}

/** The `t1:` digest of such lines: what a list in the lock must hash to, or it is not the list that was pinned. */
export function linesDigest(lines: readonly string[]): string {
  return `t1:${crypto.createHash('sha256').update(lines.map((line) => `${line}\n`).join('')).digest('hex')}`;
}

/** One line of a tree digest: the type, the execute bit, the path (which may hold spaces) and the sha256 of a file or `-`. */
export const TREE_LINE = /^([fd]) ([x-]) (.+) (-|[0-9a-f]{64})$/;

/** What changed between the pinned lines and the lines found, by path. */
export function diffTree(pinned: readonly string[], found: readonly string[]): TreeChange[] {
  const parse = (lines: readonly string[]) =>
    new Map(
      lines.flatMap((line) => {
        const m = TREE_LINE.exec(line);
        return m ? [[m[3]!, m] as const] : [];
      })
    );
  const before = parse(pinned);
  const after = parse(found);
  const changes: TreeChange[] = [];
  for (const [name, b] of before) {
    const a = after.get(name);
    if (!a) changes.push({ path: name, change: 'removed' });
    else if (a[1] !== b[1] || a[4] !== b[4]) changes.push({ path: name, change: 'modified' });
    else if (a[2] !== b[2]) changes.push({ path: name, change: 'mode changed' });
  }
  for (const name of after.keys()) if (!before.has(name)) changes.push({ path: name, change: 'added' });
  return changes.sort((x, y) => (x.path < y.path ? -1 : x.path > y.path ? 1 : 0));
}

/** The `sha256:` digest of a regular file that is not a symlink. */
export function fileDigest(file: string): string {
  const stat = fs.lstatSync(file);
  if (stat.isSymbolicLink()) throw new Refused('symlink', file);
  if (!stat.isFile()) throw new Refused('not a file', file);
  return `sha256:${sha256File(file)}`;
}

function copyFile(source: string | Buffer, destination: string | Buffer, exec: boolean, budget?: { left: number }): void {
  const mode = exec ? 0o700 : 0o600;
  const fd = fs.openSync(destination, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL, mode);
  try {
    const size = readInto(source, (block) => fs.writeSync(fd, block), budget);
    if (budget) budget.left -= size;
  } finally {
    fs.closeSync(fd);
  }
  fs.chmodSync(destination, mode);
}

/** What a plugin is made of. `kind` is `file` (`path` is an executable) or `tree` (`path` is a directory and `entry` the relative path of the program inside it). */
export class Pin {
  constructor(
    readonly kind: 'file' | 'tree',
    readonly path: string,
    readonly digest: string,
    readonly entry = '',
    /** The lines of the pinned tree (`treeLines`), when the lock kept them: a mismatch then names the files */
    readonly files?: readonly string[]
  ) {}

  /** The files that differ from the pin in the tree at `target`; undefined without the list, or when the tree cannot be read. */
  private changesIn(target: string): TreeChange[] | undefined {
    if (this.kind !== 'tree' || !this.files) return undefined;
    try {
      const found = treeLines(target);
      return found ? diffTree(this.files, found) : undefined;
    } catch {
      return undefined;
    }
  }

  private digestOf(target: string): string {
    if (this.kind === 'file') return fileDigest(target);
    if (this.kind === 'tree') return treeDigest(target);
    throw new Error(`pin kind ${JSON.stringify(this.kind)} is not file or tree`);
  }

  /** Hash the original and compare it with the pin. It hashes every time: a host that must detect every change does (section 3.4). */
  check(): void {
    const got = this.digestOf(this.path);
    if (got !== this.digest) throw new PinMismatch(this.digest, got, this.changesIn(this.path));
  }

  /**
   * Copy what the pin names into a new private directory (mode 0700), hash the copy, compare it with the pin and
   * return the directory and the program in the copy. The original is read once to make the copy and never run. The
   * caller removes the directory.
   */
  verify(store?: string): { directory: string; program: string } {
    const base = fs.mkdtempSync(path.join(store ?? os.tmpdir(), 'pin-')); // mode 0700
    try {
      if (this.kind === 'file') {
        fileDigest(this.path);
        const destination = path.join(base, path.basename(this.path));
        copyFile(this.path, destination, true);
        const got = fileDigest(destination);
        if (got !== this.digest) throw new PinMismatch(this.digest, got);
        return { directory: base, program: destination };
      }
      const entries = recognize(this.path);
      const root = path.join(base, 'tree');
      fs.mkdirSync(root, { mode: 0o700 });
      const budget = { left: MAX_BYTES };
      for (const { isDir, exec, rel, abs } of entries) {
        const destination = join(root, rel);
        if (isDir) fs.mkdirSync(destination, { mode: 0o700 });
        else copyFile(abs, destination, exec, budget);
      }
      // Restore the hashed directory bits after their contents are copied, deepest first.
      for (const { isDir, exec, rel } of [...entries].reverse()) if (isDir) fs.chmodSync(join(root, rel), exec ? 0o700 : 0o600);
      const got = treeDigest(root);
      if (got !== this.digest) throw new PinMismatch(this.digest, got, this.changesIn(root));
      const program = path.join(root, this.entry);
      const inside = !this.entry.startsWith('/') && !this.entry.split('/').includes('..');
      let regular = false;
      try {
        regular = inside && fs.lstatSync(program).isFile();
      } catch {
        regular = false;
      }
      if (!regular) throw new Refused('entry is not a regular file inside the tree', this.entry);
      return { directory: base, program };
    } catch (err) {
      fs.rmSync(base, { recursive: true, force: true });
      throw err;
    }
  }
}
