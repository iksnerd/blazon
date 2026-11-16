import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  MAX_TEXT,
  OPERATIONS,
  checkAgainst,
  commandOperations,
  toolInput,
  toolOf,
  toolOperations,
  validateOperations,
} from '../../src/core/operations/index.js';
import { HANDLERS } from '../../src/cli/handlers/index.js';
import { generated } from '../../scripts/gen-mcp-operations.js';
import { REPO } from '../support/paths.js';

// The operations list is the one definition of what blazon's read commands and MCP tools are. These tests keep the list sound, keep the two
// surfaces that read it complete, and keep the copy the MCP package carries in step with it.

/** The operations that are served on one surface only, and why. Adding to this table is a decision; a new operation with a missing surface fails. */
const ONE_SIDED: Record<string, { missing: 'cli' | 'mcp'; because: string }> = {
  check_brand: { missing: 'cli', because: 'blazon check runs plugins and is not an operation yet; the tool runs it without plugins' },
  get_brand: { missing: 'mcp', because: 'the whole document is too large for a tool; the resource blazon://brand carries it' },
};

describe('the operations list', () => {
  it('has no problem the validator finds', () => {
    expect(validateOperations(OPERATIONS)).toEqual([]);
  });

  it('serves every operation on the command line and as a tool, except the ones named in the table above', () => {
    const missing = Object.fromEntries(
      OPERATIONS.flatMap((op) => [op.cli === false && [op.name, 'cli'], op.mcp === false && [op.name, 'mcp']].filter((x): x is [string, string] => Boolean(x))),
    );
    expect(missing).toEqual(Object.fromEntries(Object.entries(ONE_SIDED).map(([name, { missing: side }]) => [name, side])));
  });

  it('has a handler for exactly the operations that have a command', () => {
    expect(Object.keys(HANDLERS).sort()).toEqual(
      commandOperations(OPERATIONS)
        .map((op) => op.name)
        .sort(),
    );
  });

  it('lists the tools in a fixed order and the commands by rank', () => {
    expect(toolOperations(OPERATIONS).map((op) => op.name)).toEqual(['check_brand', 'list_tokens', 'get_token', 'get_rules', 'can_use', 'get_fonts', 'get_logo']);
    expect(commandOperations(OPERATIONS).map((op) => (op.cli as { command: string[] }).command[0])).toEqual(['get', 'list', 'rules', 'can', 'fonts', 'logo', 'brand']);
  });

  it('builds a tool without changing the operation, and without the properties only the command line takes', () => {
    const before = JSON.stringify(OPERATIONS);
    for (const op of OPERATIONS) {
      const tool = toolOf(op);
      expect(Object.keys(tool.inputSchema.properties)).not.toContain('dir');
      expect(tool.inputSchema.additionalProperties).toBe(false);
    }
    expect(JSON.stringify(OPERATIONS)).toBe(before);
    expect(Object.keys(OPERATIONS.find((op) => op.name === 'get_token')!.inputSchema.properties)).toEqual(['path', 'dir']);
  });

  it('states the numbers the tools enforce, from one place', async () => {
    const result = await import('../../mcp/src/result.js');
    expect([result.MAX_TEXT, result.DEFAULT_LIMIT, result.MAX_LIMIT]).toEqual([MAX_TEXT, DEFAULT_LIMIT, MAX_LIMIT]);
    const check = OPERATIONS.find((op) => op.name === 'check_brand')!;
    expect(check.description).toContain(`default ${DEFAULT_LIMIT}, at most ${MAX_LIMIT}`);
    expect(check.inputSchema.properties.limit).toMatchObject({ default: DEFAULT_LIMIT, maximum: MAX_LIMIT });
  });
});

describe('checkAgainst', () => {
  const input = toolInput(OPERATIONS.find((op) => op.name === 'check_brand')!) as unknown as Record<string, unknown>;
  const tokenPath = toolInput(OPERATIONS.find((op) => op.name === 'get_token')!) as unknown as Record<string, unknown>;

  it('accepts what fits', () => {
    expect(checkAgainst(input, { severity: 'error', limit: 5 })).toEqual([]);
    expect(checkAgainst(tokenPath, { path: 'color.brand.primary' })).toEqual([]);
  });

  it.each([
    [input, { limit: 0 }, /limit must be at least 1/],
    [input, { limit: 501 }, /limit must be at most 500/],
    [input, { limit: 1.5 }, /limit must be an integer/],
    [input, { severity: 'loud' }, /severity must be one of error, warning, info/],
    [input, { extra: 1 }, /extra is not an argument of this tool/],
    [tokenPath, {}, /path is required/],
    [tokenPath, { path: '--help' }, /path is not in the form it needs/],
    [tokenPath, { path: 'a'.repeat(201) }, /path must be at most 200 characters/],
    [tokenPath, { path: 'a', dir: '/etc' }, /dir is not an argument of this tool/],
  ])('names what is wrong in %j', (schema, value, expected) => {
    expect(checkAgainst(schema, value, 'arguments').join('; ')).toMatch(expected);
  });
});

describe('the copy in mcp/src/generated', () => {
  it('is what scripts/gen-mcp-operations.ts writes; run npm run gen:mcp after a change to the list', async () => {
    for (const [file, text] of Object.entries(await generated())) expect(fs.readFileSync(path.join(REPO, file), 'utf8'), file).toBe(text);
  });
});
