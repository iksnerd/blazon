import { customProperties } from '../../drift/compare.js';
import { pickColors } from './colors.js';
import { googleFontsUrl } from '../shared/google-fonts.js';
import { fontOf } from './fonts.js';
import { manifestName, metaContent, pageTitle } from './html.js';
import { favicon, headerLogo } from './logo.js';
import type { SiteFindings } from './types.js';
import type { Network } from '../../drift/fetch.js';
import type { SiteInput } from './types.js';
import { webSite } from './web.js';

/** Reads the site and says what `applyFromSite` would use, writing nothing. Throws when the page cannot be read. */
export async function inspectSite(from: string | SiteInput, network?: Network): Promise<SiteFindings> {
  const site = typeof from === 'string' ? webSite(from, network) : from;
  const page = await site.page();
  const vars = customProperties(page.css);
  const picks = pickColors(vars);
  const body = fontOf(page.css, vars, /^(body|html)$/);
  const heading = fontOf(page.css, vars, /^h[1-6]$/);
  const fonts: SiteFindings['fonts'] = [];
  if (body) fonts.push({ family: body.family, role: 'body', stylesheet: Boolean(googleFontsUrl(body.family)) });
  if (heading && heading.family.toLowerCase() !== body?.family.toLowerCase())
    fonts.push({ family: heading.family, role: 'headings', stylesheet: Boolean(googleFontsUrl(heading.family)) });
  const header = headerLogo(page.html, site);
  const icon = favicon(page.html, site);
  const logo = header
    ? `${header.kind === 'inline' ? 'an inline SVG' : `an SVG image (${header.url})`} in the page header`
    : icon
      ? `the site icon (${icon.url})${icon.svg ? '' : `, a ${icon.ext} image, not an SVG logo`}`
      : undefined;
  const name = metaContent(page.html, 'og:site_name') ?? metaContent(page.html, 'application-name') ?? (await manifestName(page.html, site)) ?? pageTitle(page.html);
  const missing: string[] = [];
  missing.push(...(page.notRead ?? []));
  if (picks.length === 0) missing.push('no brand colors: no custom property named brand, primary, secondary, accent, background, foreground or surface holds an opaque CSS color');
  if (fonts.length === 0) missing.push('no font: no body or heading rule names a font-family');
  if (!logo) missing.push('no logo: no SVG in the header and no icon link on the page');
  if (!name) missing.push('no site name: the brand name stays as you typed it');
  return {
    page,
    name,
    description: metaContent(page.html, 'description'),
    themeColor: metaContent(page.html, 'theme-color'),
    colors: picks.map((p) => ({ cssVar: p.cssVar, hex: p.hex })),
    fonts,
    logo,
    missing,
  };
}
