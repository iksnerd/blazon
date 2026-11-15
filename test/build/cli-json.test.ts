import { describe, it, expect } from 'vitest';
import { spawnSync } from '../support/spawn';
import fs from 'node:fs';
import path from 'node:path';
import { REPO } from '../support/paths';
import { starterProject } from '../support/project';

// `--json` is the contract for a script or an agent: standard output is one JSON document and nothing else, the human text
// goes to standard error, and the exit status says what a person would read from the last line.

const blazon = (...args: string[]) =>
  spawnSync(process.execPath, ['--import', 'tsx', path.join(REPO, 'scripts/blazon-src.ts'), ...args], {
    encoding: 'utf-8',
    cwd: REPO,
    env: { ...process.env, NO_COLOR: '1' },
    input: '',
  });

/** The starter, with its first color token set to something that is not a color. */
async function brokenProject(): Promise<string> {
  const root = await starterProject();
  const file = path.join(root, 'tokens/colors.json');
  const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
  const first = (group: Record<string, any>): Record<string, any> | undefined => {
    for (const value of Object.values(group)) {
      if (value && typeof value === 'object' && '$value' in value) return value;
      if (value && typeof value === 'object') {
        const found = first(value);
        if (found) return found;
      }
    }
  };
  first(data)!.$value = 'notacolor';
  fs.writeFileSync(file, JSON.stringify(data));
  return root;
}

describe('blazon check --json', () => {
  it('prints one JSON document on standard output and the banner on standard error', async () => {
    const root = await starterProject();
    const ran = blazon('check', root, '--json');
    expect(ran.status, ran.stdout + ran.stderr).toBe(0);
    expect(ran.stdout.trimStart()[0]).toBe('{');
    const report = JSON.parse(ran.stdout);
    expect(report).toMatchObject({ command: 'check', passed: true, strict: false, counts: { errors: 0 } });
    expect(report.counts.warnings).toBe(2); // the starter's two logos are still blazon's own (starter-logo)
    expect(report.counts.info).toBeGreaterThan(0);
    expect(report.findings.length).toBe(report.counts.errors + report.counts.warnings + report.counts.info);
    expect(report.findings[0]).toEqual(
      expect.objectContaining({ code: expect.any(String), severity: expect.stringMatching(/^(error|warning|info)$/), path: expect.any(String), message: expect.any(String) }),
    );
    expect(ran.stderr).toContain('Checking design tokens');
    expect(ran.stdout).not.toContain('Checking design tokens');
  });

  it('exits 1 and reports the error as a finding when the tokens are wrong', async () => {
    const ran = blazon('check', await brokenProject(), '--json');
    expect(ran.status, ran.stdout + ran.stderr).toBe(1);
    const report = JSON.parse(ran.stdout);
    expect(report.passed).toBe(false);
    expect(report.counts.errors).toBeGreaterThan(0);
    expect(report.findings).toContainEqual(expect.objectContaining({ code: 'invalid-value', severity: 'error', message: expect.stringContaining('"notacolor" is not a color') }));
  });

  it('gives each finding the fix of its code, an error and a note alike', async () => {
    const report = JSON.parse(blazon('check', await brokenProject(), '--json').stdout);
    const invalid = report.findings.find((f: { code: string }) => f.code === 'invalid-value');
    expect(invalid.fix).toBe("Change the value so it fits the token's $type; the message says how.");
    expect(report.findings.find((f: { code: string }) => f.code === 'starter-file').fix).toBe("Replace the file's text with the brand's own, or delete it.");
  });

  it('names the token file, with its folder, when its JSON is broken', async () => {
    const root = await starterProject();
    fs.writeFileSync(path.join(root, 'tokens/colors.json'), '{ "color": ');
    const report = JSON.parse(blazon('check', root, '--json').stdout);
    expect(report.findings).toContainEqual(expect.objectContaining({ code: 'invalid-json', path: 'tokens/colors.json', fix: expect.stringContaining('JSON syntax') }));
  });

  it('fails on warnings with --strict, and says it did', async () => {
    // a starter has no warning: one token marked for review makes one
    const root = await starterProject();
    const file = path.join(root, 'tokens/colors.json');
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
    data.color.base.bone.$extensions = { 'dev.blazon': { review: { status: 'needs-review', note: 'check it' } } };
    fs.writeFileSync(file, JSON.stringify(data));
    const ran = blazon('check', root, '--json', '--strict');
    expect(ran.status).toBe(1);
    expect(JSON.parse(ran.stdout)).toMatchObject({ passed: false, strict: true });
  });

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
    expect(report.findings).toContainEqual(expect.objectContaining({ code: 'invalid-value', file: 'tokens/colors.json' }));
  });
});

