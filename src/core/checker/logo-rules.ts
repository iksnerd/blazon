import type { Finding, GroupMeta, TokenItem } from '../../types/index.js';
import { finding } from './catalogue.js';

/** The two configured logo variants; a logo asset is named by its id (`logos/white`). */
export const CONFIGURED_LOGO_VARIANTS = ['onLight', 'onDark'] as const;

export interface LogoDenial {
  /** The token that states the rule: the background itself, or one it aliases */
  path: string;
  reason?: string;
}

/**
 * Whether the brand forbids this logo variant on a background token, whatever its contrast. A token's
 * own rule (or its group's) wins; failing that, the first rule on the tokens it aliases, as for usage.
 */
export function logoDenial(item: TokenItem, items: readonly TokenItem[], variant: string): LogoDenial | undefined {
  const seen = new Set<string>();
  for (let at: TokenItem | undefined = item; at && !seen.has(at.path); at = at.aliasOf ? items.find((t) => t.path === at!.aliasOf) : undefined) {
    seen.add(at.path);
    const rule = at.blazon.logo;
    if (Array.isArray(rule?.deny) && rule.deny.includes(variant)) return { path: at.path, ...(typeof rule.reason === 'string' && { reason: rule.reason }) };
  }
  return undefined;
}

/**
 * The `logo` rules on tokens and groups: a rule that names a variant no logo has would forbid nothing and
 * say nothing, so it is an error, as a pair that matches no tokens is. A group reports once, not each token under it.
 */
export function logoRuleFindings(items: readonly TokenItem[], groups: readonly GroupMeta[], variants: readonly string[]): Finding[] {
  const own = (item: TokenItem) => (item.extensions?.['dev.blazon'] as { logo?: unknown } | undefined)?.logo;
  const rules: { path: string; rule: unknown }[] = [
    ...groups.filter((g) => g.blazon.logo !== undefined).map((g) => ({ path: g.path, rule: g.blazon.logo })),
    ...items.filter((t) => own(t) !== undefined).map((t) => ({ path: t.path, rule: own(t) })),
  ];
  return rules.flatMap(({ path, rule }): Finding[] => {
    const { deny, reason } = (typeof rule === 'object' && rule !== null ? rule : {}) as { deny?: unknown; reason?: unknown };
    if (!Array.isArray(deny) || deny.some((v) => typeof v !== 'string') || (reason !== undefined && typeof reason !== 'string')) {
      return [finding('invalid-logo-rule', { path, message: 'logo must be {"deny": ["onDark", ...], "reason"?: string}' })];
    }
    return deny
      .filter((v) => !variants.includes(v))
      .map((v): Finding => finding('unknown-logo-variant', { path, message: `logo.deny names "${v}", which is not a logo variant (${variants.join(', ') || 'none'})` }));
  });
}
