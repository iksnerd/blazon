import { execFile, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

/** Where the blazon CLI is and which brand folder it reads. */
export interface BlazonTarget {
  /** The blazon executable: `BLAZON_BIN`, else the `bin/blazon.js` of the package the server ships in, else `blazon` found on PATH. */
  bin: string;
  /** The brand folder. Every command runs with this as its working directory, so no folder is ever an argument. */
  brand: string;
  /** How long a blazon command may run before it is killed. Default 30 000. */
  timeoutMs?: number;
  /** How long an answer is reused for the same arguments. Default 2000; 0 turns the cache off. */
  cacheMs?: number;
  /** How many blazon commands may run at once. Default 2. */
  maxParallel?: number;
}

/** A blazon command that ended in an error. The message is blazon's own, so an agent can act on it. */
export class BlazonError extends Error {
  /** True when blazon itself said no, such as for an unknown token; false for a failure of the program or the folder. */
  readonly fromBlazon: boolean;
  constructor(message: string, fromBlazon = false) {
    super(message);
    this.fromBlazon = fromBlazon;
  }
}

/**
 * A token path: dot-separated segments of ASCII letters, digits, `_` and `-`. A segment starts with a letter, digit or `_`, so the path
 * never starts with `-` or `.`, never has an empty segment (`a..b`, `a.`), and can never be read as a flag or a folder.
 */
export const TOKEN_PATH = /^[A-Za-z0-9_][A-Za-z0-9_-]*(\.[A-Za-z0-9_][A-Za-z0-9_-]*)*$/;

/** The longest a blazon command may run by default. A compile of a large brand is seconds; this only stops a hang. */
export const TIMEOUT_MS = 30_000;
/** The most answers the cache keeps; the oldest is dropped first. */
export const CACHE_MAX = 64;
/** The default time an answer is reused. */
export const CACHE_MS = 2000;
/** The most blazon output the server reads. Beyond this the command is stopped and reported. */
const MAX_BUFFER = 16 * 1024 * 1024;

/** The environment names a blazon child inherits. No `NODE_*`: blazon reads none, and `NODE_AUTH_TOKEN` is an npm publish token. Everything else (tokens, keys, cloud credentials) stays out of the brand's config code. */
const ENV_ALLOWED = /^(PATH|HOME|USERPROFILE|TMPDIR|TEMP|TMP|LANG|LC_[A-Z_]+|BLAZON_[A-Z_]+|NO_COLOR|SystemRoot|SYSTEMROOT|windir|COMSPEC|PATHEXT)$/;

/** The environment for a blazon child: the allowlist from `env`, plus `NO_COLOR`. */
export function childEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const kept: NodeJS.ProcessEnv = {};
  for (const [name, value] of Object.entries(env)) if (ENV_ALLOWED.test(name) && value !== undefined) kept[name] = value;
  return { ...kept, NO_COLOR: '1' };
}

/** `--brand dir`, `--brand=dir`, or `BLAZON_BRAND`, or the current folder. A value that starts with `--` is a missing value, not a folder. */
export function targetFrom(argv: string[], env: NodeJS.ProcessEnv, cwd: string = process.cwd(), own?: string): BlazonTarget {
  let brand: string | undefined;
  try {
    const parsed = parseArgs({ args: argv, options: { brand: { type: 'string' } }, strict: true, allowPositionals: false });
    brand = parsed.values.brand;
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE') throw new Error('--brand needs a folder.', { cause: error });
    throw new Error(`${error instanceof Error ? error.message : String(error)} Usage: blazon-mcp [--brand <folder>]`, { cause: error });
  }
  if (brand !== undefined && (brand === '' || brand.startsWith('--'))) throw new Error('--brand needs a folder.');
  return { bin: env.BLAZON_BIN || (own !== undefined && fs.existsSync(own) ? own : 'blazon'), brand: path.resolve(cwd, brand ?? env.BLAZON_BRAND ?? '.') };
}

export interface RunOptions {
  /** Exit statuses that carry an answer and are not errors: `check` exits 1 on findings, `can` exits 1 when denied. */
  answers?: number[];
  /** Add `--json` to the command. `blazon brand` is always JSON and takes no such flag. Default true. */
  json?: boolean;
  /**
   * What to do with standard error when the command succeeds. `warnings` (default) returns it, since a read command says there that
   * a value may be wrong. `ignore` drops it: with `--json`, `check` prints its human report there and the document says the same.
   */
  stderr?: 'warnings' | 'ignore';
}

/** What a blazon command printed: the JSON document, and the lines it said on standard error. */
export interface BlazonAnswer {
  document: Record<string, unknown>;
  warnings: string[];
}

