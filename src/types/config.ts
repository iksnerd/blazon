import type { AssetCategoryConfig, IconSetConfig } from './catalog.js';
import type { SectionId } from './docs.js';
import type { ThemeRole } from './theme.js';

/** One use of a plugin the operator allows: its name, an optional instance id, and the options blazon passes it in every request. */
export interface PluginConfig {
  name: string;
  /** The instance id (RFC 0014): what this entry is called when the plugin is listed more than once. Default: `name`. Unique in the list; names the entry's output folder and its breaker */
  as?: string;
  options?: Record<string, unknown>;
  /** The environment variables the operator lets this plugin have. A plugin starts with an empty environment; it gets a variable only when its manifest lists the name in `env` and this list approves it (RFC 0002 section 2) */
  env?: string[];
}

export interface BlazonConfig {
  /** Title of the brand book (default: package.json name or "Brand Book") */
  title: string;
  /** Subtitle or short tagline */
  description?: string;
  /** Path to design tokens directory (default: "./tokens") */
  tokensDir: string;
  /** Path to documentation markdown directory (default: "./docs") */
  docsDir: string;
  /** Path to assets directory (default: "./assets") */
  assetsDir: string;
  /** Output directory for site build (default: "./dist/site") */
  outDir: string;
  /** Output directory for token artifacts (default: "./dist/tokens") */
  tokensOutDir: string;
  /** CSS variable prefix (default: "--" or "--blazon-") */
  cssPrefix: string;
  /** CSS selector to attach variables to (default: ":root") */
  cssSelector: string;
  /** Dev server port (default: 3000) */
  port: number;
  /** Logo files (SVG or raster), relative to the project root: one path, or a variant per background */
  logo?: string | { onLight: string; onDark?: string };
  /** Brand book theme: viewer role → token path, e.g. { accent: 'interactive.primary' } */
  theme?: Partial<Record<ThemeRole, string>>;
  /** Icon packages to preview in the brand book, read from node_modules */
  iconSets?: IconSetConfig[];
  /** Settings for asset categories: label, order, description, an extra folder, rules */
  assets?: Record<string, AssetCategoryConfig>;
  /** The sections this brand expects a page for, standard or custom; `blazon check` notes each one no page holds. Default: all of them */
  sections?: SectionId[];
  /** Sections of the brand's own, next to the standard ones (RFC 0002 §1) */
  customSections?: { id: string; title: string }[];
  /** Names the brand adds to the standard lockups and usage roles (RFC 0002 §1) */
  vocabulary?: { lockups?: string[]; usageRoles?: string[] };
  /** The plugins that may run, by name: the operator's allowlist (RFC 0002 §2). The config holds no path and no command; a pin is recorded in `blazon.plugins.lock` */
  plugins?: PluginConfig[];
  /** Fonts the brand book loads: a stylesheet URL (e.g. Google Fonts), or a font file of the project that blazon embeds itself */
  fonts?: FontEntry[];
  /** DTCG resolver document (RFC 0001 §3), relative to the project root. Default: blazon.resolver.json when present */
  resolver?: string;
  /** CSS selector per resolver modifier, with {context} as the placeholder. Default: ":lang({context})" for locale, '[data-<modifier>="{context}"]' otherwise */
  contextSelectors?: Record<string, string>;
  /** The email signature the `<!-- blazon:email-signature -->` directive generates: the hosted logo, the accepted domains and the fixed lines */
  emailSignature?: EmailSignatureConfig;
}

/** What every signature the brand book generates shares; the person fills in the rest. */
export interface EmailSignatureConfig {
  /** The logo as mail apps load it: an absolute https URL of a PNG, GIF or JPG. Gmail and Outlook show no SVG and no data URI */
  logoUrl: string;
  /** The size the logo is shown at, in CSS pixels; the file should be twice that for sharp screens */
  logoSize: { width: number; height: number };
  /** The logo's alternative text, shown when a mail app blocks images */
  logoAlt: string;
  /** The domains an address may have, such as `example.com`. Absent: any */
  domains?: string[];
  /** Fixed lines under the contact details, in order: a company line, a legal notice */
  lines?: string[];
}

/** A font file in the project (woff2, woff, ttf or otf), embedded in the brand book as an `@font-face` of this family */
export interface LocalFont {
  family: string;
  /** Path to the file, relative to the project root */
  file: string;
  /** CSS `font-weight` of this file: 400, or "200 1000" for a variable font */
  weight?: number | string;
  style?: 'normal' | 'italic';
}

export type FontEntry = string | LocalFont;

export type UserBlazonConfig = Partial<BlazonConfig>;
