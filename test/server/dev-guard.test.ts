import fs from 'node:fs';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { describe, it, expect, afterEach } from 'vitest';
import { DEFAULT_CONFIG } from '../../src/core/config/index.js';
import { packageRoot } from '../../src/core/package-root.js';
import { startDevServer, viewerFsOptions } from '../../src/server/dev-server.js';
import { runPreview } from '../../src/cli/commands/preview.js';
import { tempDir } from '../support/project';
import { starterProject } from '../support/init-project';

// Vite's `/__open-in-editor?file=...` makes a running editor open a local path and any web page can request it; and Vite's default
// `server.fs.allow` is the workspace root above the viewer. Blazon refuses the first and sets the second to the viewer's own folder.

const portOf = (server: { httpServer?: { address(): unknown } | null }): number => (server.httpServer!.address() as AddressInfo).port;

describe('open-in-editor', () => {
  const saved = process.env.LAUNCH_EDITOR;
  afterEach(() => {
    if (saved === undefined) delete process.env.LAUNCH_EDITOR;
    else process.env.LAUNCH_EDITOR = saved;
  });

  /** An "editor" that leaves a mark when launched, so a request that reaches Vite's middleware is seen. */
  function markingEditor(): { mark: string } {
    const dir = tempDir('blazon-editor-');
    const mark = path.join(dir, 'launched');
    const script = path.join(dir, 'editor.sh');
    fs.writeFileSync(script, `#!/bin/sh\necho "$@" > "${mark}"\n`, { mode: 0o755 });
    process.env.LAUNCH_EDITOR = script;
    return { mark };
  }

  it('is refused by the dev server', async () => {
    const { mark } = markingEditor();
    const server = await startDevServer({ ...DEFAULT_CONFIG, port: 0 }, tempDir('blazon-editor-'));
    try {
      const res = await fetch(`http://localhost:${portOf(server)}/__open-in-editor?file=/etc/hosts`);
      expect(res.status).toBe(404);
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(fs.existsSync(mark)).toBe(false);
    } finally {
      await server.close();
    }
  });

  it('is refused by the preview server', async () => {
    const project = await starterProject();
    fs.mkdirSync(path.join(project, 'dist/site'), { recursive: true });
    fs.writeFileSync(path.join(project, 'dist/site/index.html'), '<html></html>');
    const server = await runPreview(project, undefined, {});
    try {
      const res = await fetch(`http://localhost:${portOf(server)}/__open-in-editor?file=/etc/hosts`);
      expect(res.status).toBe(404);
    } finally {
      await server.close();
    }
  });
});

describe('dev server file access', () => {
  it('reads over /@fs/ only from the viewer: its folder when installed, the checkout from source', () => {
    expect(viewerFsOptions({ kind: 'prebuilt', dir: '/pkg/dist/ui' })).toEqual({ strict: true, allow: [path.resolve('/pkg/dist/ui')] });
    expect(viewerFsOptions({ kind: 'source', configFile: '/x/vite.viewer.config.ts' })).toEqual({ strict: true, allow: [packageRoot()] });
  });

  it('keeps strict on and Vite deny list, and serves no file outside the allowed folder', async () => {
    const outside = tempDir('blazon-fs-');
    const canary = path.join(outside, 'canary.txt');
    fs.writeFileSync(canary, 'outside-canary');
    const server = await startDevServer({ ...DEFAULT_CONFIG, port: 0 }, outside);
    try {
      const fsConfig = server.config.server.fs;
      expect(fsConfig.strict).toBe(true);
      // Vite adds its own client folder when its package sits outside the allowed one; nothing else may be there
      const allow = fsConfig.allow.map((dir) => path.resolve(dir));
      expect(allow[0]).toBe(packageRoot());
      expect(allow.slice(1).every((dir) => dir.endsWith(path.join('vite', 'dist', 'client')))).toBe(true);
      expect(fsConfig.deny).toContain('.env');
      const base = `http://localhost:${portOf(server)}`;
      for (const url of [`/@fs${canary}`, `/@fs${canary}?raw`, `/@fs/${canary}`]) {
        expect((await fetch(base + url)).status, url).toBe(403);
      }
    } finally {
      await server.close();
    }
  });
});
