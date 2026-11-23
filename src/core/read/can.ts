import type { ContrastLevel, BlazonData, TokenItem } from '../../types/index.js';
import { allows } from '../checker/usage.js';
import { CONTRAST_MINIMUM, contrastBetween, matchingPairs, parseColor } from '../checker/contrast.js';
import { MAX_PAIRS } from '../operations/limits.js';
import { findToken, LookupError } from './lookup.js';
import { allPairs, usageOf } from './rules.js';
import { inTheme } from './theme.js';

export interface CanCheck {
  rule: 'usage' | 'pairs' | 'contrast';
  ok: boolean;
  message: string;
  /** The token or group that states the rule */
  from?: string;
}

export interface CanAnswer {
  fg: string;
  bg: string;
  allowed: boolean;
  /** The first rule that denies it, or what allows it */
  reason: string;
  checks: CanCheck[];
  /**
   * Foreground on background, WCAG 2.x, and the strictest level that ratio meets ('fail' when it meets none). Measured as `blazon check` measures:
   * a translucent foreground is blended over the background first. Absent when a usage rule denied the pair and the colors cannot be measured.
   */
  contrast?: {
    ratio: number;
    level: ContrastLevel | 'fail';
    /** The ratio the pair had to meet. Set for the `ui` role only: a text pair's minimum is the one its listed pair names. */ threshold?: number;
  };
  /** What the foreground is judged as: `text`, or `ui` for a border, focus ring or icon stroke */
  role: CanRole;
  /** The opacity asked for the foreground, 0 to 1, when `alpha` was given */
  alpha?: number;
  /** The `theme` context the pair was judged in. Absent for the default tokens. */
  theme?: string;
}

export type CanRole = 'text' | 'ui';
export const CAN_ROLES: readonly CanRole[] = ['text', 'ui'];

/** WCAG 1.4.11 asks 3:1 of a graphic and of a control's boundary, the same figure as large text. */
export const NON_TEXT_MINIMUM = CONTRAST_MINIMUM['AA-large'];

/** The usage roles a non-text element is one of; the foreground may be used as `ui` when its usage rules leave at least one open. */
const UI_USAGE_ROLES = ['border', 'icon', 'interactive'] as const;

const LEVELS: ContrastLevel[] = ['AAA', 'AA', 'AA-large'];

/** The token, then each token it aliases in turn. */
function chain(data: BlazonData, item: TokenItem): TokenItem[] {
  const found: TokenItem[] = [];
  for (let at: TokenItem | undefined = item; at && !found.includes(at); at = at.aliasOf ? data.tokens.byPath.get(at.aliasOf) : undefined) found.push(at);
  return found;
}

/** Whether `item` (or a token it aliases) may fill `role`: the first token of the chain whose usage rule leaves the role out says no. */
function usageCheck(data: BlazonData, item: TokenItem, role: string): CanCheck {
  for (const at of chain(data, item)) {
    if (allows(at, role)) continue;
    const rule = usageOf(data, at)!;
    const how = rule.deny?.includes(role) ? `denies "${role}"` : `allows only ${(rule.allow ?? []).map((r) => `"${r}"`).join(', ')}, not "${role}"`;
    return { rule: 'usage', ok: false, message: `{${at.path}} ${how} (usage on ${rule.from})`, from: rule.from };
  }
  const written = chain(data, item).find((at) => usageOf(data, at));
  return { rule: 'usage', ok: true, message: written ? `usage rules on {${written.path}} leave "${role}" open` : `{${item.path}} has no usage rule against "${role}"` };
}

/** `usageCheck` for a non-text element: denied only when the token's usage rules leave out every role a non-text element can have. */
function uiUsageCheck(data: BlazonData, item: TokenItem): CanCheck {
  const checks = UI_USAGE_ROLES.map((role) => usageCheck(data, item, role));
  const open = UI_USAGE_ROLES.filter((_, i) => checks[i]!.ok);
  if (open.length > 0) return { rule: 'usage', ok: true, message: `{${item.path}} may be used as ${open.map((r) => `"${r}"`).join(', ')}` };
  return { rule: 'usage', ok: false, message: `no non-text use is open: ${checks.map((c) => c.message).join('; ')}`, from: checks[0]!.from };
}