// eslint-disable-next-line no-control-regex -- an ANSI color escape starts with the ESC character
const ANSI = /\u001b\[[0-9;]*m/g;

function warningLines(stderr: string): string[] {
  return stderr
    .replace(ANSI, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 5)
    .map((line) => (line.length > 500 ? `${line.slice(0, 500)}...` : line));
}

/** Runs blazon commands for one brand: arguments as an array, a time limit, a limit on parallel runs, a short cache, and a way to stop them all. */
export class BlazonRunner {
  private readonly children = new Set<ChildProcess>();
  private readonly waiting: (() => void)[] = [];
  private running = 0;
  private closed = false;
  private readonly cache = new Map<string, { at: number; answer: Promise<BlazonAnswer> }>();

  constructor(readonly target: BlazonTarget) {}

  /**
   * Runs `blazon <args> --json` in the brand folder and returns the parsed document and what blazon said on standard error. An exit
   * status that is not an answer, or a document with an `error`, becomes a BlazonError carrying blazon's message. The same arguments
   * within `cacheMs` share one run (a failed run is not kept), so an agent that asks twice in a row does not compile the brand twice.
   */
  run(args: string[], options: RunOptions = {}): Promise<BlazonAnswer> {
    const ttl = this.target.cacheMs ?? CACHE_MS;
    const key = JSON.stringify([args, options.answers ?? [], options.json ?? true, options.stderr ?? 'warnings']);
    const hit = this.cache.get(key);
    if (ttl > 0 && hit && Date.now() - hit.at < ttl) return hit.answer;
    const answer = this.schedule(() => this.exec(args, options));
    if (ttl > 0) {
      this.cache.delete(key);
      this.cache.set(key, { at: Date.now(), answer });
      while (this.cache.size > CACHE_MAX) this.cache.delete(this.cache.keys().next().value as string);
      answer.catch(() => this.cache.delete(key));
    }
    return answer;
  }

  /** Kills every blazon command in flight and refuses to start another. */
  killAll(): void {
    this.closed = true;
    for (const child of this.children) child.kill('SIGKILL');
    this.children.clear();
  }

  private async schedule<T>(job: () => Promise<T>): Promise<T> {
    const limit = this.target.maxParallel ?? 2;
    if (this.running >= limit) await new Promise<void>((resolve) => this.waiting.push(resolve));
    else this.running++;
    try {
      return await job();
    } finally {
      const next = this.waiting.shift();
      if (next) next();
      else this.running--;
    }
  }

  private exec(args: string[], options: RunOptions): Promise<BlazonAnswer> {
    const { target } = this;
    if (this.closed) return Promise.reject(new BlazonError('The server is shutting down.'));
    if (!fs.statSync(target.brand, { throwIfNoEntry: false })?.isDirectory())
      return Promise.reject(new BlazonError(`The brand folder ${target.brand} does not exist. Start the server with --brand <folder> or set BLAZON_BRAND.`));
    const answers = options.answers ?? [];
    const timeout = target.timeoutMs ?? TIMEOUT_MS;
    return new Promise((resolve, reject) => {
      const child = execFile(
        target.bin,
        options.json === false ? args : [...args, '--json'],
        { cwd: target.brand, timeout, killSignal: 'SIGKILL', maxBuffer: MAX_BUFFER, env: childEnv(process.env) },
        (error, stdout, stderr) => {
          this.children.delete(child);
          const status = error ? (typeof error.code === 'number' ? error.code : -1) : 0;
          const code = (error as NodeJS.ErrnoException | null)?.code;
          if (code === 'ENOENT') return reject(new BlazonError(`Cannot run "${target.bin}". Install blazon, or set BLAZON_BIN to the blazon executable.`));
          if (code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') return reject(new BlazonError(`blazon printed more than ${MAX_BUFFER / 1024 / 1024} MB; narrow the question.`));
          if (error?.killed) return reject(new BlazonError(`blazon did not finish in ${timeout / 1000} seconds and was stopped. Try again, or ask a narrower question.`));
          let document: Record<string, unknown> | undefined;
          try {
            const parsed: unknown = JSON.parse(stdout);
            if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) document = parsed as Record<string, unknown>;
          } catch {
            // not JSON: reported below with whatever blazon said on standard error
          }
          const failure = document?.error as { message?: unknown } | undefined;
          if (failure) return reject(new BlazonError(typeof failure.message === 'string' ? failure.message : 'blazon failed.', true));
          if (status === 0 || (answers.includes(status) && document)) {
            if (!document) return reject(new BlazonError('blazon printed no JSON.'));
            return resolve({ document, warnings: options.stderr === 'ignore' ? [] : warningLines(stderr) });
          }
          const said = stderr.replace(ANSI, '').trim().split('\n').filter(Boolean).slice(0, 3).join(' ');
          reject(new BlazonError(said || `blazon exited with status ${status}.`));
        },
      );
      this.children.add(child);
    });
  }
}
