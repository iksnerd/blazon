import type { SitePage, FromSiteResult } from './types.js';
import type { Json } from './tree.js';
import type { SiteInput } from './types.js';

/** What every part of `applyFromSite` shares: where it writes, what it read, and the findings it adds to. */
export interface Ctx {
  destDir: string;
  /** What the values were read from, as the notes say it: the URL, or the saved folder and page */
  url: string;
  /** The site or saved folder: it resolves and reads what the page names */
  site: SiteInput;
  /** The day it read the site, as YYYY-MM-DD */
  date: string;
  /** The project-relative paths `blazon init` made in this run: a file it did not make is never changed */
  created: Set<string>;
  page: SitePage;
  /** The custom properties in the page's stylesheets */
  vars: Map<string, string>;
  result: FromSiteResult;
  /** The sentence every token and asset it writes is marked with */
  note: string;
  review: Json;
  /** Where a value came from, as a token's `source` */
  source: (locator: string, cssVar?: string) => Json;
  /** Whether a file may be rewritten: only one this run made. Says so in `result.missing` when it may not. */
  mayChange: (file: string) => boolean;
}

export const rel = (...parts: string[]): string => parts.join('/');
