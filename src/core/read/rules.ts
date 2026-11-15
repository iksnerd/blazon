import type { ContrastLevel, BlazonData, BlazonExtension, TokenItem } from '../../types/index.js';
import { expand } from '../checker/contrast.js';
import { cleanPath, LookupError } from './lookup.js';
import { closest } from '../suggest.js';

/** The rules the brand writes as data (RFC 0001 section 2), each with the token or group it is written on. */

export interface UsageRule {
  allow?: string[];
  deny?: string[];
  /** The token or group that states it; a token under that group has it too */
  from: string;
}

export interface LogoRule {
  deny: string[];
  reason?: string;
  from: string;
}

export interface PairRule {
  fg: string;
  bg: string;
  min: ContrastLevel;
  /** The group that lists the pair */
  from: string;
}

export interface ReviewRule {
  status: 'ok' | 'needs-review';
  note?: string;
  by?: string;
  at?: string;
  /** The token or group the review is written on. A group's review covers the tokens under it */
  from: string;
}

/** The rules that apply to one token: what it carries from its groups, and the pairs that name it. */
export interface TokenRules {
  role?: { value: string; from: string };
  usage?: UsageRule;
  logo?: LogoRule;
  /** Every pair, in any group, that has this token as foreground or background (`.*` expanded) */
  pairs: (PairRule & { as: 'fg' | 'bg' })[];
  review?: ReviewRule;
}

/** A node's own `dev.blazon` as authored, which is what the token's merged `blazon` is made of. */
const ownBlazon = (item: TokenItem): BlazonExtension => (item.extensions?.['dev.blazon'] ?? {}) as BlazonExtension;

/**
 * The path of the node that wrote `field` for this token: the token itself, else the nearest group above it. It follows how the token's
 * `blazon` is merged (nearest wins, field by field). `review` does not pass down, so there it is the nearest group that has one.
 */
export function writtenOn(data: BlazonData, item: TokenItem, field: keyof BlazonExtension): string | undefined {
  if (ownBlazon(item)[field] !== undefined) return item.path;
  return data.tokens.groupMeta.filter((group) => item.path.startsWith(`${group.path}.`) && group.blazon[field] !== undefined).sort((a, b) => b.path.length - a.path.length)[0]
    ?.path;
}

const strings = (value: unknown): string[] | undefined => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : undefined);

export function usageOf(data: BlazonData, item: TokenItem): UsageRule | undefined {
  const usage = item.blazon.usage;
  const from = writtenOn(data, item, 'usage');
  if (!usage || typeof usage !== 'object' || from === undefined) return undefined;
  const allow = strings(usage.allow);
  const deny = strings(usage.deny);
  return { ...(allow && { allow }), ...(deny && { deny }), from };
}

function logoOf(data: BlazonData, item: TokenItem): LogoRule | undefined {
  const logo = item.blazon.logo;
  const from = writtenOn(data, item, 'logo');
  const deny = strings(logo?.deny);
  if (!logo || !deny || from === undefined) return undefined;
  return { deny, ...(typeof logo.reason === 'string' && { reason: logo.reason }), from };
}

/** Every pair the brand lists, in the order of its groups. */
export function allPairs(data: BlazonData): PairRule[] {
  return data.tokens.groupMeta.flatMap((group) => (group.blazon.pairs ?? []).map((pair) => ({ fg: pair.fg, bg: pair.bg, min: pair.min, from: group.path })));
}

function pairsOf(data: BlazonData, item: TokenItem): TokenRules['pairs'] {
  const found: TokenRules['pairs'] = [];
  for (const pair of allPairs(data)) {
    if (expand(pair.fg, data.tokens.items).some((t) => t.path === item.path)) found.push({ ...pair, as: 'fg' });
    if (expand(pair.bg, data.tokens.items).some((t) => t.path === item.path)) found.push({ ...pair, as: 'bg' });
  }
  return found;
}

