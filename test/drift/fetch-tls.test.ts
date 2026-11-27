import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import tls from 'node:tls';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { networkOf, PUBLIC_NETWORK, refusedAddress, safeFetch, type Network } from '../../src/core/drift/fetch.js';
import { stubNetwork } from '../support/network.js';
import { REPO } from '../support/paths.js';
import { spawnSync } from '../support/spawn.js';

// The fetch over https, through the pinned lookup: a real TLS server on 127.0.0.1 with certificates made here, at test time, by the
// openssl command. The made-up names acme.test and other.test resolve to 127.0.0.1 through the test's own network, which also trusts the
// throwaway CA. What this proves: the name, not the pinned address, goes out as SNI and is the name the certificate is checked against.
// What it does not: a real public server, the system's CA store, or Happy Eyeballs on a live dual-stack name.
//
// No key or certificate is in the repository: they are written to a folder under the home folder and deleted afterwards.

const loopbackOk: Network['refused'] = (address) => (address === '127.0.0.1' ? undefined : refusedAddress(address));

let dir: string;
let ca: string;
let main: https.Server;
let wrong: https.Server;
let port: number;
let wrongPort: number;
const names: string[] = [];

function openssl(args: string[]): void {
  try {
    execFileSync('openssl', args, { cwd: dir, stdio: ['ignore', 'ignore', 'pipe'] });
  } catch (err) {
    throw new Error(
      `the TLS test makes its certificates with the openssl command, and "openssl ${args[0]}" failed: ${err instanceof Error ? err.message : String(err)}. Install openssl; this test does not skip without it.`,
      { cause: err },
    );
  }
}

/** A leaf certificate for one DNS name, signed by the throwaway CA. */
function leaf(name: string): { key: string; cert: string } {
  fs.writeFileSync(path.join(dir, `${name}.cnf`), `[req]\ndistinguished_name=dn\nprompt=no\n[dn]\nCN=${name}\n`);
  fs.writeFileSync(
    path.join(dir, `${name}.ext`),
    `subjectAltName=DNS:${name}\nbasicConstraints=CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n`,
  );
  openssl(['req', '-new', '-newkey', 'rsa:2048', '-nodes', '-config', `${name}.cnf`, '-keyout', `${name}.key`, '-out', `${name}.csr`]);
  const serial = `0x${Date.now().toString(16)}${name.length}`;
  openssl(['x509', '-req', '-in', `${name}.csr`, '-CA', 'ca.crt', '-CAkey', 'ca.key', '-set_serial', serial, '-days', '2', '-extfile', `${name}.ext`, '-out', `${name}.crt`]);
  return { key: fs.readFileSync(path.join(dir, `${name}.key`), 'utf8'), cert: fs.readFileSync(path.join(dir, `${name}.crt`), 'utf8') };
}

function handler(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse): void {
  const url = req.url ?? '/';
  if (url === '/') return void res.writeHead(200, { 'content-type': 'text/html' }).end('<html><title>Acme</title></html>');
  if (url === '/to-http') return void res.writeHead(302, { location: `http://acme.test:${port}/` }).end();
  if (url === '/to-other') return void res.writeHead(302, { location: `https://other.test:${port}/other` }).end();
  if (url === '/other') return void res.writeHead(200, { 'content-type': 'text/html' }).end(`<html>other ${req.headers.host}</html>`);
  if (url === '/plain') return void res.writeHead(200, { 'content-type': 'text/plain' }).end('not a page');
  if (url === '/big') {
    // No content-length: the limit is the one counted while the body is read
    res.writeHead(200, { 'content-type': 'text/html' });
    const chunk = Buffer.alloc(64 * 1024, 0x61);
    let sent = 0;
    const more = () => {
      while (sent < 6 * 1024 * 1024 && !res.destroyed) {
        sent += chunk.length;
        if (!res.write(chunk)) return void res.once('drain', more);
      }
      res.end();
    };
    return more();
  }
  res.writeHead(404).end();
}

const listen = (server: https.Server) => new Promise<number>((done) => server.listen(0, '127.0.0.1', () => done((server.address() as AddressInfo).port)));

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.homedir(), '.blazon-tls-test-'));
  fs.writeFileSync(
    path.join(dir, 'ca.cnf'),
    '[req]\ndistinguished_name=dn\nprompt=no\n[dn]\nCN=Acme Throwaway Test CA\n[v3_ca]\nbasicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign,cRLSign\nsubjectKeyIdentifier=hash\n',
  );
  openssl(['req', '-x509', '-config', 'ca.cnf', '-extensions', 'v3_ca', '-newkey', 'rsa:2048', '-nodes', '-days', '2', '-keyout', 'ca.key', '-out', 'ca.crt']);
  ca = fs.readFileSync(path.join(dir, 'ca.crt'), 'utf8');
  const acme = leaf('acme.test');
  const other = leaf('other.test');
  const contexts: Record<string, tls.SecureContext> = { 'acme.test': tls.createSecureContext(acme), 'other.test': tls.createSecureContext(other) };
  main = https.createServer(
    {
      ...acme,
      SNICallback: (servername, done) => {
        names.push(servername);
        done(null, contexts[servername] ?? contexts['acme.test']);
      },
    },
    handler,
  );
  // Serves other.test's certificate whatever name is asked for
  wrong = https.createServer({ ...other }, handler);
  port = await listen(main);
  wrongPort = await listen(wrong);
});

