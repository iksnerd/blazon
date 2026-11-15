import type { Review } from './tokens.js';

export type AssetFormat = 'svg' | 'png' | 'jpg' | 'gif' | 'webp' | 'avif';

/** URL path the brand book serves asset files under, in dev and in the static build. */
export const ASSET_URL_BASE = 'brand-assets';

/** A DTCG dimension as the asset sidecars state it. */
export interface AssetDimension {
  value: number;
  unit: 'px' | 'rem';
}

/**
 * A length a sidecar states: a dimension in the artwork's own pixels, or a multiple of the artwork's
 * `unit`, which is how brand guidelines write it ("clear space equals the height of the star").
 */
export type AssetMeasure = AssetDimension | { units: number };

/** The shapes a logo comes in (RFC 0001 §10): a standard one, or one the brand added in `vocabulary.lockups`. */
export type LogoLockup = string;
export const STANDARD_LOGO_LOCKUPS = ['horizontal', 'stacked', 'mark', 'wordmark'] as const;

/** Where a logo may sit on a layout. */
export type LogoCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
export const LOGO_CORNERS: readonly LogoCorner[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

/** How the logo sits beside a partner's: the gap on each side of a divider, and the divider's height. */
export interface LogoPartnership {
  /** The space on each side of the divider, or between the logos when there is none */
  gap: AssetMeasure;
  /** The divider's height; a partnership without one has no divider */
  dividerHeight?: AssetMeasure;
  /** The partner logo's height; the logo's own height when absent */
  partnerHeight?: AssetMeasure;
}

/** Where a program's mark sits against the logo: to its right on one baseline, or under it, left edges aligned. */
export type InitiativePosition = 'beside' | 'below';
export const INITIATIVE_POSITIONS: readonly InitiativePosition[] = ['beside', 'below'];

/** A program the brand runs, drawn with the logo as the program lockup (RFC 0001 §10). */
export interface LogoInitiative {
  /** The program's name: the label of the lockup and its accessible name */
  name: string;
  /** The program's artwork, as an asset id written category/name */
  mark: string;
  /** The space between the logo and the mark */
  gap: AssetMeasure;
  /** Beside the logo when absent */
  position?: InitiativePosition;
  /** The mark's height; the logo's own height when absent */
  markHeight?: AssetMeasure;
}

/** What a `<name>.json` sidecar beside an asset says about it (RFC 0001 §7, §10). */
export interface AssetMeta {
  /** A name for the asset where the file name will not do: "Lifestyle" for `lifestyle-01.webp` */
  title?: string;
  description?: string;
  /** The qualities the brand asks of this kind of asset, as short plain statements */
  traits?: string[];
  /** What to do, and what not to do, as short plain statements */
  do?: string[];
  dont?: string[];
  /** The background the artwork is made for: `dark` for a white logo */
  background?: 'light' | 'dark';
  /** The artwork's main color as a CSS color (a token alias in the sidecar is resolved), so a logo can be chosen for a background by contrast */
  ink?: string;
  /** The length the brand measures this artwork in, in its own pixels: the star, say */
  unit?: AssetDimension;
  /** Space to keep free around the artwork */
  clearSpace?: AssetMeasure;
  /** The smallest size it may be shown at */
  minSize?: { width?: AssetDimension; height?: AssetDimension };
  /** The largest it should be shown, as for a logo drawn only for small sizes */
  maxSize?: { width?: AssetDimension; height?: AssetDimension };
  /** Below this width or height, use the asset `by` names (category/name) instead */
  replacedBelow?: { width?: AssetDimension; height?: AssetDimension; by: string };
  lockup?: LogoLockup;
  /** The corners the logo may sit in */
  placement?: LogoCorner[];
  partnership?: LogoPartnership;
  initiative?: LogoInitiative;
  /** Where the asset sits among the others of its category, lowest first; assets without one follow, by file name */
  order?: number;
  /** What a consumer records of its own, under a reverse-domain key ("com.acme.contrast"): kept as written, never read by blazon */
  extensions?: Record<string, unknown>;
  source?: { doc: string; locator: string };
  review?: Review;
  /** Provenance of an AI-generated image: the model or tool, and optionally the prompt and the licence it was used under */
  generated?: { by: string; prompt?: string; licence?: string };
}

export interface Asset {
  /** Asset identifier e.g. "logos/master-dark" or "icons/arrow-right" */
  id: string;
  /** Name e.g. "master-dark" */
  name: string;
  /** Category: "logos" | "icons" | custom subfolder; "assets" for files at the top of the folder */
  category: string;
  /** Path relative to the assets directory, with forward slashes */
  filePath: string;
  format: AssetFormat;
  mediaType: string;
  /** Relative URL the brand book loads the file from, e.g. "brand-assets/logos/mark.png" */
  url: string;
  /** File size in bytes */
  bytes: number;
  /** Pixel size for raster files; the width/height attributes, when present, for SVG */
  width?: number | string;
  height?: number | string;
  /** SVG only: the viewBox attribute, e.g. "0 0 24 24" */
  viewBox?: string;
  /** SVG only: the markup with the XML prologue stripped, for copy and inline display */
  svg?: string;
  /** From the sidecar `<name>.json` beside the file, when there is one */
  meta?: AssetMeta;
}

/** @deprecated Use `Asset`; assets are no longer SVG only. */
export type SvgAsset = Asset;
