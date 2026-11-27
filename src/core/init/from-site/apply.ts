import { customProperties } from '../../drift/compare.js';
import { webSite } from './web.js';
import type { Ctx } from './context.js';
import { applyColors } from './sections/colors.js';
import { applyConfig } from './sections/config.js';
import { pruneTokenDirectives } from './sections/directives.js';
import { applyFonts } from './sections/fonts.js';
import { writeIntro } from './sections/intro.js';
import { applyLogo } from './sections/logo.js';
import { applyRadius } from './sections/radius.js';
import { writeProof } from './sections/proof.js';
import { removePlaceholderLogo } from './sections/placeholder.js';
import type { ApplyOptions, FromSiteResult, SiteInput } from './types.js';
import type { Json } from './tree.js';

/**
 * Reads the site at `from` (an http(s) address, or a saved folder from `savedSite`) and rewrites the files the starter has just written. `created` holds the project-relative
 * paths that `blazon init` made in this run: a file it did not make is never changed. Throws when the page cannot be read.
 */
export async function applyFromSite(destDir: string, from: string | SiteInput, created: Set<string>, now: Date = new Date(), options: ApplyOptions = {}): Promise<FromSiteResult> {
  const date = now.toISOString().slice(0, 10);
  const site = typeof from === 'string' ? webSite(from, options.network) : from;
  const url = site.label;
  const page = options.page ?? (await site.page());
  const result: FromSiteResult = { written: [], missing: [], removed: [], repointed: [] };
  // A person confirms each value with the brand owner and records it the way every approval is recorded (manual chapter 2, `review`)
  const note = `Read from ${url} on ${date}. A person confirms it with the brand owner. Then record the approval in this review: status ok, by (who) and at (the date). blazon approvals prints the fingerprint for value.`;
  const ctx: Ctx = {
    destDir,
    url,
    date,
    created,
    site,
    page,
    vars: customProperties(page.css),
    result,
    note,
    review: { status: 'needs-review', note },
    source: (locator: string, cssVar?: string): Json => ({ doc: `${site.sourceDoc('stylesheet')}, read ${date}`, locator, ...(cssVar && { cssVar }) }),
    mayChange: (file: string): boolean => {
      if (created.has(file)) return true;
      result.missing.push(`${file} already existed, so it was kept as it was`);
      return false;
    },
  };

  result.missing.push(...(page.notRead ?? []));
  applyColors(ctx, options.skipVars);
  const fonts = applyFonts(ctx);
  applyRadius(ctx);
  const logoFiles = await applyLogo(ctx);
  const { title, description, configLogo } = await applyConfig(ctx, logoFiles, fonts);
  removePlaceholderLogo(ctx, logoFiles, configLogo);
  writeIntro(ctx, title, description);
  pruneTokenDirectives(ctx);
  writeProof(ctx, options.skipVars);
  return result;
}
