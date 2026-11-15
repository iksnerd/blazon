import { boundFindings as bound, FINDINGS_BUDGET } from '../shared/bound.js';
import type { Finding } from './checks.js';
import { NAME } from './request.js';

// The bound itself, and why it is by bytes, is in shared/bound.ts; this is it under this plugin's name.
export { FINDINGS_BUDGET };

export const boundFindings = (findings: Finding[]): Finding[] => bound(findings, NAME) as Finding[];
