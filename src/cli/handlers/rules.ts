import pc from '../../core/colors.js';
import { findToken, ruleEntries, tokenRules, cleanPath, type RuleEntry, type TokenRules } from '../../core/read/index.js';
import { asked, readBrand } from '../read.js';
import type { Handler } from './types.js';

/** One line a rule: what it says and where it is written. */
export function ruleLines(rules: TokenRules): string[] {
  const where = (from: string) => pc.dim(`(on ${from})`);
  return [
    ...(rules.role ? [`role      ${rules.role.value} ${where(rules.role.from)}`] : []),
    ...(rules.usage
      ? [
          `usage     ${[rules.usage.deny && `deny ${rules.usage.deny.join(', ')}`, rules.usage.allow && `allow ${rules.usage.allow.join(', ')}`].filter(Boolean).join('; ')} ${where(rules.usage.from)}`,
        ]
      : []),
    ...rules.pairs.map((p) => `pair      ${p.fg} on ${p.bg}, ${p.min}, this token is the ${p.as === 'fg' ? 'text' : 'background'} ${where(p.from)}`),
    ...(rules.logo ? [`logo      deny ${rules.logo.deny.join(', ')}${rules.logo.reason ? `: ${rules.logo.reason}` : ''} ${where(rules.logo.from)}`] : []),
    ...(rules.review
      ? [`review    ${rules.review.status}${rules.review.by ? ` by ${rules.review.by}` : ''}${rules.review.at ? ` on ${rules.review.at}` : ''} ${where(rules.review.from)}`]
      : []),
  ];
}

function entryLines(entry: RuleEntry): string[] {
  return [
    ...(entry.role ? [`role   ${entry.role}`] : []),
    ...(entry.usage
      ? [`usage  ${[entry.usage.deny && `deny ${entry.usage.deny.join(', ')}`, entry.usage.allow && `allow ${entry.usage.allow.join(', ')}`].filter(Boolean).join('; ')}`]
      : []),
    ...(entry.pairs ?? []).map((p) => `pair   ${p.fg} on ${p.bg}, ${p.min}`),
    ...(entry.logo ? [`logo   deny ${entry.logo.deny.join(', ')}${entry.logo.reason ? `: ${entry.logo.reason}` : ''}`] : []),
  ];
}

/**
 * `get_rules`, `blazon rules [path]`: the usage, pairs and logo rules of a token (the ones that apply to it, with where each is written), of a group
 * (the rules written at and under it, and the groups above it that pass theirs down), or of the whole brand. Prints only; exits 0, or 2 when there is no such path.
 */
export const getRulesHandler: Handler = async ({ path: typedPath }, { dir }) => {
  const { data } = await readBrand(dir);
  const wanted = cleanPath((typedPath as string | undefined) ?? '');
  const isToken = wanted !== '' && data.tokens.byPath.has(wanted);
  const result: { path: string; kind: 'token' | 'group' | 'brand'; rules?: TokenRules; entries?: RuleEntry[] } = asked(() =>
    isToken
      ? { path: wanted, kind: 'token', rules: tokenRules(data, findToken(data, wanted)) }
      : { path: wanted, kind: wanted === '' ? 'brand' : 'group', entries: ruleEntries(data, wanted) },
  );
  const text = () => {
    console.log();
    if (result.kind === 'token') {
      const lines = ruleLines(result.rules!);
      console.log(`  ${pc.bold(result.path)}`);
      if (lines.length === 0) console.log(pc.dim('  no rules apply to this token'));
      for (const line of lines) console.log(`  ${line}`);
    } else {
      if (result.entries!.length === 0) console.log(pc.dim(`  No rules are written ${wanted === '' ? 'in this brand' : `at or under ${wanted}`}.`));
      for (const entry of result.entries!) {
        console.log(`  ${pc.bold(entry.at)} ${pc.dim(entry.kind === 'group' ? 'group' : 'token')}${entry.inherited ? pc.dim(', passes its rules down') : ''}`);
        for (const line of entryLines(entry)) console.log(`    ${line}`);
      }
    }
    console.log();
  };
  return { command: 'rules', passed: true, status: 0, body: result, text };
};
