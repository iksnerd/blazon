import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import type { Readable } from 'node:stream';
import zlib from 'node:zlib';

// How blazon reads a public web page (`init --from`, `drift <url>`). The address is a stranger's, so the fetch is held to a policy:
// - only http and https, and no user name or password in the address;
// - the host is resolved first and every address it gives must be public: loopback, private (RFC 1918), shared (100.64/10), link-local
//   (169.254/16, with the 169.254.169.254 metadata address), unique-local and link-local IPv6, IPv4-mapped IPv6, multicast and the reserved
//   ranges are refused, and so is the name `localhost`;
// - the connection goes to the address that was checked: the request's `lookup` returns it, so the name is not resolved a second time and a
//   DNS answer that changes between the check and the connection (rebinding) is never used;
// - a redirect is a new request held to the same checks, at most 5 of them;
// - the body is at most 5 MB (after decompression) and the whole read, redirects included, at most 10 s;
// - the content type must be what was asked for: an HTML page, a stylesheet, a manifest or an image;
// - no cookies, no credentials and no scripts: the bytes are read as text or as a file, never run.

export const MAX_BYTES = 5 * 1024 * 1024;
export const TIMEOUT_MS = 10_000;
export const MAX_REDIRECTS = 5;

export interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}

/**
 * Where a fetch may connect. The default resolves with the system resolver and allows public addresses only. It is a parameter of the
 * functions that fetch, never an option of the command line or an environment variable: a test passes one that allows the loopback server it
 * started, or a resolver stub.
 */
export interface Network {
  /** Every address a host name resolves to */
  resolve: (host: string) => Promise<ResolvedAddress[]>;
  /** Why an address may not be connected to, in words; undefined when it may */
  refused: (address: string) => string | undefined;
}

export type FetchKind = 'page' | 'stylesheet' | 'manifest' | 'image';

const ACCEPT: Record<FetchKind, { types: (type: string) => boolean; what: string; header: string }> = {
  page: { types: (t) => t === 'text/html' || t === 'application/xhtml+xml', what: 'an HTML page', header: 'text/html,application/xhtml+xml' },
  stylesheet: { types: (t) => t === 'text/css', what: 'a stylesheet (text/css)', header: 'text/css' },
  manifest: {
    types: (t) => t === 'application/manifest+json' || t === 'application/json',
    what: 'a web app manifest (JSON)',
    header: 'application/manifest+json,application/json',
  },
  image: { types: (t) => t.startsWith('image/'), what: 'an image', header: 'image/*' },
};

function ipv4Parts(text: string): number[] | undefined {
  if (net.isIPv4(text)) return text.split('.').map(Number);
  return undefined;
}

/** The eight 16-bit groups of an IPv6 address, with a trailing dotted IPv4 part read as two groups. */
function ipv6Groups(text: string): number[] | undefined {
  const address = text.replace(/%.*$/, '');
  if (!net.isIPv6(address)) return undefined;
  let head = address;
  const tail: number[] = [];
  const dotted = address.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    const v4 = ipv4Parts(dotted[2]!)!;
    tail.push((v4[0]! << 8) | v4[1]!, (v4[2]! << 8) | v4[3]!);
    head = dotted[1]!.endsWith('::') ? dotted[1]! : dotted[1]!.slice(0, -1);
  }
  const [left = '', right] = head.split('::');
  const groups = (part: string) => (part === '' ? [] : part.split(':').map((g) => parseInt(g, 16)));
  const l = groups(left);
  const r = right === undefined ? [] : groups(right);
  const fill = 8 - tail.length - l.length - r.length;
  if (right === undefined && fill !== 0) return undefined;
  return [...l, ...Array<number>(Math.max(0, fill)).fill(0), ...r, ...tail];
}

const inV4 = (p: number[], base: number[], bits: number): boolean => {
  const value = (q: number[]) => ((q[0]! << 24) | (q[1]! << 16) | (q[2]! << 8) | q[3]!) >>> 0;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (value(p) & mask) === (value(base) & mask);
};

const V4_REFUSED: [number[], number, string][] = [
  [[169, 254, 169, 254], 32, 'the cloud metadata address'],
  [[0, 0, 0, 0], 8, 'a "this network" address'],
  [[10, 0, 0, 0], 8, 'a private address (RFC 1918)'],
  [[100, 64, 0, 0], 10, 'a shared address (carrier-grade NAT, RFC 6598)'],
  [[127, 0, 0, 0], 8, 'a loopback address'],
  [[169, 254, 0, 0], 16, 'a link-local address'],
  [[172, 16, 0, 0], 12, 'a private address (RFC 1918)'],
  [[192, 0, 0, 0], 24, 'a reserved address (IETF protocol assignments)'],
  [[192, 168, 0, 0], 16, 'a private address (RFC 1918)'],
  [[198, 18, 0, 0], 15, 'a reserved address (benchmarking)'],
  [[224, 0, 0, 0], 4, 'a multicast address'],
  [[240, 0, 0, 0], 4, 'a reserved address'],
];

