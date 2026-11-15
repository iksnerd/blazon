import { fixOf } from '../core/checker/fixes.js';
import { findingLocation } from '../core/checker/location.js';
import type { Finding } from '../types/index.js';

const SHOWN = 10;

const keyOf = (finding: Finding): string => `${finding.code}\n${finding.path}\n${finding.message}`;

/** One error as a line for the terminal: where it is, its code, what is wrong and, when blazon knows it, what to do. */
function lineOf(finding: Finding): string {
  const where = findingLocation(finding) ?? finding.path;
  const fix = fixOf(finding);
  return `[blazon] ${where} [${finding.code}]: ${finding.message}${fix ? `. ${fix}` : ''}`;
}

/**
 * What `blazon dev` says in its terminal about the brand as files change. The viewer shows every finding, but a person or an agent
 * watching the terminal saw nothing while the book was broken. Each error is said once, however many saves leave it there, and when
 * the last one is gone it says so. Warnings and notes stay in the viewer and in `blazon check`.
 */
export class ErrorReporter {
  private shown = new Set<string>();

  report(findings: Finding[], say: (line: string) => void): void {
    const errors = findings.filter((finding) => finding.severity === 'error');
    const fresh = errors.filter((finding) => !this.shown.has(keyOf(finding)));
    for (const finding of fresh.slice(0, SHOWN)) say(lineOf(finding));
    if (fresh.length > SHOWN) say(`[blazon] and ${fresh.length - SHOWN} more errors; run blazon check for all of them`);
    if (errors.length === 0 && this.shown.size > 0) say('[blazon] the errors are fixed');
    this.shown = new Set(errors.map(keyOf));
  }
}
