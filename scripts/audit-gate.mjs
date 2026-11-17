// The release job's dependency audit. It replaces a bare `npm audit --omit=dev` with a gate that is as strict for everything but the
// advisories .github/audit-allowlist.json names, each with a reason and an expiry date (see CONTRIBUTING, "The release audit gate").
//   node scripts/audit-gate.mjs                       audit the root and the MCP workspace
//   node scripts/audit-gate.mjs --allowlist <file>    use another allowlist file
// It fails (exit 1) when
//   - a high or critical advisory is not in the allowlist;
//   - an allowlist entry has expired (its `expires` date is before today, UTC);
//   - an allowlist entry matches no advisory in either audit (stale: remove it);
//   - an audit printed no JSON or an `error` object, for instance a registry outage. A gate that could not look does not pass.
// Low and moderate advisories are printed and do not fail it. An advisory is one object in `vulnerabilities.*.via[]`, named by the GHSA
// id in its `url`; the same one appears under every package that depends on the vulnerable one, so they are counted once by id.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ENTRY_KEYS = ['id', 'package', 'reason', 'expires'];
const GHSA = /^GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/i;
const SOFT = new Set(['info', 'low', 'moderate']);
const RANK = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };

/** The canonical spelling of a GHSA id: the prefix in capitals, the rest in lower case. An empty string stays empty. */
const canon = (id) => (id ? `GHSA-${id.slice(5).toLowerCase()}` : '');

/** True for a real calendar date written YYYY-MM-DD. */
function isDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** The entries of the allowlist, or an Error naming every problem. */
export function validateAllowlist(value) {
  const problems = [];
  const entries = [];
  if (value === null || typeof value !== 'object' || Array.isArray(value) || !Array.isArray(value.advisories)) {
    throw new Error('audit allowlist: expected { "advisories": [ ... ] }');
  }
  for (const key of Object.keys(value)) if (key !== 'advisories') problems.push(`unknown key "${key}"`);
  const seen = new Set();
  value.advisories.forEach((entry, index) => {
    const at = `advisories[${index}]`;
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) return void problems.push(`${at}: expected an object`);
    for (const key of Object.keys(entry)) if (!ENTRY_KEYS.includes(key)) problems.push(`${at}: unknown key "${key}"`);
    for (const key of ENTRY_KEYS) {
      if (typeof entry[key] !== 'string' || entry[key].trim() === '') problems.push(`${at}: "${key}" is required and must be a non-empty string`);
    }
    if (typeof entry.id === 'string' && entry.id.trim() !== '') {
      if (!GHSA.test(entry.id)) problems.push(`${at}: "id" must be a GHSA id such as GHSA-xxxx-xxxx-xxxx`);
      else if (seen.has(canon(entry.id))) problems.push(`${at}: duplicate id ${entry.id}`);
      seen.add(canon(entry.id));
    }
    if (typeof entry.expires === 'string' && entry.expires.trim() !== '' && !isDate(entry.expires)) problems.push(`${at}: "expires" must be a real date, YYYY-MM-DD`);
    entries.push({ id: entry.id, package: entry.package, reason: entry.reason, expires: entry.expires });
  });
  if (problems.length > 0) throw new Error(`audit allowlist: ${problems.join('; ')}`);
  return entries;
}

/** What one audit report says: its advisories by id, or the reason it cannot be read. */
function readReport(report) {
  let value = report;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return { error: 'npm audit produced no parseable JSON, so the audit did not run' };
    }
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return { error: 'npm audit produced no audit report, so the audit did not run' };
  if (value.error !== undefined && value.error !== null) {
    const { code, summary } = typeof value.error === 'object' ? value.error : { summary: String(value.error) };
    return {
      error: `npm audit reported an error (${[code, summary].filter(Boolean).join(': ') || 'no detail'}); the audit did not run, for instance because the registry was unreachable`,
    };
  }
  if (value.vulnerabilities === null || typeof value.vulnerabilities !== 'object' || Array.isArray(value.vulnerabilities)) {
    return { error: 'npm audit JSON has no "vulnerabilities" object, so the audit did not run' };
  }
  const found = new Map();
  for (const vulnerable of Object.values(value.vulnerabilities)) {
    for (const via of vulnerable?.via ?? []) {
      if (via === null || typeof via !== 'object') continue; // a string is a link in the chain, not an advisory
      const id = canon(String(via.url ?? '').match(/GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}/i)?.[0] ?? '') || `unidentified:${via.source ?? via.name ?? '?'}`;
      const severity = typeof via.severity === 'string' ? via.severity.toLowerCase() : 'unknown';
      const old = found.get(id);
      if (!old || (RANK[severity] ?? 99) > (RANK[old.severity] ?? 99)) found.set(id, { id, package: String(via.name ?? vulnerable?.name ?? '?'), severity });
    }
  }
  return { found };
}

