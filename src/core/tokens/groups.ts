import { PATTERN_KINDS, type ParsedTokens, type PatternKind, type TokenItem } from '../../types/index.js';

// Brand facts that are a group of tokens, not one token: a social format (width, height, ...) and a
// pattern (kind, size, ...). RFC 0001 §8. Both are plain DTCG tokens; these helpers read them.

/** A rem is read as 16px: a token file states no root size, and the browser default is the only honest guess. */
const REM_PX = 16;

function parentOf(path: string): string {
  return path.slice(0, Math.max(0, path.lastIndexOf('.')));
}

function nameOf(path: string): string {
  return path.slice(path.lastIndexOf('.') + 1);
}

/** A dimension token's size in pixels; undefined when the token is not a px or rem dimension. */
export function dimensionPx(token: TokenItem | undefined): number | undefined {
  const match = token?.type === 'dimension' ? String(token.value).match(/^(-?[\d.]+)(px|rem)$/) : undefined;
  if (!match) return undefined;
  const value = Number(match[1]) * (match[2] === 'rem' ? REM_PX : 1);
  return Number.isFinite(value) ? value : undefined;
}

export interface SocialFormat {
  /** Path of the format's group, e.g. "social.format.story" */
  path: string;
  name: string;
  width: number;
  height: number;
  /** Safe-area inset, in px */
  margin?: number;
  /** Column count of the layout grid */
  columns?: number;
}

export interface PatternSpec {
  /** Path of the pattern's group, e.g. "pattern.dots" */
  path: string;
  name: string;
  kind: PatternKind;
  /** The repeat: one tile is this many px square */
  size: number;
  /** Dot diameter or line weight, in px; a fraction of the size when the group gives none */
  stroke: number;
  /** A color or gradient, drawn through the pattern */
  ink?: string;
  /** A color or gradient behind it */
  ground?: string;
}

export interface Resolved<T> {
  found: T[];
  /** One message per mistake, each starting with the group it is about */
  problems: string[];
}

const under = (items: readonly TokenItem[], path: string) => {
  const clean = path.replace(/\.\*$/, '');
  return { clean, tokens: items.filter((t) => t.path.startsWith(`${clean}.`)) };
};

/** The children of a group, by name. */
function childrenOf(items: readonly TokenItem[], group: string): Map<string, TokenItem> {
  return new Map(items.filter((t) => parentOf(t.path) === group).map((t) => [nameOf(t.path), t]));
}

/**
 * The social formats a path names: a group with `width` and `height` dimension tokens, or a group of
 * such groups. `margin` (dimension) and `columns` (a whole number) are optional.
 */
export function formatsAt(tokens: Pick<ParsedTokens, 'items'>, path: string): Resolved<SocialFormat> {
  const { clean, tokens: inside } = under(tokens.items, path);
  const groups = [...new Set(inside.filter((t) => ['width', 'height'].includes(nameOf(t.path))).map((t) => parentOf(t.path)))];
  if (groups.length === 0) return { found: [], problems: [`no format at ${clean} (a group with dimension tokens width and height)`] };

  const found: SocialFormat[] = [];
  const problems: string[] = [];
  for (const group of groups) {
    const kids = childrenOf(tokens.items, group);
    const width = dimensionPx(kids.get('width'));
    const height = dimensionPx(kids.get('height'));
    if (!width || !height || width <= 0 || height <= 0) {
      problems.push(`${group}: needs positive px or rem dimension tokens width and height`);
      continue;
    }
    const marginToken = kids.get('margin');
    const margin = marginToken ? dimensionPx(marginToken) : undefined;
    const columns = kids.get('columns');
    if (marginToken && margin === undefined) problems.push(`${group}.margin must be a px or rem dimension`);
    if (columns && !(columns.type === 'number' && Number.isInteger(columns.value) && Number(columns.value) >= 1))
      problems.push(`${group}.columns must be a whole number of at least 1`);
    found.push({
      path: group,
      name: nameOf(group),
      width,
      height,
      ...(margin !== undefined && { margin }),
      ...(columns && columns.type === 'number' && { columns: Number(columns.value) }),
    });
  }
  return { found, problems };
}

/**
 * The patterns a path names: a group marked `$extensions["dev.blazon"].pattern` with a kind, holding a
 * `size` dimension and optionally `stroke` (dimension), `ink` and `ground` (color or gradient).
 */
export function patternsAt(tokens: Pick<ParsedTokens, 'items' | 'groupMeta'>, path: string): Resolved<PatternSpec> {
  const clean = path.replace(/\.\*$/, '');
  const marked = tokens.groupMeta.filter((g) => (g.path === clean || g.path.startsWith(`${clean}.`)) && g.blazon.pattern !== undefined);
  if (marked.length === 0) return { found: [], problems: [`no pattern at ${clean} (a group with dev.blazon.pattern set to ${PATTERN_KINDS.join(', ')})`] };

  const found: PatternSpec[] = [];
  const problems: string[] = [];
  for (const { path: group, blazon } of marked) {
    const kind = blazon.pattern;
    if (!PATTERN_KINDS.includes(kind as PatternKind)) {
      problems.push(`${group}: pattern must be one of ${PATTERN_KINDS.join(', ')}, got ${JSON.stringify(kind)}`);
      continue;
    }
    const kids = childrenOf(tokens.items, group);
    const size = dimensionPx(kids.get('size'));
    if (!size || size <= 0) {
      problems.push(`${group}: needs a positive px or rem dimension token size`);
      continue;
    }
    const stroke = kids.has('stroke') ? dimensionPx(kids.get('stroke')) : size / 8;
    const paint = (name: string): string | undefined | false => {
      const token = kids.get(name);
      if (!token) return undefined;
      return token.type === 'color' || token.type === 'gradient' ? String(token.value) : false;
    };
    const ink = paint('ink');
    const ground = paint('ground');
    if (stroke === undefined || stroke <= 0) problems.push(`${group}.stroke must be a positive px or rem dimension`);
    if (ink === false) problems.push(`${group}.ink must be a color or gradient`);
    if (ground === false) problems.push(`${group}.ground must be a color or gradient`);
    if (stroke === undefined || stroke <= 0 || ink === false || ground === false) continue;
    found.push({ path: group, name: nameOf(group), kind: kind as PatternKind, size, stroke, ...(ink && { ink }), ...(ground && { ground }) });
  }
  return { found, problems };
}
