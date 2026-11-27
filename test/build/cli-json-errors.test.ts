import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { REPO } from '../support/paths';
import { blazon, brokenProject } from '../support/blazon-src';

// The --json error object and --severity of check, build and drift: the code, message and fix when a command cannot start. Split from the --json tests.
// `--json` is the contract for a script or an agent: standard output is one JSON document and nothing else, the human text
// goes to standard error, and the exit status says what a person would read from the last line.

describe('blazon check --json', () => {
  it('prints a JSON error object when the command cannot start, and the reason on standard error, and exits 2', () => {
    const ran = blazon('check', path.join(REPO, 'no-such-folder'), '--json');
    expect(ran.status).toBe(2);
    expect(JSON.parse(ran.stdout)).toEqual({
      command: 'check',
      passed: false,
      error: { code: 'no-folder', message: expect.stringContaining('no folder'), fix: expect.stringContaining('blazon init') },
    });
    expect(ran.stderr).toContain('blazon check: no folder');
  });

  it.each([
    ['check', ['--strcit', '--json'], 'unknown-option', 'unknown option "--strcit"'],
    ['build', [path.join(REPO, 'no-such-folder'), '--json'], 'no-folder', 'no folder'],
    ['drift', ['--json'], 'missing-argument', 'needs the address of a page'],
    ['drift', ['./no-such.css', '--json'], 'no-file', 'there is no file'],
    ['check', ['--no-plugins', '--plugin', 'x', '--json'], 'conflicting-options', '--no-plugins runs no plugin'],
  ])('prints the JSON error object for %s %j', (command, args, code, message) => {
    const ran = blazon(command, ...args);
    expect(ran.status, ran.stdout + ran.stderr).toBe(2);
    expect(JSON.parse(ran.stdout)).toEqual({ command, passed: false, error: { code, message: expect.stringContaining(message), fix: expect.any(String) } });
  });

  it.each(['--dir', '--project', '--path'])('says how to name the folder when %s is typed', (flag) => {
    const ran = blazon('check', flag, 'brand');
    expect(ran.status).toBe(2);
    expect(ran.stderr).toContain(`blazon check: unknown option ${flag}: give the folder as the last argument, blazon check <dir>, or use --cwd <dir>`);
    const json = JSON.parse(blazon('check', flag, 'brand', '--json').stdout);
    expect(json.error).toMatchObject({ code: 'unknown-option', message: expect.stringContaining('give the folder as the last argument'), fix: expect.stringContaining('--cwd') });
  });

  it('puts the fix in its own field, and keeps the message as it was', () => {
    const { error } = JSON.parse(blazon('check', path.join(REPO, 'no-such-folder'), '--json').stdout);
    expect(error.fix).toMatch(/^Run blazon init /);
    expect(error.message).toContain('; run blazon init');
  });

  it('keeps only the findings at or above --severity, and counts everything', async () => {
    const root = await brokenProject();
    const all = JSON.parse(blazon('check', root, '--json').stdout);
    const errors = JSON.parse(blazon('check', root, '--json', '--severity', 'error').stdout);
    expect(errors.findings.length).toBe(all.counts.errors);
    expect(errors.findings.every((f: { severity: string }) => f.severity === 'error')).toBe(true);
    expect(errors.counts).toEqual(all.counts);
    expect(errors.passed).toBe(false);
    const warnings = JSON.parse(blazon('check', root, '--json', '--severity', 'warning').stdout);
    expect(warnings.findings.length).toBe(all.counts.errors + all.counts.warnings);
  }, 60_000);

  it('refuses a severity that is not one, with exit 2', () => {
    const ran = blazon('check', REPO, '--json', '--severity', 'loud');
    expect(ran.status).toBe(2);
    expect(JSON.parse(ran.stdout).error).toMatchObject({ code: 'invalid-option-value', message: '--severity must be error, warning or info, not "loud".' });
  });

  it('names the file a token finding is about', async () => {
    const report = JSON.parse(blazon('check', await brokenProject(), '--json').stdout);
    expect(report.findings).toContainEqual(expect.objectContaining({ code: 'token-value-invalid', file: 'tokens/colors.json' }));
  });
});
