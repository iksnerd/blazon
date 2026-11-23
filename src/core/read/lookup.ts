import type { BlazonData, TokenItem } from '../../types/index.js';
import { closest } from '../suggest.js';

/** What the read commands cannot answer because of what they were asked: no such token, or not a color. The CLI ends these with exit 2. */
export class LookupError extends Error {}

/** A token path as typed: `{color.brand}` and `color.brand` are the same path. */
export const cleanPath = (typed: string): string =>
  typed
    .trim()
    .replace(/^\{(.*)\}$/, '$1')
    .trim();

/** Every group path in the brand: `color`, `color.brand`, and so on, from the paths of its tokens. */
export function groupPaths(data: BlazonData): Set<string> {
  const groups = new Set<string>();
  for (const { path } of data.tokens.items) {
    const parts = path.split('.');
    for (let i = 1; i < parts.length; i++) groups.add(parts.slice(0, i).join('.'));
  }
  return groups;
}

const quoted = (names: string[]): string =>
  names.length > 1
    ? `${names
        .slice(0, -1)
        .map((n) => `"${n}"`)
        .join(', ')} or "${names.at(-1)}"`
    : `"${names[0]}"`;

/**
 * The tail of a "no such path" message: `; did you mean "x"?` or `.`. The one place any read tool looks for a path the caller meant, over
 * `candidates` (the paths that would have been right). In order: the nearest spelling; else, when the path starts inside a group the brand has
 * (`color.slate.50` where `color` exists), up to three candidates directly in that group; else up to three candidates that share a word with
 * what was typed (`surface.background` finds `bg.surface`).
 */
export function didYouMean(data: BlazonData, wanted: string, candidates: string[]): string {
  const near = closest(wanted, candidates);
  if (near) return `; did you mean "${near}"?`;
  const parts = wanted.split('.');
  const groups = groupPaths(data);
  for (let n = parts.length - 1; n >= 1; n--) {
    const prefix = parts.slice(0, n).join('.');
    if (!groups.has(prefix)) continue;
    const inside = candidates.filter((c) => c.startsWith(`${prefix}.`) && c.split('.').length === n + 1).slice(0, 3);
    if (inside.length > 0) return `; did you mean ${quoted(inside)}?`;
    break;
  }
  const words = new Set(parts);
  const sharing = candidates
    .map((c) => ({ c, score: c.split('.').filter((w) => words.has(w)).length }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((x) => x.c);
  return sharing.length > 0 ? `; did you mean ${quoted(sharing)}?` : '.';
}

/** The token at `typed` (in the theme `theme` when the data is one, for the message), or a LookupError that names the closest path when there is one near. */
export function findToken(data: BlazonData, typed: string, theme?: string): TokenItem {
  const wanted = cleanPath(typed);
  const item = data.tokens.byPath.get(wanted);
  if (item) return item;
  const isGroup = data.tokens.items.some((token) => token.path.startsWith(`${wanted}.`));
  throw new LookupError(
    isGroup
      ? `"${wanted}" is a group, not a token; \`blazon rules ${wanted}\` shows its rules.`
      : `no token "${wanted}"${theme === undefined ? '' : ` in theme "${theme}"`}${didYouMean(
          data,
          wanted,
          data.tokens.items.map((token) => token.path),
        )}`,
  );
}
