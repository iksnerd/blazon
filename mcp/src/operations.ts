import { OPERATIONS } from './generated/operations.js';
import type { Operation } from './generated/types.js';
import type { RunOptions } from './blazon.js';

export { OPERATIONS };

const kebab = (name: string): string => name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

/** The tool for a name, or undefined. */
export const operationNamed = (name: string): Operation | undefined => OPERATIONS.find((op) => op.name === name);

/** The arguments of a call with each default the input schema states filled in. */
export function withDefaults(op: Operation, args: Record<string, unknown>): Record<string, unknown> {
  const filled = { ...args };
  for (const [name, prop] of Object.entries(op.inputSchema.properties)) if (filled[name] === undefined && 'default' in prop) filled[name] = prop.default;
  return filled;
}

/**
 * The blazon command line for a call, from the list: the command words, the arguments it always gets, the positionals the tool takes, then
 * the options. The command line's own `dir` never appears: the tool does not take it, and the brand folder is the working directory.
 */
export function commandFor(op: Operation, args: Record<string, unknown>): { argv: string[]; options: RunOptions } {
  const cli = op.cli === false ? undefined : op.cli;
  const mcp = op.mcp === false || op.mcp === undefined ? {} : op.mcp;
  const words = mcp.command ?? cli?.command;
  if (!words) throw new Error(`operation ${op.name} has no command to run`);
  const only = new Set(cli?.cliOnly ?? []);
  const positional = (cli?.positional ?? []).filter((name) => !only.has(name));
  const flags = mcp.flags ?? (cli?.options ?? []).map((option) => option.property).filter((name) => name !== 'json' && !positional.includes(name) && !only.has(name));
  const argv = [...words, ...(mcp.fixed ?? [])];
  for (const name of positional) if (args[name] !== undefined) argv.push(String(args[name]));
  for (const name of flags) if (args[name] !== undefined) argv.push(`--${kebab(name)}`, String(args[name]));
  const options: RunOptions = { ...(mcp.answers && { answers: mcp.answers }), ...(mcp.json === false && { json: false }), ...(mcp.ignoreStderr && { stderr: 'ignore' as const }) };
  return { argv, options };
}
