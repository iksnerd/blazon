import pc from '../core/colors.js';
import { compileBlazonData } from '../core/index.js';
import { summarizeFindings } from '../core/checker/index.js';
import { LookupError } from '../core/read/index.js';
import type { BlazonConfig, BlazonData } from '../types/index.js';
import { UsageError } from './errors.js';
import { loadProject } from './project.js';

/** The brand in `dir`, from the same compile as `check`. A brand with errors is still read; standard error says so, since a value may be wrong. */
export async function readBrand(dir: string): Promise<{ config: BlazonConfig; data: BlazonData }> {
  const config = await loadProject(dir);
  const data = await compileBlazonData(config, dir);
  const { errors } = summarizeFindings(data.findings);
  if (errors.length > 0) console.error(pc.yellow(`blazon: this brand has ${errors.length} error(s), so a value below may be wrong; run blazon check.`));
  return { config, data };
}

/** Runs a lookup. A token that is not there, or not a color, is a wrong use of the command line: exit 2, nothing printed on standard output. */
export function asked<T>(lookup: () => T): T {
  try {
    return lookup();
  } catch (error) {
    if (error instanceof LookupError) throw new UsageError(error.message, undefined, 'unknown-token');
    throw error;
  }
}

/** The one JSON document `--json` prints: `command` and `passed` first, as `check --json` does. */
export function printJson(command: string, passed: boolean, body: object): void {
  process.stdout.write(`${JSON.stringify({ command, passed, ...body }, null, 2)}\n`);
}

/** A list of "label  value" lines, the labels lined up. */
export function printRows(rows: [string, string | undefined][], indent = '  '): void {
  const shown = rows.filter((row): row is [string, string] => row[1] !== undefined);
  const width = Math.max(0, ...shown.map(([label]) => label.length));
  for (const [label, value] of shown) console.log(`${indent}${pc.dim(label.padEnd(width))}  ${value}`);
}
