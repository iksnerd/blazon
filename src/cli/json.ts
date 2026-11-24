import { blazonPinState } from '../core/blazon-pin.js';
import { brandErrors, summarizeFindings } from '../core/checker/index.js';
import { fixOf } from '../core/checker/fixes.js';
import type { Finding } from '../types/index.js';
import { CheckFailed } from './commands/check.js';
import { jsonError, type ErrorCode } from './errors.js';
import { runInit, type InitOptions, type InitReport } from './commands/init.js';

/**
 * Runs a command that finds things and prints what it found as one JSON document on standard output. Everything else the
 * command prints (its banner, its list of findings) goes to standard error for the time it runs, so a script can parse
 * standard output whole. `counts` and `passed` cover every finding; `severity` only cuts the list. `brandHasErrors` is true when a finding other than the pin
 * family is an error (a value may be wrong); `pinMismatch` is there when blazon.lock names another blazon build, and `cwd` is the folder it is read from. Exit status: 0 passed, 1 not passed. A command that cannot start throws, and prints nothing here.
 */
export const SEVERITIES = ['error', 'warning', 'info'] as const;
export type SeverityOption = (typeof SEVERITIES)[number];

/** The severities a `--severity` level keeps: that level and the worse ones. */
const KEPT: Record<SeverityOption, string[]> = { error: ['error'], warning: ['error', 'warning'], info: ['error', 'warning', 'info'] };

export async function asJson(
  command: 'check' | 'build' | 'tokens',
  strict: boolean,
  run: () => Promise<{ findings: Finding[] }>,
  severity: SeverityOption = 'info',
  cwd: string = process.cwd(),
): Promise<void> {
  const log = console.log;
  console.log = (...args: unknown[]) => console.error(...args);
  let findings: Finding[];
  try {
    findings = (await run()).findings;
  } catch (error) {
    if (!(error instanceof CheckFailed)) throw error;
    findings = error.findings;
  } finally {
    console.log = log;
  }
  const result = summarizeFindings(findings, { strict });
  const counts = { errors: result.errors.length, warnings: result.warnings.length, info: result.infos.length };
  const { mismatch } = blazonPinState(cwd);
  const pinMismatch = mismatch && { pinned: mismatch.pinned, running: mismatch.running, message: mismatch.message };
  process.stdout.write(
    `${JSON.stringify({ command, passed: result.passed, strict, counts, brandHasErrors: brandErrors(findings).length > 0, ...(pinMismatch && { pinMismatch }), findings: result.all.filter((finding) => KEPT[severity].includes(finding.severity)).map((finding) => ({ ...finding, ...(fixOf(finding) && { fix: fixOf(finding) }) })) }, null, 2)}\n`,
  );
  process.exitCode = result.passed ? 0 : 1;
}

/**
 * `blazon init --json`: never asks, prints what it made as one JSON document on standard output and its usual text on standard error.
 * `created`, `kept` and `updated` are paths in the folder; a starter file that was already there is kept, not overwritten, and `updated` names a `.gitignore` init added a line to. Exit status: init's own.
 */
export async function initAsJson(dir: string, options: InitOptions): Promise<number> {
  const log = console.log;
  console.log = (...args: unknown[]) => console.error(...args);
  let made: InitReport | undefined;
  let code: number;
  let failure: { code: ErrorCode; message: string } | undefined;
  try {
    code = await runInit(dir, { ...options, input: false, report: (report) => (made = report), failure: (why) => (failure = why) });
  } finally {
    console.log = log;
  }
  const result = {
    command: 'init',
    passed: code === 0,
    ...(made ?? {}),
    ...(code !== 0 && {
      error: failure ? jsonError(failure.code, failure.message) : jsonError('error', `init did not finish (exit status ${code}); the reason is on standard error`),
    }),
  };
  process.stdout.write(`${JSON.stringify(result)}\n`);
  return code;
}
