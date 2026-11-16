import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { commandOperations, OPERATIONS, type CliSpec } from '../../src/core/operations/index.js';
import { ROOT, read } from '../support/spec-helpers.js';

// skills/blazon/SKILL.md tells a coding agent how to work with a brand book. It must not name a command, flag, MCP tool or
// file that does not exist. Expectations are read from the CLI, the operations list and the file system.

const skill = read('skills/blazon/SKILL.md');
const spans = [...skill.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]!);

const cli = read('src/cli/index.ts');
const commands = new Set([...[...cli.matchAll(/\.command\(\s*'([a-z]+)/g)].map((m) => m[1]!), ...commandOperations(OPERATIONS).map((op) => (op.cli as CliSpec).command[0]!)]);
const flags = new Set([
  '--debug',
  '--help',
  ...[...cli.matchAll(/\.option\('(?:-[A-Za-z], )?(--[A-Za-z][A-Za-z-]*)/g)].map((m) => m[1]!),
  ...commandOperations(OPERATIONS).flatMap((op) => (op.cli as CliSpec).options.map((option) => `--${option.property}`)),
]);
const tools = new Set(OPERATIONS.filter((op) => op.mcp !== false).map((op) => op.name));

describe('skills/blazon/SKILL.md', () => {
  it('has the front matter an Agent Skill needs', () => {
    const front = skill.match(/^---\n([\s\S]*?)\n---\n/)?.[1] ?? '';
    expect(front).toMatch(/^name: blazon$/m);
    const description = front.match(/^description: (.+)$/m)?.[1] ?? '';
    expect(description.length).toBeGreaterThan(0);
    expect(description.length).toBeLessThan(500);
  });

  it('stays under 150 lines', () => {
    expect(skill.split('\n').length).toBeLessThan(150);
  });

  it('finds what it is checking', () => {
    expect(commands.size).toBeGreaterThanOrEqual(10);
    expect(flags.size).toBeGreaterThanOrEqual(10);
    expect(tools.size).toBeGreaterThanOrEqual(7);
    expect(spans.filter((s) => s.startsWith('blazon ')).length).toBeGreaterThan(5);
  });

  // A command that is not built yet may be named on a line that says it comes in the next release
  const announced = (span: string) => skill.split('\n').some((line) => line.includes(`\`${span}\``) && /next release/.test(line));

  it.each([...new Set(spans.filter((s) => /^blazon [a-z]/.test(s)))])('names a command that exists: `%s`', (span) => {
    const command = span.split(' ')[1]!;
    expect(commands.has(command) || announced(span)).toBe(true);
  });

  it.each([...new Set(spans.flatMap((s) => s.match(/--[A-Za-z][A-Za-z-]*/g) ?? []))])('names a flag that exists: %s', (flag) => {
    expect(flags.has(flag) || (flag.startsWith('--no-') && flags.has(`--${flag.slice(5)}`))).toBe(true);
  });

  it.each([...new Set(spans.filter((s) => /^[a-z]+(_[a-z]+)+$/.test(s)))])('names an MCP tool that exists: `%s`', (name) => {
    expect(tools.has(name)).toBe(true);
  });

  it.each(OPERATIONS.filter((op) => op.mcp !== false).map((op) => op.name))('covers the MCP tool %s', (name) => {
    expect(spans).toContain(name);
  });

  it.each([...new Set([...skill.matchAll(/\b(docs\/manual\/[\w.-]+\.md)/g)].map((m) => m[1]!))])('points at a manual file that exists: %s', (file) => {
    expect(fs.existsSync(path.join(ROOT, file))).toBe(true);
  });

  it.each([...new Set(spans.filter((s) => /^(src|mcp|test)\/\S+$/.test(s)))])('points at a path that exists: %s', (file) => {
    expect(fs.existsSync(path.join(ROOT, file.replace(/#.*$/, '')))).toBe(true);
  });
});
