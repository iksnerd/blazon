import fs from 'node:fs';
import path from 'node:path';
import type { Finding } from '../../types/index.js';
import { isPluginName } from '../../core/plugin-name.js';
import { MAX_ENTRIES, Pin, TREE_LINE, fileDigest, linesDigest, treeDigest, treeLines } from './pin.js';
import { finding } from '../../core/checker/catalogue.js';

// blazon.plugins.lock records, for each plugin, what it must contain (RFC 0005 section 3.4): the pin lives on
// the host's side, in a file the host checks like the program itself, and records whether the digest was vouched,
// supplied by the operator from a source they trust, or computed from the bytes on disk when the plugin was pinned.
// A computed digest detects any change after pinning and says nothing about what was pinned.

export const LOCK_FILE = 'blazon.plugins.lock';

export interface LockEntry {
  kind: 'file' | 'tree';
  /** Relative to the project when inside it, with `/`; absolute otherwise */
  path: string;
  /** For a tree: the relative path of the program inside it */
  entry?: string;
  digest: string;
  /** For a tree: the lines the digest is the hash of (`treeLines`), so a mismatch can name the files. Optional; a lock without it works as before */
  files?: string[];
  source: 'vouched' | 'computed';
}

export interface Lock {
  v: 1;
  plugins: Record<string, LockEntry>;
}

const FIELDS = ['kind', 'path', 'entry', 'digest', 'files', 'source'];
const DIGEST = { file: /^sha256:[0-9a-f]{64}$/, tree: /^t1:[0-9a-f]{64}$/ };
const DIGEST_WRITTEN = { file: 'sha256:<64 hex digits>', tree: 't1:<64 hex digits>' };

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const empty = (): Lock => ({ v: 1, plugins: {} });
const lockFinding = (message: string, label = LOCK_FILE): Finding => (finding('plugin-lock-invalid', { path: label, message }));

/** The list of lines of a tree pin must be lines of the digest's own kind, and must hash to the digest: a list that does not is not the one that was pinned. */
function filesProblems(name: string, kind: unknown, digest: unknown, files: unknown): string[] {
  if (kind === 'file') return [`${name}: a file pin has no files`];
  if (!Array.isArray(files) || files.length > MAX_ENTRIES || !files.every((line) => typeof line === 'string' && TREE_LINE.test(line))) {
    return [`${name}: files must be lines of the tree digest, \`<f|d> <x|-> <path> <sha256 or ->\`, at most ${MAX_ENTRIES}`];
  }
  return typeof digest === 'string' && linesDigest(files as string[]) !== digest ? [`${name}: files do not hash to the digest, so they are not the list that was pinned`] : [];
}

/** One message per mistake in an entry. */
function entryProblems(name: string, entry: unknown): string[] {
  if (!isObject(entry)) return [`${name}: must be an object`];
  const problems: string[] = [];
  for (const field of Object.keys(entry)) if (!FIELDS.includes(field)) problems.push(`${name}: unknown field "${field}"; known: ${FIELDS.join(', ')}`);
  const { kind, path: where, digest, source } = entry;
  const validKind = kind === 'file' || kind === 'tree';
  if (!validKind) problems.push(`${name}: kind must be file or tree`);
  if (typeof where !== 'string' || where === '') problems.push(`${name}: path must be a non-empty string`);
  if (validKind) {
    if (typeof digest !== 'string' || !DIGEST[kind].test(digest)) problems.push(`${name}: a ${kind} pin has a digest written ${DIGEST_WRITTEN[kind]}`);
  } else if (typeof digest !== 'string' || !(DIGEST.file.test(digest) || DIGEST.tree.test(digest))) {
    problems.push(`${name}: digest must be written sha256:<64 hex digits> or t1:<64 hex digits>`);
  }
  if (source !== 'vouched' && source !== 'computed') problems.push(`${name}: source must be vouched or computed`);
  if (kind === 'tree') {
    const inside = (e: unknown) => typeof e === 'string' && e !== '' && !e.startsWith('/') && !e.split('/').includes('..');
    if (entry.entry === undefined) problems.push(`${name}: a tree pin needs an entry: the relative path of the program inside it`);
    else if (!inside(entry.entry)) problems.push(`${name}: entry must be a relative path inside the tree`);
  } else if (kind === 'file' && entry.entry !== undefined) problems.push(`${name}: a file pin has no entry`);
  if (entry.files !== undefined) problems.push(...filesProblems(name, kind, digest, entry.files));
  return problems;
}

/**
 * Read the lock strictly: an unknown key or a malformed entry is a problem, every one is listed, and a lock with any
 * problem gives no pins at all, so nothing is trusted on the word of a file that cannot be read. A missing file is an
 * empty lock. A lock that group or others can write is refused, as the program would be.
 */
export function readLock(cwd: string): { lock: Lock; problems: Finding[] } {
  return readLockFile(path.join(cwd, LOCK_FILE), LOCK_FILE);
}

