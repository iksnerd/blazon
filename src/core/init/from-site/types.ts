import type { FetchKind, Network } from '../../drift/fetch.js';

export interface FromSiteResult {
  /** Project-relative paths of the files it wrote or changed */
  written: string[];
  /** What it looked for and did not find, or found and could not use */
  missing: string[];
  /** Starter tokens and files it deleted because the site's own replace them */
  removed: string[];
  /** Starter tokens it pointed at the site's colors instead */
  repointed: string[];
}

/** A page and the CSS of its stylesheets, as read */
export interface SitePage {
  html: string;
  css: string;
  /** Where each stylesheet came from: its URL, or its path in a saved folder */
  sources: string[];
  /** Stylesheets that were not read, and why (a URL in a saved folder, a path outside it) */
  notRead?: string[];
}

/**
 * Where the values come from: a live site (`--from <url>`, web.ts) or a saved copy of one (`--from-dir <folder>`, folder.ts). The readers
 * ask it to resolve and read what the page names, so a saved folder is never left and a live site is held to the fetch policy.
 */
export interface SiteInput {
  /** What the values were read from, as notes and the output say it: the URL, or the folder and page */
  label: string;
  /** True for a saved folder: nothing is fetched */
  offline: boolean;
  /** The file name logos get */
  logoName: string;
  /** The brand name when the page states none */
  fallbackName: string;
  /** Reads the page and its stylesheets */
  page: () => Promise<SitePage>;
  /** What a reference on the page names: a URL or a folder-relative path, or why it cannot be read */
  resolve: (href: string) => { ref: string } | { reason: string };
  /** Whether a link on the page points at the home page */
  isHome: (href: string) => boolean;
  /** The bytes of a resolved reference */
  read: (ref: string, kind: FetchKind) => Promise<Buffer>;
  /** A token's `source.doc` for a value read from the page or its stylesheets */
  sourceDoc: (what: 'page' | 'stylesheet') => string;
}

export interface ApplyOptions {
  /** A page already read, so it is not fetched again */
  page?: SitePage;
  /** Custom properties (`--brand-primary`) the user unticked: their colors are left out */
  skipVars?: Set<string>;
  /** Where a fetch may connect. Only a test passes one; the command line has no way to */
  network?: Network;
}

export interface SiteFindings {
  page: SitePage;
  name?: string;
  description?: string;
  /** The page's `<meta name="theme-color">`, as written: evidence only, never a token */
  themeColor?: string;
  colors: { cssVar: string; hex: string }[];
  fonts: { family: string; role: 'body' | 'headings'; stylesheet: boolean }[];
  /** Where the logo would come from, in words; undefined when there is none */
  logo?: string;
  /** What it looked for and did not find */
  missing: string[];
}
