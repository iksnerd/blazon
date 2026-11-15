import type { Finding, BlazonExtension, TokenItem } from '../../types/index.js';
import { aliasTarget } from '../tokens/alias.js';
import { finding } from './catalogue.js';

/** Shares within 0.5% of 100% count as complete; brand books round. */
const PROPORTION_TOLERANCE = 0.005;

export function proportionFindings(path: string, proportion: BlazonExtension['proportion'], byPath: Map<string, TokenItem>): Finding[] {
  if (!proportion) return [];
  const findings: Finding[] = [];
  let total = 0;
  for (const [key, entry] of Object.entries(proportion)) {
    const share = typeof entry === 'number' ? entry : entry?.share;
    if (typeof share !== 'number' || share < 0 || share > 1) {
      findings.push(finding('invalid-proportion', { path, message: `"${key}" needs a share between 0 and 1` }));
      continue;
    }
    total += share;
    if (typeof entry === 'object') {
      for (const ref of entry.tokens ?? []) {
        const target = aliasTarget(ref);
        if (!target || !byPath.has(target)) {
          findings.push(finding('invalid-proportion', { path, message: `"${key}" lists ${ref}, which is not a token` }));
        }
      }
    }
  }
  if (Math.abs(total - 1) > PROPORTION_TOLERANCE) {
    findings.push(finding('proportion-total', { path, message: `Shares add up to ${Math.round(total * 1000) / 10}%, not 100%` }));
  }
  return findings;
}
