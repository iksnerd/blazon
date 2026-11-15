import { BLAZON_EXTENSION_KEY, TOKEN_TYPES, type Finding, type BlazonExtension, type GroupMeta, type TokenType } from '../../types/index.js';
import { finding } from '../checker/catalogue.js';

/** A token as declared, before aliases are resolved. */
export interface DeclaredToken {
  path: string;
  file: string;
  rawValue: unknown;
  type: TokenType | undefined;
  description?: string;
  deprecated?: boolean | string;
  extensions?: Record<string, unknown>;
  blazon: BlazonExtension;
}

export interface TokenTree {
  tokens: DeclaredToken[];
  groupMeta: GroupMeta[];
  problems: Finding[];
}

interface Inherited {
  type: TokenType | undefined;
  deprecated: boolean | string | undefined;
  blazon: BlazonExtension;
}

/** Group-level `dev.blazon` fields that describe the group itself and are not inherited by tokens. */
const FIELD_SCOPE: Record<keyof BlazonExtension, 'group' | 'inherited'> = {
  tier: 'inherited',
  role: 'inherited',
  usage: 'inherited',
  print: 'inherited',
  source: 'inherited',
  review: 'inherited',
  logo: 'inherited',
  angle: 'inherited',
  preview: 'inherited',
  webFont: 'inherited',
  font: 'inherited',
  proportion: 'group',
  pairs: 'group',
  pattern: 'group',
};
// A field added to BlazonExtension does not compile until it is classified here, so none leaks into tokens by default
const GROUP_ONLY_FIELDS = (Object.keys(FIELD_SCOPE) as (keyof BlazonExtension)[]).filter((field) => FIELD_SCOPE[field] === 'group');

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** An empty object with no prototype, for building a map from keys that come from a file. */
export function dictionary(): Record<string, unknown> {
  return Object.create(null) as Record<string, unknown>;
}

function blazonOf(node: Record<string, unknown>): BlazonExtension {
  const extensions = node.$extensions;
  if (!isObject(extensions)) return {};
  const blazon = extensions[BLAZON_EXTENSION_KEY];
  return isObject(blazon) ? (blazon as BlazonExtension) : {};
}

/** Passes from a group to its tokens' blazon... except `review`: a flagged group is reported once, on the group (reviewFindings), and a token's own review always wins. */
function passedDown(blazon: BlazonExtension): BlazonExtension {
  const { review: _review, ...rest } = inheritableBlazon(blazon);
  return rest;
}

function inheritableBlazon(blazon: BlazonExtension): BlazonExtension {
  const copy: BlazonExtension = { ...blazon };
  for (const field of GROUP_ONLY_FIELDS) delete copy[field];
  return copy;
}

function readType(node: Record<string, unknown>, at: string, file: string, problems: Finding[]): TokenType | undefined {
  if (node.$type === undefined) return undefined;
  if (TOKEN_TYPES.includes(node.$type as TokenType)) return node.$type as TokenType;
  problems.push(finding('unknown-type', { path: at || file, message: `$type "${String(node.$type)}" is not a DTCG 2025.10 type` }));
  return undefined;
}

/** Which document each token object came from, so a merged tree still knows its tokens' files. */
export type SourceMap = WeakMap<object, string>;

export function walk(node: Record<string, unknown>, parts: string[], inherited: Inherited, sources: SourceMap, tree: TokenTree): void {
  const at = parts.join('.');
  const file = sources.get(node) ?? '';
  const ownBlazon = blazonOf(node);
  const type = readType(node, at, file, tree.problems) ?? inherited.type;
  const deprecated = (node.$deprecated as boolean | string | undefined) ?? inherited.deprecated;

  if ('$value' in node) {
    tree.tokens.push({
      path: at,
      file,
      rawValue: node.$value,
      type,
      description: typeof node.$description === 'string' ? node.$description : undefined,
      deprecated,
      extensions: isObject(node.$extensions) ? node.$extensions : undefined,
      blazon: { ...inherited.blazon, ...inheritableBlazon(ownBlazon) },
    });
    return;
  }

  const description = typeof node.$description === 'string' ? node.$description : undefined;
  if (at && (description || Object.keys(ownBlazon).length > 0)) {
    tree.groupMeta.push({ path: at, ...(description && { description }), blazon: ownBlazon });
  }

  const childInherited: Inherited = {
    type,
    deprecated,
    blazon: { ...inherited.blazon, ...passedDown(ownBlazon) },
  };

  for (const [key, child] of Object.entries(node)) {
    if (key.startsWith('$')) continue;
    const childPath = [...parts, key];
    // DTCG forbids "." "{" "}" in a name. A key "a.b" and a group a holding b would both be the path a.b, and the later one would silently replace the earlier
    if (/[.{}]/.test(key)) {
      tree.problems.push(
        finding('invalid-token', {
          path: childPath.join('.'),
          message: `"${key}" is not a valid name: DTCG names cannot contain ".", "{" or "}", because a path joins names with "."`,
        }),
      );
    } else if (isObject(child)) {
      walk(child, childPath, childInherited, sources, tree);
    } else {
      tree.problems.push(finding('invalid-token', { path: childPath.join('.'), message: `"${childPath.join('.')}" is a bare value; DTCG tokens are objects with "$value"` }));
    }
  }
}
