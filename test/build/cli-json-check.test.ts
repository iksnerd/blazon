import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { starterProject } from '../support/init-project';
import { blazon, brokenProject } from '../support/blazon-src';

// check and build output, as JSON and as text: findings, --strict, failures, and the line of a finding. Split from the --json tests.
// `--json` is the contract for a script or an agent: standard output is one JSON document and nothing else, standard error
// is empty on a run that ends normally, and the exit status says what a person would read from the last line.

describe('blazon check --json', () => {
  it('prints one JSON document on standard output and nothing on standard error', async () => {
    const root = await starterProject();
    const ran = blazon('check', root, '--json');
    expect(ran.status, ran.stdout + ran.stderr).toBe(0);
    expect(ran.stdout.trimStart()[0]).toBe('{');
    const report = JSON.parse(ran.stdout);
    expect(report).toMatchObject({ command: 'check', passed: true, strict: false, counts: { errors: 0 } });
    expect(report.counts.warnings).toBe(2); // the starter's two logos are still blazon's own (starter-logo-unchanged)
    expect(report.counts.info).toBeGreaterThan(0);
    expect(report.findings.length).toBe(report.counts.errors + report.counts.warnings + report.counts.info);
    expect(report.findings[0]).toEqual(
      expect.objectContaining({ code: expect.any(String), severity: expect.stringMatching(/^(error|warning|info)$/), path: expect.any(String), message: expect.any(String) }),
    );
    expect(ran.stderr).toBe(''); // the findings are in the document, so a list on standard error would only repeat them
    expect(ran.stdout).not.toContain('Checking design tokens');
  });

  it('keeps standard error empty with --severity warning, so 2>&1 parses', async () => {
    const root = await starterProject();
    const ran = blazon('check', root, '--json', '--severity', 'warning');
    expect(ran.status, ran.stdout + ran.stderr).toBe(0);
    expect(ran.stderr).toBe('');
    expect(JSON.parse(ran.stdout).counts.warnings).toBe(2);
  });

  it('still prints the findings as text without --json', async () => {
    const ran = blazon('check', await starterProject());
    expect(ran.status, ran.stdout + ran.stderr).toBe(0);
    expect(ran.stdout).toContain('Checking design tokens');
    expect(ran.stdout).toContain('starter-logo-unchanged');
  });

  it('exits 1 and reports the error as a finding when the tokens are wrong', async () => {
    const ran = blazon('check', await brokenProject(), '--json');
    expect(ran.status, ran.stdout + ran.stderr).toBe(1);
    const report = JSON.parse(ran.stdout);
    expect(report.passed).toBe(false);
    expect(report.counts.errors).toBeGreaterThan(0);
    expect(report.findings).toContainEqual(
      expect.objectContaining({ code: 'token-value-invalid', severity: 'error', message: expect.stringContaining('"notacolor" is not a color') }),
    );
  });

  it('gives each finding the fix of its code, an error and a note alike', async () => {
    const report = JSON.parse(blazon('check', await brokenProject(), '--json').stdout);
    const invalid = report.findings.find((f: { code: string }) => f.code === 'token-value-invalid');
    expect(invalid.fix).toBe("Change the value so it fits the token's $type; the message says how.");
    expect(report.findings.find((f: { code: string }) => f.code === 'starter-file-unchanged').fix).toBe("Replace the file's text with the brand's own, or delete it.");
  });

  it('names the token file, with its folder, when its JSON is broken', async () => {
    const root = await starterProject();
    fs.writeFileSync(path.join(root, 'tokens/colors.json'), '{ "color": ');
    const report = JSON.parse(blazon('check', root, '--json').stdout);
    expect(report.findings).toContainEqual(expect.objectContaining({ code: 'token-file-invalid', path: 'tokens/colors.json', fix: expect.stringContaining('JSON syntax') }));
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
});

describe('blazon check, when it fails', () => {
  it('ends with the next step for each kind of error, then to run the check again', async () => {
    const ran = blazon('check', await brokenProject());
    expect(ran.status).toBe(1);
    expect(ran.stdout).toMatch(/Next:\n\s+1\. token-value-invalid: Change the value so it fits the token's \$type; the message says how\.\n\s+2\. Run blazon check \S+ again/);
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
    expect(report.findings).toContainEqual(expect.objectContaining({ code: 'token-file-invalid', message: expect.stringContaining('the file ends early') }));
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
    expect(report.findings).toContainEqual(expect.objectContaining({ code: 'token-value-invalid', severity: 'error' }));
    expect(fs.existsSync(path.join(root, 'dist/site'))).toBe(false);
  }, 120_000);
});

describe('blazon check --json, the line of a finding', () => {
  it('gives a token finding the line of the token key in its file, with CRLF line endings', async () => {
    const root = await starterProject();
    const lines = ['{', '  "color": {', '    "brand": { "$type": "color", "$value": "notacolor" }', '  }', '}'];
    fs.writeFileSync(path.join(root, 'tokens/colors.json'), lines.join('\r\n'));
    const report = JSON.parse(blazon('check', root, '--json').stdout);
    expect(report.findings).toContainEqual(expect.objectContaining({ code: 'token-value-invalid', path: 'color.brand', file: 'tokens/colors.json', line: 3 }));
  });

  it('gives a token-file-invalid finding the line the parser stopped on', async () => {
    const root = await starterProject();
    fs.writeFileSync(path.join(root, 'tokens/colors.json'), '{\n  "a": 1\n  "b": 2\n}');
    const report = JSON.parse(blazon('check', root, '--json').stdout);
    expect(report.findings).toContainEqual(expect.objectContaining({ code: 'token-file-invalid', path: 'tokens/colors.json', line: 3 }));
  });

  it('leaves line out when the finding is not about a token', async () => {
    const report = JSON.parse(blazon('check', await starterProject(), '--json').stdout);
    const starter = report.findings.find((f: { code: string }) => f.code === 'starter-file-unchanged');
    expect(starter).not.toHaveProperty('line');
  });
});