/** The ratio of the foreground over the background, by the one measure `blazon check` uses, or why there is none. */
function measure(fg: TokenItem, bg: TokenItem, alpha: number | undefined): { ratio: number } | { error: string } {
  const read = (item: TokenItem, label: string) => {
    const color = item.type === 'color' ? parseColor(String(item.value)) : undefined;
    return color ?? `{${item.path}} (${label}) is not a color blazon can read: it is ${item.type ?? 'untyped'} with the value ${String(item.value)}.`;
  };
  const [fgColor, bgColor] = [read(fg, 'foreground'), read(bg, 'background')];
  if (typeof fgColor === 'string') return { error: fgColor };
  if (typeof bgColor === 'string') return { error: bgColor };
  if (alpha !== undefined) {
    const own = typeof fgColor.alpha === 'number' && !Number.isNaN(fgColor.alpha) ? fgColor.alpha : 1;
    fgColor.alpha = own * alpha;
  }
  const ratio = contrastBetween(fgColor, bgColor);
  if (ratio === undefined)
    return {
      error: `{${bg.path}} (background) is translucent (${String(bg.value)}), so what is behind it is not known and blazon cannot measure contrast on it. Use an opaque background token.`,
    };
  return { ratio };
}

/**
 * Whether the foreground token may be used as text on the background token, from the brand's own rules and nothing else: the `usage` rules
 * on the foreground (role "text") and the background (role "background"), and the `pairs`. Pairs are a list, as the brand book treats them: when
 * the brand lists any, a combination none of them names is denied. A pair listed on a token that the foreground or background aliases counts.
 *
 * With `role` `ui` the foreground is a non-text element (focus ring, border, icon stroke): the contrast must reach {@link NON_TEXT_MINIMUM}, the `usage`
 * rule is read for the roles `border`, `icon` and `interactive`, and `pairs` do not apply, because they are text pairs.
 *
 * With `alpha` (0 to 1) the foreground is measured at that opacity, times its own. Contrast is measured as `blazon check` measures it (`contrastBetween`): a translucent
 * foreground is blended over the background, and a translucent background is refused with a LookupError, because what is behind it is not known. The `usage` rules are
 * read first, so a denial by usage is an answer even for a token that is not a color; an error is raised only when usage allows and the contrast cannot be measured.
 *
 * With `theme` the pair is judged in that context of the resolver's `theme` modifier: its colors, not the default's.
 * `inThemeNamed` is only for the message: data already put in a theme names it when a token is missing.
 */
