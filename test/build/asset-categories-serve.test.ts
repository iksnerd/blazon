import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { approveTempDirs, tempDir } from '../support/project';
import { initStarter } from '../support/init-project';
import { DEFAULT_CONFIG } from '../../src/core/config/index.js';
import { buildSite } from '../../src/builder/site-builder.js';
import { startDevServer } from '../../src/server/dev-server.js';
import { loadConfig } from '../../src/core/config/index.js';

approveTempDirs();

// An asset category may be scanned from a folder outside assets/ (RFC 0001 §11). The dev server serves its
// files and the build copies them, at the URL every asset has: brand-assets/<key>/<path>.

function png(width: number, height: number): Buffer {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'ascii');
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  return b;
}

/** A project, a sibling `shared` folder with images, and files that must never be served or copied. */
function fixture() {
  const parent = tempDir('blazon-serve-');
  const project = path.join(parent, 'brand');
  const shared = path.join(parent, 'shared');
  fs.mkdirSync(path.join(project, 'assets/illustrations'), { recursive: true });
  fs.mkdirSync(path.join(shared, 'deep'), { recursive: true });
  fs.writeFileSync(path.join(project, 'assets/illustrations/own.png'), png(2, 2));
  fs.writeFileSync(path.join(shared, 'scene.png'), png(4, 4));
  fs.writeFileSync(path.join(shared, 'deep/panel.png'), png(6, 6));
  fs.writeFileSync(path.join(shared, 'notes.json'), '{"private":true}');
  fs.writeFileSync(path.join(shared, 'readme.txt'), 'not an image');
  // An image outside the folder, linked from inside it: the extension check alone would let it through
  fs.writeFileSync(path.join(parent, 'secret.png'), 'do not serve');
  fs.symlinkSync(path.join(parent, 'secret.png'), path.join(shared, 'escape.png'));
  return { parent, project, shared };
}
const config = { ...DEFAULT_CONFIG, assets: { illustrations: { dir: '../shared' } } };

describe('dev server: a category folder outside assets/', () => {
  it('serves its images at brand-assets/<key>/, nested ones too, and nothing else', async () => {
    const { project } = fixture();
    const server = await startDevServer({ ...config, port: 0 }, project);
    try {
      const base = server.resolvedUrls!.local[0]!;
      const scene = await fetch(new URL('brand-assets/illustrations/scene.png', base));
      expect(scene.status).toBe(200);
      expect(scene.headers.get('content-type')).toBe('image/png');
      expect(Buffer.from(await scene.arrayBuffer()).equals(png(4, 4))).toBe(true);
      expect((await fetch(new URL('brand-assets/illustrations/deep/panel.png', base))).status).toBe(200);

      // Still served from assets/ when the file is only there
      expect((await fetch(new URL('brand-assets/illustrations/own.png', base))).status).toBe(200);

      for (const attempt of [
        'brand-assets/illustrations/notes.json',
        'brand-assets/illustrations/readme.txt',
        'brand-assets/illustrations/escape.png',
        'brand-assets/illustrations/../secret.png',
        'brand-assets/illustrations/%2e%2e/secret.png',
        'brand-assets/illustrations/..%2fsecret.png',
        'brand-assets/illustrations/deep/..%2f..%2fsecret.png',
        'brand-assets/illustrations/missing.png',
      ]) {
        const res = await fetch(`${base}${attempt}`);
        const body = await res.text();
        expect(body, attempt).not.toContain('do not serve');
        expect(body, attempt).not.toContain('private');
        expect(body, attempt).not.toContain('not an image');
      }
    } finally {
      await server.close();
    }
  });
});

describe('buildSite: a category folder outside assets/', () => {
  it('copies its images to brand-assets/<key>/ with the folders under them, and only images', async () => {
    const { project } = fixture();
    await initStarter(project);
    const { siteOutDir } = await buildSite({ ...(await loadConfig(project)), assets: { illustrations: { dir: '../shared' } } }, project);

    const copied = path.join(siteOutDir, 'brand-assets/illustrations');
    expect(fs.readFileSync(path.join(copied, 'scene.png')).equals(png(4, 4))).toBe(true);
    expect(fs.readFileSync(path.join(copied, 'deep/panel.png')).equals(png(6, 6))).toBe(true);
    // The asset that lives in assets/ is copied too
    expect(fs.readFileSync(path.join(copied, 'own.png')).equals(png(2, 2))).toBe(true);
    expect(fs.existsSync(path.join(copied, 'notes.json'))).toBe(false);
    expect(fs.existsSync(path.join(copied, 'readme.txt'))).toBe(false);
    expect(fs.existsSync(path.join(copied, 'escape.png'))).toBe(false);
  }, 60_000);
});