/** The same, for a lock at any path. `label` names it in what is reported: the lock that ships with blazon is read this way too. */
export function readLockFile(file: string, label: string): { lock: Lock; problems: Finding[] } {
  if (!fs.existsSync(file)) return { lock: empty(), problems: [] };
  const problems: string[] = [];
  if ((fs.statSync(file).mode & 0o022) !== 0) problems.push(`${label} is writable by group or others; run chmod go-w ${path.basename(file)}`);
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch (err) {
    problems.push(`the lock is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
  const plugins: Record<string, LockEntry> = {};
  if (raw !== undefined) {
    if (!isObject(raw)) problems.push('the lock must be an object');
    else {
      for (const key of Object.keys(raw)) if (key !== 'v' && key !== 'plugins') problems.push(`unknown key "${key}"; known: v, plugins`);
      if (raw.v !== 1) problems.push('v must be 1');
      if (!isObject(raw.plugins)) problems.push('plugins must be an object keyed by plugin name');
      else {
        for (const [name, entry] of Object.entries(raw.plugins)) {
          if (!isPluginName(name)) problems.push(`"${name}" is not a plugin name`);
          const mistakes = entryProblems(name, entry);
          problems.push(...mistakes);
          if (mistakes.length === 0 && isPluginName(name)) plugins[name] = entry as unknown as LockEntry;
        }
      }
    }
  }
  return problems.length > 0 ? { lock: empty(), problems: problems.map((problem) => lockFinding(problem, label)) } : { lock: { v: 1, plugins }, problems: [] };
}

/** Write the lock sorted by plugin name, as two-space JSON with a final newline, atomically: nothing is left beside it. */
export function writeLock(cwd: string, lock: Lock): void {
  writeLockFile(path.join(cwd, LOCK_FILE), lock);
}

/** The same, for a lock at any path. */
export function writeLockFile(file: string, lock: Lock): void {
  const plugins = Object.fromEntries(
    Object.keys(lock.plugins)
      .sort()
      .map((name) => {
        const { kind, path: where, entry, digest, files, source } = lock.plugins[name]!;
        return [name, { kind, path: where, ...(entry !== undefined && { entry }), digest, ...(files !== undefined && { files }), source }];
      })
  );
  const temporary = `${file}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify({ v: 1, plugins }, null, 2)}\n`, { mode: 0o644 });
    fs.chmodSync(temporary, 0o644);
    fs.renameSync(temporary, file);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

/**
 * Pin a plugin: hash what is at `target` and record it in the lock, keeping the other entries. With `digest` the
 * operator vouches for the bytes: they must be those, and the entry says so. Throws an Error saying why it did not.
 */
export function recordPin(cwd: string, name: string, target: string, options: { digest?: string; entry?: string } = {}): LockEntry {
  if (!isPluginName(name)) throw new Error(`"${name}" is not a plugin name: dotted lowercase words such as acme.house-style`);
  const { lock, problems } = readLock(cwd);
  if (problems.length > 0) throw new Error(`${LOCK_FILE} cannot be read, so nothing is written to it: ${problems.map((p) => p.message).join('; ')}`);

  const absolute = path.resolve(cwd, target);
  const stat = fs.lstatSync(absolute);
  const kind = stat.isDirectory() && !stat.isSymbolicLink() ? 'tree' : 'file';
  // The digest of a tree is the hash of its lines: take both from one reading, so the list the lock keeps is the one the digest names
  const files = kind === 'tree' ? treeLines(absolute) : undefined;
  const digest = files ? linesDigest(files) : kind === 'tree' ? treeDigest(absolute) : fileDigest(absolute);
  let entry: string | undefined;
  if (kind === 'tree') {
    entry = options.entry ?? (fs.existsSync(path.join(absolute, `blazon-${name}`)) ? `blazon-${name}` : undefined);
    if (entry === undefined) throw new Error(`a tree pin needs --entry: there is no blazon-${name} in ${absolute}, so say which file is the program`);
    const inside = entry !== '' && !entry.startsWith('/') && !entry.split('/').includes('..');
    if (!inside || !fs.lstatSync(path.join(absolute, entry), { throwIfNoEntry: false })?.isFile()) throw new Error(`the entry ${entry} is not a regular file inside ${absolute}`);
  }
  if (options.digest !== undefined) {
    if (!DIGEST[kind].test(options.digest)) throw new Error(`a ${kind} pin has a digest written ${DIGEST_WRITTEN[kind]}`);
    if (options.digest !== digest) throw new Error(`the bytes at ${absolute} are ${digest}, not the ${options.digest} you vouched for`);
  }

  const relative = path.relative(cwd, absolute);
  const stored = relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative) ? relative.split(path.sep).join('/') : absolute;
  const recorded: LockEntry = { kind, path: stored, ...(entry !== undefined && { entry }), digest, ...(files && { files }), source: options.digest === undefined ? 'computed' : 'vouched' };
  writeLock(cwd, { v: 1, plugins: { ...lock.plugins, [name]: recorded } });
  return recorded;
}

/** The pin a lock entry describes, with its path resolved against the project. */
export function pinFor(cwd: string, entry: LockEntry): Pin {
  return new Pin(entry.kind, path.resolve(cwd, entry.path), entry.digest, entry.entry ?? '', entry.files);
}
