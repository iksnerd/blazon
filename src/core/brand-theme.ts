import type { BrandTheme, Finding, BlazonConfig, ParsedTokens, ShadcnVariable, ThemeRole } from '../types/index.js';
import { inferTheme } from './tokens/theme.js';
import { finding } from './checker/catalogue.js';

/**
 * Looks up each `config.theme` token path; a path with no token is reported, not thrown. With no
 * `theme` block at all, roles come from conventional token names and an `info` finding says which.
 */
/** The `shadcn` entries whose token does not exist, as the same finding a missing theme token gets. */
export function shadcnProblems(config: BlazonConfig, tokens: ParsedTokens): Finding[] {
  return (Object.entries(config.shadcn ?? {}) as [ShadcnVariable, string][])
    .filter(([, tokenPath]) => !tokens.byPath.has(tokenPath))
    .map(([name, tokenPath]) => finding('theme-unresolved', { path: tokenPath, message: `shadcn.${name} points at {${tokenPath}}, which is not a token` }));
}

export function resolveTheme(config: BlazonConfig, tokens: ParsedTokens): ResolvedTheme {
  if (!config.theme || Object.keys(config.theme).length === 0) return inferredTheme(tokens);
  const values: BrandTheme = {};
  const roleTokens: ResolvedTheme['tokens'] = {};
  const problems: Finding[] = [];
  for (const [role, tokenPath] of Object.entries(config.theme) as [ThemeRole, string][]) {
    const token = tokens.byPath.get(tokenPath);
    if (token) {
      values[role] = String(token.value);
      roleTokens[role] = tokenPath;
    } else {
      problems.push(finding('theme-unresolved', { path: tokenPath, message: `theme.${role} points at {${tokenPath}}, which is not a token` }));
    }
  }
  return { values, tokens: roleTokens, problems };
}

/** Each role's value, the token it came from (so a context that changes the token can change the role), and what went wrong. */
interface ResolvedTheme {
  values: BrandTheme;
  tokens: Partial<Record<ThemeRole, string>>;
  problems: Finding[];
}

function inferredTheme(tokens: ParsedTokens): ResolvedTheme {
  const { values, from } = inferTheme(tokens);
  const roles = Object.entries(from).map(([role, tokenPath]) => `${role} = {${tokenPath}}`);
  const message =
    roles.length > 0
      ? `No theme in blazon.json, so the brand book took ${roles.join(', ')}. Set theme in blazon.json to choose roles yourself.`
      : "No theme in blazon.json and no token has a conventional name (surface.background, text.primary, interactive.primary, ...), so the brand book uses blazon's neutral colors. Set theme in blazon.json to map its roles to your tokens.";
  return { values, tokens: from, problems: [finding(roles.length > 0 ? 'theme-inferred' : 'theme-missing', { path: 'theme', message })] };
}
