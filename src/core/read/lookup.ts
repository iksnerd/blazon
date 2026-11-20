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

/** The token at `typed` (in the theme `theme` when the data is one, for the message), or a LookupError that names the closest path when there is one near. */
export function findToken(data: BlazonData, typed: string, theme?: string): TokenItem {
  const wanted = cleanPath(typed);
  const item = data.tokens.byPath.get(wanted);
  if (item) return item;
  const meant = closest(
    wanted,
    data.tokens.items.map((token) => token.path),
  );
  const isGroup = data.tokens.items.some((token) => token.path.startsWith(`${wanted}.`));
  throw new LookupError(
    isGroup
      ? `"${wanted}" is a group, not a token; \`blazon rules ${wanted}\` shows its rules.`
      : `no token "${wanted}"${theme === undefined ? '' : ` in theme "${theme}"`}${meant ? `; did you mean "${meant}"?` : '.'}`,
  );
}
