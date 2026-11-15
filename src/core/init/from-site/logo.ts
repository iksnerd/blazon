import path from 'node:path';
import { attrOf } from './html.js';

// The logo of a site: an SVG in the page header, else the site icon.

export type LogoFound = { kind: 'inline'; svg: string; locator: string } | { kind: 'url'; url: string; locator: string };

export function headerLogo(html: string, pageUrl: string): LogoFound | undefined {
  const header = html.replace(/<!--[\s\S]*?-->/g, '').match(/<header\b[^>]*>([\s\S]*?)<\/header>/i)?.[1];
  if (!header) return undefined;
  const homes: string[] = [];
  for (const m of header.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = attrOf(`<a${m[1]}>`, 'href');
    if (href === undefined) continue;
    try {
      const url = new URL(href.trim(), pageUrl);
      if (url.origin === new URL(pageUrl).origin && url.pathname === '/') homes.push(m[2]!);
    } catch {
      // not a URL: not the home link
    }
  }
  const svgIn = (text: string) => text.match(/<svg\b[\s\S]*?<\/svg>/i)?.[0];
  const imgIn = (text: string): string | undefined => {
    for (const m of text.matchAll(/<img\b[^>]*>/gi)) {
      const src = attrOf(m[0], 'src');
      if (src && /\.svg(?:[?#]|$)/i.test(src)) {
        try {
          const url = new URL(src.trim(), pageUrl);
          if (url.protocol === 'http:' || url.protocol === 'https:') return url.href;
        } catch {
          // skipped
        }
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

export function favicon(html: string, pageUrl: string): Favicon | undefined {
  const found: (Favicon & { apple: boolean })[] = [];
  for (const [tag] of html.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<link\b[^>]*>/gi)) {
    const rel = (attrOf(tag, 'rel') ?? '').toLowerCase().split(/\s+/);
    const apple = rel.includes('apple-touch-icon') || rel.includes('apple-touch-icon-precomposed');
    if (!apple && !rel.includes('icon')) continue;
    const href = attrOf(tag, 'href');
    if (!href) continue;
    try {
      const url = new URL(href.trim(), pageUrl);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') continue;
      const ext = path.extname(url.pathname).toLowerCase() || (attrOf(tag, 'type') === 'image/svg+xml' ? '.svg' : '.png');
      found.push({ url: url.href, svg: ext === '.svg', ext, apple, locator: `link rel="${rel.join(' ')}"` });
    } catch {
      // skipped
    }
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
