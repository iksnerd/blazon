import type { Finding } from './findings.js';
import type { BlazonExtension, TokenType } from './tokens.js';

export interface TokenItem {
  /** Full dotted path from the token tree root, e.g. "color.brand.indigo" */
  path: string;
  /** First path segment, e.g. "color" */
  group: string;
  /** Last path segment, e.g. "indigo" */
  name: string;
  /** The file the token was declared in, from the project root: `tokens/colors.json`. A token written inside a resolver document says `<resolver file> (inline)` */
  file: string;
  /** `$value` as authored, aliases included */
  rawValue: unknown;
  /** `$value` with every alias replaced, in DTCG structure */
  resolvedValue: unknown;
  /** CSS-ready value, e.g. "#635DFF", "16px", "600 64px/1.125 'Inter'" */
  value: string | number;
  /** For composite types (typography, border, transition, single shadow): each part as a CSS-ready value */
  parts?: Record<string, string | number>;
  /** Declared or inherited `$type`; undefined when neither exists (a check error) */
  type: TokenType | undefined;
  description?: string;
  deprecated?: boolean | string;
  /** Path of the token this one aliases directly, when `$value` is a single alias */
  aliasOf?: string;
  /** `$extensions` as authored, unknown vendors included */
  extensions?: Record<string, unknown>;
  /** `dev.blazon` fields merged from ancestor groups and the token */
  blazon: BlazonExtension;
  /** CSS custom property name, e.g. "--color-brand-indigo" */
  cssVariable: string;
}

export interface TokenGroup {
  /** Top-level group name, e.g. "color" */
  name: string;
  /** Files that contributed tokens to this group */
  files: string[];
  tokens: TokenItem[];
  /** The group's own `dev.blazon` fields */
  blazon: BlazonExtension;
}

/** A group's own `$description` and `dev.blazon` fields (pairs and proportion live only here). */
export interface GroupMeta {
  path: string;
  description?: string;
  blazon: BlazonExtension;
}

/** One non-default resolver context: the tokens whose resolved value differs from the default context. */
export interface TokenContext {
  /** Resolver modifier name, e.g. "locale" */
  modifier: string;
  /** Context name, e.g. "ja" */
  context: string;
  /** CSS selector its variables are emitted under, e.g. ":lang(ja)" */
  selector: string;
  /** The tokens whose CSS value differs: what the context's CSS block holds. A context as a whole is `contextItems(items, [context])` (core/tokens/contexts.ts) */
  tokens: TokenItem[];
  /**
   * The tokens whose CSS value is the default's but that say something else: another description, deprecation, type or extension, or another
   * alias that holds the same value. They have no CSS to write, and they belong in the context's own DTCG document. Absent when there are none.
   */
  metadataChanges?: TokenItem[];
}

export interface ParsedTokens {
  /** All tokens, in file then document order */
  items: TokenItem[];
  /** Tokens mapped by full dotted path. Server side only: the brand book receives the data as JSON, where a Map is `{}` */
  byPath: Map<string, TokenItem>;
  /** Tokens grouped by top-level group */
  groups: TokenGroup[];
  /** Resolved values in the original hierarchy; composites as objects of CSS-ready parts */
  nested: Record<string, unknown>;
  /** Groups that carry a `$description` or `dev.blazon` fields */
  groupMeta: GroupMeta[];
  /** Problems found while loading and resolving; `blazon check` adds rule findings */
  problems: Finding[];
  /** With a resolver document: every non-default context, one modifier at a time */
  contexts?: TokenContext[];
  /** With a resolver document: each modifier, its default context and all its contexts */
  modifiers?: { name: string; default: string; contexts: string[] }[];
}
