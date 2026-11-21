import type { GroupMeta, ParsedTokens, TokenContext, TokenItem } from '../../types/index.js';

// A resolver context is stored as what it changes, not as a second copy of every token. That keeps the data the brand book receives small
// (a context would otherwise repeat all the tokens), and it means two lists that say different things:
//  - `tokens`: the tokens whose CSS value differs. This is what a context's CSS block is made of.
//  - `metadataChanges`: the tokens with the default's value that say something else (a description, a deprecation, a type, an extension).
//  - `removed`: the paths of the default's tokens that the context leaves out. CSS cannot express a removal, so no CSS block has one.
//  - `groupChanges` and `removedGroups`: the same, for the groups that carry a `$description` or `dev.blazon` rules.
// Anything that needs the context as a whole, such as its own DTCG document or what the brand book shows with the context chosen, asks for it
// here, so the two lists are never combined by hand.

const differs = (a: unknown, b: unknown): boolean => JSON.stringify(a) !== JSON.stringify(b);

/**
 * The default's tokens with the changes of `contexts` in place, in the default's order, then any token only a context has.
 *
 * A change is applied field by field: what a context's token has that the default's does not, and what it lacks that the default's has. So two
 * contexts that change one token in different ways (one its value, one its description) both show, whichever comes first, and where they change
 * the same field the later context wins. A token a context lists in `removed` is left out, and it stays out when another chosen context changes it.
 */
export function contextItems(items: readonly TokenItem[], contexts: readonly Pick<TokenContext, 'tokens' | 'metadataChanges' | 'removed'>[]): TokenItem[] {
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
  const removed = new Set(contexts.flatMap((context) => context.removed ?? []));
  return [...items.map((token) => merged.get(token.path) ?? token), ...[...merged.values()].filter((token) => !original.has(token.path))].filter(
    (token) => !removed.has(token.path),
  );
}

/** The default's group records with the changes of `contexts` in place: a changed group replaces the default's, a removed one is dropped. */
export function contextGroups(groups: readonly GroupMeta[], contexts: readonly Pick<TokenContext, 'groupChanges' | 'removedGroups'>[]): GroupMeta[] {
  const merged = new Map(groups.map((group) => [group.path, group]));
  for (const context of contexts) {
    for (const path of context.removedGroups ?? []) merged.delete(path);
    for (const group of context.groupChanges ?? []) merged.set(group.path, group);
  }
  return [...merged.values()];
}

const groupSays = (group: GroupMeta): string => JSON.stringify([group.description, group.blazon]);

/**
 * What a context leaves out or changes beyond its tokens' values, against the default: the paths of the default's tokens it does not have,
 * the groups whose description or rules differ (the context's whole record), and the default's groups that carry no description or rules in
 * the context. Only the non-empty parts are present, and `removed` and `removedGroups` are sorted.
 */
export function contextRemovals(
  base: Pick<ParsedTokens, 'items' | 'groupMeta'>,
  context: Pick<ParsedTokens, 'items' | 'groupMeta'>,
): Pick<TokenContext, 'removed' | 'groupChanges' | 'removedGroups'> {
  const has = new Set(context.items.map((t) => t.path));
  const removed = base.items
    .map((t) => t.path)
    .filter((path) => !has.has(path))
    .sort();
  const was = new Map(base.groupMeta.map((g) => [g.path, g]));
  const now = new Set(context.groupMeta.map((g) => g.path));
  const groupChanges = context.groupMeta.filter((g) => !was.has(g.path) || groupSays(was.get(g.path)!) !== groupSays(g));
  const removedGroups = base.groupMeta
    .map((g) => g.path)
    .filter((path) => !now.has(path))
    .sort();
  return {
    ...(removed.length > 0 && { removed }),
    ...(groupChanges.length > 0 && { groupChanges }),
    ...(removedGroups.length > 0 && { removedGroups }),
  };
}
