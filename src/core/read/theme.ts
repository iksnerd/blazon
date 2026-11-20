import type { BlazonData } from '../../types/index.js';
import { contextItems } from '../tokens/contexts.js';
import { LookupError } from './lookup.js';

/** The modifier `--theme` names a context of. */
export const THEME_MODIFIER = 'theme';

/** The names of the contexts of the resolver's `theme` modifier, in the resolver's order; empty when the brand has no such modifier. */
export function themeNames(data: BlazonData): string[] {
  return data.tokens.modifiers?.find((m) => m.name === THEME_MODIFIER)?.contexts ?? [];
}

/** The brand as the `theme` context `name` resolves it: its changes put over the default tokens by `contextItems`. */
export function inTheme(data: BlazonData, name: string): BlazonData {
  const modifier = data.tokens.modifiers?.find((m) => m.name === THEME_MODIFIER);
  if (!modifier) throw new LookupError(`no theme "${name}": this brand has no resolver "${THEME_MODIFIER}" modifier, so it has no themes.`);
  if (!modifier.contexts.includes(name)) throw new LookupError(`no theme "${name}". The themes are ${modifier.contexts.map((c) => `"${c}"`).join(', ')}.`);
  const active = (data.tokens.contexts ?? []).filter((c) => c.modifier === THEME_MODIFIER && c.context === name);
  const items = contextItems(data.tokens.items, active);
  return { ...data, tokens: { ...data.tokens, items, byPath: new Map(items.map((t) => [t.path, t])) } };
}
