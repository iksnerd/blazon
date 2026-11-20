import fs from 'node:fs';
import type { CAC } from 'cac';
import { commandOperations, OPERATIONS, type CliOption, type CliSpec, type Operation } from '../core/operations/index.js';
import { BlazonError, failed } from './errors.js';
import { folderFirstHint } from './folder-first.js';
import { HANDLERS } from './handlers/index.js';
import { printJson } from './read.js';

// The commands that are operations (src/core/operations/list.ts): their help, their arguments and their options come from the list, and
// each one runs the handler of the same name in handlers/. The parser is still cac; the other commands are registered by hand in index.ts.

const specOf = (op: Operation): CliSpec => op.cli as CliSpec;

const kebab = (name: string): string => name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

/** The first word of each command whose `--json` prints the result, for the error that `--json` turns into JSON. */
export const JSON_COMMANDS: string[] = commandOperations(OPERATIONS)
  .filter((op) => specOf(op).options.some((option) => option.property === 'json'))
  .map((op) => specOf(op).command[0]!);

/** The text that registers a command with the parser: `get <path> [dir]`. A positional is required when the input requires it. */
export function rawName(op: Operation): string {
  const spec = specOf(op);
  const required = new Set(op.inputSchema.required ?? []);
  return [...spec.command, ...spec.positional.map((name) => (required.has(name) ? `<${name}>` : `[${name}]`))].join(' ');
}

/** The flag for an option: `--json`, `--type <type>`, `--key <path>`, `--pair <fg:bg>`, `--no-verbose`. */
export function flagOf(op: Operation, option: CliOption): string {
  if (option.property === 'json') return '--json';
  const prop = op.inputSchema.properties[option.property];
  const name = option.flag ?? kebab(option.property);
  return prop?.type === 'boolean' ? `--${name}` : `--${name} <${option.value ?? name}>`;
}

/** The key the parser files an option under: the flag in camel case, without a `no-` that negates it. */
const keyOf = (option: CliOption): string => (option.flag ?? kebab(option.property)).replace(/^no-/, '').replace(/-(.)/g, (_, letter: string) => letter.toUpperCase());

/** Whether `typed` names a folder and not a token path: a path has no slash and never starts with a dot. */
const isFolder = (typed: unknown): boolean => typeof typed === 'string' && /^\.|[\\/]/.test(typed) && Boolean(fs.statSync(typed, { throwIfNoEntry: false })?.isDirectory());

/** Registers every operation that has a command. The registration order is the order of `rank` in the list. */
export function registerOperations(cli: CAC, debug: boolean): void {
  for (const op of commandOperations(OPERATIONS)) {
    const spec = specOf(op);
    const handler = HANDLERS[op.name];
    if (!handler) throw new Error(`operation ${op.name} has a command and no handler`);
    const command = cli.command(rawName(op), spec.summary);
    for (const option of spec.options) command.option(flagOf(op, option), option.description);
    command.action(async (...received: unknown[]) => {
      const options = (received.pop() ?? {}) as Record<string, unknown>;
      try {
        const args: Record<string, unknown> = {};
        spec.positional.forEach((name, i) => (args[name] = received[i]));
        for (const option of spec.options) if (option.property !== 'json') args[option.property] = options[keyOf(option)];
        // `blazon rules ./brand` names a folder, not a path
        let dir = args.dir;
        if (spec.folder !== undefined && dir === undefined && isFolder(args[spec.folder])) {
          dir = args[spec.folder];
          args[spec.folder] = undefined;
        }
        delete args.dir;
        const outcome = await handler(args, { dir: dir ? String(dir) : process.cwd() });
        if (options.json) printJson(outcome.command, outcome.passed, outcome.body);
        else outcome.text();
        process.exitCode = outcome.status;
      } catch (err) {
        // the one place a folder typed first is explained, for every command registered here
        const hint = folderFirstHint(spec.command, spec.positional, received, new Set(op.inputSchema.required ?? []), err);
        if (hint && err instanceof BlazonError) err.hint = hint;
        failed(spec.command.join(' '), err, debug);
      }
    });
  }
}
