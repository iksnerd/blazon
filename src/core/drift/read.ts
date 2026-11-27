import fs from 'node:fs';
import path from 'node:path';
import { MAX_BYTES, safeFetch, TIMEOUT_MS, type FetchKind, type Network } from './fetch.js';

// The CSS `blazon drift` compares with: a local file, or the stylesheets a live page links.

export const MAX_STYLESHEETS = 20;
/** Stylesheet reads in flight at once, and the bytes one page read may hold in all: with the 5 MB of a single read, 20 sheets could hold 100 MB */
export const MAX_CONCURRENT_SHEETS = 4;
export const MAX_PAGE_BYTES = 25 * 1024 * 1024;
export { MAX_BYTES, TIMEOUT_MS };

export interface CssSource {
  css: string;
  /** Where the text came from: the file, or each stylesheet URL that was read */
  sources: string[];
  /** Stylesheets that were left unread, and why */
  notRead?: string[];
}

/**
 * Reads stylesheets in order, at most `MAX_CONCURRENT_SHEETS` at a time and `MAX_PAGE_BYTES` in all. A read is started only when the bytes already
 * read, plus the most each read in flight may still bring (`MAX_BYTES`), leave room for it; when no read is in flight and the next one still has
 * no room, it and every later sheet are left unread and said so in `notRead`. The sheets read are a prefix of `links`, so what is kept does not
 * depend on which read finished first. A read that fails rejects, as it did when they were all started at once.
 */
export async function readSheets(links: string[], network?: Network): Promise<{ sheets: { source: string; css: string }[]; notRead: string[] }> {
  const texts: string[] = [];
  let next = 0;
  let inFlight = 0;
  let used = 0;
  let stopped = false;
  let waiting: (() => void)[] = [];
  const wake = () => {
    const list = waiting;
    waiting = [];
    for (const resume of list) resume();
  };
  const worker = async (): Promise<void> => {
    while (next < links.length && !stopped) {
      if (used + (inFlight + 1) * MAX_BYTES > MAX_PAGE_BYTES) {
        if (inFlight === 0) {
          stopped = true;
          wake();
          return;
        }
        await new Promise<void>((resume) => waiting.push(resume));
        continue;
      }
      const at = next++;
      inFlight++;
      try {
        const bytes = await fetchBytes(links[at]!, 'stylesheet', network);
        used += bytes.length;
        texts[at] = bytes.toString('utf8');
      } finally {
        inFlight--;
        wake();
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENT_SHEETS, links.length) }, worker));
  const sheets = links.slice(0, next).map((source, i) => ({ source, css: texts[i]! }));
  const left = links.length - next;
  return {
    sheets,
    notRead:
      left > 0
        ? [
            `${left} of the ${links.length} stylesheets (from ${links[next]}) were not read: a page read holds at most ${MAX_PAGE_BYTES / 1024 / 1024} MB of stylesheets, and ${sheets.length} were read`,
          ]
        : [],
  };
}

/** The bytes of an http(s) address, held to the fetch policy in fetch.ts: public addresses only, at most 5 redirects, 5 MB and 10 s, and the content type `kind` asks for. */
export async function fetchBytes(url: string, kind: FetchKind, network?: Network): Promise<Buffer> {
  return safeFetch(url, kind, network);
}

export async function fetchText(url: string, kind: FetchKind, network?: Network): Promise<string> {
  return (await fetchBytes(url, kind, network)).toString('utf8');
}

/** The `href` of every `<link rel="stylesheet">` in a page, as written, in order. */
export function stylesheetHrefs(html: string): string[] {
  const hrefs: string[] = [];
  for (const [tag] of html.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<link\b[^>]*>/gi)) {
    const attr = (name: string) => tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
    const rel = attr('rel');
    const href = attr('href');
    if (!rel || !href) continue;
    if (!(rel[1] ?? rel[2] ?? rel[3] ?? '').toLowerCase().split(/\s+/).includes('stylesheet')) continue;
    hrefs.push((href[1] ?? href[2] ?? href[3] ?? '').trim());
  }
  return hrefs;
}

/** The `href` of every `<link rel="stylesheet">` in a page, resolved against the page; only http(s) addresses are kept. */
export function stylesheetLinks(html: string, pageUrl: string): string[] {
  const urls: string[] = [];
  for (const href of stylesheetHrefs(html)) {
    try {
      const url = new URL(href, pageUrl);
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
    const { sheets, notRead } = await readSheets(links, network);
    return { css: sheets.map((sheet) => sheet.css).join('\n'), sources: sheets.map((sheet) => sheet.source), ...(notRead.length > 0 && { notRead }) };
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

/** A page and the CSS of the stylesheets it links (at most 20, read 4 at a time and 25 MB in all). Only http(s) addresses are read. */
export async function readPage(
  url: string,
  network?: Network,
): Promise<{ html: string; css: string; sources: string[]; sheets: { source: string; css: string }[]; notRead: string[] }> {
  if (!/^https?:\/\//i.test(url)) throw new Error(`${url} is not an http(s) address`);
  const html = await fetchText(url, 'page', network);
  const { sheets, notRead } = await readSheets(stylesheetLinks(html, url).slice(0, MAX_STYLESHEETS), network);
  return { html, css: sheets.map((sheet) => sheet.css).join('\n'), sources: sheets.map((sheet) => sheet.source), sheets, notRead };
}
