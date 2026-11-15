import { dictionary, isObject, walk, type SourceMap, type TokenTree } from './walk.js';
import { finding } from '../checker/catalogue.js';

export interface TokenDocument {
  /** Where the document came from, e.g. "colors.json"; recorded on each of its tokens */
  name: string;
  content: unknown;
}

export interface LoadOptions {
  /** Warn when a later document redefines a token. Off for resolver sources, where overriding is the point. */
  warnOnRedefinition?: boolean;
}

/**
 * Deep-merges DTCG documents in order, then reads the merged tree (RFC 0001 §1, DTCG Resolver §6.2).
 * Groups merge key by key; a token in a later document replaces the earlier token whole. Because
 * groups merge before types are read, an override with no `$type` still inherits its group's type.
 */
export function loadTokenDocuments(documents: TokenDocument[], options: LoadOptions = {}): TokenTree {
  const tree: TokenTree = { tokens: [], groupMeta: [], problems: [] };
  const sources: SourceMap = new WeakMap();
  // Prototype-free: a group named `__proto__` is an ordinary key, not a write to the shared prototype
  const merged = dictionary();

  const mergeInto = (target: Record<string, unknown>, source: Record<string, unknown>, parts: string[], name: string) => {
    for (const [key, value] of Object.entries(source)) {
      if (key.startsWith('$')) {
        target[key] = value;
        continue;
      }
      const existing = Object.hasOwn(target, key) ? target[key] : undefined;
      if (isObject(value) && '$value' in value) {
        if (options.warnOnRedefinition && isObject(existing) && '$value' in existing) {
          const path = [...parts, key].join('.');
          const earlier = sources.get(existing) ?? '';
          tree.problems.push(finding('token-path-duplicate', { path, message: `Defined in ${earlier} and again in ${name}; ${name} wins` }));
        }
        target[key] = value;
        sources.set(value, name);
      } else if (isObject(value)) {
        const group = isObject(existing) && !('$value' in existing) ? existing : dictionary();
        if (group !== existing) sources.set(group, name);
        target[key] = group;
        mergeInto(group, value, [...parts, key], name);
      } else {
        target[key] = value;
      }
    }
  };

  for (const doc of documents) {
    if (!isObject(doc.content)) {
      tree.problems.push(finding('token-file-invalid', { path: doc.name, message: 'Top level must be an object' }));
      continue;
    }
    mergeInto(merged, doc.content, [], doc.name);
  }

  walk(merged, [], { type: undefined, deprecated: undefined, blazon: {} }, sources, tree);
  return tree;
}
