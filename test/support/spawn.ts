import { execFileSync as runFile, spawnSync as run, type ExecFileSyncOptions, type SpawnSyncOptions } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Synchronous child processes for tests. A synchronous call blocks the worker's event loop, so vitest's test timeout cannot
// interrupt it: one child that never exits stalls the whole run, and with it a commit hook, for as long as the child lives
// (a plugin launcher once held a hook for 1 h 40 min). Every call here is given a timeout and killed with SIGKILL when it passes.

/** Long enough for the slowest real child in the suite (a deck build through uv), short enough to fail a hung one. */
export const DEFAULT_SPAWN_TIMEOUT_MS = 300_000;

/** The options with the default timeout and kill signal filled in; a caller's own values win. */
export function withTimeout<T extends { timeout?: number; killSignal?: NodeJS.Signals | number }>(options?: T): T & { timeout: number; killSignal: NodeJS.Signals | number } {
  return { timeout: DEFAULT_SPAWN_TIMEOUT_MS, killSignal: 'SIGKILL', ...options } as T & { timeout: number; killSignal: NodeJS.Signals | number };
}

type Args = readonly string[];

/**
 * Node feeds `input` to a child through a socket and closes it when the write is done. In the test workers that close was
 * sometimes lost: the child (a Python script doing `sys.stdin.read()` under `uv run`) waited for end-of-file for as long as the
 * worker lived, and the worker, waiting for the child, never closed the socket (found with `sample` and `lsof` on a stalled
 * child, 2026-10-27). A file ends on its own, so `input` is written to a temporary file and handed to the child as stdin.
 */
function fileStdin<T extends { input?: unknown; stdio?: unknown }>(options: T | undefined): { options: T | undefined; done: () => void } {
  if (options?.input === undefined) return { options, done: () => {} };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blazon-stdin-'));
  const file = path.join(dir, 'stdin');
  fs.writeFileSync(file, options.input as string | Uint8Array);
  const fd = fs.openSync(file, 'r');
  const { input: _input, ...rest } = options;
  const stdio = Array.isArray(options.stdio) ? [...options.stdio] : ['pipe', 'pipe', 'pipe'];
  stdio[0] = fd;
  return {
    options: { ...rest, stdio } as unknown as T,
    done: () => {
      fs.closeSync(fd);
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** `spawnSync` that cannot hang: a child still running after the timeout is killed, and the result carries `error.code` ETIMEDOUT. */
export const spawnSync = ((command: string, a?: Args | SpawnSyncOptions, b?: SpawnSyncOptions) => {
  const args = Array.isArray(a) ? a : [];
  const { options, done } = fileStdin(withTimeout((Array.isArray(a) ? b : a) as SpawnSyncOptions | undefined));
  try {
    return run(command, args, options!);
  } finally {
    done();
  }
}) as typeof run;

/** `execFileSync` that cannot hang: a child still running after the timeout is killed and the call throws ETIMEDOUT. */
export const execFileSync = ((file: string, a?: Args | ExecFileSyncOptions, b?: ExecFileSyncOptions) => {
  const args = Array.isArray(a) ? a : [];
  const { options, done } = fileStdin(withTimeout((Array.isArray(a) ? b : a) as ExecFileSyncOptions | undefined));
  try {
    return runFile(file, args, options!);
  } finally {
    done();
  }
}) as typeof runFile;
