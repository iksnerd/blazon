import type { Finding, ParsedTokens, TokenItem } from '../../types/index.js';
import { finding } from './catalogue.js';
import { tokenVariables } from '../tokens/formatters/css.js';
import { tailwindVariable } from '../tokens/formatters/tailwind.js';

/**
 * Walks the tokens in order, each with the variables it writes into one output block. A later token that writes a
 * variable an earlier one already wrote gets a finding (once per earlier token); the first keeps the variable.
 */
function collide(
  tokens: TokenItem[],
  variablesOf: (token: TokenItem) => string[],
  where: string,
  context: string | undefined,
  reported: Set<string>,
  harmless: (token: TokenItem, first: TokenItem) => boolean = () => false,
): Finding[] {
  const owner = new Map<string, TokenItem>();
  const findings: Finding[] = [];
  for (const token of tokens) {
    for (const variable of variablesOf(token)) {
      const first = owner.get(variable);
      if (!first) {
        owner.set(variable, token);
        continue;
      }
      if (first.path === token.path || harmless(token, first)) continue;
      const key = `${context ?? ''}\u0000${token.path}\u0000${first.path}`;
      if (reported.has(key)) continue;
      reported.add(key);
      findings.push(
        finding('css-variable-collision', {
          path: token.path,
          message: `${token.path} and ${first.path} both write the CSS variable ${variable}${where}; rename one`,
          ...(context && { context }),
        }),
      );
    }
  }
  return findings;
}

/**
 * Two tokens whose names reduce to one CSS custom property (`foo-bar` and `foo.bar`) overwrite each other, and the
 * stylesheet keeps the last. Checks theme.css (the tokens and the parts of composites), each resolver context's block
 * and tailwind.css; the same name in two blocks is by design. typography.css writes no variables of its own.
 */
export function variableFindings(tokens: Pick<ParsedTokens, 'items' | 'contexts'>): Finding[] {
  const theme = new Set<string>();
  const findings = collide(tokens.items, tokenVariables, '', undefined, theme);
  for (const context of tokens.contexts ?? []) {
    findings.push(...collide(context.tokens, tokenVariables, '', `${context.modifier}=${context.context}`, new Set()));
  }
  const tailwind = (token: TokenItem) => {
    const variable = tailwindVariable(token);
    return variable ? [variable] : [];
  };
  // tailwind.css names drop the group word, so a semantic alias (`brand.primary`) and its primitive (`color.brand.primary`)
  // share a name there by design; with one value, keeping the first loses nothing. A pair already found in theme.css is not repeated.
  const sameValue = (token: TokenItem, first: TokenItem) => String(token.value) === String(first.value);
  findings.push(...collide(tokens.items, tailwind, ' in tailwind.css', undefined, theme, sameValue));
  return findings;
}
