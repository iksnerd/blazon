import path from 'node:path';

// Paths and commands in what blazon prints, written from the folder the person ran blazon in, so each one works as typed there.

/**
 * A project folder as a person types it from `from`: '' for the folder itself, a relative path for one below it, else the
 * absolute path (a long "../../.." says less than the place itself).
 */
export function shownDir(dir: string, from: string = process.cwd()): string {
  const relative = path.relative(from, path.resolve(from, dir));
  if (relative === '') return '';
  return relative.startsWith('..') || path.isAbsolute(relative) ? path.resolve(from, dir) : relative.split(path.sep).join('/');
}

/** A file or folder of the project, from where blazon was run: `a/tokens/colors.json`. */
export const inDir = (dir: string, file: string): string => (dir ? `${dir}/${file}` : file);

/** A word for the shell, quoted when it holds anything the shell reads. */
const shellWord = (word: string): string => (/^[\w./@%+=:,-]+$/.test(word) ? word : `'${word.replace(/'/g, `'\\''`)}'`);

/** A blazon command that works from where blazon was run: `blazon dev a`, or `blazon dev` in the folder itself. */
export const blazonCommand = (command: string, dir: string): string => `blazon ${command}${dir ? ` ${shellWord(dir)}` : ''}`;
