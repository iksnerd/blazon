import type { ParsedTokens, TokenGroup, TokenItem } from '../../types/index.js';
import { aliasTarget, Resolver } from './alias.js';
import { compareText } from '../order.js';
import { generateCssVarName } from './names.js';
import { dictionary, type TokenTree } from './walk.js';
import { compositeParts, toCssValue } from './values/index.js';

/**
 * Resolves aliases and types for a loaded token tree and computes CSS-ready values.
 * Never throws on bad tokens: problems are returned for `blazon check` to report.
 */
export function resolveTokenTree(tree: TokenTree, cssPrefix = '--'): ParsedTokens {
  const resolver = new Resolver(tree.tokens);
  const items: TokenItem[] = [];

  for (const token of tree.tokens) {
    const resolvedValue = resolver.token(token.path);
    const type = resolver.typeOf(token);
    const aliasOf = aliasTarget(token.rawValue);
    const segments = token.path.split('.');

    const cascaded = resolver.unresolved.has(token.path);
    if (!type) {
      if (!cascaded) resolver.report(token.path, 'token-type-missing', 'No $type on the token, its groups, or the token it aliases');
    } else if (aliasOf && token.type) {
      const targetType = resolver.typeOf(tree.tokens.find((t) => t.path === aliasOf) ?? token);
      if (targetType && targetType !== token.type) {
        resolver.report(token.path, 'alias-type-mismatch', `$type ${token.type} aliases {${aliasOf}}, which is ${targetType}`);
      }
    }

    const value = toCssValue(type, resolvedValue, token.blazon);
    const parts = compositeParts(type, resolvedValue);
    if (value.problem && !cascaded) resolver.report(token.path, 'token-value-invalid', value.problem);

    items.push({
      path: token.path,
      group: segments[0]!,
      name: segments[segments.length - 1]!,
      file: token.file,
      rawValue: token.rawValue,
      resolvedValue,
      value: value.css,
      ...(parts && { parts }),
      type,
      description: token.description,
      deprecated: token.deprecated,
      aliasOf,
      extensions: token.extensions,
      blazon: token.blazon,
      cssVariable: generateCssVarName(cssPrefix, segments),
    });
  }

  return {
    items,
    byPath: new Map(items.map((item) => [item.path, item])),
    groups: groupByTopLevel(items, tree),
    nested: nest(items),
    groupMeta: tree.groupMeta,
    problems: [...tree.problems, ...resolver.problems],
    ...(resolver.unresolved.size > 0 && { unresolved: [...resolver.unresolved].sort(compareText) }),
  };
}

function groupByTopLevel(items: TokenItem[], tree: TokenTree): TokenGroup[] {
  const groups = new Map<string, TokenGroup>();
  for (const item of items) {
    let group = groups.get(item.group);
    if (!group) {
      const meta = tree.groupMeta.find((g) => g.path === item.group);
      group = { name: item.group, files: [], tokens: [], blazon: meta?.blazon ?? {} };
      groups.set(item.group, group);
    }
    group.tokens.push(item);
    if (!group.files.includes(item.file)) group.files.push(item.file);
  }
  return [...groups.values()];
}

function nest(items: TokenItem[]): Record<string, unknown> {
  const root = dictionary();
  for (const item of items) {
    const parts = item.path.split('.');
    let node = root;
    for (const part of parts.slice(0, -1)) {
      if (typeof node[part] !== 'object' || node[part] === null) node[part] = dictionary();
      node = node[part] as Record<string, unknown>;
    }
    node[parts[parts.length - 1]!] = item.parts ?? item.value;
  }
  return root;
}
