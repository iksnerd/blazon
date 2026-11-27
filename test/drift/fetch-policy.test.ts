import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { refusedAddress, safeFetch, type Network } from '../../src/core/drift/fetch.js';
import { readPage } from '../../src/core/drift/read.js';
import { stubNetwork } from '../support/network.js';

// What `init --from` and `drift <url>` may fetch. Nothing here reaches the internet: a refused address is refused before any connection,
// and the requests that do connect go to a server on 127.0.0.1, which only these tests' own network allows.

const loopbackOk: Network['refused'] = (address) => (address === '127.0.0.1' ? undefined : refusedAddress(address));

let server: http.Server;
let port: number;
const seen: http.IncomingHttpHeaders[] = [];

beforeAll(async () => {
  server = http.createServer((req, res) => {
    seen.push(req.headers);
    const url = req.url ?? '/';
    const chain = url.match(/^\/r(\d+)$/);
    if (chain) {
      const n = Number(chain[1]);
      res.statusCode = 302;
      res.setHeader('set-cookie', 'session=acme; Path=/');
      res.setHeader('location', n === 0 ? '/page' : `/r${n - 1}`);
      return void res.end();
    }
    if (url === '/loop') return void res.writeHead(301, { location: '/loop' }).end();
    if (url === '/to-private') return void res.writeHead(302, { location: 'http://10.0.0.1/' }).end();
    if (url === '/to-name') return void res.writeHead(302, { location: `http://internal.acme.test:${port}/page` }).end();
    if (url === '/to-metadata') return void res.writeHead(307, { location: 'http://169.254.169.254/latest/meta-data/' }).end();
    if (url === '/to-file') return void res.writeHead(302, { location: 'file:///etc/hosts' }).end();
    if (url === '/page') return void res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end('<html><link rel="stylesheet" href="/s.css"></html>');
    if (url === '/xhtml') return void res.writeHead(200, { 'content-type': 'application/xhtml+xml' }).end('<html></html>');
    if (url === '/s.css') return void res.writeHead(200, { 'content-type': 'text/css' }).end(':root { --brand-primary: #635dff; }');
    if (url === '/plain') return void res.writeHead(200, { 'content-type': 'text/plain' }).end('hello');
    if (url === '/untyped') return void res.end('<html></html>');
    if (url === '/css-as-html') return void res.writeHead(200, { 'content-type': 'text/html' }).end('<html><link rel="stylesheet" href="/fake.css"></html>');
    if (url === '/fake.css') return void res.writeHead(200, { 'content-type': 'text/html' }).end('<html>not css</html>');
    res.statusCode = 404;
    res.end();
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  port = (server.address() as AddressInfo).port;
});
afterAll(() => new Promise<void>((done) => server.close(() => done())));

describe('the addresses blazon refuses', () => {
  it.each([
    ['10.1.2.3', /private.*RFC 1918/],
    ['172.16.0.1', /private/],
    ['172.31.255.255', /private/],
    ['192.168.1.20', /private/],
    ['127.0.0.1', /loopback/],
    ['127.5.5.5', /loopback/],
    ['169.254.169.254', /metadata/],
    ['169.254.10.1', /link-local/],
    ['0.0.0.0', /this network/],
    ['100.64.0.1', /shared/],
    ['224.0.0.1', /multicast/],
    ['::1', /loopback/],
    ['::', /unspecified/],
    ['fc00::1', /unique-local/],
    ['fd12:3456::1', /unique-local/],
    ['fe80::1', /link-local/],
    ['fe80::1%en0', /link-local/],
    ['::ffff:127.0.0.1', /IPv4-mapped/],
    ['::ffff:7f00:1', /IPv4-mapped/],
    ['::ffff:8.8.8.8', /IPv4-mapped/],
    ['::127.0.0.1', /IPv4-compatible/],
    ['64:ff9b::10.0.0.1', /NAT64.*private/],
    ['2002:a00:1::', /6to4.*private/],
    ['ff02::1', /multicast/],
  ])('%s', (address, reason) => {
    expect(refusedAddress(address)).toMatch(reason);
  });

  it.each(['8.8.8.8', '1.1.1.1', '172.32.0.1', '93.184.215.14', '2606:4700::1111', '64:ff9b::808:808', '2002:808:808::'])('allows the public address %s', (address) => {
    expect(refusedAddress(address)).toBeUndefined();
  });
});

describe('a fetch to a refused address', () => {
  // No server listens on these: the refusal comes before a connection, so the test never waits on the network
  it.each([
    ['http://127.0.0.1:9/', /refused http:\/\/127\.0\.0\.1:9\/: 127\.0\.0\.1 is a loopback address/],
    ['http://[::1]:9/', /::1 is a loopback address/],
    ['http://169.254.169.254/latest/meta-data/', /169\.254\.169\.254 is the cloud metadata address/],
    ['http://10.0.0.1/', /10\.0\.0\.1 is a private address/],
    ['http://192.168.0.1/', /private address/],
    ['http://[fd00::1]/', /unique-local/],
    ['http://[::ffff:127.0.0.1]/', /IPv4-mapped/],
    ['http://2130706433/', /127\.0\.0\.1 is a loopback address/],
    ['http://localhost:9/', /localhost is the local machine/],
    ['http://app.localhost/', /local machine/],
  ])('%s is refused with the reason', async (url, reason) => {
    const network = stubNetwork({});
    await expect(safeFetch(url, 'page', network)).rejects.toThrow(reason);
    expect(network.calls).toEqual([]);
  });

  it('refuses a public name that resolves to a private address', async () => {
    await expect(safeFetch('https://acme.test/', 'page', stubNetwork({ 'acme.test': [['10.20.30.40']] }))).rejects.toThrow(
      /acme\.test resolves to 10\.20\.30\.40, a private address/,
    );
    await expect(safeFetch('https://acme.test/', 'page', stubNetwork({ 'acme.test': [['fd00::5']] }))).rejects.toThrow(/unique-local/);
  });

  it('refuses a name whose answer mixes a public and a private address', async () => {
    await expect(safeFetch('https://acme.test/', 'page', stubNetwork({ 'acme.test': [['8.8.8.8', '127.0.0.1']] }))).rejects.toThrow(/resolves to 127\.0\.0\.1, a loopback/);
  });

  it('refuses another scheme and an address with credentials', async () => {
    await expect(safeFetch('ftp://acme.test/x.css', 'stylesheet', stubNetwork({}))).rejects.toThrow(/only http and https/);
    await expect(safeFetch('file:///etc/passwd', 'page', stubNetwork({}))).rejects.toThrow(/only http and https/);
    await expect(safeFetch('https://user:secret@acme.test/', 'page', stubNetwork({ 'acme.test': [['8.8.8.8']] }))).rejects.toThrow(/user name or password/);
  });
});

describe('redirects', () => {
  const net = () => stubNetwork({ 'acme.test': [['127.0.0.1']], 'internal.acme.test': [['192.168.0.10']] }, loopbackOk);

  it('follows up to 5, connecting to the checked address of a name', async () => {
    const text = (await safeFetch(`http://acme.test:${port}/r4`, 'page', net())).toString();
    expect(text).toContain('stylesheet');
  });

  it('refuses more than 5', async () => {
    await expect(safeFetch(`http://acme.test:${port}/r5`, 'page', net())).rejects.toThrow(/more than 5 redirects/);
    await expect(safeFetch(`http://acme.test:${port}/loop`, 'page', net())).rejects.toThrow(/more than 5 redirects/);
  });

  it('checks every hop: a redirect to a private address, a private name or the metadata address is refused', async () => {
    await expect(safeFetch(`http://acme.test:${port}/to-private`, 'page', net())).rejects.toThrow(/refused http:\/\/10\.0\.0\.1\/ \(a redirect from .*\/to-private\).*private/);
    await expect(safeFetch(`http://acme.test:${port}/to-name`, 'page', net())).rejects.toThrow(/internal\.acme\.test resolves to 192\.168\.0\.10/);
    await expect(safeFetch(`http://acme.test:${port}/to-metadata`, 'page', net())).rejects.toThrow(/metadata/);
    await expect(safeFetch(`http://acme.test:${port}/to-file`, 'page', net())).rejects.toThrow(/only http and https/);
  });

  it('sends no cookie or credentials, even after a redirect sets one', async () => {
    seen.length = 0;
    await safeFetch(`http://acme.test:${port}/r2`, 'page', net());
    expect(seen).toHaveLength(4);
    for (const headers of seen) {
      expect(headers.cookie).toBeUndefined();
      expect(headers.authorization).toBeUndefined();
    }
  });
});

describe('DNS rebinding', () => {
  it('resolves a name once per request and connects to the address it checked', async () => {
    // The second answer is private: a fetch that resolved again to connect would be sent there
    const network = stubNetwork({ 'rebind.acme.test': [['127.0.0.1'], ['169.254.169.254']] }, loopbackOk);
    const text = (await safeFetch(`http://rebind.acme.test:${port}/page`, 'page', network)).toString();
    expect(text).toContain('stylesheet');
    expect(network.calls).toEqual(['rebind.acme.test']);
    // The next request asks again, gets the private answer, and is refused
    await expect(safeFetch(`http://rebind.acme.test:${port}/s.css`, 'stylesheet', network)).rejects.toThrow(/169\.254\.169\.254, the cloud metadata address/);
  });
});

describe('content types', () => {
  const net = () => stubNetwork({ 'acme.test': [['127.0.0.1']] }, loopbackOk);

  it('takes an HTML or XHTML page and a text/css stylesheet', async () => {
    await expect(safeFetch(`http://acme.test:${port}/xhtml`, 'page', net())).resolves.toBeInstanceOf(Buffer);
    expect((await readPage(`http://acme.test:${port}/page`, net())).css).toContain('--brand-primary');
  });

  it('refuses anything else, and names what it got', async () => {
    await expect(safeFetch(`http://acme.test:${port}/plain`, 'page', net())).rejects.toThrow(/wanted an HTML page, and the server says it is text\/plain/);
    await expect(safeFetch(`http://acme.test:${port}/untyped`, 'page', net())).rejects.toThrow(/sent no content type/);
    await expect(readPage(`http://acme.test:${port}/css-as-html`, net())).rejects.toThrow(/fake\.css.*wanted a stylesheet \(text\/css\).*text\/html/);
  });
});
