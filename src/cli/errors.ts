import pc from '../core/colors.js';

/**
 * The closed list of `error.code` values a `--json` error carries, one per kind of error. A script matches on the code, never on the
 * message. `error` is the code of an error with no kind of its own. Each code is described in the manual, chapter 3.
 */
export const ERROR_CODES = [
  'check-failed',
  'conflicting-options',
  'empty-value',
  'error',
  'invalid-option-value',
  'invalid-port',
  'missing-argument',
  'no-built-site',
  'no-file',
  'no-folder',
  'no-tokens-folder',
  'not-a-token',
  'plugin-failed',
  'port-in-use',
  'site-unreadable',
  'unknown-command',
  'unknown-finding-code',
  'unknown-key',
  'unknown-option',
  'unknown-token',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/**
 * An error blazon can explain: what happened (the message) and, when blazon knows it, what to do about it (`fix`). Every error
 * a command ends with is printed in one shape by `errorText`: `blazon <command>: <what happened>`, then the fix on its own line.
 */
export class BlazonError extends Error {
  constructor(
    message: string,
    readonly fix?: string,
    readonly code: ErrorCode = 'error',
  ) {
    super(message);
  }
}

/** A command was pointed at something that is not there (a folder, a tokens folder): the command line was used wrongly, so exit 2. */
export class UsageError extends BlazonError {}

/** What `--strict-port` turns a busy port into: a wrong use of the command line, with the way out. */
export const busyPort = (port: number): UsageError =>
  new UsageError(`port ${port} is in use`, 'Pick another with --port, or leave out --strict-port to take the next free one.', 'port-in-use');

/** The status a command ends with when it was used wrongly, so a caller can tell that from a failed check (1). */
export const USAGE_STATUS = 2;

/** The fix as the end of a sentence: "Run blazon build first." becomes "run blazon build first". */
const clause = (fix: string): string => fix.replace(/^./, (first) => first.toLowerCase()).replace(/\.$/, '');

/** The one text shape of an error: `blazon <command>: <what happened>`, and the fix, when there is one, indented on the next line. */
export function errorText(command: string, what: string, fix?: string): string {
  return `blazon${command ? ` ${command}` : ''}: ${what}${fix ? `\n  ${fix}` : ''}`;
}

/** The same error as the one sentence `--json` carries in `error.message`: what happened, then the fix after a semicolon. */
export const jsonMessage = (what: string, fix?: string): string => (fix ? `${what}; ${clause(fix)}` : what);

let jsonCommand: string | undefined;

/** Under --json a command that ends in an error says so on standard output as well, as one JSON object, so a script always gets JSON. */
export function jsonErrors(command: string | undefined): void {
  jsonCommand = command;
}

/** The error on standard error, its `blazon <command>:` in red when colour is on. */
function printError(text: string): void {
  console.error(text.replace(/^blazon(?: [a-z]+)*:/, (prefix) => pc.red(prefix)));
}

/** The error as the object `--json` prints: a stable `code`, the `message` for people (fix folded in), and the `fix` on its own when there is one. */
export const jsonError = (code: ErrorCode, message: string, fix?: string) => ({ code, message, ...(fix !== undefined && { fix }) });

function printJsonError(code: ErrorCode, message: string, fix?: string): void {
  if (jsonCommand !== undefined) process.stdout.write(`${JSON.stringify({ command: jsonCommand, passed: false, error: jsonError(code, message, fix) })}\n`);
}

/**
 * One error on standard error and exit 2: a wrong use of the command line. Nothing has run. `stack` follows it, for --debug.
 * `fix` is the next step, as `error.fix` under --json; the text already says it, so the message stays what a person reads.
 */
export function refuse(text: string, code: ErrorCode, extra: { fix?: string; stack?: string; json?: string } = {}): never {
  printError(text);
  if (extra.stack) console.error(extra.stack);
  printJsonError(code, extra.json ?? text.replace(/^blazon(?: [a-z]+)?: /, ''), extra.fix);
  return process.exit(USAGE_STATUS);
}

/** The parser's own sentence, as one line that starts with a lower-case word: "Unused args: `x`" becomes `unused args: "x"`. */
export const sentence = (message: string): string => message.replace(/`([^`]*)`/g, '"$1"').replace(/^./, (first) => first.toLowerCase());

/** Whether `error` is the command-line parser's complaint about what was typed, as opposed to a command that failed. */
export const isUsageError = (error: unknown): error is Error => error instanceof Error && error.name === 'CACError';

/**
 * A command that threw, in the one shape, and exit 1. An error blazon raised on purpose carries its fix; any other is unexpected,
 * so its fix line is the way to its stack, which `--debug` prints in its place.
 */
export function failed(command: string, error: unknown, debug: boolean): never {
  const fix = error instanceof BlazonError ? error.fix : undefined;
  if (error instanceof UsageError)
    return refuse(errorText(command, error.message, fix), error.code, { stack: debug ? error.stack : undefined, json: jsonMessage(error.message, fix), fix });
  const text = error instanceof Error ? error.message : String(error);
  console.error();
  printError(errorText(command, text, fix ?? (debug || error instanceof BlazonError ? undefined : pc.dim('Run again with --debug for the stack.'))));
  if (debug && error instanceof Error && error.stack) console.error(error.stack);
  printJsonError(error instanceof BlazonError ? error.code : 'error', jsonMessage(text, fix), fix);
  return process.exit(1);
}
