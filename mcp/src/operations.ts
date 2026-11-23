import { OPERATIONS } from './generated/operations.js';
import { toolInput } from './generated/project.js';
import type { Operation } from './generated/types.js';
import type { RunOptions } from './blazon.js';

export { OPERATIONS };

const kebab = (name: string): string => name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

/** The tool for a name, or undefined. */
export const operationNamed = (name: string): Operation | undefined => OPERATIONS.find((op) => op.name === name);

/** Models send "5" and "true". A string that reads as the integer or boolean the schema asks for is turned into it; anything else is left for the schema check to refuse. */
export function coerceArgs(op: Operation, args: Record<string, unknown>): Record<string, unknown> {
  const out = { ...args };
  for (const [name, prop] of Object.entries(toolInput(op).properties)) {
    const value = out[name];
    if (typeof value !== 'string') continue;
    if (prop.type === 'number' && value.trim() !== '' && Number.isFinite(Number(value))) out[name] = Number(value);
    else if (prop.type === 'integer' && /^\s*-?\d+\s*$/.test(value)) out[name] = Number(value);
    else if (prop.type === 'boolean' && /^(true|false)$/i.test(value.trim())) out[name] = value.trim().toLowerCase() === 'true';
  }
  return out;
}

/** The arguments of a call with each default the input schema states filled in. */
export function withDefaults(op: Operation, args: Record<string, unknown>): Record<string, unknown> {
  const filled = { ...args };
  for (const [name, prop] of Object.entries(op.inputSchema.properties)) if (filled[name] === undefined && 'default' in prop) filled[name] = prop.default;
  return filled;
}

/**
 * The blazon command line for a call, from the list: the command words, the arguments it always gets, the positionals the tool takes, then
 * the options. An option is one argument, `--name=value`, so a value that starts with a dash is that option's text and never an option of its own
 * (positionals are token paths, which the schema never lets start with a dash). The command line's own `dir` never appears: the tool does not take it, and the brand folder is the working directory.
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
  for (const name of flags) {
    const value = args[name];
    if (value === undefined) continue;
    const option = cli?.options.find((o) => o.property === name);
    const flag = option?.flag ?? kebab(name);
    if (Array.isArray(value)) {
      // a list is one flag for each item; an object item is its listed fields joined with ':'
      for (const item of value) argv.push(`--${flag}=${option?.items ? option.items.map((field) => String((item as Record<string, unknown>)[field])).join(':') : String(item)}`);
    } else if (flag.startsWith('no-')) {
      // a boolean that is true by default is turned off with its `--no-` flag, and left alone when true
      if (value === false) argv.push(`--${flag}`);
    } else argv.push(`--${flag}=${String(value)}`);
  }
  const options: RunOptions = { ...(mcp.answers && { answers: mcp.answers }), ...(mcp.json === false && { json: false }), ...(mcp.ignoreStderr && { stderr: 'ignore' as const }) };
  return { argv, options };
}
