import { SHADCN_VARIABLES, type BrandTheme, type ShadcnVariable, type ThemeRole, type TokenItem } from '../../types/index.js';
import { matchingPairs } from '../checker/contrast.js';

/**
 * The shadcn/ui variables the theme roles supply, and the role each one reads. The brand book's own
 * stylesheet (`src/viewer/index.css`) derives the same light-mode values with CSS, and a test holds the two
 * together. A variable not here (`destructive`, `chart-1` to `chart-5`) has no role: only `shadcn` in the config fills it.
 */
export const SHADCN_FROM_ROLES: Partial<Record<ShadcnVariable, ThemeRole>> = {
  background: 'background',
  foreground: 'text',
  card: 'background',
  'card-foreground': 'text',
  popover: 'background',
  'popover-foreground': 'text',
  primary: 'accent',
  'primary-foreground': 'accentText',
  secondary: 'canvas',
  'secondary-foreground': 'text',
  muted: 'canvas',
  'muted-foreground': 'muted',
  accent: 'canvas',
  'accent-foreground': 'text',
  border: 'border',
  input: 'border',
  ring: 'accent',
  radius: 'radius',
  sidebar: 'background',
  'sidebar-foreground': 'text',
  'sidebar-primary': 'accent',
  'sidebar-primary-foreground': 'accentText',
  'sidebar-accent': 'canvas',
  'sidebar-accent-foreground': 'text',
  'sidebar-border': 'border',
  'sidebar-ring': 'accent',
};

/** The pairs shadcn draws as text on a surface: the first is the surface, the second the text on it. */
export const SHADCN_PAIRS: readonly (readonly [ShadcnVariable, ShadcnVariable])[] = [
  ['background', 'foreground'],
  ['card', 'card-foreground'],
  ['popover', 'popover-foreground'],
  ['primary', 'primary-foreground'],
  ['secondary', 'secondary-foreground'],
  ['muted', 'muted-foreground'],
  ['accent', 'accent-foreground'],
  ['sidebar', 'sidebar-foreground'],
  ['sidebar-primary', 'sidebar-primary-foreground'],
  ['sidebar-accent', 'sidebar-accent-foreground'],
];

export interface ShadcnEntry {
  /** The token the value comes from */
  token: string;
  /** Its value in the default context, as CSS */
  value: string;
  /** `theme`: derived from a theme role (named in `role`). `config`: set by `shadcn` in blazon.json */
  from: 'theme' | 'config';
  role?: ThemeRole;
}

export interface ShadcnPairNote {
  /** The surface variable and the variable drawn on it */
  background: ShadcnVariable;
  foreground: ShadcnVariable;
  backgroundToken: string;
  foregroundToken: string;
  /** Whether a `pairs` rule of the brand covers these two tokens, so `blazon check` measures their contrast */
  declared: boolean;
}

export interface ShadcnMapping {
  variables: Partial<Record<ShadcnVariable, ShadcnEntry>>;
  /** The variables nothing supplies, in shadcn's order: the ones an agent has to ask about or choose */
  unsupplied: ShadcnVariable[];
  /** Each shadcn pair whose two tokens are known. Absent when the brand declares no `pairs` at all */
  pairs?: ShadcnPairNote[];
}

/**
 * The one place shadcn variables are derived. A mapping entry wins over the role; a mapping that names a
 * token that does not exist is left out (the compile reports it, `theme-unresolved`).
 */
export function deriveShadcn(
  roles: BrandTheme,
  roleTokens: Partial<Record<ThemeRole, string>>,
  mapping: Partial<Record<ShadcnVariable, string>> | undefined,
  items: TokenItem[],
  declaredPairs: { fg: string; bg: string }[] = [],
): ShadcnMapping {
  const byPath = new Map(items.map((item) => [item.path, item]));
  const variables: ShadcnMapping['variables'] = {};
  for (const name of SHADCN_VARIABLES) {
    const mapped = mapping?.[name];
    const token = mapped ? byPath.get(mapped) : undefined;
    if (mapped && token) {
      variables[name] = { token: token.path, value: String(token.value), from: 'config' };
      continue;
    }
    const role = SHADCN_FROM_ROLES[name];
    const value = role ? roles[role] : undefined;
    const tokenPath = role ? roleTokens[role] : undefined;
    if (role && value !== undefined && tokenPath) variables[name] = { token: tokenPath, value, from: 'theme', role };
  }
  const unsupplied = SHADCN_VARIABLES.filter((name) => !variables[name]);
  if (declaredPairs.length === 0) return { variables, unsupplied };

  const covered = (fg: string, bg: string) => matchingPairs(items, declaredPairs, fg, bg).length > 0;
  const pairs = SHADCN_PAIRS.flatMap(([background, foreground]): ShadcnPairNote[] => {
    const bg = variables[background];
    const fg = variables[foreground];
    if (!bg || !fg) return [];
    return [{ background, foreground, backgroundToken: bg.token, foregroundToken: fg.token, declared: covered(fg.token, bg.token) }];
  });
  return { variables, unsupplied, pairs };
}
