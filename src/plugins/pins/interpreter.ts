import fs from 'node:fs';
import path from 'node:path';

// The interpreter of a pinned plugin (RFC 0005 sections 3.4 and 4, as Contra's ADR 0099 does it). A pin covers
// the bytes of a plugin and not the program that runs them: a launcher that starts `python3` runs whatever that name
// resolves to for whoever controls PATH. So the host reads the `#!` line itself, finds the interpreter in directories it
// chooses, checks the whole chain of owners and modes to it, and starts the verified copy through that path with a PATH of
// those directories alone. It does this again before every launch.

/** Where a pinned plugin's interpreter may be found, before the operator's own directories (BLAZON_PLUGIN_PATH) are put in front. */
export const DEFAULT_PLUGIN_PATH: readonly string[] = ['/usr/local/bin', '/usr/bin', '/bin'];

/** The most bytes a `#!` line may have, the `#!` included. */
const MAX_LINE = 256;
/** Links followed on the way to a file before it is taken to be a loop. */
const MAX_LINKS = 40;

/** The interpreter of a pinned plugin cannot be trusted, with the reason and what to change. */
export class InterpreterRefused extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'InterpreterRefused';
  }
}

export interface Shebang {
  /** An absolute path, or with `viaEnv` a name to find in the trusted directories */
  interpreter: string;
  arg?: string;
  viaEnv: boolean;
}

/** The `#!` line of a file: undefined when the file is not a script, a refusal when the line breaks the rules. */
export function readShebang(file: string): Shebang | undefined {
  const fd = fs.openSync(file, 'r');
  let head: Buffer;
  try {
    const buffer = Buffer.alloc(MAX_LINE + 2);
    head = buffer.subarray(0, fs.readSync(fd, buffer, 0, buffer.length, 0));
  } finally {
    fs.closeSync(fd);
  }
  if (head.length < 2 || head[0] !== 0x23 || head[1] !== 0x21) return undefined;
  const newline = head.indexOf(0x0a);
  const length = newline < 0 ? head.length : newline;
  if (length > MAX_LINE) throw new InterpreterRefused(`the #! line is longer than ${MAX_LINE} bytes`);
  const line = head.subarray(0, length);
  for (const byte of line) {
    if ((byte < 0x20 && byte !== 0x09) || byte > 0x7e) throw new InterpreterRefused(`the #! line has a control character or a byte that is not ASCII (0x${byte.toString(16)})`);
  }
  const text = line.toString('latin1');
  const fields = text.slice(2).split(/[ \t]+/).filter((field) => field !== '');
  if (fields.length === 0) throw new InterpreterRefused('the #! line names no interpreter');
  const [interpreter, ...rest] = fields as [string, ...string[]];
  if (!interpreter.startsWith('/')) throw new InterpreterRefused(`the interpreter in the #! line must be an absolute path, got ${JSON.stringify(interpreter)}`);
  if (path.basename(interpreter) === 'env') {
    const [name] = rest;
    if (rest.length !== 1 || !/^[A-Za-z0-9._+-]+$/.test(name!) || name!.startsWith('-')) {
      throw new InterpreterRefused(`env in the #! line takes one name and nothing else (no option, no path), got ${JSON.stringify(text)}`);
    }
    return { interpreter: name!, viaEnv: true };
  }
  if (rest.length > 1) throw new InterpreterRefused(`the #! line takes at most one argument for ${interpreter}, got ${rest.length}`);
  return { interpreter, ...(rest[0] !== undefined && { arg: rest[0] }), viaEnv: false };
}

export interface ChainOptions {
  /** What the end of the chain must be. A file by default */
  final?: 'file' | 'dir';
  /** The user the host runs as; only a test changes it */
  uid?: number;
}

/**
 * Why `file` cannot be trusted as a program, or undefined. Every link on the way is followed, and every directory
 * visited and the file itself must belong to the host's user or to root and must not be writable by group or others,
 * because whoever can write there can put another program where this one is.
 */
