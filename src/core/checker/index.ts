import { STANDARD_USAGE_ROLES, type BlazonData, type Finding, type Vocabulary } from '../../types/index.js';
import { compareFindings } from '../order.js';
import { contrastFindings } from './contrast.js';
import { duplicateFindings } from './duplicates.js';
import { isPinFinding } from './catalogue.js';
import { printFindings } from './print.js';
import { proportionFindings } from './proportion.js';
import { reviewFindings } from './review.js';
import { sourceFindings } from './source.js';
import { tierFindings } from './tier.js';
import { usageFindings } from './usage.js';
import { variableFindings } from './variables.js';

export type CheckFinding = Finding;

export interface CheckResult {
  passed: boolean;
  errors: Finding[];
  warnings: Finding[];
  infos: Finding[];
  all: Finding[];
}

/**
 * Runs the RFC 0001 §4 checks over compiled data: load problems plus usage, contrast,
 * duplicate, review and tier rules. `strict` makes warnings fail the check.
 */
export function checkTokens(data: Pick<BlazonData, 'tokens'> & { vocabulary?: Pick<Vocabulary, 'usageRoles'> }, options?: { strict?: boolean }): CheckResult {
  const roles = data.vocabulary?.usageRoles ?? STANDARD_USAGE_ROLES;
  const { items, byPath, groupMeta, problems } = data.tokens;
  const all: Finding[] = [
    ...problems,
    ...items.flatMap((item) => usageFindings(item, byPath, roles)),
    ...groupMeta.flatMap((group) => (group.blazon.pairs ?? []).flatMap((pair) => contrastFindings(pair, group.path, items))),
    ...groupMeta.flatMap((group) => proportionFindings(group.path, group.blazon.proportion, byPath)),
    ...duplicateFindings(items),
    ...variableFindings(data.tokens),
    ...reviewFindings(items, groupMeta),
    ...items.flatMap(printFindings),
    ...items.flatMap(sourceFindings),
    ...items.flatMap(tierFindings),
  ];

  return summarizeFindings(all, options);
}

/**
 * The findings that make a value of the brand possibly wrong: errors, except the pin family (the blazon build and the book disagree, which
 * says nothing about any token). The one definition of "the brand has errors" that `check --json`, the read commands and the MCP tools share.
 */
export const brandErrors = (found: readonly Finding[]): Finding[] => found.filter((f) => f.severity === 'error' && !isPinFinding(f.code));

/** Puts findings in the defined total order (`compareFindings`) and splits them by severity; `strict` makes warnings fail too. */
export function summarizeFindings(found: Finding[], options?: { strict?: boolean }): CheckResult {
  const all = [...found].sort(compareFindings);
  const errors = all.filter((f) => f.severity === 'error');
  const warnings = all.filter((f) => f.severity === 'warning');
  const infos = all.filter((f) => f.severity === 'info');
  const passed = errors.length === 0 && (!options?.strict || warnings.length === 0);
  return { passed, errors, warnings, infos, all };
}
