import { customProperties } from '../../drift/compare.js';
import { readPage } from '../../drift/read.js';
import type { Ctx } from './context.js';
import { applyColors } from './sections/colors.js';
import { applyConfig } from './sections/config.js';
import { pruneTokenDirectives } from './sections/directives.js';
import { applyFonts } from './sections/fonts.js';
import { writeIntro } from './sections/intro.js';
import { applyLogo } from './sections/logo.js';
import { removePlaceholderLogo } from './sections/placeholder.js';
import type { ApplyOptions, FromSiteResult } from './types.js';
import type { Json } from './tree.js';

/**
 * Reads the site at `url` and rewrites the files the starter has just written. `created` holds the project-relative
 * paths that `blazon init` made in this run: a file it did not make is never changed. Throws when the page cannot be read.
 */
export async function applyFromSite(destDir: string, url: string, created: Set<string>, now: Date = new Date(), options: ApplyOptions = {}): Promise<FromSiteResult> {
  const date = now.toISOString().slice(0, 10);
  const page = options.page ?? (await readPage(url));
  const result: FromSiteResult = { written: [], missing: [], removed: [], repointed: [] };
  const note = `Read from ${url} on ${date}: confirm with the brand owner.`;
  const ctx: Ctx = {
    destDir,
    url,
    date,
    created,
    page,
    vars: customProperties(page.css),
    result,
    note,
    review: { status: 'needs-review', note },
    source: (locator: string, cssVar?: string): Json => ({ doc: `${url} stylesheet, read ${date}`, locator, ...(cssVar && { cssVar }) }),
    mayChange: (file: string): boolean => {
      if (created.has(file)) return true;
      result.missing.push(`${file} already existed, so it was kept as it was`);
      return false;
    },
  };

  applyColors(ctx, options.skipVars);
  const fonts = applyFonts(ctx);
  const logoFiles = await applyLogo(ctx);
  const { title, description, configLogo } = await applyConfig(ctx, logoFiles, fonts);
  removePlaceholderLogo(ctx, logoFiles, configLogo);
  writeIntro(ctx, title, description);
  pruneTokenDirectives(ctx);
  return result;
}