/**
 * Judge audit reports against the allowlist on `today` (YYYY-MM-DD). `reports` is one `npm audit --json` result or an array of them
 * (parsed or as text); an entry is stale only when no report holds its advisory. Throws on an invalid allowlist.
 * Returns { ok, findings }; a finding is { id, package, severity, status, message } with status allowed, noted, blocking, expired, stale or error.
 */
export function evaluate(reports, allowlist, today) {
  const entries = validateAllowlist(allowlist);
  const findings = [];
  const advisories = new Map();
  const list = Array.isArray(reports) ? reports : [reports];
  if (list.length === 0) findings.push({ id: '-', package: '-', severity: '-', status: 'error', message: 'no audit report was given, so the audit did not run' });
  for (const report of list) {
    const read = readReport(report);
    if (read.error) {
      findings.push({ id: '-', package: '-', severity: '-', status: 'error', message: read.error });
      continue;
    }
    for (const [id, advisory] of read.found) {
      const old = advisories.get(id);
      if (!old || (RANK[advisory.severity] ?? 99) > (RANK[old.severity] ?? 99)) advisories.set(id, advisory);
    }
  }
  const allowed = new Map(entries.map((entry) => [canon(entry.id), entry]));
  for (const advisory of advisories.values()) {
    const entry = allowed.get(advisory.id);
    if (entry) {
      const expired = entry.expires < today;
      findings.push({
        ...advisory,
        status: expired ? 'expired' : 'allowed',
        message: expired ? `allowlist entry expired on ${entry.expires}; review it again` : `allowed until ${entry.expires}`,
      });
    } else if (SOFT.has(advisory.severity)) {
      findings.push({ ...advisory, status: 'noted', message: 'not blocking' });
    } else {
      findings.push({ ...advisory, status: 'blocking', message: 'a high or critical advisory that is not in the allowlist' });
    }
  }
  const errored = findings.some((finding) => finding.status === 'error');
  for (const entry of entries) {
    // With an audit that did not run, "absent" proves nothing, and the error already fails the gate.
    if (!advisories.has(canon(entry.id)) && !errored) {
      findings.push({ id: entry.id, package: entry.package, severity: '-', status: 'stale', message: 'no longer in the audit; remove the allowlist entry' });
    }
  }
  const ok = findings.every((finding) => finding.status === 'allowed' || finding.status === 'noted');
  return { ok, findings };
}

const LABEL = { allowed: 'allowed', noted: 'noted', blocking: 'BLOCKING', expired: 'EXPIRED', stale: 'STALE', error: 'ERROR' };

/** The findings as a plain-text table: id, package, severity, status. */
export function formatTable(findings) {
  const rows = findings.map((finding) => [
    finding.id,
    finding.package,
    finding.severity,
    `${finding.status === 'allowed' ? finding.message : LABEL[finding.status]}${finding.status === 'allowed' || finding.status === 'noted' ? '' : `: ${finding.message}`}`,
  ]);
  const table = [['id', 'package', 'severity', 'status'], ...rows];
  const widths = [0, 1, 2].map((column) => Math.max(...table.map((row) => row[column].length)));
  return table.map((row) => [...row.slice(0, 3).map((cell, i) => cell.padEnd(widths[i])), row[3]].join('  ').trimEnd()).join('\n');
}

/** Run `npm audit --omit=dev --json` (with extra arguments) and return its output; npm exits 1 when it finds something, so the status is not read. */
function runAudit(root, extra) {
  const result = spawnSync('npm', ['audit', '--omit=dev', '--json', ...extra], { cwd: root, encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 });
  return result.error ? '' : result.stdout;
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2);
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const flag = args.indexOf('--allowlist');
  if (flag !== -1 && !args[flag + 1]) {
    console.error('audit-gate: --allowlist needs a file');
    process.exit(1);
  }
  const allowlistFile = path.resolve(flag === -1 ? path.join(root, '.github/audit-allowlist.json') : args[flag + 1]);
  let result;
  try {
    const allowlist = JSON.parse(fs.readFileSync(allowlistFile, 'utf-8'));
    // The MCP SDK and zod are bundled into mcp/dist/index.js, so the second audit is the audit of what the shipped server carries.
    result = evaluate([runAudit(root, []), runAudit(root, ['--workspace', 'mcp'])], allowlist, new Date().toISOString().slice(0, 10));
  } catch (error) {
    console.error(`audit-gate: ${error.message}`);
    process.exit(1);
  }
  if (result.findings.length > 0) console.log(formatTable(result.findings));
  if (result.ok) console.log(`audit-gate: ok (${result.findings.length} advisor${result.findings.length === 1 ? 'y' : 'ies'} listed, none blocking)`);
  else {
    console.error('audit-gate: failed; fix or update what is marked above (an allowlist entry needs a reason and an expiry date, see CONTRIBUTING)');
    process.exit(1);
  }
}