describe('blazon check, when it fails', () => {
  it('ends with the next step for each kind of error, then to run the check again', async () => {
    const ran = blazon('check', await brokenProject());
    expect(ran.status).toBe(1);
    expect(ran.stdout).toMatch(/Next:\n\s+1\. invalid-value: Change the value so it fits the token's \$type; the message says how\.\n\s+2\. Run blazon check \S+ again/);
  });

  it('prints one Next block, the one for the errors, and not the starter one', async () => {
    const ran = blazon('check', await brokenProject());
    expect(ran.stdout.match(/^Next:/gm)).toHaveLength(1);
    expect(ran.stdout).not.toContain('with your colors');
  });

  it('says a token file that ends early may be truncated', async () => {
    const root = await starterProject();
    const file = path.join(root, 'tokens/colors.json');
    fs.writeFileSync(file, fs.readFileSync(file, 'utf-8').slice(0, 120));
    const report = JSON.parse(blazon('check', root, '--json').stdout);
    expect(report.findings).toContainEqual(expect.objectContaining({ code: 'invalid-json', message: expect.stringContaining('the file ends early') }));
  });

  it('prints no next step when it passes with warnings only', async () => {
    const ran = blazon('check', await starterProject());
    expect(ran.status).toBe(0);
    expect(ran.stdout).not.toMatch(/Run blazon check again/);
  });
});

describe('blazon build --json', () => {
  it('builds the site, and prints one JSON document on standard output', async () => {
    const root = await starterProject();
    const ran = blazon('build', root, '--json');
    expect(ran.status, ran.stdout + ran.stderr).toBe(0);
    expect(ran.stdout.trimStart()[0]).toBe('{');
    expect(JSON.parse(ran.stdout)).toMatchObject({ command: 'build', passed: true, counts: { errors: 0 } });
    expect(fs.existsSync(path.join(root, 'dist/site/index.html'))).toBe(true);
  }, 120_000);

  it('exits 1, builds nothing, and reports the findings when the tokens are wrong', async () => {
    const root = await brokenProject();
    const ran = blazon('build', root, '--json');
    expect(ran.status, ran.stdout + ran.stderr).toBe(1);
    const report = JSON.parse(ran.stdout);
    expect(report).toMatchObject({ command: 'build', passed: false });
    expect(report.findings).toContainEqual(expect.objectContaining({ code: 'invalid-value', severity: 'error' }));
    expect(fs.existsSync(path.join(root, 'dist/site'))).toBe(false);
  }, 120_000);
});

describe('blazon check --json, the line of a finding', () => {
  it('gives a token finding the line of the token key in its file, with CRLF line endings', async () => {
    const root = await starterProject();
    const lines = ['{', '  "color": {', '    "brand": { "$type": "color", "$value": "notacolor" }', '  }', '}'];
    fs.writeFileSync(path.join(root, 'tokens/colors.json'), lines.join('\r\n'));
    const report = JSON.parse(blazon('check', root, '--json').stdout);
    expect(report.findings).toContainEqual(expect.objectContaining({ code: 'invalid-value', path: 'color.brand', file: 'tokens/colors.json', line: 3 }));
  });

  it('gives an invalid-json finding the line the parser stopped on', async () => {
    const root = await starterProject();
    fs.writeFileSync(path.join(root, 'tokens/colors.json'), '{\n  "a": 1\n  "b": 2\n}');
    const report = JSON.parse(blazon('check', root, '--json').stdout);
    expect(report.findings).toContainEqual(expect.objectContaining({ code: 'invalid-json', path: 'tokens/colors.json', line: 3 }));
  });

  it('leaves line out when the finding is not about a token', async () => {
    const report = JSON.parse(blazon('check', await starterProject(), '--json').stdout);
    const starter = report.findings.find((f: { code: string }) => f.code === 'starter-file');
    expect(starter).not.toHaveProperty('line');
  });
});
