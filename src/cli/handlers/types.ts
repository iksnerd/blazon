/** What a handler is given: the brand folder (the command line's `dir`, or the current folder), and the arguments the operation declares. */
export interface Context {
  dir: string;
}

/**
 * What a handler found. `body` is the result as data (`--json` prints it after `command` and `passed`), `text` prints it for a person,
 * and `status` is the exit status of an answer: 1 for a denied `can`. A question the brand cannot answer throws a UsageError (exit 2).
 */
export interface Outcome {
  command: string;
  /** Absent for a command that measures and does not judge: `--json` then has no `passed`. */
  passed?: boolean;
  status: number;
  body: object;
  text(): void;
}

export type Handler = (args: Record<string, unknown>, context: Context) => Promise<Outcome>;
