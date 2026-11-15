import type { BrandTheme, ParsedTokens, ThemeRole, TokenType } from '../../types/index.js';

/**
 * The token names a brand book looks for, per viewer role, when `blazon.config.ts` has no `theme`: the
 * first that exists with the right type wins. They follow the conventions of the brand guidelines blazon was first tested against.
 */
export const CONVENTIONAL_ROLES: Record<ThemeRole, { types: TokenType[]; paths: string[] }> = {
  background: { types: ['color'], paths: ['surface.background', 'surface.base', 'surface.default'] },
  canvas: { types: ['color'], paths: ['surface.subtle', 'surface.canvas', 'surface.muted'] },
  text: { types: ['color'], paths: ['text.primary', 'text.default', 'text.base'] },
  muted: { types: ['color'], paths: ['text.muted', 'text.secondary', 'text.subtle'] },
  border: { types: ['color'], paths: ['border.default', 'border.base', 'border.subtle'] },
  accent: { types: ['color'], paths: ['interactive.primary', 'brand.primary', 'color.primary', 'color.accent'] },
  accentText: { types: ['color'], paths: ['text.inverse', 'text.onAccent', 'text.onPrimary'] },
  inverse: { types: ['color'], paths: ['surface.inverse', 'color.inverse'] },
  inverseText: { types: ['color'], paths: ['text.inverse', 'text.onInverse'] },
  fontDisplay: { types: ['fontFamily'], paths: ['font.family.display', 'font.family.heading', 'font.family.sans'] },
  fontBody: { types: ['fontFamily'], paths: ['font.family.body', 'font.family.sans', 'font.family.base'] },
  radius: { types: ['dimension'], paths: ['radius.default', 'radius.base', 'radius.md'] },
};

export interface InferredTheme {
  values: BrandTheme;
  /** Where each role came from, e.g. { accent: "interactive.primary" } */
  from: Partial<Record<ThemeRole, string>>;
}

/** The roles a brand's own token names fill, for a brand with no `theme` block. */
export function inferTheme(tokens: Pick<ParsedTokens, 'byPath'>): InferredTheme {
  const values: BrandTheme = {};
  const from: InferredTheme['from'] = {};
  for (const [role, { types, paths }] of Object.entries(CONVENTIONAL_ROLES) as [ThemeRole, (typeof CONVENTIONAL_ROLES)[ThemeRole]][]) {
    for (const path of paths) {
      const token = tokens.byPath.get(path);
      if (token?.type && types.includes(token.type)) {
        values[role] = String(token.value);
        from[role] = path;
        break;
      }
    }
  }
  return { values, from };
}
