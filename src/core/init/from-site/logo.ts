import path from 'node:path';
import { attrOf } from './html.js';
import type { SiteInput } from './types.js';

// The logo of a site: an SVG in the page header, else the site icon.

/** An inline SVG, or the reference (`url`: a URL, or a path in a saved folder) of an SVG image. */
export type LogoFound = { kind: 'inline'; svg: string; locator: string } | { kind: 'url'; url: string; locator: string };

export function headerLogo(html: string, site: SiteInput): LogoFound | undefined {
  const header = html.replace(/<!--[\s\S]*?-->/g, '').match(/<header\b[^>]*>([\s\S]*?)<\/header>/i)?.[1];
  if (!header) return undefined;
  const homes: string[] = [];
  for (const m of header.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = attrOf(`<a${m[1]}>`, 'href');
    if (href !== undefined && site.isHome(href)) homes.push(m[2]!);
  }
  const svgIn = (text: string) => text.match(/<svg\b[\s\S]*?<\/svg>/i)?.[0];
  const imgIn = (text: string): string | undefined => {
    for (const m of text.matchAll(/<img\b[^>]*>/gi)) {
      const src = attrOf(m[0], 'src');
      if (src && /\.svg(?:[?#]|$)/i.test(src)) {
        const where = site.resolve(src);
        if ('ref' in where) return where.ref;
      }
    }
    return undefined;
  };
  for (const home of homes) {
    const svg = svgIn(home);
    if (svg) return { kind: 'inline', svg, locator: 'header a[href="/"] svg' };
  }
  for (const home of homes) {
    const url = imgIn(home);
    if (url) return { kind: 'url', url, locator: 'header a[href="/"] img' };
  }
  const svg = svgIn(header);
  if (svg) return { kind: 'inline', svg, locator: 'header svg' };
  const url = imgIn(header);
  return url ? { kind: 'url', url, locator: 'header img' } : undefined;
}

export interface Favicon {
  url: string;
  svg: boolean;
  ext: string;
  locator: string;
}

export function favicon(html: string, site: SiteInput): Favicon | undefined {
  const found: (Favicon & { apple: boolean })[] = [];
  for (const [tag] of html.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<link\b[^>]*>/gi)) {
    const rel = (attrOf(tag, 'rel') ?? '').toLowerCase().split(/\s+/);
    const apple = rel.includes('apple-touch-icon') || rel.includes('apple-touch-icon-precomposed');
    if (!apple && !rel.includes('icon')) continue;
    const href = attrOf(tag, 'href');
    if (!href) continue;
    const where = site.resolve(href);
    if (!('ref' in where)) continue;
    const ext = path.extname(where.ref.replace(/[?#].*$/, '')).toLowerCase() || (attrOf(tag, 'type') === 'image/svg+xml' ? '.svg' : '.png');
    found.push({ url: where.ref, svg: ext === '.svg', ext, apple, locator: `link rel="${rel.join(' ')}"` });
  }
  return found.find((f) => f.svg) ?? found.find((f) => f.apple) ?? found[0];
}

/** The name logo files get: the first label of the site's host, or `site` for an address. */
export function logoName(url: string): string {
  const host = new URL(url).hostname.replace(/^www\./, '');
  if (/^[\d.]+$/.test(host) || host.includes(':') || host.startsWith('[')) return 'site';
  return (
    host
      .split('.')[0]!
      .replace(/[^a-z0-9-]/gi, '-')
      .toLowerCase() || 'site'
  );
}