function refusedV4(p: number[]): string | undefined {
  return V4_REFUSED.find(([base, bits]) => inV4(p, base, bits))?.[2];
}

/** Why blazon will not connect to an address: undefined for a public one. */
export function refusedAddress(address: string): string | undefined {
  const v4 = ipv4Parts(address);
  if (v4) return refusedV4(v4);
  const g = ipv6Groups(address);
  if (!g) return 'not an IP address';
  const embedded = (hi: number, lo: number) => [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff];
  if (g.every((x) => x === 0)) return 'the unspecified address';
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return 'a loopback address (::1)';
  // ::ffff:a.b.c.d reaches IPv4 on a dual-stack socket, and ::a.b.c.d is the old compatible form: a public name has no reason to give either
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return 'an IPv4-mapped IPv6 address';
  if (g.slice(0, 6).every((x) => x === 0)) return 'an IPv4-compatible IPv6 address';
  // NAT64 (64:ff9b::/96) and 6to4 (2002::/16) carry an IPv4 address: it is held to the IPv4 rules
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) {
    const inner = refusedV4(embedded(g[6]!, g[7]!));
    return inner && `a NAT64 address of ${inner}`;
  }
  if (g[0] === 0x2002) {
    const inner = refusedV4(embedded(g[1]!, g[2]!));
    return inner && `a 6to4 address of ${inner}`;
  }
  if ((g[0]! & 0xfe00) === 0xfc00) return 'a unique-local IPv6 address (fc00::/7)';
  if ((g[0]! & 0xffc0) === 0xfe80) return 'a link-local IPv6 address (fe80::/10)';
  if ((g[0]! & 0xffc0) === 0xfec0) return 'a site-local IPv6 address (fec0::/10)';
  if ((g[0]! & 0xff00) === 0xff00) return 'a multicast IPv6 address';
  if (g[0] === 0x100 && g.slice(1, 4).every((x) => x === 0)) return 'a discard-only IPv6 address (100::/64)';
  return undefined;
}

async function systemResolve(host: string): Promise<ResolvedAddress[]> {
  const found = await dns.promises.lookup(host, { all: true, verbatim: true });
  return found.map((a) => ({ address: a.address, family: a.family === 6 ? 6 : 4 }));
}

/** The policy every command uses: the system resolver, public addresses only. */
export const PUBLIC_NETWORK: Network = { resolve: systemResolve, refused: refusedAddress };

/** The network to use: the one given when it is a real one (both functions), else the public one. A value from a config or a flag never is. */
export const networkOf = (given: unknown): Network =>
  typeof given === 'object' && given !== null && typeof (given as Network).resolve === 'function' && typeof (given as Network).refused === 'function'
    ? (given as Network)
    : PUBLIC_NETWORK;

/** A fetch blazon would not make, with the reason. */
export class FetchRefused extends Error {
  override name = 'FetchRefused';
}

