import type { ContextRead } from './brand.js';
import { sameColor } from './color.js';
import type { ShadcnMapping } from './derive.js';
import { CLASH_PARTNERS, finding, type ClashPartner, type Finding } from './options.js';

/**
 * An info finding, once, when `themeInline` is on and a brand supplies `destructive` but not `destructive-foreground`: Tailwind then has no
 * `--color-destructive-foreground`, so `text-destructive-foreground` (some registry components and older scaffolds use it) computes to the
 * inherited text color with no error. Adding the variable silences it.
 */
export function foregroundFindings(mapping: ShadcnMapping, themeInline: boolean): Finding[] {
  if (!themeInline || !mapping.variables.destructive || mapping.variables['destructive-foreground']) return [];
  return [
    finding(
      'destructive-foreground-missing',
      'info',
      'destructive-foreground',
      '`destructive` is supplied but `destructive-foreground` is not, so `text-destructive-foreground` takes the inherited text color. Current shadcn v4 uses `text-white` there. If a component or scaffold of yours uses the class, add `variables: { "destructive-foreground": "<token>" }` (a token that reads on `destructive`); adding it silences this.',
    ),
  ];
}

/**
 * A warning for each context in which `destructive` is the same color as `primary`, `accent` or `ring`: an error then looks like a main
 * action. The colors are compared as colors (`#E00`, `#ee0000` and the same OKLCH are one), not as text. A pair named in `allowSame` is
 * left out, in every context. A value that is not a color is never reported here.
 */
export function clashFindings(mapping: ShadcnMapping, contexts: readonly ContextRead[], allowSame: readonly ClashPartner[]): Finding[] {
  const destructive = mapping.variables.destructive;
  if (!destructive) return [];
  const where = [
    { label: 'the default context', changed: new Map<string, string>() },
    ...contexts.map((c) => ({ label: `the ${c.context} context`, changed: new Map(c.tokens.map((t) => [t.path, t.value])) })),
  ];
  const findings: Finding[] = [];
  for (const partner of CLASH_PARTNERS) {
    const other = mapping.variables[partner];
    if (!other || allowSame.includes(partner)) continue;
    for (const { label, changed } of where) {
      const mine = changed.get(destructive.token) ?? destructive.value;
      if (sameColor(mine, changed.get(other.token) ?? other.value) !== true) continue;
      findings.push(
        finding(
          'destructive-duplicate',
          'warning',
          destructive.token,
          `\`destructive\` ({${destructive.token}}, ${mine}) is the same color as \`${partner}\` ({${other.token}}) in ${label}: an error looks like a main action. Point \`variables.destructive\` at a color that differs from ${partner}, or list the pair in \`allowSame\`.`,
        ),
      );
    }
  }
  return findings;
}
