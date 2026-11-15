import type { Finding, TokenItem } from '../../types/index.js';
import { finding } from './catalogue.js';

export function duplicateFindings(items: TokenItem[]): Finding[] {
  const seen = new Map<string, TokenItem>();
  const findings: Finding[] = [];
  for (const item of items) {
    if (item.aliasOf || item.type !== 'color') continue;
    const parent = item.path.slice(0, item.path.lastIndexOf('.'));
    const key = `${parent}\u0000${String(item.value).toLowerCase()}`;
    const first = seen.get(key);
    if (first) {
      findings.push(finding('duplicate-value', { path: item.path, message: `Same value as {${first.path}} (${item.value})` }));
    } else {
      seen.set(key, item);
    }
  }
  return findings;
}
