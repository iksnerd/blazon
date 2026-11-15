import fs from 'node:fs';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { describe, it, expect } from 'vitest';
import { runPreview } from '../../src/cli/commands/preview.js';
import { starterProject, tempDir } from '../support/project';

// `blazon preview` serves a built folder that may come from anywhere (a repository can ship its dist/). A link in it that leaves the folder
// is not a file of the site.

const CANARY = 'CANARY_PREVIEW_7c1e';

describe('blazon preview and links out of the built site', () => {
  it('serves the site and refuses a file or a folder that is a link out', async () => {
    const project = await starterProject();
    const outside = tempDir('blazon-outside-');
    fs.writeFileSync(path.join(outside, 'secret.txt'), CANARY);
    const site = path.join(project, 'dist/site');
    fs.mkdirSync(path.join(site, 'inner'), { recursive: true });
    fs.writeFileSync(path.join(site, 'index.html'), '<html>site</html>');
    fs.writeFileSync(path.join(site, 'inner/ok.txt'), 'fine');
    fs.symlinkSync(path.join(outside, 'secret.txt'), path.join(site, 'leak.txt'));
    fs.symlinkSync(outside, path.join(site, 'linkdir'));

    const server = await runPreview(project, undefined, {});
    try {
      const base = `http://localhost:${(server.httpServer.address() as AddressInfo).port}`;
      const get = async (url: string) => {
        const res = await fetch(base + url);
        return { status: res.status, body: await res.text() };
      };
      expect(await get('/inner/ok.txt')).toEqual({ status: 200, body: 'fine' });
      for (const url of ['/leak.txt', '/linkdir/secret.txt', '/linkdir/../secret.txt', '/%6cinkdir/secret.txt']) {
        const answer = await get(url);
        expect(answer.body, url).not.toContain(CANARY);
      }
      expect((await get('/leak.txt')).status).toBe(403);
      expect((await get('/linkdir/secret.txt')).status).toBe(403);
      // A path that is not there still falls through to Vite's own answer
      expect((await get('/missing.txt')).body).not.toContain(CANARY);
    } finally {
      await server.close();
    }
  });
});
