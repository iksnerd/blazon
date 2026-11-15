import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { environment } from '../wire/environment.js';
import { InterpreterRefused, launchFor, type Launch } from '../pins/interpreter.js';
import { DEFAULT_TIMEOUT, STDERR_KEEP, STDOUT_LIMIT } from '../wire/limits.js';
import type { Pin } from '../pins/pin.js';
import { shippedLaunch, shippedTrouble, type Shipped } from '../pins/shipped.js';

// One call to a plugin's program, and how it ends (RFC 0005 sections 4 to 6). A call never throws on a
// plugin: a program that cannot start, a timeout, an undefined exit code or too much output is a Result with
// `breakReason` set, which the host reports as an outcome (section 5).

/** How long to wait for the output pipes after the process group has been killed. */
const KILL_GRACE_MS = 2000;

/** One start of a plugin's program: for a manifest, a validation or a request. */
export interface Call {
  program?: string;
  /** `--<host>-manifest` for the manifest call, `--validate` for a validation, none for a request */
  args?: readonly string[];
  /** The request, written byte for byte to a file the plugin reads as its stdin */
  stdin?: Uint8Array;
  /** The variables the manifest lists, with the values the host has resolved */
  env?: Readonly<Record<string, string>>;
  /** Seconds; the manifest's, capped by the host. Zero or absent means the default */
  timeout?: number;
  /** Overrides the core's limit for a role whose profile raises it */
  stdoutLimit?: number;
  /** How many bytes of stderr the result keeps. A check sets it above the host's, so it sees more than the host does */
  stderrKeep?: number;
  /** The exit codes this call's role defines as answers. Absent means the core's (0, 1 and 2). Any other code is a break */
  answers?: readonly number[];
  /** The working directory. Absent leaves it the host's, which a plugin MUST NOT depend on. Not with a pin */
  directory?: string;
  /** A pin to run. The host verifies a copy and runs the copy from its own directory (section 3.4); `program` and `directory` are then left out */
  pin?: Pin;
  /** Where the verified copy is made; the system's temporary directory when absent */
  store?: string;
  /** A plugin that ships in blazon's own package: checked before this call, then run where it is, in its own folder. `program`, `directory` and `pin` are then left out */
  shipped?: Shipped;
}

/** What goes before the call's own arguments when the program is run through another, and the PATH to give it in place of the host's. */
interface Start {
  args: readonly string[];
  path?: string;
}

/**
 * How a call ended: an answer, with a code of the core's (0, 1 or 2) and the plugin's stdout and stderr, or a break,
 * any other end, with `breakReason` saying why. What exit 1 means is a role's, not the core's.
 */
export interface Result {
  answered: boolean;
  code: number;
  stdout: Buffer;
  /** At most the call's `stderrKeep`; the rest is discarded */
  stderr: Buffer;
  breakReason: string;
  /** For a break: which kind of cause it was, so the host can say what fixes it */
  cause?: BreakCause;
}

/**
 * The kinds of break, each with its own remedy. `place`: a shipped plugin's folder, or a directory above it, can be
 * changed by another user. `install`: a shipped plugin does not match the lock or cannot be read. `pin`: a pin failed
 * its check. `interpreter`: the interpreter of a script was refused. `call`: the call was malformed or its request could
 * not be written, which is the host's own fault. The rest are what the program did.
 */
export type BreakCause = 'place' | 'install' | 'pin' | 'interpreter' | 'call' | 'start' | 'timeout' | 'output' | 'pipe' | 'exit';

const broke = (breakReason: string, cause: BreakCause, stdout = Buffer.alloc(0), stderr = Buffer.alloc(0)): Result => ({ answered: false, code: 0, stdout, stderr, breakReason, cause });

/**
 * Write the request to a regular file in a directory only the host can enter, created exclusively at a mode only
 * the host can read, so no other user can open it in between (section 4). Returns the path and a cleanup.
 */
export function requestFile(data: Uint8Array): { path: string; cleanup: () => void } {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-call-')); // mode 0700
  const cleanup = () => fs.rmSync(directory, { recursive: true, force: true });
  const file = path.join(directory, 'request');
  try {
    fs.writeFileSync(file, data, { flag: 'wx', mode: 0o600 });
  } catch (err) {
    cleanup();
    throw err;
  }
  return { path: file, cleanup };
}

/** SIGKILL every process in the group. A group with no members left is the normal case on the second kill. */
function killGroup(pgid: number): void {
  try {
    process.kill(-pgid, 'SIGKILL');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'ESRCH' && code !== 'EPERM') throw err;
  }
}

/**
 * Start the plugin and read how the call ends. It runs with an empty environment plus the base set, with the request
 * as a file in a private directory for its stdin, in a process group of its own that is killed when the time runs
 * out and again after it exits.
 */
/** Why a program could not start, and what to do about it when the cause is one a person fixes. */
function startFailure(program: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  const hint = code === 'EACCES' ? `; make it executable with: chmod +x ${program}` : code === 'ENOENT' ? `; there is no program at ${program}` : '';
  return `cannot start the program: ${message}${hint}`;
}

