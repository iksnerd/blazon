// Writes the code, severity and summary of every core finding code into the two documents that list them, from the
// catalogue (src/core/checker/catalogue.ts): the manual's "Every finding" table and RFC 0001 section 4. Only the table
// between the `checks:begin` and `checks:end` markers is written; the text around it is by hand.
//   npm run checks-docs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CHECKS, type CheckCode } from '../src/core/checker/catalogue.js';
import type { Severity } from '../src/types/index.js';

export const BEGIN = '<!-- checks:begin -->';
export const END = '<!-- checks:end -->';

interface Target {
  /** Path from the repository root. */
  file: string;
  /** The word each document uses for a severity: the manual capitalises it and calls `info` a note. */
  words: Record<Severity, string>;
}

export const TARGETS: readonly Target[] = [
  { file: 'docs/manual/03-checks.md', words: { error: 'Error', warning: 'Warning', info: 'Note' } },
  { file: 'docs/rfc/0001-data-model.md', words: { error: 'error', warning: 'warning', info: 'info' } },
];

/** A plain byte comparison, so the order is the same on every machine. */
const byBytes = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** The table for one document, with its header and a line break at the end. */
export function table(target: Target): string {
  const rows = (Object.keys(CHECKS) as CheckCode[]).sort(byBytes).map((code) => {
    const { severity, summary } = CHECKS[code];
    if (summary.includes('|') || summary.includes('\n')) throw new Error(`the summary of ${code} cannot sit in a table cell`);
    return `| \`${code}\` | ${target.words[severity]} | ${summary} |`;
  });
  return ['| Code | Severity | Summary |', '|---|---|---|', ...rows, ''].join('\n');
}

/** The document with the text between its markers replaced by the table. */
export function withTable(text: string, target: Target): string {
  const begin = text.indexOf(BEGIN);
  const end = text.indexOf(END);
  if (begin === -1 || end === -1 || end < begin || text.indexOf(BEGIN, begin + 1) !== -1) {
    throw new Error(`${target.file} needs exactly one ${BEGIN} before one ${END}`);
  }
  return `${text.slice(0, begin + BEGIN.length)}\n${table(target)}${text.slice(end)}`;
}

/** What each document should hold, by path, given a way to read the current text. */
export function generate(readFile: (file: string) => string): Map<string, string> {
  return new Map(TARGETS.map((target) => [target.file, withTable(readFile(target.file), target)]));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const changed: string[] = [];
  for (const [file, text] of generate((f) => fs.readFileSync(path.join(root, f), 'utf-8'))) {
    const target = path.join(root, file);
    if (fs.readFileSync(target, 'utf-8') !== text) {
      fs.writeFileSync(target, text);
      changed.push(file);
    }
  }
  console.log(changed.length ? `checks-docs: wrote ${changed.join(', ')}` : 'checks-docs: already current');
}
