import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MAX_CONCURRENT_SHEETS, MAX_PAGE_BYTES, readCss, readPage } from '../../src/core/drift/read.js';
import { TEST_LOOPBACK } from '../support/network.js';

// A page that links many stylesheets is read four at a time and at most 25 MB in all, so `init --from` and `drift` do not hold 20 x 5 MB at
// once. What was left unread is said in `notRead`, and what was read still gives its colors. The server is on 127.0.0.1, never a real site.

const MB = 1024 * 1024;
let server: http.Server;
let base: string;
let inFlight = 0;
let peak = 0;
let served = 0;
/** The size of each stylesheet the server answers, by the path /sheet/<n>.css */
let sizeOf = (_n: number): number => 100;

const linksTo = (count: number) =>
  `<html><head><title>Acme</title>${Array.from({ length: count }, (_, n) => `<link rel="stylesheet" href="/sheet/${n}.css">`).join('')}</head></html>`;
let pageCount = 0;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.url === '/') return void res.setHeader('content-type', 'text/html').end(linksTo(pageCount));
    const match = req.url?.match(/^\/sheet\/(\d+)\.css$/);
    if (!match) return void res.writeHead(404).end();
    inFlight++;
    peak = Math.max(peak, inFlight);
    served++;
    setTimeout(() => {
      const n = Number(match[1]);
      const head = `:root { --acme-${n}: #e00000; }\n`;
      res.setHeader('content-type', 'text/css').end(head + 'x'.repeat(Math.max(0, sizeOf(n) - head.length)));
      inFlight--;
    }, 40);
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((done) => server.close(() => done())));

const reset = (count: number, size: (n: number) => number) => {
  pageCount = count;
  sizeOf = size;
  inFlight = 0;
  peak = 0;
  served = 0;
};

describe('reading the stylesheets of a page', () => {
  it('has the bounds the docs state', () => {
    expect([MAX_CONCURRENT_SHEETS, MAX_PAGE_BYTES]).toEqual([4, 25 * MB]);
  });

  it('reads at most four at a time, and all of them when they are small', async () => {
    reset(14, () => 100);
    const page = await readPage(`${base}/`, TEST_LOOPBACK);
    expect(page.sheets).toHaveLength(14);
    expect(page.sheets.map((s) => s.source.replace(base, ''))).toEqual(Array.from({ length: 14 }, (_, n) => `/sheet/${n}.css`));
    expect(page.notRead).toEqual([]);
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(4);
  });

  it('stops at 25 MB, says what was not read, and keeps the colors of the sheets it read', async () => {
    reset(12, () => 4 * MB);
    const page = await readPage(`${base}/`, TEST_LOOPBACK);
    const bytes = page.sheets.reduce((sum, s) => sum + Buffer.byteLength(s.css), 0);
    expect(bytes).toBeLessThanOrEqual(25 * MB);
    expect(page.sheets.length).toBeGreaterThan(0);
    expect(page.sheets.length).toBeLessThan(12);
    expect(served).toBe(page.sheets.length);
    expect(peak).toBeLessThanOrEqual(4);
    expect(page.css).toContain('--acme-0: #e00000');
    expect(page.sources).toHaveLength(page.sheets.length);
    expect(page.notRead).toHaveLength(1);
    expect(page.notRead[0]).toMatch(new RegExp(`${12 - page.sheets.length} of the 12 stylesheets.*were not read.*25 MB`));
  });

  it('reads the same sheets however the reads finish', async () => {
    reset(12, () => 4 * MB);
    const first = (await readPage(`${base}/`, TEST_LOOPBACK)).sources;
    reset(12, (n) => (n % 2 === 0 ? 4 * MB : 4 * MB - 1));
    const second = (await readPage(`${base}/`, TEST_LOOPBACK)).sources;
    expect(second).toEqual(first);
  });

  it('bounds `drift` the same way and reports what it left out', async () => {
    reset(12, () => 4 * MB);
    const css = await readCss(`${base}/`, TEST_LOOPBACK);
    expect(css.sources.length).toBeLessThan(12);
    expect(css.notRead?.[0]).toMatch(/were not read/);
    reset(3, () => 100);
    expect((await readCss(`${base}/`, TEST_LOOPBACK)).notRead).toBeUndefined();
  });
});
