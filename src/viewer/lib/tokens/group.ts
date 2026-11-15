import type { TokenItem } from '../../../types/index.js';
import { parentOf } from './format';

/** Tokens grouped by their parent path, in document order, for one section per group. */
export function byParent(tokens: TokenItem[]): [string, TokenItem[]][] {
  const groups = new Map<string, TokenItem[]>();
  for (const token of tokens) {
    const parent = parentOf(token.path) || token.group;
    groups.set(parent, [...(groups.get(parent) ?? []), token]);
  }
  return [...groups];
}
