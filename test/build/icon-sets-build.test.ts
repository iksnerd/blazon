import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { initStarter, tempDir } from '../support/project';
import { DEFAULT_CONFIG, loadConfig } from '../../src/core/config/index.js';
import { startDevServer } from '../../src/server/dev-server.js';
import { buildSite } from '../../src/builder/site-builder.js';
import type { IconSetConfig } from '../../src/types/index.js';

const SVG = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M0 0h24v24H0z"/></svg>';
const SETS: IconSetConfig[] = [{ name: 'lucide', package: 'lucide-static' }];

/** A project with a fake lucide-static: two icons, plus files that must never be served or copied. */
function projectWithPackage(): string {
  const root = tempDir('blazon-iconsets-');
  const pkg = path.join(root, 'node_modules/lucide-static');
  fs.mkdirSync(path.join(pkg, 'icons'), { recursive: true });
  fs.writeFileSync(path.join(pkg, 'package.json'), JSON.stringify({ name: 'lucide-static', version: '1.0.0' }));
  fs.writeFileSync(path.join(pkg, 'icons/home.svg'), SVG);
  fs.writeFileSync(path.join(pkg, 'icons/plus.svg'), SVG);
  fs.writeFileSync(path.join(pkg, 'icons/README.md'), 'not an icon');
  // An SVG outside the package, linked from inside it: the extension check alone would let it through
  fs.writeFileSync(path.join(root, 'secret.svg'), '<svg>do not serve</svg>');
  fs.symlinkSync(path.join(root, 'secret.svg'), path.join(pkg, 'icons/escape.svg'));
  fs.mkdirSync(path.join(root, 'assets'));
  return root;
}

describe('dev server: /brand-assets/icon-sets', () => {
  it("serves a set's SVGs from the package, and nothing else", async () => {
    const root = projectWithPackage();
    const server = await startDevServer({ ...DEFAULT_CONFIG, port: 0, iconSets: SETS }, root);
    try {
      const base = server.resolvedUrls!.local[0]!;
      const ok = await fetch(new URL('brand-assets/icon-sets/lucide/home.svg', base));
      expect(ok.status).toBe(200);
      expect(ok.headers.get('content-type')).toBe('image/svg+xml');
      expect(ok.headers.get('x-content-type-options')).toBe('nosniff');
      expect(ok.headers.get('content-security-policy')).toMatch(/sandbox/);
      expect(await ok.text()).toBe(SVG);

      for (const attempt of [
        'brand-assets/icon-sets/lucide/README.md',
        'brand-assets/icon-sets/lucide/../package.json',
        'brand-assets/icon-sets/lucide/..%2fpackage.json',
        'brand-assets/icon-sets/lucide/%2e%2e/package.json',
        'brand-assets/icon-sets/lucide/escape.svg',
        'brand-assets/icon-sets/lucide/missing.svg',
        'brand-assets/icon-sets/unknown/home.svg',
      ]) {
        const res = await fetch(`${base}${attempt}`);
        const body = await res.text();
        expect(body, attempt).not.toContain('do not serve');
        expect(body, attempt).not.toContain('not an icon');
        expect(body, attempt).not.toContain('"version"');
      }
    } finally {
      await server.close();
    }
  });
});

describe('buildSite: icon sets', () => {
  it("copies the set's SVGs under brand-assets/icon-sets/<name>/ and nothing else from the package", async () => {
    const root = projectWithPackage();
    await initStarter(root);
    const { siteOutDir } = await buildSite({ ...(await loadConfig(root)), iconSets: SETS }, root);

    const copied = path.join(siteOutDir, 'brand-assets/icon-sets/lucide');
    // escape.svg links out of the package, so it is no icon of the set and its target is never published
    expect(fs.readdirSync(copied).sort()).toEqual(['home.svg', 'plus.svg']);
    expect(fs.readFileSync(path.join(copied, 'home.svg'), 'utf-8')).toBe(SVG);
  }, 60_000);
});