afterAll(async () => {
  for (const server of [main, wrong]) {
    if (!server) continue;
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
  }
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

/** acme.test and other.test are 127.0.0.1; the throwaway CA is trusted unless `trust` is false. */
function network(trust = true) {
  return { ...stubNetwork({ 'acme.test': [['127.0.0.1']], 'other.test': [['127.0.0.1']] }, loopbackOk), ...(trust && { ca }) };
}

describe('https through the pinned lookup', () => {
  it('reads https://acme.test, sending acme.test (not the address) as the server name', async () => {
    names.length = 0;
    const net = network();
    const body = await safeFetch(`https://acme.test:${port}/`, 'page', net);
    expect(body.toString('utf8')).toContain('<title>Acme</title>');
    expect(names).toEqual(['acme.test']);
    expect(net.calls).toEqual(['acme.test']);
  });

  it('refuses a certificate for another name, and says which check failed', async () => {
    await expect(safeFetch(`https://acme.test:${wrongPort}/`, 'page', network())).rejects.toThrow(
      /could not fetch https:\/\/acme\.test:\d+\/: Hostname\/IP does not match certificate's altnames: Host: acme\.test\. is not in the cert's altnames: DNS:other\.test/,
    );
  });

  it('refuses a certificate from a CA it does not trust', async () => {
    await expect(safeFetch(`https://acme.test:${port}/`, 'page', network(false))).rejects.toThrow(
      /could not fetch https:\/\/acme\.test:\d+\/: (unable to verify the first certificate|unable to get local issuer certificate|self-signed certificate in certificate chain)/,
    );
  });

  it('refuses a redirect from https to http, before it connects', async () => {
    names.length = 0;
    const net = network();
    await expect(safeFetch(`https://acme.test:${port}/to-http`, 'page', net)).rejects.toThrow(/redirects from https to http .*does not downgrade a read to clear text/);
    expect(net.calls).toEqual(['acme.test']);
  });

  it('follows a redirect to a second https name, which goes out as the new server name', async () => {
    names.length = 0;
    const net = network();
    const body = await safeFetch(`https://acme.test:${port}/to-other`, 'page', net);
    expect(body.toString('utf8')).toContain(`other other.test:${port}`);
    expect(names).toEqual(['acme.test', 'other.test']);
    expect(net.calls).toEqual(['acme.test', 'other.test']);
  });

  it('still holds the content type and the size limit', async () => {
    await expect(safeFetch(`https://acme.test:${port}/plain`, 'page', network())).rejects.toThrow(/wanted an HTML page, and the server says it is text\/plain/);
    await expect(safeFetch(`https://acme.test:${port}/big`, 'page', network())).rejects.toThrow(/https:\/\/acme\.test:\d+\/big is larger than 5 MB/);
  });
});

describe('the trusted CA is a test-only parameter', () => {
  it('is dropped with the rest of a network that is not a pair of functions, as a flag, config or environment value would be', () => {
    // `--network.ca x --network.resolve y` parses to strings, and a config or the environment holds only strings and plain data
    for (const given of [{ ca }, { ca, timeoutMs: 1 }, { resolve: 'x', refused: 'y', ca }, 'ca', undefined, null]) expect(networkOf(given)).toBe(PUBLIC_NETWORK);
    expect(PUBLIC_NETWORK.ca).toBeUndefined();
  });

  it('has no command-line option: a dotted --network.ca is an unknown option, and nothing is read or written', () => {
    const target = path.join(dir, 'acme-brand');
    const blazon = (...args: string[]) =>
      spawnSync(process.execPath, ['--import', 'tsx', path.join(REPO, 'scripts/blazon-src.ts'), ...args], {
        encoding: 'utf-8',
        cwd: REPO,
        env: { ...process.env, NO_COLOR: '1' },
        input: '',
        timeout: 60_000,
      });
    const flags = ['--network.ca', path.join(dir, 'ca.crt'), '--network.resolve', 'x', '--network.refused', 'x'];
    for (const ran of [blazon('drift', `https://127.0.0.1:${port}/`, ...flags), blazon('init', target, '--yes', '--from', `https://127.0.0.1:${port}/`, ...flags)]) {
      expect(ran.status).toBe(2);
      expect(ran.stderr).toMatch(/unknown option "--network"/);
    }
    expect(fs.existsSync(target)).toBe(false);
  });

  it('is ignored when it is not certificate text', async () => {
    const odd = { ...network(false), ca: 42 as unknown as string };
    await expect(safeFetch(`https://acme.test:${port}/`, 'page', odd)).rejects.toThrow(/certificate/);
  });
});
