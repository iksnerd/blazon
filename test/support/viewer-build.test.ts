import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ensureViewer, viewerIsFresh } from './viewer-build.js';
import { tempDir } from './project';

// The check that dist/ui is fresh and the lock around its build (test/support/viewer-build.ts), on a made-up project root.

const SECOND = 1000;
const write = (root: string, file: string, ago = 0) => {
  const full = path.join(root, file);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, 'x');
  const at = new Date(Date.now() - ago * SECOND);
  fs.utimesSync(full, at, at);
};

/** A project with every source `ago` seconds old and, when `built` is given, a build `built` seconds old. */
function project(sourcesAgo: number, built?: number): string {
  const root = tempDir('blazon-viewer-build-');
  for (const file of ['src/viewer/App.tsx', 'src/viewer/pages/a.tsx', 'src/core/x.ts', 'src/types/y.ts', 'vite.viewer.config.ts', 'package.json']) write(root, file, sourcesAgo);
  if (built !== undefined) write(root, 'dist/ui/index.html', built);
  return root;
}

describe('viewerIsFresh', () => {
  it('is false when there is no build', () => {
    expect(viewerIsFresh(project(100))).toBe(false);
  });

  it('is true when the build is newer than every source', () => {
    expect(viewerIsFresh(project(100, 10))).toBe(true);
  });

  it.each([
    ['a page of the viewer', 'src/viewer/pages/a.tsx'],
    ['the core, which the viewer bundles', 'src/core/x.ts'],
    ['a type', 'src/types/y.ts'],
    ['the build config', 'vite.viewer.config.ts'],
    ['package.json', 'package.json'],
  ])('is false when %s was edited after the build', (_, file) => {
    const root = project(100, 50);
    write(root, file, 5);
    expect(viewerIsFresh(root)).toBe(false);
  });

  it('does not count a file in node_modules, or one that has nothing to do with the viewer', () => {
    const root = project(100, 50);
    write(root, 'src/viewer/node_modules/pkg/index.js', 5);
    write(root, 'README.md', 5);
    write(root, 'src/server/s.ts', 5);
    expect(viewerIsFresh(root)).toBe(true);
  });
});

describe('ensureViewer', () => {
  const builds = (root: string, delay = 0) => {
    const calls: number[] = [];
    const build = async () => {
      calls.push(Date.now());
      await new Promise((resolve) => setTimeout(resolve, delay));
      write(root, 'dist/ui/index.html');
    };
    return { calls, build };
  };

  it('builds nothing when the viewer is fresh', async () => {
    const root = project(100, 10);
    const { calls, build } = builds(root);
    expect(await ensureViewer(root, build)).toBe('fresh');
    expect(calls).toHaveLength(0);
  });

  it('builds when there is no build or the build is stale, and leaves no lock behind', async () => {
    const root = project(100);
    const { calls, build } = builds(root);
    expect(await ensureViewer(root, build)).toBe('built');
    expect(calls).toHaveLength(1);
    expect(fs.existsSync(path.join(root, 'dist/.ui-build.lock'))).toBe(false);
    write(root, 'src/viewer/App.tsx', -2);
    expect(await ensureViewer(root, build)).toBe('built');
    expect(calls).toHaveLength(2);
  });

  it('makes a second run wait for the first and then find the viewer built, so it is built once', async () => {
    const root = project(100);
    const { calls, build } = builds(root, 300);
    const results = await Promise.all([ensureViewer(root, build, { pollMs: 20 }), ensureViewer(root, build, { pollMs: 20 }), ensureViewer(root, build, { pollMs: 20 })]);
    expect(results.sort()).toEqual(['built', 'fresh', 'fresh']);
    expect(calls).toHaveLength(1);
    expect(fs.existsSync(path.join(root, 'dist/.ui-build.lock'))).toBe(false);
  });

  it('releases the lock when the build fails, and passes the failure on', async () => {
    const root = project(100);
    await expect(
      ensureViewer(root, async () => {
        throw new Error('the build failed');
      }),
    ).rejects.toThrow('the build failed');
    expect(fs.existsSync(path.join(root, 'dist/.ui-build.lock'))).toBe(false);
  });

  it('takes a lock whose owner is gone, and one left behind longer than staleMs', async () => {
    const gone = project(100);
    fs.mkdirSync(path.join(gone, 'dist/.ui-build.lock'), { recursive: true });
    fs.writeFileSync(path.join(gone, 'dist/.ui-build.lock/pid'), '999999');
    expect(await ensureViewer(gone, builds(gone).build, { pollMs: 10 })).toBe('built');

    const old = project(100);
    fs.mkdirSync(path.join(old, 'dist/.ui-build.lock'), { recursive: true });
    const long = new Date(Date.now() - 3600 * SECOND);
    fs.utimesSync(path.join(old, 'dist/.ui-build.lock'), long, long);
    expect(await ensureViewer(old, builds(old).build, { pollMs: 10, staleMs: 600_000 })).toBe('built');
  });

  it('gives up with a message that names the lock when a live run holds it for longer than waitMs', async () => {
    const root = project(100);
    fs.mkdirSync(path.join(root, 'dist/.ui-build.lock'), { recursive: true });
    fs.writeFileSync(path.join(root, 'dist/.ui-build.lock/pid'), String(process.pid));
    const { calls, build } = builds(root);
    await expect(ensureViewer(root, build, { waitMs: 200, pollMs: 20 })).rejects.toThrow(/dist\/\.ui-build\.lock for more than/);
    expect(calls).toHaveLength(0);
  });
});