export function chainProblem(file: string, options: ChainOptions = {}): string | undefined {
  const uid = options.uid ?? process.getuid?.() ?? 0;
  const unsafe = (place: string, stat: fs.Stats): string | undefined => {
    if (stat.uid !== 0 && stat.uid !== uid) return `${place} is owned by user ${stat.uid}, who is neither you nor root`;
    if (stat.mode & 0o022) return `${place} can be written by group or others`;
    return undefined;
  };
  let current = '/';
  const root = fs.statSync('/');
  const rootProblem = unsafe('/', root);
  if (rootProblem) return rootProblem;
  const pending = file.split('/').filter((part) => part !== '' && part !== '.').reverse();
  let links = 0;
  while (pending.length > 0) {
    const part = pending.pop()!;
    if (part === '..') {
      current = path.dirname(current);
      continue;
    }
    const next = path.join(current, part);
    let stat: fs.Stats;
    try {
      stat = fs.lstatSync(next);
    } catch {
      return `${next} does not exist`;
    }
    if (stat.isSymbolicLink()) {
      if (++links > MAX_LINKS) return `${file} has too many links on the way`;
      const target = fs.readlinkSync(next);
      if (target.startsWith('/')) current = '/';
      pending.push(...target.split('/').filter((piece) => piece !== '' && piece !== '.').reverse());
      continue;
    }
    if (pending.length > 0 || options.final === 'dir') {
      if (!stat.isDirectory()) return `${next} is not a directory`;
      const problem = unsafe(next, stat);
      if (problem) return problem;
      current = next;
      continue;
    }
    if (!stat.isFile()) return `${next} is not a regular file`;
    const problem = unsafe(next, stat);
    if (problem) return problem;
    if (!(stat.mode & 0o111)) return `${next} is not executable`;
    return undefined;
  }
  return options.final === 'dir' ? undefined : `${file} does not exist`;
}

export interface TrustedPath {
  dirs: string[];
  /** The operator's directories that were left out, and why */
  dropped: { dir: string; why: string }[];
}

/** The operator's directories (BLAZON_PLUGIN_PATH) first, then the defaults, each only if it exists and its chain is clean. */
export function pluginPath(env: Readonly<Record<string, string | undefined>>): TrustedPath {
  const operator = (env.BLAZON_PLUGIN_PATH ?? '').split(':').filter((dir) => dir !== '');
  const dirs: string[] = [];
  const dropped: TrustedPath['dropped'] = [];
  for (const dir of [...operator, ...DEFAULT_PLUGIN_PATH]) {
    if (dirs.includes(dir)) continue;
    const mine = operator.includes(dir);
    const why = dir.startsWith('/') ? chainProblem(dir, { final: 'dir' }) : `${dir} must be an absolute path`;
    if (why === undefined) dirs.push(dir);
    else if (mine && !dropped.some((d) => d.dir === dir)) dropped.push({ dir, why });
  }
  return { dirs, dropped };
}

export interface Launch {
  program: string;
  /** Before the call's own arguments; the last one is the copy when it is a script */
  args: string[];
  /** The PATH the plugin starts with: the trusted directories and nothing else */
  path: string;
}

/**
 * How to start `file`, a verified copy: a script goes through its interpreter, found and checked here as
 * `<interpreter> [arg] <file>`; anything else runs as it is. Throws InterpreterRefused with what to change.
 */
export function launchFor(file: string, env: Readonly<Record<string, string | undefined>>): Launch {
  const trusted = pluginPath(env);
  const pathValue = trusted.dirs.join(':');
  const shebang = readShebang(file);
  if (!shebang) return { program: file, args: [], path: pathValue };
  if (!shebang.viaEnv) {
    const problem = chainProblem(shebang.interpreter);
    if (problem) throw new InterpreterRefused(`${problem}; the interpreter ${shebang.interpreter} cannot be trusted`);
    return { program: shebang.interpreter, args: [...(shebang.arg !== undefined ? [shebang.arg] : []), file], path: pathValue };
  }
  for (const dir of trusted.dirs) {
    const candidate = path.join(dir, shebang.interpreter);
    try {
      fs.lstatSync(candidate);
    } catch {
      continue;
    }
    const problem = chainProblem(candidate);
    if (problem) throw new InterpreterRefused(`${problem}; the interpreter ${candidate} cannot be trusted`);
    return { program: candidate, args: [file], path: pathValue };
  }
  const left = trusted.dropped.map(({ dir, why }) => `${dir}: ${why}`);
  throw new InterpreterRefused(
    `${shebang.interpreter} is not in the directories blazon trusts for a pinned plugin (${pathValue}); add the directory that holds it to BLAZON_PLUGIN_PATH${left.length > 0 ? ` (left out: ${left.join('; ')})` : ''}`
  );
}
