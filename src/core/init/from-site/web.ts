import type { Network } from '../../drift/fetch.js';
import { fetchBytes, readPage } from '../../drift/read.js';
import { logoName } from './logo.js';
import type { SiteInput } from './types.js';

/** A live site as `applyFromSite` reads it: the page at `url` and what it links, fetched under the policy in drift/fetch.ts. */
export function webSite(url: string, network?: Network): SiteInput {
  return {
    label: url,
    offline: false,
    logoName: logoName(url),
    fallbackName: new URL(url).hostname.replace(/^www\./, ''),
    page: () => readPage(url, network),
    resolve: (href) => {
      try {
        const target = new URL(href.trim(), url);
        if (target.protocol === 'http:' || target.protocol === 'https:') return { ref: target.href };
        return { reason: `(${href.trim()}) is not an http(s) address` };
      } catch {
        return { reason: `(${href.trim()}) is not a URL` };
      }
    },
    isHome: (href) => {
      try {
        const target = new URL(href.trim(), url);
        return target.origin === new URL(url).origin && target.pathname === '/';
      } catch {
        return false;
      }
    },
    read: (ref, kind) => fetchBytes(ref, kind, network),
    sourceDoc: (what) => `${url} ${what}`,
  };
}
