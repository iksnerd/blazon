import { TOKEN_TYPES, type BlazonData, type TokenType } from '../../types/index.js';
import { closest } from '../suggest.js';
import { LookupError, cleanPath } from './lookup.js';

/** One line of the token list: enough to pick a path, and to use its value without a second call. */
export interface TokenListing {
  path: string;
  type?: TokenType;
  /** CSS-ready, aliases resolved */
  value: string | number;
  /** The token this one aliases directly */
  aliasOf?: string;
}

export interface TokenList {
  /** The group asked for, as a clean path; absent for the whole brand */
  group?: string;
  /** The type asked for; absent for every type */
  type?: TokenType;
  tokens: TokenListing[];
}

/** Every group path in the brand: `color`, `color.brand`, and so on, from the paths of its tokens. */
function groupPaths(data: BlazonData): Set<string> {
  const groups = new Set<string>();
  for (const { path } of data.tokens.items) {
    const parts = path.split('.');
    for (let i = 1; i < parts.length; i++) groups.add(parts.slice(0, i).join('.'));
  }
  return groups;
}

/** Whether `typed` names a group of tokens and not a token. A path that is both is a token. */
export function isGroupPath(data: BlazonData, typed: string): boolean {
  const wanted = cleanPath(typed);
  return !data.tokens.byPath.has(wanted) && groupPaths(data).has(wanted);
}

/**
 * The tokens of the brand, or of one group, in the order the token files write them, optionally only one `$type`.
 * Throws a LookupError for a group that is not there, or a type blazon does not know. Lets an agent find a path to give `describeToken`.
 */
export function listTokens(data: BlazonData, options: { group?: string; type?: string } = {}): TokenList {
  let type: TokenType | undefined;
  if (options.type !== undefined) {
    type = TOKEN_TYPES.find((known) => known === options.type);
    if (!type) throw new LookupError(`no token type "${options.type}"; the types are ${TOKEN_TYPES.join(', ')}.`);
  }
  let group: string | undefined;
  if (options.group !== undefined) {
    group = cleanPath(options.group);
    const groups = groupPaths(data);
    if (!groups.has(group)) {
      const meant = closest(group, [...groups]);
      throw new LookupError(`no group "${group}"${meant ? `; did you mean "${meant}"?` : '.'}`);
    }
  }
  const tokens = data.tokens.items
    .filter((item) => (group === undefined || item.path.startsWith(`${group}.`)) && (type === undefined || item.type === type))
    .map((item): TokenListing => ({ path: item.path, ...(item.type && { type: item.type }), value: item.value, ...(item.aliasOf && { aliasOf: item.aliasOf }) }));
  return { ...(group !== undefined && { group }), ...(type && { type }), tokens };
}