function reviewOf(data: BlazonData, item: TokenItem): ReviewRule | undefined {
  const own = ownBlazon(item).review;
  const from = own ? item.path : writtenOn(data, item, 'review');
  const review = own ?? data.tokens.groupMeta.find((group) => group.path === from)?.blazon.review;
  if (!review || from === undefined) return undefined;
  return { status: review.status, ...(review.note && { note: review.note }), ...(review.by && { by: review.by }), ...(review.at && { at: review.at }), from };
}

/** The rules that apply to a token, with where each is written. */
export function tokenRules(data: BlazonData, item: TokenItem): TokenRules {
  const usage = usageOf(data, item);
  const logo = logoOf(data, item);
  const review = reviewOf(data, item);
  const roleFrom = item.blazon.role === undefined ? undefined : writtenOn(data, item, 'role');
  return {
    ...(item.blazon.role !== undefined && roleFrom !== undefined && { role: { value: item.blazon.role, from: roleFrom } }),
    ...(usage && { usage }),
    ...(logo && { logo }),
    pairs: pairsOf(data, item),
    ...(review && { review }),
  };
}

/** One node that writes rules: a group, or a token with rules of its own. */
export interface RuleEntry {
  at: string;
  kind: 'group' | 'token';
  /** True for a group above the path asked about, whose rules pass down to it */
  inherited?: boolean;
  role?: string;
  usage?: { allow?: string[]; deny?: string[] };
  logo?: { deny: string[]; reason?: string };
  /** Pairs the group lists (a token lists none) */
  pairs?: { fg: string; bg: string; min: ContrastLevel }[];
}

function entryOf(at: string, kind: RuleEntry['kind'], blazon: BlazonExtension): RuleEntry | undefined {
  const usage =
    blazon.usage && typeof blazon.usage === 'object'
      ? { ...(strings(blazon.usage.allow) && { allow: strings(blazon.usage.allow) }), ...(strings(blazon.usage.deny) && { deny: strings(blazon.usage.deny) }) }
      : undefined;
  const deny = strings(blazon.logo?.deny);
  const entry: RuleEntry = {
    at,
    kind,
    ...(typeof blazon.role === 'string' && { role: blazon.role }),
    ...(usage && { usage }),
    ...(deny && { logo: { deny, ...(typeof blazon.logo?.reason === 'string' && { reason: blazon.logo.reason }) } }),
    ...(kind === 'group' && blazon.pairs?.length && { pairs: blazon.pairs.map((p) => ({ fg: p.fg, bg: p.bg, min: p.min })) }),
  };
  return Object.keys(entry).length > 2 ? entry : undefined;
}

/**
 * The rules written at or under a group, or on the whole brand when `prefix` is empty: one entry for each group and each token that writes
 * a `role`, `usage`, `logo` or `pairs`. A group under a path also lists the groups above it that pass rules down, marked `inherited`.
 */
export function ruleEntries(data: BlazonData, prefix: string): RuleEntry[] {
  const wanted = cleanPath(prefix);
  const inside = (at: string) => wanted === '' || at === wanted || at.startsWith(`${wanted}.`);
  const exists = wanted === '' || data.tokens.items.some((t) => inside(t.path));
  if (!exists) {
    const groups = [
      ...new Set(
        data.tokens.items.flatMap((t) =>
          t.path
            .split('.')
            .slice(0, -1)
            .map((_, i, parts) => parts.slice(0, i + 1).join('.')),
        ),
      ),
    ];
    const meant = closest(wanted, [...groups, ...data.tokens.items.map((t) => t.path)]);
    throw new LookupError(`no token or group "${wanted}"${meant ? `; did you mean "${meant}"?` : '.'}`);
  }
  const above = data.tokens.groupMeta.filter((g) => wanted !== '' && wanted.startsWith(`${g.path}.`));
  const entries = [
    ...above.map((g) => entryOf(g.path, 'group', { ...g.blazon, pairs: undefined })).map((e) => e && { ...e, inherited: true }),
    ...data.tokens.groupMeta.filter((g) => inside(g.path)).map((g) => entryOf(g.path, 'group', g.blazon)),
    ...data.tokens.items.filter((t) => inside(t.path)).map((t) => entryOf(t.path, 'token', ownBlazon(t))),
  ];
  return entries.filter((e): e is RuleEntry => e !== undefined);
}
