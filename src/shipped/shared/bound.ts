// The answer must fit the 64 KB of standard output a build call gets (RFC 0005 section 6, STDOUT_LIMIT in src/plugins/wire/limits.ts); over
// it, the call is a failure and a legitimate result becomes plugin-failed. The host cannot shrink an answer that was already printed, so
// every shipped plugin bounds its findings before it prints them, by bytes and not by count: a count cannot promise a fit, because a
// message can carry a long id or option text.

/** What the findings may take on the wire, in bytes. The limit is 65,536; the rest is the envelope, the summary finding and a newline, with room to spare. */
export const FINDINGS_BUDGET = 60000;

interface Bounded {
  code: string;
  severity: string;
  path: string;
  message: string;
}

const RANK: Record<string, number> = { error: 0, warning: 1, info: 2 };
const rank = (severity: string): number => RANK[severity] ?? 3;
const wire = (finding: Bounded): number => Buffer.byteLength(JSON.stringify(finding), 'utf-8') + 1;

/**
 * The findings as they are when they fit. When they do not, the first ones that fit, errors before warnings before notes and each
 * group in the order it was found, then one `<name>/findings-left-out` warning that says how many are not shown. The summary is a
 * warning so that it never hides that there were errors: the errors come first, and a run with any error is already failed.
 */
export function boundFindings<T extends Bounded>(findings: T[], name: string): (T | Bounded)[] {
  let size = 0;
  for (const finding of findings) size += wire(finding);
  if (size <= FINDINGS_BUDGET) return findings;
  const ordered = [...findings].sort((a, b) => rank(a.severity) - rank(b.severity));
  const kept: (T | Bounded)[] = [];
  size = 0;
  for (const finding of ordered) {
    if (size + wire(finding) > FINDINGS_BUDGET) break;
    size += wire(finding);
    kept.push(finding);
  }
  const left = ordered.length - kept.length;
  kept.push({
    code: `${name}/findings-left-out`,
    severity: 'warning',
    path: 'findings',
    message: `${left} more findings are not shown, because the answer would not fit the ${FINDINGS_BUDGET.toLocaleString('en-US')} bytes a plugin may print; fix the ones above and run again`,
  });
  return kept;
}
