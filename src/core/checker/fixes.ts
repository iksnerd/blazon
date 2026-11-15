import type { Finding } from '../../types/index.js';
import { CHECKS } from './catalogue.js';

/** The fix for a finding's code, or undefined when there is none to give (a note, or a warning that is a question). */
export function fixFor(code: string): string | undefined {
  if (!Object.hasOwn(CHECKS, code)) return undefined;
  return (CHECKS[code as keyof typeof CHECKS] as { fix?: string }).fix;
}

/** The fix for one finding: its own, when its cause has one (a plugin-failed finding), or its code's. What every output prints. */
export function fixOf(finding: Pick<Finding, 'code' | 'fix'>): string | undefined {
  return finding.fix ?? fixFor(finding.code);
}
