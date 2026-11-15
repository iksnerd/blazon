import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { DEFAULT_CONFIG } from '../../../src/core/config/index.js';
import { logoConfig } from '../../support/helpers.js';
import { compileBlazonData } from '../../../src/core/index.js';
import { startDevServer } from '../../../src/server/dev-server.js';
import { tempDir } from '../../support/project';

/** Smallest headers each format needs for its pixel size; the scanner reads nothing past them. */
function png(width: number, height: number): Buffer {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'ascii');
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  return b;
}

function jpeg(width: number, height: number): Buffer {
  // SOI, an APP0 segment to skip, then SOF0 with height before width
  return Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x03]);
}

function gif(width: number, height: number): Buffer {
  const b = Buffer.alloc(13);
  b.write('GIF89a', 0, 'ascii');
  b.writeUInt16LE(width, 6);
  b.writeUInt16LE(height, 8);
  return b;
}

function webp(width: number, height: number): Buffer {
  // RIFF....WEBP + VP8X chunk: 24-bit (width - 1) and (height - 1) at offsets 24 and 27
  const b = Buffer.alloc(30);
  b.write('RIFF', 0, 'ascii');
  b.write('WEBPVP8X', 8, 'ascii');
  b.writeUIntLE(width - 1, 24, 3);
  b.writeUIntLE(height - 1, 27, 3);
  return b;
}

const SVG = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M0 0h24v24H0z"/></svg>';

function writeAssets(files: Record<string, Buffer | string>): string {
  const root = tempDir();
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(root, 'assets', rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return root;
}

describe('compileBlazonData: raster assets', () => {
  it('catalogs PNG, JPEG, GIF and WebP next to SVG, with format, pixel size and a relative url', async () => {
    const root = writeAssets({
      'logos/mark.svg': SVG,
      'logos/logotype-black.png': png(2426, 717),
      'photos/office.jpg': jpeg(1600, 900),
      'photos/loop.gif': gif(320, 240),
      'photos/hero.webp': webp(1920, 1080),
      'logos/notes.json': '{}',
    });
    const { assets } = await compileBlazonData(logoConfig(root), root);

    const byId = new Map(assets.all.map((a) => [a.id, a]));
    expect([...byId.keys()].sort()).toEqual(['logos/logotype-black', 'logos/mark', 'photos/hero', 'photos/loop', 'photos/office']);
    expect(byId.get('logos/logotype-black')).toMatchObject({
      format: 'png',
      mediaType: 'image/png',
      width: 2426,
      height: 717,
      url: 'brand-assets/logos/logotype-black.png',
    });
    expect(byId.get('logos/logotype-black')?.svg).toBeUndefined();
    expect(byId.get('photos/office')).toMatchObject({ format: 'jpg', width: 1600, height: 900 });
    expect(byId.get('photos/loop')).toMatchObject({ format: 'gif', width: 320, height: 240 });
    expect(byId.get('photos/hero')).toMatchObject({ format: 'webp', width: 1920, height: 1080 });
    expect(byId.get('logos/mark')).toMatchObject({ format: 'svg', viewBox: '0 0 24 24' });
    expect(assets.logos.map((a) => a.name).sort()).toEqual(['logotype-black', 'mark']);
    expect(assets.custom.photos?.map((a) => a.name).sort()).toEqual(['hero', 'loop', 'office']);
  });

  it('lists each file once when the assets folder also has files at its top level', async () => {
    const root = writeAssets({ 'top.svg': SVG, 'logos/mark.svg': SVG, 'banner.png': png(10, 10) });
    const { assets } = await compileBlazonData(logoConfig(root), root);

    expect(assets.all.map((a) => a.id).sort()).toEqual(['assets/banner', 'assets/top', 'logos/mark']);
  });
});

describe('dev server: /brand-assets', () => {
  it('serves asset files with their media type and refuses paths outside the assets folder', async () => {
    const root = writeAssets({ 'logos/logotype-black.png': png(4, 4) });
    // An image outside the assets folder: the extension check alone would let it through
    fs.writeFileSync(path.join(root, 'secret.png'), 'do not serve');
    fs.symlinkSync(path.join(root, 'secret.png'), path.join(root, 'assets/logos/escape.png'));
    const server = await startDevServer({ ...DEFAULT_CONFIG, port: 0 }, root);
    try {
      const base = server.resolvedUrls!.local[0]!;
      const ok = await fetch(new URL('brand-assets/logos/logotype-black.png', base));
      expect(ok.status).toBe(200);
      expect(ok.headers.get('content-type')).toBe('image/png');
      expect(Buffer.from(await ok.arrayBuffer()).equals(png(4, 4))).toBe(true);

      for (const attempt of [
        'brand-assets/../secret.png',
        'brand-assets/%2e%2e/secret.png',
        'brand-assets/..%2fsecret.png',
        'brand-assets/logos/..%2f..%2fsecret.png',
        'brand-assets/logos/escape.png',
      ]) {
        const res = await fetch(`${base}${attempt}`);
        expect(await res.text(), attempt).not.toContain('do not serve');
      }
      expect((await fetch(new URL('brand-assets/logos/missing.png', base))).status).toBe(404);
    } finally {
      await server.close();
    }
  });
});

describe('buildSite: asset files', () => {
  it('copies cataloged images under brand-assets/ and nothing else from the assets folder', async () => {
    const root = writeAssets({ 'logos/logotype-black.png': png(4, 4), 'logos/mark.svg': SVG, 'logos/notes.json': '{"private":true}' });
    const { buildSite } = await import('../../../src/builder/site-builder.js');
    const { siteOutDir } = await buildSite(logoConfig(root), root);

    const copied = path.join(siteOutDir, 'brand-assets', 'logos');
    expect(fs.readFileSync(path.join(copied, 'logotype-black.png')).equals(png(4, 4))).toBe(true);
    expect(fs.existsSync(path.join(copied, 'mark.svg'))).toBe(true);
    expect(fs.existsSync(path.join(copied, 'notes.json'))).toBe(false);
  }, 60_000);
});
