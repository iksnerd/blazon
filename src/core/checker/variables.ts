import type { Finding, ParsedTokens, TokenItem } from '../../types/index.js';
import { finding } from './catalogue.js';
import { tokenVariables } from '../tokens/formatters/css.js';

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
        finding('css-variable-duplicate', {
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
 * stylesheet keeps the last. Checks theme.css (the tokens and the parts of composites) and each resolver context's block; the same name
 * in two blocks is by design. typography.css writes no variables of its own. A file a plugin writes is that plugin's to check.
 */
export function variableFindings(tokens: Pick<ParsedTokens, 'items' | 'contexts'>): Finding[] {
  const findings = collide(tokens.items, tokenVariables, '', undefined, new Set());
  for (const context of tokens.contexts ?? []) {
    findings.push(...collide(context.tokens, tokenVariables, '', `${context.modifier}=${context.context}`, new Set()));
  }
  return findings;
}
