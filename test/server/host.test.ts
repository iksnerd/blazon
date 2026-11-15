import fs from 'node:fs';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { describe, it, expect } from 'vitest';
import { DEFAULT_CONFIG } from '../../src/core/config/index.js';
import { startDevServer } from '../../src/server/dev-server.js';
import { runPreview } from '../../src/cli/commands/preview.js';
import { starterProject, tempDir } from '../support/project';

// `blazon dev` and `blazon preview` listen on this machine only, unless `--host` says otherwise: the dev server answers
// `/__blazon/mcp-config` with absolute paths, and a brand's files are not for everyone on the network.

const LOOPBACK = ['127.0.0.1', '::1'];
const addressOf = (server: { httpServer?: { address(): unknown } | null }): string => (server.httpServer!.address() as AddressInfo).address;

describe('blazon dev --host', () => {
  it('listens on the loopback address only by default', async () => {
    const server = await startDevServer({ ...DEFAULT_CONFIG, port: 0 }, tempDir('blazon-host-'));
    try {
      expect(LOOPBACK).toContain(addressOf(server));
    } finally {
      await server.close();
    }
  });

  it('listens on the address it is given', async () => {
    const server = await startDevServer({ ...DEFAULT_CONFIG, port: 0 }, tempDir('blazon-host-'), { host: '0.0.0.0' });
    try {
      expect(addressOf(server)).toBe('0.0.0.0');
    } finally {
      await server.close();
    }
  });

  it('listens on every interface for a bare --host', async () => {
    const server = await startDevServer({ ...DEFAULT_CONFIG, port: 0 }, tempDir('blazon-host-'), { host: true });
    try {
      expect(['0.0.0.0', '::']).toContain(addressOf(server));
    } finally {
      await server.close();
    }
  });
});

describe('blazon preview --host', () => {
  async function builtProject(): Promise<string> {
    const project = await starterProject();
    fs.mkdirSync(path.join(project, 'dist/site'), { recursive: true });
    fs.writeFileSync(path.join(project, 'dist/site/index.html'), '<html></html>');
    return project;
  }

  it('listens on the loopback address only by default, and on the address it is given', async () => {
    const project = await builtProject();
    const local = await runPreview(project, undefined, {});
    const open = await runPreview(project, undefined, { host: '0.0.0.0' });
    try {
      expect(LOOPBACK).toContain(addressOf(local));
      expect(addressOf(open)).toBe('0.0.0.0');
    } finally {
      await local.close();
      await open.close();
    }
  });
});
