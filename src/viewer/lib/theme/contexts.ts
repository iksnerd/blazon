import { useState } from 'react';
import type { BlazonData, ThemeRole } from '../../../types/index.js';
import { contextGroups, contextItems } from '../../../core/tokens/contexts.js';
import type { Mode } from '@/lib/theme/theme';

/** Chosen context per modifier; a modifier not listed shows its default. */
export type SelectedContexts = Record<string, string>;

const CONTEXT_KEY = 'blazon-contexts';

function readSelected(): SelectedContexts {
  try {
    const saved = JSON.parse(localStorage.getItem(CONTEXT_KEY) ?? '{}');
    return typeof saved === 'object' && saved !== null ? saved : {};
  } catch {
    return {};
  }
}

/** The reader's chosen contexts, remembered per viewer. Choosing a modifier's default forgets it. */
export function useSelectedContexts(data: BlazonData): [SelectedContexts, (modifier: string, context: string) => void] {
  const [selected, setSelected] = useState(readSelected);

  const select = (modifier: string, context: string) => {
    const isDefault = context === data.tokens.modifiers?.find((m) => m.name === modifier)?.default;
    setSelected((prev) => {
      const next = { ...prev };
      if (isDefault) delete next[modifier];
      else next[modifier] = context;
      try {
        localStorage.setItem(CONTEXT_KEY, JSON.stringify(next));
      } catch {
        // Storage can be unavailable; the choice still applies until reload.
      }
      return next;
    });
  };

  return [selected, select];
}

/**
 * The modifier the viewer's light and dark mode drives: one named `theme` with a `light` and a `dark` context. The book
 * then has one switch, and the brand's dark tokens show whenever the book is dark.
 */
export function modeModifier(data: BlazonData): string | undefined {
  return data.tokens.modifiers?.find((m) => m.name === 'theme' && m.contexts.includes('light') && m.contexts.includes('dark'))?.name;
}

/** The chosen contexts with the mode's context in place of any chosen for the mode's modifier. */
export function withMode(data: BlazonData, selected: SelectedContexts, mode: Mode): SelectedContexts {
  const modifier = modeModifier(data);
  return modifier ? { ...selected, [modifier]: mode } : selected;
}

/** The context shown for a modifier: the chosen one if the data still has it, otherwise the default. */
export function contextFor(data: BlazonData, modifier: string, selected: SelectedContexts): string | undefined {
  const m = data.tokens.modifiers?.find((x) => x.name === modifier);
  if (!m) return undefined;
  const chosen = selected[modifier];
  return chosen && m.contexts.includes(chosen) ? chosen : m.default;
}

/**
 * The brand book as the chosen contexts resolve it: each context's changed tokens replace the defaults,
 * a theme role whose token changed takes the new value, and only the findings that apply in what is on
 * screen remain (for review flags).
 */
export function effectiveData(data: BlazonData, selected: SelectedContexts): BlazonData {
  const active = (data.tokens.contexts ?? []).filter((c) => selected[c.modifier] === c.context);
  if (active.length === 0) return { ...data, findings: data.findings.filter((f) => !f.context) };

  const items = contextItems(data.tokens.items, active);
  const shown = new Set(active.map((c) => `${c.modifier}=${c.context}`));
  // The book dresses in the context too: Japanese body text in the brand's Japanese face
  const theme = { ...data.theme };
  for (const [role, tokenPath] of Object.entries(data.themeTokens ?? {}) as [ThemeRole, string][]) {
    // From the tokens as they are shown, so the theme and the token pages agree when several contexts are chosen
    const now = items.find((t) => t.path === tokenPath);
    const was = data.tokens.items.find((t) => t.path === tokenPath);
    if (now && String(now.value) !== String(was?.value)) theme[role] = String(now.value);
  }

  return {
    ...data,
    theme,
    tokens: { ...data.tokens, items, groupMeta: contextGroups(data.tokens.groupMeta, active) },
    findings: data.findings.filter((f) => !f.context || shown.has(f.context)),
  };
}
