import type { Finding, TokenItem } from '../../types/index.js';
import { finding } from './catalogue.js';

export function duplicateFindings(items: TokenItem[]): Finding[] {
  const seen = new Map<string, TokenItem>();
  const findings: Finding[] = [];
  for (const item of items) {
    if (item.aliasOf || item.type !== 'color') continue;
    const dot = item.path.lastIndexOf('.');
    // A token with no group is a sibling of the others with none: lastIndexOf is -1, and slice(0, -1) would cut its last letter
    const parent = dot < 0 ? '' : item.path.slice(0, dot);
    const key = `${parent}\u0000${String(item.value).toLowerCase()}`;
    const first = seen.get(key);
    if (first) {
      findings.push(finding('token-value-duplicate', { path: item.path, message: `Same value as {${first.path}} (${item.value})` }));
    } else {
      seen.set(key, item);
    }
  }
  return findings;
}
