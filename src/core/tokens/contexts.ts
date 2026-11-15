import type { TokenContext, TokenItem } from '../../types/index.js';

// A resolver context is stored as what it changes, not as a second copy of every token. That keeps the data the brand book receives small
// (a context would otherwise repeat all the tokens), and it means two lists that say different things:
//  - `tokens`: the tokens whose CSS value differs. This is what a context's CSS block is made of.
//  - `metadataChanges`: the tokens with the default's value that say something else (a description, a deprecation, a type, an extension).
// Anything that needs the context as a whole, such as its own DTCG document or what the brand book shows with the context chosen, asks for it
// here, so the two lists are never combined by hand.

const differs = (a: unknown, b: unknown): boolean => JSON.stringify(a) !== JSON.stringify(b);

/**
 * The default's tokens with the changes of `contexts` in place, in the default's order, then any token only a context has.
 *
 * A change is applied field by field: what a context's token has that the default's does not, and what it lacks that the default's has. So two
 * contexts that change one token in different ways (one its value, one its description) both show, whichever comes first, and where they change
 * the same field the later context wins.
 */
export function contextItems(items: readonly TokenItem[], contexts: readonly Pick<TokenContext, 'tokens' | 'metadataChanges'>[]): TokenItem[] {
  const original = new Map(items.map((token) => [token.path, token]));
  const merged = new Map<string, TokenItem>();
  for (const context of contexts) {
    for (const token of [...context.tokens, ...(context.metadataChanges ?? [])]) {
      const was = original.get(token.path);
      if (!was) {
        merged.set(token.path, token);
        continue;
      }
      const next: Record<string, unknown> = { ...(merged.get(token.path) ?? was) };
      const has = token as unknown as Record<string, unknown>;
      const before = was as unknown as Record<string, unknown>;
      for (const key of Object.keys(has)) if (differs(has[key], before[key])) next[key] = has[key];
      for (const key of Object.keys(before)) if (!(key in has)) delete next[key];
      merged.set(token.path, next as unknown as TokenItem);
    }
  }
  return [...items.map((token) => merged.get(token.path) ?? token), ...[...merged.values()].filter((token) => !original.has(token.path))];
}
