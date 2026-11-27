import type { readPage } from '../../drift/read.js';
import type { Network } from '../../drift/fetch.js';

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

export type SitePage = Awaited<ReturnType<typeof readPage>>;

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
  colors: { cssVar: string; hex: string }[];
  fonts: { family: string; role: 'body' | 'headings'; stylesheet: boolean }[];
  /** Where the logo would come from, in words; undefined when there is none */
  logo?: string;
  /** What it looked for and did not find */
  missing: string[];
}