export async function run(call: Call): Promise<Result> {
  if (call.shipped) {
    if (call.program || call.directory || call.pin) return broke('a shipped call has no program, directory or pin of its own', 'call');
    // Every call, not the first: a change after the last check is caught by this one (the folder can still change between the check and the start)
    const trouble = shippedTrouble(call.shipped);
    if (trouble) return broke(`unavailable: shipped plugin: ${trouble.problem}`, trouble.place ? 'place' : 'install');
    let launch: ReturnType<typeof shippedLaunch>;
    try {
      launch = shippedLaunch(call.shipped.entry);
    } catch (err) {
      if (!(err instanceof InterpreterRefused)) throw err;
      return broke(`unavailable: shipped plugin: ${err.message}`, 'install');
    }
    return started(call, launch.program, call.shipped.directory, { args: launch.args });
  }
  if (call.pin) {
    if (call.program || call.directory) return broke('a pinned call has no program or directory of its own', 'call');
    let verified: { directory: string; program: string };
    try {
      verified = call.pin.verify(call.store);
    } catch (err) {
      return broke(`unavailable: pin: ${err instanceof Error ? err.message : String(err)}`, 'pin'); // the plugin is unavailable
    }
    try {
      // A script runs through its interpreter, found and checked now and not at pin time (section 3.4)
      let launch: Launch;
      try {
        launch = launchFor(verified.program, process.env);
      } catch (err) {
        if (!(err instanceof InterpreterRefused)) throw err;
        return broke(`unavailable: interpreter: ${err.message}`, 'interpreter');
      }
      return await started(call, launch.program, path.dirname(verified.program), launch);
    } finally {
      fs.rmSync(verified.directory, { recursive: true, force: true });
    }
  }
  return started(call, call.program ?? '', call.directory);
}

async function started(call: Call, program: string, directory: string | undefined, launch?: Start): Promise<Result> {
  if (!program) return broke('no program to start', 'call');
  let request: ReturnType<typeof requestFile>;
  try {
    request = requestFile(call.stdin ?? Buffer.alloc(0));
  } catch (err) {
    return broke(`cannot write the request: ${err instanceof Error ? err.message : String(err)}`, 'call');
  }
  try {
    return await start(call, program, directory, request.path, launch);
  } finally {
    request.cleanup();
  }
}

function start(call: Call, program: string, directory: string | undefined, requestPath: string, launch?: Start): Promise<Result> {
  const timeout = call.timeout && call.timeout > 0 ? call.timeout : DEFAULT_TIMEOUT;
  const limit = call.stdoutLimit && call.stdoutLimit > 0 ? call.stdoutLimit : STDOUT_LIMIT;
  const keep = call.stderrKeep && call.stderrKeep > 0 ? call.stderrKeep : STDERR_KEEP;
  const answers = call.answers && call.answers.length > 0 ? call.answers : [0, 1, 2];

  return new Promise<Result>((resolve) => {
    let stdin: number;
    try {
      stdin = fs.openSync(requestPath, 'r');
    } catch (err) {
      return resolve(broke(`cannot read the request: ${err instanceof Error ? err.message : String(err)}`, 'call'));
    }
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(program, [...(launch?.args ?? []), ...(call.args ?? [])], { cwd: directory || undefined, stdio: [stdin, 'pipe', 'pipe'], env: environment({ ...call.env, ...(launch?.path !== undefined && { PATH: launch.path }) }), detached: true }); // its own process group
    } catch (err) {
      fs.closeSync(stdin);
      return resolve(broke(startFailure(program, err), 'start'));
    }
    fs.closeSync(stdin);

    const out: Buffer[] = [];
    const err: Buffer[] = [];
    let keptOut = 0;
    let keptErr = 0;
    let timedOut = false;
    let over = false;
    let pipesHeld = false;
    let exited: { code: number | null; signal: NodeJS.Signals | null } | undefined;
    let done = false;
    // eslint-disable-next-line prefer-const -- finish() below reads it, so it is declared first and set where the child starts
    let timer: NodeJS.Timeout | undefined;
    let grace: NodeJS.Timeout | undefined;

    // A child that failed to start has no pid, and no group to kill
    const kill = () => {
      if (child.pid !== undefined) killGroup(child.pid);
    };

    const finish = (result?: Result) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      clearTimeout(grace);
      if (result) return resolve(result);
      const stdout = Buffer.concat(out);
      const stderr = Buffer.concat(err);
      if (timedOut) return resolve(broke(`timed out after ${timeout}s`, 'timeout', stdout, stderr));
      if (over) return resolve(broke(`output over the limit of ${limit} bytes`, 'output', stdout, stderr));
      if (pipesHeld) return resolve(broke('the call did not finish cleanly: an output pipe stayed open', 'pipe', stdout, stderr));
      if (exited && exited.code !== null && answers.includes(exited.code)) return resolve({ answered: true, code: exited.code, stdout, stderr, breakReason: '' });
      resolve(broke(exited?.code === null || exited?.code === undefined ? `killed by signal ${exited?.signal}` : `exited with ${exited.code}`, 'exit', stdout, stderr));
    };

    child.on('error', (failure) => finish(broke(startFailure(program, failure), 'start')));

    child.stdout!.on('data', (chunk: Buffer) => {
      if (over) return;
      const room = limit - keptOut;
      if (chunk.length > room) {
        out.push(chunk.subarray(0, room));
        over = true;
        kill(); // stop a plugin that writes forever; do not buffer it
        return;
      }
      out.push(chunk);
      keptOut += chunk.length;
    });
    child.stderr!.on('data', (chunk: Buffer) => {
      if (keptErr >= keep) return;
      const part = chunk.subarray(0, keep - keptErr);
      err.push(part);
      keptErr += part.length;
    });

    timer = setTimeout(() => {
      timedOut = true;
      kill();
    }, timeout * 1000);

    child.on('exit', (code, signal) => {
      exited = { code, signal };
      clearTimeout(timer);
      kill(); // again, for anything the plugin left running
      grace = setTimeout(() => {
        pipesHeld = true;
        child.stdout!.destroy();
        child.stderr!.destroy();
        finish();
      }, KILL_GRACE_MS);
    });
    child.on('close', () => finish());
  });
}
