import path from 'node:path';
import { UsageError } from '../errors.js';
import { requireFolder } from '../project.js';
import { operatorDirs, setApprovedDirs } from '../../core/confine.js';

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

/**
 * `--allow-dir <folder>` (repeatable) and BLAZON_ALLOW_DIRS: the folders outside the project that the person running blazon lets a compile
 * read, for an `assets.<key>.dir` that names a shared folder. Set once, before `--cwd` moves the process, so a relative folder is relative to
 * where blazon was started. `value` is what the parser read: a string, a list or undefined. The config has no say in it (core/confine.ts).
 */
export function applyAllowDirs(value: unknown, env: NodeJS.ProcessEnv = process.env): void {
  const typed = (Array.isArray(value) ? value : value === undefined ? [] : [value]).map((entry) => (typeof entry === 'string' || typeof entry === 'number' ? String(entry) : ''));
  if (typed.some((entry) => entry.trim() === '')) throw new UsageError('--allow-dir needs a folder', 'Give one, such as blazon dev --allow-dir ../shared.');
  setApprovedDirs(operatorDirs(typed, env, process.cwd()));
}
