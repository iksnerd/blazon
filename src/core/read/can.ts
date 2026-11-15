import type { ContrastLevel, BlazonData, TokenItem } from '../../types/index.js';
import { allows } from '../checker/usage.js';
import { CONTRAST_MINIMUM, contrastRatio, matchingPairs, parseColor } from '../checker/contrast.js';
import { contextItems } from '../tokens/contexts.js';
import { findToken, LookupError } from './lookup.js';
import { allPairs, usageOf } from './rules.js';

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
  /** Foreground on background, WCAG 2.x, and the strictest level that ratio meets ('fail' when it meets none) */
  contrast: {
    ratio: number;
    level: ContrastLevel | 'fail';
    /** The ratio the pair had to meet. Set for the `ui` role only: a text pair's minimum is the one its listed pair names. */ threshold?: number;
  };
  /** What the foreground is judged as: `text`, or `ui` for a border, focus ring or icon stroke */
  role: CanRole;
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

/** The modifier `--theme` names a context of. */
export const THEME_MODIFIER = 'theme';

/** The brand as the `theme` context `name` resolves it: its changes put over the default tokens by `contextItems`. */
function inTheme(data: BlazonData, name: string): BlazonData {
  const modifier = data.tokens.modifiers?.find((m) => m.name === THEME_MODIFIER);
  if (!modifier) throw new LookupError(`no theme "${name}": this brand has no resolver "${THEME_MODIFIER}" modifier, so it has no themes.`);
  if (!modifier.contexts.includes(name)) throw new LookupError(`no theme "${name}". The themes are ${modifier.contexts.map((c) => `"${c}"`).join(', ')}.`);
  const active = (data.tokens.contexts ?? []).filter((c) => c.modifier === THEME_MODIFIER && c.context === name);
  const items = contextItems(data.tokens.items, active);
  return { ...data, tokens: { ...data.tokens, items, byPath: new Map(items.map((t) => [t.path, t])) } };
}

const colorOf = (item: TokenItem, label: string) => {
  const color = item.type === 'color' ? parseColor(String(item.value)) : undefined;
  if (!color) throw new LookupError(`{${item.path}} (${label}) is not a color blazon can read: it is ${item.type ?? 'untyped'} with the value ${String(item.value)}.`);
  return color;
};

/**
 * Whether the foreground token may be used as text on the background token, from the brand's own rules and nothing else: the `usage` rules
 * on the foreground (role "text") and the background (role "background"), and the `pairs`. Pairs are a list, as the brand book treats them: when
 * the brand lists any, a combination none of them names is denied. A pair listed on a token that the foreground or background aliases counts.
 *
 * With `role` `ui` the foreground is a non-text element (focus ring, border, icon stroke): the contrast must reach {@link NON_TEXT_MINIMUM}, the `usage`
 * rule is read for the roles `border`, `icon` and `interactive`, and `pairs` do not apply, because they are text pairs.
 *
 * With `theme` the pair is judged in that context of the resolver's `theme` modifier: its colors, not the default's.
 */
export function canUse(data: BlazonData, typedFg: string, typedBg: string, role: CanRole = 'text', theme?: string): CanAnswer {
  if (theme !== undefined) return { ...canUse(inTheme(data, theme), typedFg, typedBg, role), theme };
  if (!CAN_ROLES.includes(role)) throw new LookupError(`"${String(role)}" is not a role blazon can judge. Use ${CAN_ROLES.map((r) => `"${r}"`).join(' or ')}.`);
  const fg = findToken(data, typedFg);
  const bg = findToken(data, typedBg);
  const ratio = contrastRatio(colorOf(fg, 'foreground'), colorOf(bg, 'background'));
  const level = LEVELS.find((l) => ratio >= CONTRAST_MINIMUM[l]) ?? 'fail';
  const shown = `${ratio.toFixed(2)}:1`;
  const rounded = Math.round(ratio * 100) / 100;
  if (role === 'ui') {
    const checks: CanCheck[] = [
      uiUsageCheck(data, fg),
      usageCheck(data, bg, 'background'),
      { rule: 'pairs', ok: true, message: 'pairs list text on background, so they do not apply to a non-text element' },
      {
        rule: 'contrast',
        ok: ratio >= NON_TEXT_MINIMUM,
        message: `non-text contrast needs ${NON_TEXT_MINIMUM}:1, this is ${shown}`,
      },
    ];
    const denied = checks.find((c) => !c.ok);
    const reason = denied ? denied.message : checks[checks.length - 1]!.message;
    return { fg: fg.path, bg: bg.path, role, allowed: denied === undefined, reason, checks, contrast: { ratio: rounded, level, threshold: NON_TEXT_MINIMUM } };
  }
  const checks: CanCheck[] = [usageCheck(data, fg, 'text'), usageCheck(data, bg, 'background')];

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
      message: `no pair lists {${fg.path}} on {${bg.path}}; the brand lists ${listed.length} pair${listed.length === 1 ? '' : 's'} and only those may sit together`,
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
  return { fg: fg.path, bg: bg.path, role, allowed, reason, checks, contrast: { ratio: rounded, level } };
}
