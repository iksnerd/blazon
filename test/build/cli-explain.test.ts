import { describe, it, expect } from 'vitest';
import { spawnSync } from '../support/spawn';
import path from 'node:path';
import { REPO } from '../support/paths';
import { CHECKS } from '../../src/core/checker/catalogue.js';
import { fixFor } from '../../src/core/checker/fixes.js';

// `blazon explain <code>` says what a finding code means and what to do about it, from the catalogue.

const blazon = (...args: string[]) =>
  spawnSync(process.execPath, ['--import', 'tsx', path.join(REPO, 'scripts/blazon-src.ts'), ...args], {
    encoding: 'utf-8',
    cwd: REPO,
    env: { ...process.env, NO_COLOR: '1' },
    input: '',
  });

describe('blazon explain <code>', () => {
  it('prints the severity, the summary and the place to read for a code', () => {
    const ran = blazon('explain', 'contrast');
    expect(ran.status).toBe(0);
    expect(ran.stdout).toContain('contrast');
    expect(ran.stdout).toContain(CHECKS.contrast.severity);
    expect(ran.stdout).toContain(CHECKS.contrast.summary);
    expect(ran.stdout).toContain('docs/manual/03-checks.md');
    expect(ran.stdout).toMatch(/RFC 0001/);
  });

  it('prints the fix for a code that has one, and no fix line for one that has none', () => {
    const withFix = Object.keys(CHECKS).find((code) => fixFor(code) !== undefined)!;
    expect(blazon('explain', withFix).stdout).toContain(fixFor(withFix)!);
    const without = Object.keys(CHECKS).find((code) => fixFor(code) === undefined);
    if (without) expect(blazon('explain', without).stdout).not.toMatch(/^\s*Fix/m);
  });

  it('prints the same as an object under --json', () => {
    const ran = blazon('explain', 'contrast', '--json');
    expect(ran.status).toBe(0);
    expect(JSON.parse(ran.stdout)).toMatchObject({
      command: 'explain',
      passed: true,
      code: 'contrast',
      severity: CHECKS.contrast.severity,
      summary: CHECKS.contrast.summary,
      rfc: CHECKS.contrast.rfc,
      manual: CHECKS.contrast.manual,
    });
  });

  it('names the closest codes for an unknown one, and exits 2', () => {
    const ran = blazon('explain', 'contrats');
    expect(ran.status).toBe(2);
    expect(ran.stdout).toBe('');
    expect(ran.stderr).toContain('blazon explain: unknown code "contrats"');
    expect(ran.stderr).toContain('contrast');
  });

  it('prints a JSON error with a code and a fix for an unknown code', () => {
    const ran = blazon('explain', 'contrats', '--json');
    expect(ran.status).toBe(2);
    expect(JSON.parse(ran.stdout)).toEqual({
      command: 'explain',
      passed: false,
      error: { code: 'unknown-finding-code', message: expect.stringContaining('unknown code "contrats"'), fix: expect.stringContaining('contrast') },
    });
  });

  it('lists every code with no argument', () => {
    const ran = blazon('explain');
    expect(ran.status).toBe(0);
    for (const code of Object.keys(CHECKS)) expect(ran.stdout).toContain(code);
  });

  it('lists every code as objects under --json with no argument', () => {
    const report = JSON.parse(blazon('explain', '--json').stdout);
    expect(report).toMatchObject({ command: 'explain', passed: true });
    expect(report.codes.map((c: { code: string }) => c.code)).toEqual(Object.keys(CHECKS).sort());
  });
});
