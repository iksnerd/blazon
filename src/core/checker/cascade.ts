import type { Finding } from '../../types/index.js';

/** A token written as an alias, `"{color.blue}"`, is what `invalid-value` quotes when the alias could not be followed. */
const QUOTED_ALIAS = /^"\{[^}]+\}"/;

/** Findings that say only that a token is missing. With a token file unread they cannot be told from a token that is in it. */
const saysTokenMissing = (finding: Finding): boolean =>
  finding.code === 'unresolved-alias' ||
  finding.code === 'theme-unresolved' ||
  (finding.code === 'invalid-value' && QUOTED_ALIAS.test(finding.message)) ||
  // A page that places a token of the unread file, and a context file whose $type comes from a group in it (a resolver's dark theme)
  (finding.code === 'directive-invalid' && /: no token at /.test(finding.message)) ||
  finding.code === 'missing-type';

/**
 * A token file that does not parse holds tokens nobody can see, so every alias or theme role that points at one looks like a broken
 * reference. One bad comma used to bring a screenful of them, hiding the one finding that mattered. While any file is unreadable the
 * findings that only say "no such token" are left out; fixing the file brings back whichever are real.
 */
export function withoutCascade(findings: Finding[]): Finding[] {
  return findings.some((finding) => finding.code === 'invalid-json') ? findings.filter((finding) => !saysTokenMissing(finding)) : findings;
}
