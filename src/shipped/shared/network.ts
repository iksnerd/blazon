import type { BrowserContext, Page, Route } from 'playwright-core';
import { findingFor, type Finding } from './plugin.js';

// The plugins that draw in a browser share one rule: a page loads only what the plugin itself serves. A brand's CSS, font, SVG or image
// that names a remote address (a private one such as 169.254.169.254 or 10.0.0.1 included) would otherwise make the browser request it
// from the machine that runs blazon, with none of the address policy `blazon drift` applies. So every request of such a page is checked
// here: the plugin's own origins, `data:`, `blob:` and `about:` pass, and the rest is aborted and remembered by origin, so the plugin can
// say what it left out (`takeBlocked`).

/** The blocked origins and the first page that asked for each. Only the scheme and host are kept: a path or query string may carry a secret. */
const blocked = new Map<string, string>();

export interface GuardOptions {
  /** The page as the finding names it: the file it makes, or what it draws */
  page: string;
  /** The origins the plugin serves itself, such as `http://127.0.0.1:4321`; requests to them pass */
  origins?: readonly string[];
  /** Answers a request to one of `origins`; without it the request goes on to the origin */
  serve?: (url: URL, route: Route) => Promise<void> | void;
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

/** The route handler: pass what the plugin serves, abort and remember the rest. */
export function guardHandler(options: GuardOptions): (route: Route) => Promise<void> | void {
  const allowed = new Set(options.origins ?? []);
  return (route) => {
    const address = route.request().url();
    let url: URL | undefined;
    try {
      url = new URL(address);
    } catch {
      url = undefined;
    }
    if (url && LOCAL_SCHEMES.has(url.protocol)) return route.continue();
    if (url && allowed.has(url.origin)) return options.serve ? options.serve(url, route) : route.continue();
    const origin = originOf(address);
    if (!blocked.has(origin)) blocked.set(origin, options.page);
    return route.abort('blockedbyclient');
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
  const found = [...blocked].map(([origin, page]) =>
    finding(
      'network-blocked',
      'warning',
      page,
      `${origin} was asked for while ${page} was drawn and was not loaded: a page blazon draws has no network. Put the file in the brand's own assets and name it there; a web font is a { "family", "file" } entry of the fonts config, which blazon embeds`,
    ),
  );
  blocked.clear();
  return found.sort((a, b) => (a.message < b.message ? -1 : a.message > b.message ? 1 : 0));
}