/** The address to connect to for a URL, checked: a refusal names the host, the address and the reason. */
async function checkedAddress(url: URL, network: Network, signal: AbortSignal): Promise<ResolvedAddress> {
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (/^localhost\.?$/i.test(host) || /\.localhost\.?$/i.test(host)) throw new FetchRefused(`${host} is the local machine; blazon reads only public addresses`);
  const literal = net.isIP(host);
  if (literal) {
    const reason = network.refused(host);
    if (reason) throw new FetchRefused(`${host} is ${reason}; blazon reads only public addresses`);
    return { address: host, family: literal === 6 ? 6 : 4 };
  }
  const abort = new Promise<never>((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  let addresses: ResolvedAddress[];
  try {
    addresses = await Promise.race([network.resolve(host), abort]);
  } catch (err) {
    if (signal.aborted) throw err;
    throw new Error(`${host} does not resolve: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
  }
  if (addresses.length === 0) throw new Error(`${host} does not resolve to any address`);
  // Every address must be public: an answer that mixes a public and a private address is refused, whichever one a connection would take
  for (const a of addresses) {
    const reason = network.refused(a.address);
    if (reason) throw new FetchRefused(`${host} resolves to ${a.address}, ${reason}; blazon reads only public addresses`);
  }
  return addresses[0]!;
}

interface Hop {
  status: number;
  statusText: string;
  headers: http.IncomingHttpHeaders;
  body: Readable;
}

function request(url: URL, pinned: ResolvedAddress, kind: FetchKind, signal: AbortSignal): Promise<Hop> {
  const get = url.protocol === 'https:' ? https.get : http.get;
  // The name is resolved once, above. The socket takes the checked address from this lookup, whatever the resolver would say now.
  const lookup: net.LookupFunction = (_host, options, callback) => {
    if ((options as dns.LookupOptions).all) (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, [pinned]);
    else callback(null, pinned.address, pinned.family);
  };
  return new Promise((resolve, reject) => {
    const req = get(
      url,
      {
        agent: false,
        lookup,
        signal,
        headers: { accept: ACCEPT[kind].header, 'accept-encoding': 'gzip, deflate, br', 'user-agent': 'blazon' },
      },
      (res) => resolve({ status: res.statusCode ?? 0, statusText: res.statusMessage ?? '', headers: res.headers, body: res }),
    );
    req.on('error', reject);
  });
}

function decoded(hop: Hop, label: string): Readable {
  const encoding = String(hop.headers['content-encoding'] ?? 'identity')
    .toLowerCase()
    .trim();
  if (encoding === 'identity' || encoding === '') return hop.body;
  if (encoding === 'gzip' || encoding === 'x-gzip') return hop.body.pipe(zlib.createGunzip());
  if (encoding === 'deflate') return hop.body.pipe(zlib.createInflate());
  if (encoding === 'br') return hop.body.pipe(zlib.createBrotliDecompress());
  hop.body.resume();
  throw new FetchRefused(`refused ${label}: the server sent it in an encoding blazon does not read (${encoding})`);
}

/** Why a fetch failed: Node's own message, with its cause when that says more. */
function reasonOf(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const cause = err instanceof Error ? err.cause : undefined;
  return cause instanceof Error && cause.message && cause.message !== message ? `${message}: ${cause.message}` : message;
}

/**
 * The bytes at an http(s) address, held to the policy above. `kind` says what the address must be (its content type), `network` where it may
 * connect (the public network unless a test passes another).
 */
export async function safeFetch(address: string, kind: FetchKind, network: Network = PUBLIC_NETWORK): Promise<Buffer> {
  const policy = networkOf(network);
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    throw new FetchRefused(`refused ${address}: it is not a web address`);
  }
  const first = url.href;
  const label = (u: URL) => (u.href === first ? u.href : `${u.href} (a redirect from ${first})`);
  const timedOut = (err: unknown) => signal.aborted || (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError'));
  for (let redirects = 0; ; redirects++) {
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new FetchRefused(`refused ${label(url)}: blazon reads only http and https addresses`);
    if (url.username || url.password) throw new FetchRefused(`refused ${label(url)}: the address holds a user name or password, and blazon sends no credentials`);
    let hop: Hop;
    try {
      const pinned = await checkedAddress(url, policy, signal);
      hop = await request(url, pinned, kind, signal);
    } catch (err) {
      if (err instanceof FetchRefused) throw new FetchRefused(`refused ${label(url)}: ${err.message}`, { cause: err });
      throw new Error(`could not fetch ${label(url)}: ${timedOut(err) ? `no answer in ${TIMEOUT_MS / 1000} s` : reasonOf(err)}`, { cause: err });
    }
    const location = hop.headers.location;
    if (hop.status >= 300 && hop.status < 400 && location) {
      hop.body.resume();
      if (redirects >= MAX_REDIRECTS) throw new FetchRefused(`refused ${first}: more than ${MAX_REDIRECTS} redirects`);
      try {
        url = new URL(location, url);
      } catch {
        throw new FetchRefused(`refused ${label(url)}: it redirects to "${location}", which is not a web address`);
      }
      continue;
    }
    if (hop.status < 200 || hop.status >= 300) {
      hop.body.resume();
      throw new Error(`could not fetch ${label(url)}: ${hop.status} ${hop.statusText}`.trim());
    }
    const type = String(hop.headers['content-type'] ?? '')
      .split(';')[0]!
      .trim()
      .toLowerCase();
    if (!ACCEPT[kind].types(type)) {
      hop.body.resume();
      throw new FetchRefused(`refused ${label(url)}: blazon wanted ${ACCEPT[kind].what}, and the server ${type ? `says it is ${type}` : 'sent no content type'}`);
    }
    if (Number(hop.headers['content-length'] ?? 0) > MAX_BYTES) {
      hop.body.destroy();
      throw new FetchRefused(`${label(url)} is larger than 5 MB`);
    }
    const body = decoded(hop, label(url));
    const chunks: Buffer[] = [];
    let bytes = 0;
    try {
      for await (const chunk of body as AsyncIterable<Buffer>) {
        bytes += chunk.byteLength;
        if (bytes > MAX_BYTES) {
          hop.body.destroy();
          throw new FetchRefused(`${label(url)} is larger than 5 MB`);
        }
        chunks.push(Buffer.from(chunk));
      }
    } catch (err) {
      if (err instanceof FetchRefused) throw err;
      throw new Error(`could not read ${label(url)}: ${timedOut(err) ? `no answer in ${TIMEOUT_MS / 1000} s` : reasonOf(err)}`, { cause: err });
    }
    return Buffer.concat(chunks);
  }
}
