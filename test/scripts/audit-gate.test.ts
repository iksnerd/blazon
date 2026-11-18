import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT_DIR } from '../plugins/support/spec.js';
import { evaluate, formatTable, validateAllowlist } from '../../scripts/audit-gate.mjs';

// scripts/audit-gate.mjs replaces the raw `npm audit --omit=dev` in the release job. picomatch's ReDoS advisory has no patched version
// and blazon passes no attacker-controlled pattern to it (SECURITY.md), so that one advisory is allowed, with a reason and an expiry
// date, and everything else stays strict. The fixtures are the shape `npm audit --omit=dev --json` printed for this tree, trimmed to
// what the gate reads.

const ID = 'GHSA-fc5q-39xc-vjpf';
const OTHER = 'GHSA-aaaa-bbbb-cccc';
const advisory = (over: Record<string, unknown> = {}) => ({
  source: 1247710,
  name: 'picomatch',
  dependency: 'picomatch',
  title: 'picomatch vulnerable to ReDoS through single-branch repeated extglobs',
  url: `https://github.com/advisories/${ID}`,
  severity: 'high',
  range: '<=4.0.7',
  ...over,
});

/** The real report: one advisory, four vulnerable packages; the other three only name a package or an earlier one in their chain. */
const REAL = {
  auditReportVersion: 2,
  vulnerabilities: {
    fdir: { name: 'fdir', severity: 'high', isDirect: false, via: ['picomatch'] },
    picomatch: { name: 'picomatch', severity: 'high', isDirect: false, via: [advisory()] },
    tinyglobby: { name: 'tinyglobby', severity: 'high', isDirect: false, via: ['fdir', 'picomatch'] },
    vite: { name: 'vite', severity: 'high', isDirect: true, via: ['picomatch', 'tinyglobby'] },
  },
  metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 4, critical: 0, total: 4 } },
};
const CLEAN = { auditReportVersion: 2, vulnerabilities: {}, metadata: { vulnerabilities: { total: 0 } } };

const ENTRY = { id: ID, package: 'picomatch', reason: 'No attacker-controlled glob pattern reaches picomatch in blazon.', expires: '2027-02-17' };
const ALLOW = { advisories: [ENTRY] };
const TODAY = '2026-11-17';

/** The real report with one more advisory under another package. */
const withAdvisory = (pkg: string, over: Record<string, unknown>) => ({
  ...REAL,
  vulnerabilities: {
    ...REAL.vulnerabilities,
    [pkg]: { name: pkg, severity: over.severity ?? 'high', via: [advisory({ name: pkg, dependency: pkg, source: 9, url: `https://github.com/advisories/${OTHER}`, ...over })] },
  },
});

describe('the advisories in an audit report', () => {
  it('passes when the only high advisory is allowed and has not expired', () => {
    const result = evaluate(REAL, ALLOW, TODAY);
    expect(result.ok).toBe(true);
    expect(result.findings).toEqual([expect.objectContaining({ id: ID, package: 'picomatch', severity: 'high', status: 'allowed' })]);
    expect(result.findings[0]?.message).toContain('2027-02-17');
  });

  it('counts the one advisory once, though four packages are vulnerable through it, and ignores the string chain links', () => {
    const result = evaluate(REAL, { advisories: [] }, TODAY);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({ id: ID, package: 'picomatch', status: 'blocking' });
  });

  it('counts the same id under another package as the same advisory', () => {
    const twice = { ...REAL, vulnerabilities: { ...REAL.vulnerabilities, other: { name: 'other', severity: 'high', via: [advisory({ name: 'other' })] } } };
    expect(evaluate(twice, ALLOW, TODAY).findings).toHaveLength(1);
  });

  it('fails on a high advisory that is not allowed, and still lists the allowed one', () => {
    const result = evaluate(withAdvisory('lodash', {}), ALLOW, TODAY);
    expect(result.ok).toBe(false);
    expect(result.findings.find((f) => f.id === OTHER)).toMatchObject({ package: 'lodash', severity: 'high', status: 'blocking' });
    expect(result.findings.find((f) => f.id === ID)?.status).toBe('allowed');
  });

  it('fails on a critical advisory that is not allowed', () => {
    const result = evaluate(withAdvisory('x', { severity: 'critical' }), ALLOW, TODAY);
    expect(result.ok).toBe(false);
    expect(result.findings.find((f) => f.id === OTHER)?.status).toBe('blocking');
  });

  it('prints a low or moderate advisory and does not fail on it', () => {
    for (const severity of ['low', 'moderate']) {
      const result = evaluate(withAdvisory('x', { severity }), ALLOW, TODAY);
      expect(result.ok).toBe(true);
      expect(result.findings.find((f) => f.id === OTHER)).toMatchObject({ severity, status: 'noted' });
    }
  });

  it('treats a severity it does not know as blocking', () => {
    expect(evaluate(withAdvisory('x', { severity: 'weird' }), ALLOW, TODAY).ok).toBe(false);
  });

  it('fails an advisory whose url has no GHSA id', () => {
    const result = evaluate(withAdvisory('x', { url: 'https://example.com/none' }), ALLOW, TODAY);
    expect(result.ok).toBe(false);
    expect(result.findings.some((f) => f.status === 'blocking' && f.package === 'x')).toBe(true);
  });
});

