/** DTCG 2025.10 token types (Format Module §8, §9). */
export type TokenType =
  'color' | 'dimension' | 'fontFamily' | 'fontWeight' | 'duration' | 'cubicBezier' | 'number' | 'strokeStyle' | 'border' | 'transition' | 'shadow' | 'gradient' | 'typography';

export const TOKEN_TYPES: readonly TokenType[] = [
  'color',
  'dimension',
  'fontFamily',
  'fontWeight',
  'duration',
  'cubicBezier',
  'number',
  'strokeStyle',
  'border',
  'transition',
  'shadow',
  'gradient',
  'typography',
];

/**
 * Places a value may appear: the vocabulary of `dev.blazon` usage rules. The standard roles are always valid and
 * a brand adds its own in `vocabulary.usageRoles` (RFC 0002 §1).
 */
export type UsageRole = string;

export const STANDARD_USAGE_ROLES = ['text', 'background', 'border', 'icon', 'illustration', 'accent', 'interactive'] as const;

export type Tier = 'primitive' | 'semantic' | 'component';

export type ContrastLevel = 'AA' | 'AA-large' | 'AAA';

/** A contrast rule: every fg/bg combination must meet `min`. Paths may end in `.*` for a whole group. */
export interface ContrastPair {
  fg: string;
  bg: string;
  min: ContrastLevel;
}

/** The repeats blazon can draw from tokens (RFC 0001 §8). */
export type PatternKind = 'dots' | 'lines' | 'diagonal' | 'grid' | 'checks';

export const PATTERN_KINDS: readonly PatternKind[] = ['dots', 'lines', 'diagonal', 'grid', 'checks'];

/**
 * Whether a person has confirmed the value (RFC 0001 §2). `ok` records the confirmation; `by` and `at` say who and
 * when, and `value` is the fingerprint of what they confirmed, so `blazon check` can see the value has changed since.
 */
export interface Review {
  status: 'ok' | 'needs-review';
  note?: string;
  /** Who confirmed the value */
  by?: string;
  /** The day it was confirmed, YYYY-MM-DD */
  at?: string;
  /** The fingerprint of the value that was confirmed, 12 hex digits printed by `blazon approvals` (RFC 0001 section 2) */
  value?: string;
}

/** `$extensions["dev.blazon"]`: brand facts DTCG has no slot for (RFC 0001 §2). */
export interface BlazonExtension {
  tier?: Tier;
  /** The role this token plays, checked against the usage of what it aliases. */
  role?: UsageRole;
  usage?: { allow?: UsageRole[]; deny?: UsageRole[] };
  /** `ral`: a RAL number such as "5012", without the "RAL" the book writes before it; `print-ral-invalid` checks it */
  print?: { cmyk?: [number, number, number, number]; pms?: string; ral?: string };
  /** `cssVar`: the custom property of the live site this value was read from; `blazon drift` compares them */
  source?: { doc: string; locator: string; cssVar?: string };
  review?: Review;
  /**
   * Logo variants the brand forbids on this background, whatever their contrast: `onLight`, `onDark`, or a logo
   * asset id such as `logos/white`. `blazon:logo-contrast` marks each as forbidden and gives the `reason`.
   */
  logo?: { deny?: string[]; reason?: string };
  /** Gradient direction in degrees. */
  angle?: number;
  /** How the brand book previews the token, when its type and name do not say it; see PreviewKind. */
  preview?: PreviewKind;
  /** A typeface the brand book cannot load, such as a commercial font with no web stylesheet: false, or a sentence saying why or what to use */
  webFont?: false | string;
  /** On a `fontFamily` token (or a group of them): where the typeface comes from and under what license; see FontMeta */
  font?: FontMeta;
  /**
   * Group-level only: the documented share of a composition. Keyed by a group path with a share
   * (`"color.neutral": 0.6`), or by a label with the tokens it covers (`"White": { share: 0.5,
   * tokens: ["{color.neutral.white}"] }`) when the buckets do not match token groups.
   */
  proportion?: Record<string, number | ProportionBucket>;
  /** Group-level only: contrast rules checked by `blazon check`. */
  pairs?: ContrastPair[];
  /** Group-level only: marks the group as a pattern of this kind; see `PatternKind`. */
  pattern?: PatternKind;
}

/** What a brand states about a typeface it uses, for the brand book and for anything handed to people outside the brand (the press kit) */
export interface FontMeta {
  /** Where the typeface comes from: a foundry or service name, or an http(s) address */
  source?: string;
  /** An SPDX identifier (`OFL-1.1`) or the license's name in words */
  license?: string;
  /** An http(s) address of the license text */
  licenseUrl?: string;
}

export interface ProportionBucket {
  share: number;
  /** Aliases of the tokens this bucket covers, e.g. ["{color.neutral.white}"]; optional for a bucket the brand names only in words */
  tokens?: string[];
}

/** Brand book previews: radius box, size square with grid, stroke drawn at its weight, tracked text, font-size specimen, canvas frame, opacity swatch, bordered shape, or a plain bar. */
export type PreviewKind = 'radius' | 'square' | 'stroke' | 'tracking' | 'fontSize' | 'frame' | 'opacity' | 'border' | 'bar';

export const BLAZON_EXTENSION_KEY = 'dev.blazon';
