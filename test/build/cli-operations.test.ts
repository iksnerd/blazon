import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { commandOperations, OPERATIONS, type CliSpec } from '../../src/core/operations/index.js';
import { REPO } from '../support/paths';
import { spawnSync } from '../support/spawn';

// `blazon --help` and each command's help come from the operations list (src/core/operations/list.ts): the words, the arguments, the options.

const blazon = (...args: string[]) =>
  spawnSync(process.execPath, ['--import', 'tsx', path.join(REPO, 'scripts/blazon-src.ts'), ...args], {
    encoding: 'utf-8',
    cwd: REPO,
    env: { ...process.env, NO_COLOR: '1' },
    input: '',
  });

describe('the commands that are operations', () => {
  const help = blazon('--help').stdout;
  const specOf = (op: (typeof OPERATIONS)[number]) => op.cli as CliSpec;

  it.each(commandOperations(OPERATIONS).map((op) => [specOf(op).command.join(' '), op] as const))('lists %s with its summary, as the list says it', (_name, op) => {
    const spec = specOf(op);
    const required = new Set(op.inputSchema.required ?? []);
    const usage = [...spec.command, ...spec.positional.map((p) => (required.has(p) ? `<${p}>` : `[${p}]`))].join(' ');
    const line = help.split('\n').find((l) => l.trim().startsWith(`${usage} `));
    expect(line, usage).toBeDefined();
    expect(line).toContain(spec.summary.slice(0, 40));
  });

  it.each(commandOperations(OPERATIONS).map((op) => [specOf(op).command.join(' '), op] as const))('shows every option of %s in its help', (_name, op) => {
    const text = blazon(...specOf(op).command, '--help').stdout;
    for (const option of specOf(op).options) {
      expect(text).toContain(`--${option.property}`);
      expect(text).toContain(option.description);
    }
  });

  it('lists the commands in the order of the list, among the others', () => {
    const at = commandOperations(OPERATIONS).map((op) => help.indexOf(`  ${specOf(op).command[0]} `));
    expect(at.every((i) => i > 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });
});
