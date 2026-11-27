import type { BrowserContext, Page, Route } from 'playwright-core';
import { networkOf, safeFetchTyped, type FetchKind } from '../../core/drift/fetch.js';
import { findingFor, type Finding } from './plugin.js';

// The plugins that draw in a browser share one rule: the browser never opens a connection to a remote host. A brand's CSS, font, SVG or
// image that names a remote address (a private one such as 169.254.169.254 or 10.0.0.1 included) would otherwise make the browser request
// it from the machine that runs blazon, with none of the address policy `blazon init --from` and `blazon drift` apply. Every request of
// such a page is checked here:
// - the plugin's own origins, `data:`, `blob:` and `about:` pass;
// - any other request is aborted when the plugin asked for `remote: 'none'` (the default: a plugin that needs nothing remote);
// - with `remote: 'policy'` an http(s) request for a stylesheet, a font or an image is fetched BY BLAZON through `safeFetchTyped`
//   (public addresses only, the address pinned, redirects checked again, 5 MB and 10 s, no cookies) and the page's request is answered
//   with those bytes. The browser never connects, so a name that is public when checked and private when connected (DNS rebinding) is
//   never reached. A stylesheet's own `@import` and `url()` requests come back through this handler, so they are checked the same way;
// - the rule for what a page may fetch is its resource type and the content type of the answer: `stylesheet` must answer text/css,
//   `font` a font type, `image` image/*. A page needs nothing else to be drawn, so a document, script, fetch, xhr, websocket, media or any
//   other request is aborted without a connection;
// - a page may make at most MAX_REMOTE_REQUESTS remote requests and take MAX_REMOTE_BYTES in all.
// What was refused or failed is remembered by origin (`takeBlocked`) so the plugin can say what it left out.

/** The most remote requests a page may make, and the most bytes it may take from them. */
export const MAX_REMOTE_REQUESTS = 40;
export const MAX_REMOTE_BYTES = 20 * 1024 * 1024;

/** The kind of read each resource type of a page may have; a type that is not here is never fetched. */
const KIND_OF: Readonly<Record<string, FetchKind>> = { stylesheet: 'stylesheet', font: 'font', image: 'image' };

/** The blocked origins and the first page and reason for each. Only the scheme and host are kept: a path or query string may carry a secret. */
const blocked = new Map<string, { page: string; reason: string }>();

export interface GuardOptions {
  /** The page as the finding names it: the file it makes, or what it draws */
  page: string;
  /** The origins the plugin serves itself, such as `http://127.0.0.1:4321`; requests to them pass */
  origins?: readonly string[];
  /** Answers a request to one of `origins`; without it the request goes on to the origin */
  serve?: (url: URL, route: Route) => Promise<void> | void;
  /** `'none'` aborts every remote request; `'policy'` lets blazon fetch a stylesheet, font or image under the address policy. Default `'none'`. */
  remote?: 'none' | 'policy';
  /**
   * Where blazon may connect for `remote: 'policy'`. A parameter for a test, never read from a request, an option or the environment, as
   * with `networkOf` in core/drift/fetch.ts: a value that is not a real network is the public one.
   */
  network?: unknown;
}

const LOCAL_SCHEMES = new Set(['data:', 'blob:', 'about:']);

/** The origin of an address as it is named in a finding, or its scheme when it has none. Never a path or a query. */
export function originOf(address: string): string {
  try {
    const url = new URL(address);
    return url.origin === 'null' ? url.protocol : url.origin;
  } catch {
    return 'an address that is not a URL';
  }
}

/** A message with every web address in it cut down to its origin, so a path or a query string is never printed. */
const scrub = (message: string): string => message.replace(/https?:\/\/[^\s)'"]+/g, (address) => originOf(address));

function remember(address: string, page: string, reason: string): void {
  const origin = originOf(address);
  if (!blocked.has(origin)) blocked.set(origin, { page, reason });
}

/** The route handler: pass what the plugin serves, fetch under the policy what it may, abort and remember the rest. */
export function guardHandler(options: GuardOptions): (route: Route) => Promise<void> | void {
  const allowed = new Set(options.origins ?? []);
  const network = networkOf(options.network);
  let requests = 0;
  let bytes = 0;
  let queue: Promise<void> = Promise.resolve();
  return async (route) => {
    const request = route.request();
    const address = request.url();
    let url: URL | undefined;
    try {
      url = new URL(address);
    } catch {
      url = undefined;
    }
    if (url && LOCAL_SCHEMES.has(url.protocol)) return route.continue();
    if (url && allowed.has(url.origin)) return options.serve ? options.serve(url, route) : route.continue();
    const refuse = (reason: string) => {
      remember(address, options.page, reason);
      return route.abort('blockedbyclient');
    };
    if (options.remote !== 'policy') return refuse('a page blazon draws for this plugin has no network');
    if (!url || (url.protocol !== 'http:' && url.protocol !== 'https:')) return refuse('only http and https addresses are read');
    const kind = KIND_OF[request.resourceType()];
    if (!kind) return refuse(`a ${request.resourceType()} request is not something a page needs to be drawn; only stylesheets, fonts and images are read`);
    // One remote read at a time, so the caps below are counted before the next read starts, not after several have begun
    const turn = queue;
    let done!: () => void;
    queue = new Promise<void>((resolve) => (done = resolve));
    await turn;
    try {
      if (requests >= MAX_REMOTE_REQUESTS) return await refuse(`the page made more than ${MAX_REMOTE_REQUESTS} remote requests`);
      if (bytes >= MAX_REMOTE_BYTES) return await refuse(`the page took more than ${MAX_REMOTE_BYTES / (1024 * 1024)} MB from remote addresses`);
      requests++;
      const got = await safeFetchTyped(address, kind, network);
      bytes += got.body.byteLength;
      // A font is a cross-origin read to the page, so the answer says any origin may read it, as a font host's own answer does
      return await route.fulfill({ status: 200, contentType: got.type, headers: { 'access-control-allow-origin': '*' }, body: got.body });
    } catch (error) {
      const message = scrub(error instanceof Error ? error.message : String(error));
      // blazon's own refusals say "refused"; anything else is a host that could not be reached (offline, no such name, no answer, an error status)
      return refuse(
        /^refused /.test(message) ? message.replace(/^refused [^:]*: /, '') : `the host could not be reached (${message.replace(/^could (not )?(fetch|read) [^:]*: /, '')})`,
      );
    } finally {
      done();
    }
  };
}

/** Puts the guard on a page or a context, before anything is loaded in it. */
export async function guardNetwork(target: Page | BrowserContext, options: GuardOptions): Promise<void> {
  await target.route('**/*', guardHandler(options));
}

/**
 * The findings for what was blocked since the last call, one per origin, and forgets them. A plugin runs once per process, so this is
 * the call that ends its build; a test that draws more than once calls it between runs.
 */
export function takeBlocked(plugin: string): Finding[] {
  const finding = findingFor(plugin);
  const found = [...blocked].map(([origin, { page, reason }]) =>
    finding(
      'network-blocked',
      'warning',
      page,
      `${origin} was not loaded while ${page} was drawn: ${reason}. A page blazon draws loads only what the plugin serves and what blazon itself fetches under the address policy of init --from. Put the file in the brand's own assets and name it there; a web font is a { "family", "file" } entry of the fonts config, which blazon embeds`,
    ),
  );
  blocked.clear();
  return found.sort((a, b) => (a.message < b.message ? -1 : a.message > b.message ? 1 : 0));
}
