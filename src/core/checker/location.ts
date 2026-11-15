import type { Finding } from '../../types/index.js';

/**
 * Where a finding is, as compilers print it: `tokens/colors.json:17`, which terminals and editors open at the line. `dir` goes in
 * front of the file, so a person who ran blazon from another folder can open it from there. Undefined when the finding names no file.
 */
export function findingLocation(finding: Pick<Finding, 'file' | 'line'>, dir: string = ''): string | undefined {
  if (!finding.file) return undefined;
  const file = dir ? `${dir.replace(/\/+$/, '')}/${finding.file}` : finding.file;
  return finding.line ? `${file}:${finding.line}` : file;
}
