import { describe, it, expect } from 'vitest';
import { spawnSync } from '../support/spawn';
import path from 'node:path';
import { REPO } from '../support/paths';

// The help is where an agent learns what a command does and what its exit status means, without opening the manual.

const blazon = (...args: string[]) =>
  spawnSync(process.execPath, ['--import', 'tsx', path.join(REPO, 'scripts/blazon-src.ts'), ...args], {
    encoding: 'utf-8',
    cwd: REPO,
    env: { ...process.env, NO_COLOR: '1' },
    input: '',
  });

describe('blazon --help', () => {
  const ran = blazon('--help');

  it('lists the commands, examples, and what each exit status means', () => {
    expect(ran.status).toBe(0);
    expect(ran.stdout).toMatch(/Examples:\n\s+\$ blazon init my-brand/);
    expect(ran.stdout).toMatch(/Exit status:\n\s+0 {2}[^\n]+\n\s+1 {2}[^\n]+\n\s+2 {2}[^\n]+/);
  });

  it('does not say --no-input is on by default', () => {
    const line = blazon('init', '--help')
      .stdout.split('\n')
      .find((l) => l.includes('--no-input'))!;
    expect(line).toBeDefined();
    expect(line).not.toContain('default: true');
  });
});

describe('blazon plugin <action> --help', () => {
  it.each([
    ['check', 'blazon plugin check <program>', /1 {2}a case failed/],
    ['pin', 'blazon plugin pin <path>', /t1: for a directory/],
    ['profile', 'blazon plugin profile', /0 {2}printed/],
  ])('says what %s does and its exit status, not the help of all three', (action, usage, status) => {
    const ran = blazon('plugin', action, '--help');
    expect(ran.status).toBe(0);
    expect(ran.stdout).toContain(usage);
    expect(ran.stdout).toMatch(status);
    expect(ran.stdout).not.toContain('plugin [action] [target]');
  });

  it('still shows the help of the whole plugin command with no action', () => {
    const ran = blazon('plugin', '--help');
    expect(ran.stdout).toContain('plugin [action] [target]');
  });
});
