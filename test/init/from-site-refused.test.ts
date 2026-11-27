import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { runInit } from '../../src/cli/commands/init.js';
import { PUBLIC_NETWORK } from '../../src/core/drift/fetch.js';
import { tempDir } from '../support/project';
import { TEST_LOOPBACK } from '../support/network.js';

// `blazon init --from <url>` reads the page and its stylesheets before it copies anything. A page that cannot be read (the fetch policy
// refuses it, the server answers with an error, or nothing answers) leaves nothing behind: no folder, no starter, exit 2. What can be
// missing once the page is read (no colors, a logo that does not load) is a note, and init carries on as before.

const OK_PAGE = '<html><head><title>Acme</title><link rel="stylesheet" href="/site.css"></head><body><header><a href="/"><img src="/gone.svg"></a></header></body></html>';

let server: http.Server;
let base: string;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const html = (body: string) => void res.setHeader('content-type', 'text/html').end(body);
    if (req.url === '/') return html(OK_PAGE);
    if (req.url === '/site.css') return void res.setHeader('content-type', 'text/css').end(':root { --brand-primary: #2563eb; }');
    if (req.url === '/bad-sheet') return html('<html><head><link rel="stylesheet" href="/gone.css"></head><body></body></html>');
    if (req.url === '/plain') return void res.setHeader('content-type', 'text/plain').end('not a page');
    if (req.url === '/big') {
      res.writeHead(200, { 'content-type': 'text/html', 'content-length': String(6 * 1024 * 1024) });
      return void res.write('<html>');
    }
    if (req.url === '/cut') {
      res.writeHead(200, { 'content-type': 'text/html', 'content-length': '1000' });
      res.write('<html><head>');
      return void setTimeout(() => res.socket?.destroy(), 20);
    }
    if (req.url === '/hang') return;
    if (req.url === '/loop') return void res.writeHead(302, { location: '/loop' }).end();
    if (req.url === '/ftp') return void res.writeHead(302, { location: 'ftp://acme.test/' }).end();
    res.statusCode = 404;
    res.end('not found');
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => {
  server.closeAllConnections();
  return new Promise<void>((done) => server.close(() => done()));
});
afterEach(() => vi.restoreAllMocks());

async function init(dir: string, from: string, network = TEST_LOOPBACK) {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const failures: string[] = [];
  const code = await runInit(dir, { from, network, failure: (f) => failures.push(`${f.code}: ${f.message}`) });
  const err = vi.mocked(console.error).mock.calls.flat().join('\n');
  const out = vi.mocked(console.log).mock.calls.flat().join('\n');
  vi.restoreAllMocks();
  return { code, err, out, failures };
}

const REFUSALS: [string, () => string, RegExp, typeof TEST_LOOPBACK?][] = [
  ['a private address', () => 'http://127.0.0.1:1/', /127\.0\.0\.1 is a loopback address; blazon reads only public addresses/, PUBLIC_NETWORK],
  ['a scheme blazon does not read, after a redirect', () => `${base}/ftp`, /blazon reads only http and https addresses/],
  ['too many redirects', () => `${base}/loop`, /more than 5 redirects/],
  ['a content type that is not a page', () => `${base}/plain`, /wanted an HTML page, and the server says it is text\/plain/],
  ['a page over the size limit', () => `${base}/big`, /larger than 5 MB/],
  ['a body that ends early', () => `${base}/cut`, /the connection closed before the whole body arrived/],
  ['the time limit', () => `${base}/hang`, /no answer in 0\.3 s/, { ...TEST_LOOPBACK, timeoutMs: 300 }],
  ['a page the server does not have', () => `${base}/missing`, /404 Not Found/],
  ['a stylesheet of the page the server does not have', () => `${base}/bad-sheet`, /gone\.css: 404 Not Found/],
  ['nothing listening', () => 'http://127.0.0.1:1/', /could not fetch http:\/\/127\.0\.0\.1:1\/: .*ECONNREFUSED/],
];

describe('blazon init --from, when the page cannot be read', () => {
  for (const [what, url, reason, network] of REFUSALS) {
    it(`writes nothing and exits 2 for ${what}`, async () => {
      const dir = path.join(tempDir(), 'acme');
      const { code, err, out, failures } = await init(dir, url(), network);
      expect(code).toBe(2);
      expect(err).toMatch(reason);
      expect(err).toMatch(/Nothing was written/);
      expect(err).not.toMatch(/starter was copied/);
      expect(out).not.toMatch(/Created/);
      expect(failures).toEqual([expect.stringMatching(/^site-unreadable: /)]);
      expect(fs.existsSync(dir)).toBe(false);
    });
  }

  it('leaves an existing empty folder empty', async () => {
    const dir = tempDir();
    const { code } = await init(dir, 'http://127.0.0.1:1/', PUBLIC_NETWORK);
    expect(code).toBe(2);
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it('leaves a folder that has files untouched, with the same error', async () => {
    const empty = await init(path.join(tempDir(), 'acme'), 'http://127.0.0.1:1/', PUBLIC_NETWORK);
    const dir = tempDir();
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'Acme notes\n');
    const { code, err } = await init(dir, 'http://127.0.0.1:1/', PUBLIC_NETWORK);
    expect(code).toBe(2);
    expect(err).toBe(empty.err);
    expect(fs.readdirSync(dir)).toEqual(['notes.txt']);
    expect(fs.readFileSync(path.join(dir, 'notes.txt'), 'utf8')).toBe('Acme notes\n');
  });
});

describe('blazon init --from, when the page is read but a part of it is not', () => {
  it('keeps going with the starter and a note when the header logo does not load', async () => {
    const dir = path.join(tempDir(), 'acme');
    const { code, out } = await init(dir, `${base}/`);
    expect(code).toBe(0);
    expect(out).toMatch(/the header logo could not be read: could not fetch .*gone\.svg: 404 Not Found/);
    expect(fs.existsSync(path.join(dir, 'assets/logos/blazon-graphite.svg'))).toBe(true);
    expect(fs.readFileSync(path.join(dir, 'tokens/colors.json'), 'utf8')).toContain('#2563eb');
  });
});