export function canUse(data: BlazonData, typedFg: string, typedBg: string, role: CanRole = 'text', theme?: string, alpha?: number, inThemeNamed?: string): CanAnswer {
  if (theme !== undefined) return { ...canUse(inTheme(data, theme), typedFg, typedBg, role, undefined, alpha, theme), theme };
  if (!CAN_ROLES.includes(role)) throw new LookupError(`"${String(role)}" is not a role blazon can judge. Use ${CAN_ROLES.map((r) => `"${r}"`).join(' or ')}.`);
  const fg = findToken(data, typedFg, inThemeNamed);
  const bg = findToken(data, typedBg, inThemeNamed);
  if (alpha !== undefined && !(typeof alpha === 'number' && alpha >= 0 && alpha <= 1)) throw new LookupError(`alpha must be a number from 0 to 1; got ${String(alpha)}.`);
  const alphaShown = alpha === undefined ? {} : { alpha };
  // usage first: a token that usage forbids is a denial even when its contrast cannot be measured (a gradient, a translucent background)
  const usage = role === 'ui' ? [uiUsageCheck(data, fg), usageCheck(data, bg, 'background')] : [usageCheck(data, fg, 'text'), usageCheck(data, bg, 'background')];
  const measured = measure(fg, bg, alpha);
  if ('error' in measured) {
    const denial = usage.find((c) => !c.ok);
    if (!denial) throw new LookupError(measured.error);
    return { fg: fg.path, bg: bg.path, role, allowed: false, reason: denial.message, checks: usage, ...alphaShown };
  }
  const { ratio } = measured;
  const level = LEVELS.find((l) => ratio >= CONTRAST_MINIMUM[l]) ?? 'fail';
  const shown = `${ratio.toFixed(2)}:1`;
  const rounded = Math.round(ratio * 100) / 100;
  if (role === 'ui') {
    const checks: CanCheck[] = [
      ...usage,
      { rule: 'pairs', ok: true, message: 'pairs list text on background, so they do not apply to a non-text element' },
      {
        rule: 'contrast',
        ok: ratio >= NON_TEXT_MINIMUM,
        message: `non-text contrast needs ${NON_TEXT_MINIMUM}:1, this is ${shown}`,
      },
    ];
    const denied = checks.find((c) => !c.ok);
    const reason = denied ? denied.message : checks[checks.length - 1]!.message;
    return { fg: fg.path, bg: bg.path, role, allowed: denied === undefined, reason, checks, contrast: { ratio: rounded, level, threshold: NON_TEXT_MINIMUM }, ...alphaShown };
  }
  const checks: CanCheck[] = [...usage];

  const listed = allPairs(data);
  const matching = matchingPairs(data.tokens.items, listed, fg.path, bg.path);
  if (matching.length > 0) {
    for (const pair of matching) {
      const needs = CONTRAST_MINIMUM[pair.min];
      checks.push({
        rule: 'pairs',
        ok: ratio >= needs,
        message: `pairs on ${pair.from} list ${pair.fg} on ${pair.bg}: ${pair.min} needs ${needs}:1, this is ${shown}`,
        from: pair.from,
      });
    }
  } else if (listed.length > 0) {
    checks.push({
      rule: 'pairs',
      ok: false,
      message: `no pair lists {${fg.path}} on {${bg.path}}; the brand lists ${listed.length} pair${listed.length === 1 ? '' : 's'} and only those may sit together. Component tokens are not read for pairs: to allow this pair, declare it in \`pairs\` on a token group (docs/manual/02-tokens.md, "Contrast pairs")`,
    });
  } else {
    checks.push({ rule: 'pairs', ok: true, message: 'the brand lists no pairs, so contrast is the only measure left' });
  }
  checks.push({
    rule: 'contrast',
    ok: true,
    message: `contrast is ${shown}${level === 'fail' ? ', below every WCAG level' : `, which meets ${level}`} (reported, never a rule of its own)`,
  });

  const denied = checks.find((c) => !c.ok && c.rule !== 'contrast') ?? undefined;
  const allowed = denied === undefined;
  const reason = denied ? denied.message : (checks.find((c) => c.rule === 'pairs' && c.from) ?? checks[checks.length - 1]!).message;
  return { fg: fg.path, bg: bg.path, role, allowed, reason, checks, contrast: { ratio: rounded, level }, ...alphaShown };
}

/** The answer without its `checks` when it is allowed: a denial keeps them, since they are the reason. */
export function withoutChecks(answer: CanAnswer): Omit<CanAnswer, 'checks'> & { checks?: CanCheck[] } {
  if (!answer.allowed) return answer;
  const { checks: _checks, ...rest } = answer;
  return rest;
}

/**
 * `canUse` for a list of pairs, one answer each, in order, at most MAX_PAIRS. A pair with an unknown token fails the whole call, and the
 * message starts with its place in the list (`pairs[1]: ...`), so no answer is a half answer.
 */
export function canUseMany(data: BlazonData, pairs: readonly { fg: string; bg: string }[], role: CanRole = 'text', theme?: string, alpha?: number): CanAnswer[] {
  if (pairs.length === 0) throw new LookupError('give at least one pair.');
  if (pairs.length > MAX_PAIRS) throw new LookupError(`give at most ${MAX_PAIRS} pairs in one call; this call has ${pairs.length}.`);
  const judged = theme === undefined ? data : inTheme(data, theme);
  return pairs.map((pair, i) => {
    try {
      const answer = canUse(judged, pair.fg, pair.bg, role, undefined, alpha, theme);
      return theme === undefined ? answer : { ...answer, theme };
    } catch (error) {
      if (error instanceof LookupError) throw new LookupError(`pairs[${i}]: ${error.message}`);
      throw error;
    }
  });
}
