import fs from 'node:fs';
import path from 'node:path';
import { MAX_BYTES, safeFetch, TIMEOUT_MS, type FetchKind, type Network } from './fetch.js';

// The CSS `blazon drift` compares with: a local file, or the stylesheets a live page links.

export const MAX_STYLESHEETS = 20;
export { MAX_BYTES, TIMEOUT_MS };

export interface CssSource {
  css: string;
  /** Where the text came from: the file, or each stylesheet URL that was read */
  sources: string[];
}

/** The bytes of an http(s) address, held to the fetch policy in fetch.ts: public addresses only, at most 5 redirects, 5 MB and 10 s, and the content type `kind` asks for. */
export async function fetchBytes(url: string, kind: FetchKind, network?: Network): Promise<Buffer> {
  return safeFetch(url, kind, network);
}

export async function fetchText(url: string, kind: FetchKind, network?: Network): Promise<string> {
  return (await fetchBytes(url, kind, network)).toString('utf8');
}

/** The `href` of every `<link rel="stylesheet">` in a page, resolved against the page; only http(s) addresses are kept. */
export function stylesheetLinks(html: string, pageUrl: string): string[] {
  const urls: string[] = [];
  for (const [tag] of html.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<link\b[^>]*>/gi)) {
    const attr = (name: string) => tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
    const rel = attr('rel');
    const href = attr('href');
    if (!rel || !href) continue;
    if (!(rel[1] ?? rel[2] ?? rel[3] ?? '').toLowerCase().split(/\s+/).includes('stylesheet')) continue;
    try {
      const url = new URL((href[1] ?? href[2] ?? href[3] ?? '').trim(), pageUrl);
      if ((url.protocol === 'http:' || url.protocol === 'https:') && !urls.includes(url.href)) urls.push(url.href);
    } catch {
      // not a URL: skipped
    }
  }
  return urls;
}

/** The CSS to compare with: a page's stylesheets when the target is an http(s) URL, else the text of the file. */
export async function readCss(target: string, network?: Network): Promise<CssSource> {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(target)) {
    if (!/^https?:\/\//i.test(target)) throw new Error(`${target} is not an http(s) address or a file`);
    const page = await fetchText(target, 'page', network);
    const links = stylesheetLinks(page, target).slice(0, MAX_STYLESHEETS);
    const sheets = await Promise.all(links.map((link) => fetchText(link, 'stylesheet', network)));
    return { css: sheets.join('\n'), sources: links };
  }
  const file = path.resolve(target);
  let css: string;
  try {
    if (fs.statSync(file).size > MAX_BYTES) throw new Error(`${file} is larger than 5 MB`);
    css = fs.readFileSync(file, 'utf8');
  } catch (err) {
    throw new Error(err instanceof Error && err.message.endsWith('5 MB') ? err.message : `could not read ${file}: ${err instanceof Error ? err.message : String(err)}`, {
      cause: err,
    });
  }
  return { css, sources: [file] };
}

/** A page and the CSS of the stylesheets it links (at most 20). Only http(s) addresses are read. */
export async function readPage(url: string, network?: Network): Promise<{ html: string; css: string; sources: string[] }> {
  if (!/^https?:\/\//i.test(url)) throw new Error(`${url} is not an http(s) address`);
  const html = await fetchText(url, 'page', network);
  const sources = stylesheetLinks(html, url).slice(0, MAX_STYLESHEETS);
  const sheets = await Promise.all(sources.map((link) => fetchText(link, 'stylesheet', network)));
  return { html, css: sheets.join('\n'), sources };
}
