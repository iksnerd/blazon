import type { Finding, TokenItem, UsageRole } from '../../types/index.js';
import { finding } from './catalogue.js';

/** A usage list as written in the file: anything but an array is no rules, and is reported by `usageFindings`. */
function roleList(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

export function allows(item: TokenItem, role: UsageRole): boolean {
  const usage = item.blazon.usage;
  if (!usage || typeof usage !== 'object') return true;
  if (roleList(usage.deny)?.includes(role)) return false;
  const allow = roleList(usage.allow);
  return !allow || allow.includes(role);
}

export function usageFindings(item: TokenItem, byPath: Map<string, TokenItem>, roles: readonly string[]): Finding[] {
  const findings: Finding[] = [];
  const usage: Record<string, unknown> | undefined = item.blazon.usage && typeof item.blazon.usage === 'object' ? (item.blazon.usage as Record<string, unknown>) : undefined;
  const written: unknown[] = [item.blazon.role];
  for (const key of ['allow', 'deny']) {
    const list = usage?.[key];
    if (list === undefined) continue;
    if (Array.isArray(list)) written.push(...list);
    else findings.push(finding('unknown-role', { path: item.path, message: `usage.${key} must be a list of usage roles` }));
  }
  for (const role of written) {
    if (role !== undefined && (typeof role !== 'string' || !roles.includes(role))) {
      findings.push(finding('unknown-role', { path: item.path, message: `"${String(role)}" is not a usage role (${roles.join(', ')})` }));
    }
  }

  const role = item.blazon.role;
  const seen = new Set([item.path]);
  let target = item.aliasOf ? byPath.get(item.aliasOf) : undefined;
  while (target && !seen.has(target.path)) {
    seen.add(target.path);
    if (target.deprecated) {
      findings.push(finding('deprecated-alias', { path: item.path, message: `Aliases {${target.path}}, which is deprecated` }));
    }
    if (role && !allows(target, role)) {
      findings.push(finding('usage-violation', { path: item.path, message: `Used as ${role}, but {${target.path}} is not allowed as ${role}` }));
      break;
    }
    target = target.aliasOf ? byPath.get(target.aliasOf) : undefined;
  }
  return findings;
}
