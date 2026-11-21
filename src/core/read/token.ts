import type { BlazonData, TokenItem, TokenType } from '../../types/index.js';
import { tokenVariables } from '../tokens/formatters/css.js';
import { typographyClassName } from '../tokens/names.js';
import { findToken } from './lookup.js';
import { inTheme } from './theme.js';
import { tokenRules, type TokenRules } from './rules.js';

/** The names a token has in the CSS files `blazon tokens` writes. */
export interface TokenNames {
  theme: {
    /** In theme.css, from the token's path */
    variable: string;
    /** A composite token also writes one variable for each part: `{ fontSize: '--type-h1-font-size' }` */
    parts?: Record<string, string>;
  };
  /** In typography.css, for a typography token */
  typographyClass?: string;
}

export function tokenNames(data: BlazonData, item: TokenItem): TokenNames {
  const [variable, ...partVariables] = tokenVariables(item);
  return {
    theme: { variable: variable!, ...(item.parts && { parts: Object.fromEntries(Object.keys(item.parts).map((part, i) => [part, partVariables[i]!])) }) },
    ...(item.type === 'typography' && { typographyClass: typographyClassName(item.path) }),
  };
}

export interface TokenDescription {
  path: string;
  type?: TokenType;
  /** CSS-ready, aliases resolved; with a theme, as that theme resolves it */
  value: string | number;
  /** With a theme: the value in the default tokens, only when the theme changes it */
  defaultValue?: string | number;
  /** The theme the value is resolved in; absent for the default tokens */
  theme?: string;
  /** A composite token's parts, CSS-ready */
  parts?: Record<string, string | number>;
  description?: string;
  deprecated?: boolean | string;
  /** The token this one aliases directly */
  aliasOf?: string;
  tier?: string;
  names: TokenNames;
  rules: TokenRules;
  /** Other values this token has in a resolver context, with the selector the context's CSS block uses */
  contexts?: { modifier: string; context: string; selector: string; value: string | number }[];
  /** The token file, from the project root */
  sourceFile: string;
}

/** Everything the brand says about one token, from the same compile every other command uses. */
export function describeToken(data: BlazonData, typedPath: string, theme?: string): TokenDescription {
  const item = findToken(theme === undefined ? data : inTheme(data, theme), typedPath, theme);
  const was = theme === undefined ? undefined : findToken(data, typedPath);
  const contexts = (data.tokens.contexts ?? []).flatMap((c) =>
    c.tokens.filter((t) => t.path === item.path).map((t) => ({ modifier: c.modifier, context: c.context, selector: c.selector, value: t.value })),
  );
  return {
    path: item.path,
    ...(item.type && { type: item.type }),
    value: item.value,
    ...(was && was.value !== item.value && { defaultValue: was.value }),
    ...(theme !== undefined && { theme }),
    ...(item.parts && { parts: item.parts }),
    ...(item.description && { description: item.description }),
    ...(item.deprecated && { deprecated: item.deprecated }),
    ...(item.aliasOf && { aliasOf: item.aliasOf }),
    ...(item.blazon.tier && { tier: item.blazon.tier }),
    names: tokenNames(data, item),
    rules: tokenRules(data, item),
    ...(contexts.length > 0 && { contexts }),
    sourceFile: item.file.replace(/ \(inline\)$/, ''),
  };
}
