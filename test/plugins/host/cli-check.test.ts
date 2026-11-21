import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { tempDir } from '../../support/project';
import { blazon, program, CONFORMING } from '../../support/plugin-cli';

// `blazon plugin check <program>` is the host's check command (RFC 0005 section 9) and `blazon plugin pin <path>` prints the digest of a
// file or a tree (section 3.4), run as the real command. This file: the --json form, a missing or ignored argument, and the plain check. The rest is in cli-*.test.ts.

describe('blazon plugin check --json', () => {
  it('prints the host, what it adopts and each case as one document, and exits 0 for a plugin that conforms', () => {
    const result = blazon('plugin', 'check', program(CONFORMING), '--json');
    expect(result.status, result.stdout + result.stderr).toBe(0);
    const out = JSON.parse(result.stdout);
    expect(out).toMatchObject({ command: 'plugin check', passed: true, host: 'blazon', adopts: [] });
    expect(out.cases.length).toBeGreaterThan(0);
    expect(out.cases[0]).toEqual({ case: expect.any(Number), name: expect.any(String), role: expect.any(String), status: expect.stringMatching(/^(ok|skip|fail)$/), detail: expect.any(String) });
    expect(out.cases.filter((c: { status: string }) => c.status === 'fail')).toEqual([]);
  }, 60_000);

  it('names the failed case and exits 1', () => {
    const result = blazon('plugin', 'check', program(CONFORMING.replace("*) echo 'the request is not JSON'; exit 2;;", '*) exit 0;;')), '--json');
    expect(result.status).toBe(1);
    const out = JSON.parse(result.stdout);
    expect(out.passed).toBe(false);
    expect(out.cases.some((c: { status: string }) => c.status === 'fail')).toBe(true);
  }, 60_000);

  it('runs the cases of each role the manifest declares after the core cases, as cases 6 to 9', () => {
    const out = JSON.parse(blazon('plugin', 'check', program(CONFORMING), '--json').stdout);
    const added = out.cases.filter((c: { case: number }) => c.case >= 6).map((c: { case: number; role: string; status: string }) => `${c.role} ${c.case} ${c.status}`);
    expect(added).toEqual(['check 6 ok', 'check 7 ok', 'check 8 ok', 'build 6 ok', 'build 7 ok', 'build 8 ok', 'build 9 ok']);
  }, 60_000);

  it('reports a build plugin that writes beside out_dir as a warning, and still exits 0', () => {
    const beside = CONFORMING.replace(
      "  echo '{\"findings\":[]}'",
      `  out=$(printf '%s' "$in" | sed -n 's/.*"out_dir":"\\([^"]*\\)".*/\\1/p'); [ -n "$out" ] && echo x > "$out.cache"\n  echo '{"findings":[]}'`,
    );
    const json = blazon('plugin', 'check', program(beside), '--json');
    expect(json.status, json.stdout + json.stderr).toBe(0);
    const out = JSON.parse(json.stdout);
    expect(out.passed).toBe(true);
    expect(out.cases.find((c: { case: number }) => c.case === 9)).toMatchObject({ role: 'build', status: 'warn' });
    const text = blazon('plugin', 'check', program(beside));
    expect(text.status).toBe(0);
    expect(text.stdout).toMatch(/warn\s+9\s+build:/);
    expect(text.stdout).toMatch(/Passed, with 1 warning/);
  }, 60_000);

  it('says a missing program as JSON, with the exit status of the text form', () => {
    const text = blazon('plugin', 'check', path.join(tempDir(), 'missing'));
    const result = blazon('plugin', 'check', path.join(tempDir(), 'missing'), '--json');
    expect(result.status).toBe(text.status);
    expect(JSON.parse(result.stdout)).toMatchObject({ command: 'plugin check', passed: false });
  }, 60_000);

  it('is refused for pin and profile, which print a digest and JSON already', () => {
    const result = blazon('plugin', 'profile', '--json');
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('--json is for `blazon plugin check`');
  }, 60_000);
});

describe('blazon plugin: a missing or ignored argument', () => {
  it.each([
    [['check', '--json'], 'plugin check'],
    [['pin', '--json'], 'plugin'],
  ])('says %j as JSON on standard output when --json is allowed, with exit 2 and code missing-argument', (args, command) => {
    const result = blazon('plugin', ...args);
    expect(result.status).toBe(2);
    if (command === 'plugin check') expect(JSON.parse(result.stdout)).toMatchObject({ command: 'plugin check', passed: false, error: { code: 'missing-argument' } });
    else expect(result.stderr).toContain('--json is for `blazon plugin check`');
  }, 60_000);

  it.each([['check'], ['pin']])('exits 2 for `plugin %s` with no target, and says the usage on standard error', (action) => {
    const result = blazon('plugin', action);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain(`usage: blazon plugin ${action}`);
  }, 60_000);

  it.each([
    [['check', '--name', 'x', '--digest', 'y', '--entry', 'z'], '--name'],
    [['check', '--entry', 'z'], '--entry'],
    [['profile', '--digest', 'y'], '--digest'],
  ])('refuses %j: an option of `pin` is not silently ignored', (args, flag) => {
    const result = blazon('plugin', args[0]!, ...(args[0] === 'check' ? [program(CONFORMING)] : []), ...args.slice(1));
    expect(result.status, result.stdout + result.stderr).toBe(2);
    expect(result.stderr).toContain(`${flag} is for \`blazon plugin pin\``);
  }, 60_000);

  it('refuses a target for profile', () => {
    const result = blazon('plugin', 'profile', 'foo');
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('`profile` takes no target');
  }, 60_000);
});

describe('blazon plugin check', () => {
  it('names the host and what it adopts before its first case, and exits 0 for a plugin that conforms', () => {
    const result = blazon('plugin', 'check', program(CONFORMING));
    expect(result.status, result.stdout + result.stderr).toBe(0);
    const lines = result.stdout.split('\n').filter((line) => line.trim() !== '');
    expect(lines[0]).toBe('blazon plugin check: host blazon, adopts: none');
    expect(result.stdout).toContain('the manifest call prints a manifest the host loads');
    expect(result.stdout).toMatch(/Passed/);
  }, 60_000);

  it('exits 1 and names the case that failed, for a plugin that breaks a rule', () => {
    // Accepts a request that is not JSON: case 2.
    const result = blazon('plugin', 'check', program(CONFORMING.replace("*) echo 'the request is not JSON'; exit 2;;", '*) exit 0;;')));
    expect(result.status).toBe(1);
    expect(result.stdout).toMatch(/FAIL\s+2\b/);
    expect(result.stdout).toMatch(/1 case failed|failed/);
  }, 60_000);

  it('exits 1 for a plugin that cannot start, naming the manifest call', () => {
    const result = blazon('plugin', 'check', path.join(tempDir(), 'missing'));
    expect(result.status).toBe(1);
    expect(result.stdout).toMatch(/FAIL\s+1\b/);
  }, 60_000);

  it('exits 2 when it is not given a program', () => {
    const result = blazon('plugin', 'check');
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('usage');
  }, 60_000);
});
