import fs from 'node:fs';
import path from 'node:path';
import type { BlazonConfig } from '../../types/index.js';
import { canonical, isWithin } from '../confine.js';
import { projectInputs } from '../inputs.js';
import { MAX_TEXT } from '../operations/limits.js';

// What `blazon tokens` and `blazon build` already wrote under tokensOutDir, read the way any third party reads plugin output (RFC 0002, plugin
// output folders). Nothing here writes a file or starts a plugin, and no CSS is computed: a file is a file a plugin or the core wrote.

export type OutputState = 'fresh' | 'stale';

export interface OutputFile {
  /** From the outputs folder: what to pass back as `file` */
  file: string;
  /** From the brand folder, with `/` */
  relative: string;
  /** Absolute */
  path: string;
  bytes: number;
  state: OutputState;
}

export interface MissingOutput {
  /** The plugin's id: its `as`, or its name. Its folder `<outputsDir>/<id>/` does not exist. A plugin that writes nothing on this command is listed too */
  id: string;
}

export interface OutputsDescription {
  /** The tokens output folder, from the brand folder */
  outputsDir: string;
  files: OutputFile[];
  missing: MissingOutput[];
  /** The command to run, present when any file is stale or the folder holds nothing. Not set by a missing plugin folder alone: a plugin may write nothing on `blazon tokens`, and running it again would not change that */
  fix?: string;
  note: string;
  /** With `file`: its text, cut at MAX_TEXT characters */
  text?: string;
  /** With `file`: whether `text` was cut */
  truncated?: boolean;
}

/** A `file` blazon refuses to read. The command line makes it a usage error. */
export class OutputsError extends Error {
  constructor(
    message: string,
    readonly code: 'no-file' | 'invalid-option-value',
  ) {
    super(message);
  }
}

export const OUTPUTS_NOTE = 'fresh means no input of the brand is newer than the file, by timestamp; a git checkout rewrites timestamps';
const FIX = 'blazon tokens';

const posix = (p: string): string => p.split(path.sep).join('/');
const byName = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Every regular file under `dir`, links not followed (a link is not listed: it could lead out of the folder). */
function filesUnder(dir: string): string[] {
  const found: string[] = [];
  const walk = (current: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) found.push(full);
    }
  };
  walk(dir);
  return found;
}

/**
 * The newest modification time among the inputs of a compile (`projectInputs`): each file, and for a folder the files in it and the folder itself
 * (a rename or a delete changes only the folder). The project folder is left out (every output is in it) and so is an unwatched package folder.
 */
function newestInput(config: BlazonConfig, cwd: string): number {
  let newest = 0;
  const see = (p: string): void => {
    const stat = fs.statSync(p, { throwIfNoEntry: false });
    if (stat) newest = Math.max(newest, stat.mtimeMs);
  };
  for (const input of projectInputs(config, cwd)) {
    if (input.holdsOnly || input.unwatched) continue;
    see(input.path);
    if (input.folder) for (const file of filesUnder(input.path)) see(file);
  }
  return newest;
}

/** The text of `file` under `base`, or a refusal. `file` is relative to `base` and stays inside it, by where it really is. */
function readText(base: string, file: string): { text: string; truncated: boolean } {
  const refuse = (why: string): never => {
    throw new OutputsError(`"${file.replace(/[^\x20-\x7e]/g, '?')}" ${why}`, 'invalid-option-value');
  };
  if (file === '' || file.includes('\0')) refuse('is not a file name');
  if (path.isAbsolute(file) || path.win32.isAbsolute(file) || /^[A-Za-z]:/.test(file) || file.includes('\\'))
    refuse('is not a path inside the outputs folder: give it relative to that folder, as listed');
  if (file.split('/').includes('..')) refuse('leaves the outputs folder');
  const target = path.resolve(base, file);
  if (!isWithin(base, target)) refuse('leaves the outputs folder');
  const real = canonical(target);
  if (!isWithin(canonical(base), real)) refuse('is a link that leaves the outputs folder');
  const stat = fs.statSync(real, { throwIfNoEntry: false });
  if (!stat) throw new OutputsError(`no file "${file}" in the outputs folder; run blazon outputs to list them`, 'no-file');
  if (!stat.isFile()) return refuse('is not a file');
  const bytes = fs.readFileSync(real);
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return refuse('is not text (it is not valid UTF-8), so it is not returned');
  }
  if (text.includes('\0')) return refuse('is not text (it holds a NUL byte), so it is not returned');
  // The cut the MCP server makes (mcp/src/result.ts), by Unicode code points; MAX_TEXT is the shared number (operations/limits.ts)
  if (text.length <= MAX_TEXT) return { text, truncated: false };
  const points = Array.from(text);
  return points.length <= MAX_TEXT ? { text, truncated: false } : { text: points.slice(0, MAX_TEXT).join(''), truncated: true };
}

/**
 * Which files the last `blazon tokens` or `blazon build` wrote under tokensOutDir, whether each is fresh or stale, and which configured plugins
 * have no folder there. With `file`, also that file's text. Reads only.
 */
export function describeOutputs(config: BlazonConfig, cwd: string, options: { file?: string } = {}): OutputsDescription {
  const base = path.resolve(cwd, config.tokensOutDir);
  const outputsDir = posix(path.relative(path.resolve(cwd), base)) || '.';
  const isDir = fs.statSync(base, { throwIfNoEntry: false })?.isDirectory() === true;
  const newest = isDir ? newestInput(config, cwd) : 0;
  const files: OutputFile[] = isDir
    ? filesUnder(base)
        .map((full): OutputFile => {
          const stat = fs.statSync(full);
          return {
            file: posix(path.relative(base, full)),
            relative: posix(path.relative(path.resolve(cwd), full)),
            path: full,
            bytes: stat.size,
            state: newest > stat.mtimeMs ? 'stale' : 'fresh',
          };
        })
        .sort((a, b) => byName(a.file, b.file))
    : [];
  const missing: MissingOutput[] = (config.plugins ?? [])
    .map((entry) => entry.as ?? entry.name)
    .filter((id) => !(fs.statSync(path.join(base, id), { throwIfNoEntry: false })?.isDirectory() ?? false))
    .map((id) => ({ id }));
  const needsRun = files.length === 0 || files.some((f) => f.state === 'stale');
  const answer: OutputsDescription = { outputsDir, files, missing, ...(needsRun && { fix: FIX }), note: OUTPUTS_NOTE };
  if (options.file !== undefined) Object.assign(answer, readText(base, options.file));
  return answer;
}
