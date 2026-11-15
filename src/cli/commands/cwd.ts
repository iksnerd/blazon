import path from 'node:path';
import { UsageError } from '../errors.js';
import { requireFolder } from '../project.js';

/**
 * `--cwd <dir>`: the folder every command works from, the same as running blazon from it. It is resolved here, once, before a command
 * runs, and blazon moves into it, so each `process.cwd()` after it (a command's default folder, `-o`, the plugin host's cwd) is that
 * folder and a positional folder is relative to it. A folder that is not there is a wrong use of the command line (exit 2).
 * `value` is what the parser read: undefined when the option was not typed.
 */
export function applyCwd(value: unknown): void {
  if (value === undefined) return;
  if (typeof value !== 'string' || value === '') throw new UsageError('--cwd needs a folder', 'Give one, such as blazon --cwd ./my-brand check.');
  const dir = path.resolve(process.cwd(), value);
  requireFolder(dir);
  process.chdir(dir);
}