describe('the allowlist entry', () => {
  it('fails once it has expired, and the day it expires is the last good day', () => {
    expect(evaluate(REAL, ALLOW, '2027-02-17').ok).toBe(true);
    const result = evaluate(REAL, ALLOW, '2027-02-18');
    expect(result.ok).toBe(false);
    expect(result.findings[0]).toMatchObject({ id: ID, status: 'expired' });
  });

  it('fails when the advisory is gone from the audit, so the entry is removed', () => {
    const result = evaluate(CLEAN, ALLOW, TODAY);
    expect(result.ok).toBe(false);
    expect(result.findings).toEqual([expect.objectContaining({ id: ID, package: 'picomatch', status: 'stale' })]);
  });

  it('is stale only when no audit holds the advisory, so one entry serves the root and the MCP audits', () => {
    expect(evaluate([REAL, CLEAN], ALLOW, TODAY).ok).toBe(true);
    expect(evaluate([CLEAN, CLEAN], ALLOW, TODAY).ok).toBe(false);
  });
});

describe('an audit that did not run', () => {
  const closed = (input: unknown) => {
    const result = evaluate(input, ALLOW, TODAY);
    expect(result.ok).toBe(false);
    expect(result.findings).toEqual([expect.objectContaining({ status: 'error' })]);
    return result.findings[0]?.message ?? '';
  };

  it('fails closed on text that is not JSON', () => {
    expect(closed('npm ERR! network request failed')).toMatch(/no parseable JSON/);
    expect(closed('')).toMatch(/no parseable JSON/);
  });

  it('fails closed on an error object, naming the reason and saying the audit did not run', () => {
    const message = closed({ error: { code: 'ENOTFOUND', summary: 'request to registry.npmjs.org failed' } });
    expect(message).toMatch(/ENOTFOUND/);
    expect(message).toMatch(/did not run/);
    expect(closed(JSON.stringify({ error: { code: 'ENOAUDIT', summary: 'audit endpoint returned an error' } }))).toMatch(/ENOAUDIT/);
  });

  it('fails closed on JSON that is not an audit report', () => {
    closed({ hello: 'world' });
    closed(null);
    closed([1]);
  });

  it('fails when one of several audits did not run, though another is clean', () => {
    expect(evaluate([REAL, { error: { code: 'E', summary: 's' } }], ALLOW, TODAY).ok).toBe(false);
  });

  it('accepts the report as text', () => {
    expect(evaluate(JSON.stringify(REAL), ALLOW, TODAY).ok).toBe(true);
  });
});

describe('validating the allowlist', () => {
  const problem = (value: unknown) => {
    try {
      validateAllowlist(value);
    } catch (error) {
      return (error as Error).message;
    }
    return undefined;
  };

  it('accepts the entry and an empty list', () => {
    expect(validateAllowlist(ALLOW)).toEqual([ENTRY]);
    expect(validateAllowlist({ advisories: [] })).toEqual([]);
  });

  it('refuses a file that is not { advisories: [...] }, or has another key', () => {
    expect(problem([])).toMatch(/advisories/);
    expect(problem({})).toMatch(/advisories/);
    expect(problem({ advisories: [], extra: 1 })).toMatch(/unknown key "extra"/);
  });

  it('refuses an unknown key in an entry', () => {
    expect(problem({ advisories: [{ ...ENTRY, note: 'x' }] })).toMatch(/unknown key "note"/);
  });

  it('refuses a missing or empty field, naming it', () => {
    for (const key of ['id', 'package', 'reason', 'expires']) {
      const rest: Record<string, string> = { ...ENTRY };
      delete rest[key];
      expect(problem({ advisories: [rest] })).toMatch(new RegExp(`"${key}"`));
      expect(problem({ advisories: [{ ...ENTRY, [key]: '  ' }] })).toMatch(new RegExp(`"${key}"`));
    }
  });

  it('refuses an id that is not a GHSA id', () => {
    expect(problem({ advisories: [{ ...ENTRY, id: 'CVE-2026-1' }] })).toMatch(/GHSA/);
  });

  it('refuses a date that is not YYYY-MM-DD or does not exist', () => {
    for (const expires of ['2027-2-17', '17/02/2027', '2027-02-30', '2027-13-01', 'soon']) {
      expect(problem({ advisories: [{ ...ENTRY, expires }] })).toMatch(/"expires"/);
    }
  });

  it('refuses a duplicate id', () => {
    expect(problem({ advisories: [ENTRY, { ...ENTRY, package: 'other' }] })).toMatch(/duplicate/);
  });

  it('is what evaluate applies, so a bad allowlist stops the gate', () => {
    expect(() => evaluate(REAL, { advisories: [{ ...ENTRY, expires: 'soon' }] }, TODAY)).toThrow(/"expires"/);
  });
});

describe('the committed allowlist', () => {
  it('is valid, and every entry has a reason that points at SECURITY.md', () => {
    // It is empty while no advisory needs a reviewed exception (the picomatch advisory that first filled it was withdrawn upstream).
    const entries = validateAllowlist(JSON.parse(fs.readFileSync(path.join(ROOT_DIR, '.github/audit-allowlist.json'), 'utf-8')));
    for (const entry of entries) expect(entry.reason).toContain('SECURITY.md');
  });
});

describe('the table', () => {
  it('has a row per advisory with id, package, severity and status', () => {
    const table = formatTable(evaluate(REAL, ALLOW, TODAY).findings);
    expect(table).toMatch(new RegExp(`${ID}\\s+picomatch\\s+high\\s+allowed until 2027-02-17`));
    expect(formatTable(evaluate(REAL, { advisories: [] }, TODAY).findings)).toMatch(/BLOCKING/);
    expect(formatTable(evaluate(REAL, ALLOW, '2028-01-01').findings)).toMatch(/EXPIRED/);
    expect(formatTable(evaluate(CLEAN, ALLOW, TODAY).findings)).toMatch(/STALE/);
  });
});
