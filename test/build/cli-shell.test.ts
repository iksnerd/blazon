import { describe, it, expect } from 'vitest';
import { spawnSync } from '../support/spawn';
import path from 'node:path';
import { REPO } from '../support/paths';
import { closest } from '../../src/core/suggest.js';

// What the command line says when it is used wrongly: one line that names the mistake and the fix, exit 2, and no stack
// trace unless `--debug` asks for it. An agent reads the status and the first line; it cannot recover from a success that lied.

const blazon = (...args: string[]) =>
  spawnSync(process.execPath, ['--import', 'tsx', path.join(REPO, 'scripts/blazon-src.ts'), ...args], {
    encoding: 'utf-8',
    cwd: REPO,
    env: { ...process.env, NO_COLOR: '1' },
    input: '',
  });

const noTrace = (text: string) => {
  expect(text).not.toContain('file://');
  expect(text).not.toMatch(/\n\s+at /);
};

describe('the command line: a wrong use', () => {
  it('refuses an unknown command, says which one was meant, and exits 2', () => {
    const ran = blazon('chek');
    expect(ran.status, ran.stdout + ran.stderr).toBe(2);
    expect(ran.stderr.split('\n')[0]).toBe('blazon: unknown command "chek"; did you mean "check"? Run blazon --help for the commands.');
    expect(ran.stdout).toBe('');
    noTrace(ran.stderr);
  });

  it('names no guess for a command that resembles nothing', () => {
    const ran = blazon('zzzzzzzz');
    expect(ran.status).toBe(2);
    expect(ran.stderr.split('\n')[0]).toBe('blazon: unknown command "zzzzzzzz". Run blazon --help for the commands.');
  });

  it('prints the help and exits 0 when it is run with nothing', () => {
    const ran = blazon();
    expect(ran.status, ran.stdout + ran.stderr).toBe(0);
    expect(ran.stdout).toMatch(/Usage:/);
    expect(ran.stdout).toMatch(/\bcheck \[dir\]/);
    expect(ran.stderr).toBe('');
  });

  it('refuses an unknown option, says which one was meant, and exits 2', () => {
    const ran = blazon('check', '--strcit');
    expect(ran.status, ran.stdout + ran.stderr).toBe(2);
    expect(ran.stderr.split('\n')[0]).toBe('blazon check: unknown option "--strcit"; did you mean "--strict"? Run blazon check --help for the options.');
    noTrace(ran.stderr);
  });

  it('refuses an option that resembles nothing, without a guess', () => {
    const ran = blazon('build', '--zzzzzzzz');
    expect(ran.status).toBe(2);
    expect(ran.stderr.split('\n')[0]).toBe('blazon build: unknown option "--zzzzzzzz". Run blazon build --help for the options.');
  });

  it('shows the stack of a parser error only with --debug', () => {
    const ran = blazon('check', '--strcit', '--debug');
    expect(ran.status).toBe(2);
    expect(ran.stderr.split('\n')[0]).toContain('unknown option "--strcit"');
    expect(ran.stderr).toContain('CACError');
  });

  it.each([['abc'], ['0'], ['-1'], ['65536'], ['3000.5']])('refuses the port %s for dev and preview before it starts anything, and exits 2', (port) => {
    for (const command of ['dev', 'preview']) {
      const ran = blazon(command, `--port=${port}`);
      expect(ran.status, `${command} -p ${port}: ${ran.stdout}${ran.stderr}`).toBe(2);
      expect(ran.stderr.split('\n')[0]).toBe(`blazon ${command}: the port must be a whole number from 1 to 65535, not "${port}".`);
      noTrace(ran.stderr);
    }
  });
});

describe('closest', () => {
  const commands = ['dev', 'build', 'tokens', 'check', 'drift', 'approvals', 'plugin', 'init', 'preview'];

  it.each([
    ['chek', 'check'],
    ['bild', 'build'],
    ['preveiw', 'preview'],
    ['tokns', 'tokens'],
  ])('says %s was meant to be %s', (typed, meant) => expect(closest(typed, commands)).toBe(meant));

  it('says nothing when no name is near', () => {
    expect(closest('zzzzzzzz', commands)).toBeUndefined();
    expect(closest('x', ['dev'])).toBeUndefined();
  });

  it('breaks a tie by the order given', () => expect(closest('dex', ['dev', 'dew'])).toBe('dev'));
});
