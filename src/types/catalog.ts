import type { Asset, AssetFormat } from './assets.js';

/** An icon package to preview, from `iconSets` in blazon.config.ts (RFC 0001 §9). */
export interface IconSetConfig {
  /** Name the directive and the URLs use: lowercase letters, digits and hyphens */
  name: string;
  /** An installed npm package, e.g. "lucide-static", "@tabler/icons", "@mdi/svg" */
  package: string;
  /** Folder of `<icon>.svg` files inside the package; known packages have a default */
  dir?: string;
  /** Brand categories: a map of category name to icon names, or a JSON file in the project holding one */
  categories?: Record<string, string[]> | string;
}

export interface IconCategory {
  name: string;
  /** Icon names, which are file names without `.svg` */
  icons: string[];
}

/** What the brand book knows of an icon set. The files stay in the package; the build copies them. */
export interface IconSet {
  name: string;
  package: string;
  version?: string;
  license?: string;
  count: number;
  categories: IconCategory[];
}

/** What a brand requires of every file in an asset category (RFC 0001 §11); `blazon check` tests each file against it. */
export interface AssetRules {
  /** The file formats allowed */
  formats?: AssetFormat[];
  /** The smallest pixel size a raster image may have. Vector files are not measured */
  minPixels?: { width?: number; height?: number };
  /** The aspect ratios allowed, written "16:9". A file matches one within 1% */
  aspectRatios?: string[];
}

/** One entry of the `assets` block in blazon.config.ts: settings for an asset category. */
export interface AssetCategoryConfig {
  /** Sidebar and page title; the humanized folder name when absent */
  label?: string;
  /** Sort key; ordered categories come first, ascending */
  order?: number;
  /** One line under the page title */
  description?: string;
  /** An extra folder to scan as this category, relative to the project or absolute. It may sit outside the project */
  dir?: string;
  rules?: AssetRules;
  /** What the guidelines leave open, as short plain statements */
  notSpecified?: string[];
  /** Where the guidelines say it */
  source?: { doc: string; locator: string };
  /** The images are kept out of git, and this sentence says how to make them. A checkout without them gets a note, not errors */
  local?: string;
  /** The files are explorations, not the brand's identity: their `review` does not gate the book, and the deliverables leave them out */
  experimental?: boolean;
  /** The files follow the guidelines but are kept for comparison, or were supplied by someone else: their `review` does not gate the book, and the deck leaves them out. Not together with `experimental` */
  reference?: boolean;
}

/** An asset category as the brand book shows it */
export interface AssetCategoryInfo {
  /** The folder name, as directives and URLs use it, e.g. "photography" */
  category: string;
  /** Sidebar and page title, e.g. "Imagery"; the humanized folder name when the config sets none */
  label: string;
  /** Sort key from the config; categories without one follow: logos, icons, then the rest by name */
  order?: number;
  /** One line shown under the page title */
  description?: string;
  /** What the brand requires of the files in it */
  rules?: AssetRules;
  /** What the guidelines leave open */
  notSpecified?: string[];
  source?: { doc: string; locator: string };
  /** The images are kept out of git, so a reader must not pass them on; this says how to make them */
  local?: string;
  /** The files are explorations, not the brand's identity: the brand book labels them, and the deliverables leave them out */
  experimental?: true;
  /** The files follow the guidelines but are kept for comparison, or were supplied by someone else: the brand book labels them, and the deck leaves them out */
  reference?: true;
}

export interface AssetCatalog {
  logos: Asset[];
  icons: Asset[];
  custom: Record<string, Asset[]>;
  all: Asset[];
}
