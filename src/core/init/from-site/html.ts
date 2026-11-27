import type { SiteInput } from './types.js';

// What a page's HTML says about the brand: its name, from a meta tag, its web app manifest or its title.

/** A page title without its tagline: the text before the first ` | `, ` - `, ` : `, or spaced en or em dash. */
export function cleanTitle(raw: string): string {
  const text = raw
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.split(/ [|:–—-] /)[0]!.trim();
}

export const attrOf = (tag: string, name: string): string | undefined => {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return m ? (m[1] ?? m[2] ?? m[3]) : undefined;
};

/** The content of a `<meta>` tag with this property or name, e.g. og:site_name, application-name or description. */
export function metaContent(html: string, key: string): string | undefined {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const id = attrOf(tag, 'property') ?? attrOf(tag, 'name');
    if (id?.toLowerCase() === key) {
      const content = attrOf(tag, 'content')?.replace(/&amp;/g, '&').trim();
      if (content) return content;
    }
  }
  return undefined;
}

/** The brand's name: the site's own name when it states one, else the page title without its tagline. */
export function pageTitle(html: string): string | undefined {
  const named = metaContent(html, 'og:site_name') ?? metaContent(html, 'application-name');
  if (named) return named;
  const m = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const title = m ? cleanTitle(m[1]!) : '';
  return title || undefined;
}

/** The short name in the page's web app manifest (`<link rel="manifest">`), else its name without a tagline. */
export async function manifestName(html: string, site: SiteInput): Promise<string | undefined> {
  const tag = (html.match(/<link\b[^>]*>/gi) ?? []).find((l) => attrOf(l, 'rel')?.toLowerCase() === 'manifest');
  const href = tag && attrOf(tag, 'href');
  if (!href) return undefined;
  try {
    const where = site.resolve(href);
    if (!('ref' in where)) return undefined;
    const manifest = JSON.parse((await site.read(where.ref, 'manifest')).toString('utf8')) as { name?: unknown; short_name?: unknown };
    const short = typeof manifest.short_name === 'string' ? manifest.short_name.trim() : '';
    const name = typeof manifest.name === 'string' ? cleanTitle(manifest.name) : '';
    return short || name || undefined;
  } catch {
    return undefined;
  }
}
