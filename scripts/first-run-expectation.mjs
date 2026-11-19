// The first run of a new user, pinned as data: test/first-run/expected.json lists the finding codes `blazon check` may report on a
// fresh `blazon init` project, errors 0, and the most findings of each severity. The source test (test/build/first-run.test.ts) and the
// tarball smoke test (scripts/smoke-tarball.mjs) both judge a `check --json` result with this one function, so they cannot drift apart.

/**
 * What is wrong with a first-run `check --json` result, as sentences a person can act on; an empty list means it matches.
 * @param {{ findings: { code: string; severity: string; path: string; file?: string; message: string }[] }} result the parsed `blazon check --json` output
 * @param {{ errors: number; codes: Record<string, string>; max: Record<string, number> }} expected the parsed expected.json
 * @returns {string[]}
 */
export function firstRunProblems(result, expected) {
  const problems = [];
  const where = (f) => `${f.file ?? f.path}`;
  const first = (f) => f.message.split('\n')[0];
  for (const f of result.findings) {
    const allowed = expected.codes[f.code];
    if (allowed === undefined) problems.push(`new finding on a fresh project: [${f.code}] ${f.severity} at ${where(f)}: ${first(f)}`);
    else if (allowed !== f.severity) problems.push(`[${f.code}] is now ${f.severity} (expected ${allowed}) at ${where(f)}: ${first(f)}`);
  }
  const count = (severity) => result.findings.filter((f) => f.severity === severity).length;
  if (count('error') > expected.errors) problems.push(`${count('error')} error(s) on a fresh project, expected ${expected.errors}`);
  for (const [severity, max] of Object.entries(expected.max)) {
    if (count(severity) > max) problems.push(`${count(severity)} ${severity} finding(s) on a fresh project, at most ${max} allowed`);
  }
  if (problems.length > 0) problems.push('If this is intended, edit test/first-run/expected.json in the same commit (CONTRIBUTING, "Cutting a release").');
  return problems;
}
