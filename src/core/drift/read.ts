import fs from 'node:fs';
import path from 'node:path';

// The CSS `blazon drift` compares with: a local file, or the stylesheets a live page links.

export const MAX_STYLESHEETS = 20;
export const MAX_BYTES = 5 * 1024 * 1024;
export const TIMEOUT_MS = 10_000;

export interface CssSource {
  css: string;
  /** Where the text came from: the file, or each stylesheet URL that was read */
  sources: string[];
}

/** Why a fetch failed: Node's own message is "fetch failed", and the reason (a refused connection, a name that does not resolve, a bad certificate) is its cause. */
function reasonOf(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const cause = err instanceof Error ? err.cause : undefined;
  return cause instanceof Error && cause.message && cause.message !== message ? `${message}: ${cause.message}` : message;
}

/** The bytes of an http(s) address, within the time and size limits. */
export async function fetchBytes(url: string): Promise<Buffer> {
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'follow' });
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
    throw new Error(`could not fetch ${url}: ${timedOut ? `no answer in ${TIMEOUT_MS / 1000} s` : reasonOf(err)}`, { cause: err });
  }
  if (!res.ok) throw new Error(`could not fetch ${url}: ${res.status} ${res.statusText}`.trim());
  const chunks: Buffer[] = [];
  let bytes = 0;
  try {
    for await (const chunk of res.body ?? []) {
      bytes += chunk.byteLength;
      if (bytes > MAX_BYTES) throw new Error(`${url} is larger than 5 MB`);
      chunks.push(Buffer.from(chunk));
    }
  } catch (err) {
    if (err instanceof Error && err.message.endsWith('5 MB')) throw err;
    throw new Error(`could not read ${url}: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
  }
  return Buffer.concat(chunks);
}

export async function fetchText(url: string): Promise<string> {
  return (await fetchBytes(url)).toString('utf8');
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
export async function readCss(target: string): Promise<CssSource> {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(target)) {
    if (!/^https?:\/\//i.test(target)) throw new Error(`${target} is not an http(s) address or a file`);
    const page = await fetchText(target);
    const links = stylesheetLinks(page, target).slice(0, MAX_STYLESHEETS);
    const sheets = await Promise.all(links.map(fetchText));
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
export async function readPage(url: string): Promise<{ html: string; css: string; sources: string[] }> {
  if (!/^https?:\/\//i.test(url)) throw new Error(`${url} is not an http(s) address`);
  const html = await fetchText(url);
  const sources = stylesheetLinks(html, url).slice(0, MAX_STYLESHEETS);
  const sheets = await Promise.all(sources.map(fetchText));
  return { html, css: sheets.join('\n'), sources };
}
