import fs from 'node:fs';
import path from 'node:path';
import { BlazonError } from './errors.js';
import { shellWord } from './where.js';

// The read commands take the brand folder last (`blazon list [group] [dir]`). A person who types it first (`blazon list acme`) has it read as the
// group, path, fg or bg. The parse stays as it is; when the command then fails, this says what happened. Every read command goes through
// registerOperations (operations.ts), which calls `folderFirstHint` once, so the wording is in this one place.

const isDirectory = (dir: string): boolean => {
  try {
    return fs.statSync(dir, { throwIfNoEntry: false })?.isDirectory() ?? false;
  } catch {
    return false;
  }
};

/** Whether `dir` looks like a brand project: it has a blazon.json, the tokens folder that file names, or a `tokens` folder. */
function isBrandFolder(dir: string): boolean {
  if (!isDirectory(dir)) return false;
  const config = path.join(dir, 'blazon.json');
  if (fs.statSync(config, { throwIfNoEntry: false })?.isFile()) return true;
  return isDirectory(path.join(dir, 'tokens'));
}

/** The failures a folder typed first ends in: no folder or no tokens folder where the command ran, or a token that is not there. */
const FOLDER_FAILURES = new Set(['no-folder', 'no-tokens-folder', 'unknown-token']);

/** A command line, each word quoted for the shell when it needs it. */
const line = (words: string[]): string => words.map((word) => (/^<.*>$/.test(word) ? word : shellWord(word))).join(' ');

/**
 * One line for a failed read command, or undefined. `names` are the command's positional names in order and `typed` what was typed for each
 * (the brand folder `dir` last, when the command has one). The line is given when the error is one a folder typed first ends in, and one of
 * the leading arguments (not `dir`) names an existing folder that looks like a brand project. A group named like a stray folder stays quiet.
 */
export function folderFirstHint(command: string[], names: string[], typed: unknown[], required: Set<string>, error: unknown): string | undefined {
  if (!(error instanceof BlazonError) || !FOLDER_FAILURES.has(error.code)) return undefined;
  const words = typed.map((value) => (typeof value === 'string' ? value : undefined));
  const index = names.findIndex((name, i) => {
    const value = words[i];
    if (name === 'dir' || value === undefined || !isBrandFolder(value)) return false;
    // a token that is not there: the message must be about this argument, or the folder was not what failed
    return error.code !== 'unknown-token' || error.message.includes(`"${value}"`);
  });
  if (index === -1) return undefined;
  const folder = words[index]!;
  const name = names[index]!;
  const rest = words.filter((value, i): value is string => value !== undefined && i !== index);
  const missing = rest.length === 0 ? [`<${name}>`] : [];
  const last = line(['blazon', ...command, ...(rest.length > 0 ? rest : missing), folder]);
  const cwd = line(['blazon', ...command, ...(rest.length > 0 || required.has(name) ? [...rest, ...missing] : []), '--cwd', folder]);
  const read = name === 'path' ? 'the path' : `the ${name} (a token path)`;
  return `"${folder}" was read as ${read}, not a folder; the folder goes last: ${last}, or ${cwd}`;
}
