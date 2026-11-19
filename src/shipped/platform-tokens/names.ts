export type Style = 'android' | 'swift' | 'kotlin';
export type Kind = 'color' | 'dimension';

export interface Named {
  path: string;
  name: string;
  /** Present when the name is not what the path made: it was a reserved word, or another token had it */
  note?: { why: 'collision' | 'reserved'; with?: string };
}

const SWIFT = new Set(
  `associatedtype class deinit enum extension fileprivate func import init inout internal let open operator private precedencegroup protocol public rethrows static struct subscript
  typealias var break case catch continue default defer do else fallthrough for guard if in repeat return switch where while as await false is nil super self throw throws true try
  Any Self Type Protocol _`.split(/\s+/),
);
const KOTLIN = new Set(
  `as break class continue do else false for fun if in interface is null object package return super this throw true try typealias typeof val var when while`.split(/\s+/),
);
// An Android resource name becomes a field of R, so it cannot be a Java keyword
const JAVA = new Set(
  `abstract assert boolean break byte case catch char class const continue default do double else enum extends false final finally float for goto if implements import instanceof int
  interface long native new null package private protected public return short static strictfp super switch synchronized this throw throws transient true try void volatile while`.split(
    /\s+/,
  ),
);
const RESERVED: Record<Style, Set<string>> = { android: JAVA, swift: SWIFT, kotlin: KOTLIN };

const upperFirst = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1);
const lowerFirst = (word: string): string => word.charAt(0).toLowerCase() + word.slice(1);

/** The words of a dotted path: split at dots and at anything that is not a letter or digit */
const words = (path: string): string[] => path.split(/[^A-Za-z0-9]+/).filter(Boolean);

const snake = (word: string): string =>
  word
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toLowerCase();

/** The name a path makes before reserved words and collisions: `color.brand.primary` is `color_brand_primary`, or `brandPrimary` in a color namespace */
function baseName(path: string, style: Style, kind: Kind, prefix: string): string {
  if (style === 'android') {
    const name = [...(prefix ? [prefix] : []), ...words(path)].map(snake).join('_') || 'token';
    return /^[a-z]/.test(name) ? name : `n_${name}`;
  }
  // The namespace already says "colors", so a leading `color` segment is not repeated
  const segments = path.split('.');
  const rest = kind === 'color' && segments[0] === 'color' && segments.length > 1 ? segments.slice(1).join('.') : path;
  const name =
    words(rest)
      .map((word, at) => (at === 0 ? lowerFirst(word) : upperFirst(word)))
      .join('') || 'token';
  return /^[0-9]/.test(name) ? `_${name}` : name;
}

/**
 * The name of each path on one platform, in path order. A reserved word gets a suffix (`Token`, `_token` on Android) and a name another
 * token already has gets a number (`2`, `_2` on Android), so no token is dropped and the same brand always gets the same names.
 */
export function nameTokens(paths: string[], style: Style, kind: Kind, prefix: string): Named[] {
  const owners = new Map<string, string>();
  return [...paths]
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .map((path) => {
      let name = baseName(path, style, kind, prefix);
      let note: Named['note'];
      if (RESERVED[style].has(name)) {
        name += style === 'android' ? '_token' : 'Token';
        note = { why: 'reserved' };
      }
      const owner = owners.get(name);
      if (owner !== undefined) {
        const taken = name;
        const join = style === 'android' ? '_' : '';
        let n = 2;
        while (owners.has(`${taken}${join}${n}`)) n++;
        name = `${taken}${join}${n}`;
        note = { why: 'collision', with: owner };
      }
      owners.set(name, path);
      return { path, name, ...(note && { note }) };
    });
}

/** The name of a colorset in the asset catalog: the Swift name, with the prefix in front as lowerCamel (`acmeBlue100`), or the Swift name alone with no prefix */
export const assetName = (prefix: string, swift: string): string => (prefix ? `${lowerFirst(prefix)}${upperFirst(swift)}` : swift);

/** The Swift file name: `BlazonTokens.swift`, or `AcmeTokens.swift` with the prefix `acme` */
export const swiftFile = (prefix: string): string => `${typeName(prefix, 'Tokens')}.swift`;

/** The Swift and Kotlin type name for a group of tokens: `BlazonColors`, or `AcmeColors` with the prefix `acme` */
export const typeName = (prefix: string, suffix: string): string => `${prefix ? upperFirst(prefix) : 'Blazon'}${suffix}`;
