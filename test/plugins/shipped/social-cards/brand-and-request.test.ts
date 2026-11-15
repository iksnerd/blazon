import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { MANIFEST, jobFor } from '../../../../src/shipped/social-cards/request.js';
import { readBrand } from '../../../../src/shipped/social-cards/brand.js';
import { ROOT_DIR } from '../../support/spec.js';
import { tempDir } from '../../../support/project';

// blazon.social-cards, the plugin blazon ships to compose marketing images from a brand's tokens, logo and a background.
// Seam: reading the brand and the request, and what the package ships.

describe('the brand', () => {
  const brand = {
    format: 'blazon-brand',
    version: 1,
    theme: { roles: { inverse: '#1E1F21', inverseText: '#F2F0EB', text: '#1E1F21', accent: '#FF5A1F', fontDisplay: "'Big', sans-serif", fontBody: 'Plex, sans-serif' }, tokens: {}, fonts: ['https://x.test/f.css'] },
    logo: { onLight: 'brand-assets/logos/a.svg', onDark: 'brand-assets/logos/b.svg' },
    tokens: [
      { path: 'social.format.square.width', type: 'dimension', value: '1080px', resolvedValue: { value: 1080, unit: 'px' } },
      { path: 'social.format.square.height', type: 'dimension', value: '1080px', resolvedValue: { value: 1080, unit: 'px' } },
      { path: 'social.format.wide.width', type: 'dimension', value: '10px', resolvedValue: { value: 10, unit: 'px' } },
      { path: 'color.ink', type: 'color', value: '#111111', resolvedValue: '#111111' },
      { path: 'type.display', type: 'typography', value: '', parts: { fontFamily: "'Big', sans-serif", fontSize: '96px', fontWeight: 800, letterSpacing: '-0.01em', lineHeight: 0.9 } },
      { path: 'type.h2', type: 'typography', value: '', parts: { fontFamily: "'Big', sans-serif", fontSize: '40px', fontWeight: 800, letterSpacing: '0em', lineHeight: 1.1 } },
      { path: 'type.body', type: 'typography', value: '', parts: { fontFamily: 'Plex, sans-serif', fontSize: '16px', fontWeight: 400, letterSpacing: '0em', lineHeight: 1.5 } },
    ],
    assets: [],
  };

  it('reads the formats that have a width and a height, with a margin of its own when the tokens give none', () => {
    const read = readBrand(brand);
    expect([...read.formats.keys()]).toEqual(['square']);
    expect(read.formats.get('square')).toEqual({ width: 1080, height: 1080, margin: 54, columns: 6 });
  });

  it('keeps the stylesheets of local fonts, which are data: stylesheets, as well as web ones, and drops other schemes', () => {
    const local = 'data:text/css;base64,QGZvbnQtZmFjZXt9';
    const web = 'https://fonts.googleapis.com/css2?family=Inter';
    const read = readBrand({ ...brand, theme: { ...(brand as { theme: object }).theme, fonts: [web, local, 'file:///etc/passwd', 'data:text/html;base64,PGI+', 'javascript:alert(1)', 7] } });
    expect(read.fonts).toEqual([web, local]);
  });

  it('reads the display type steps from the typography tokens in the display family', () => {
    expect(readBrand(brand).display).toMatchObject({ start: 96, floor: 40, family: "'Big', sans-serif", weight: 800, lineHeight: 0.9, letterSpacing: '-0.01em' });
  });

  it('survives a brand with nothing in it', () => {
    const read = readBrand({ format: 'blazon-brand', version: 1 });
    expect(read.formats.size).toBe(0);
    expect(read.display.start).toBeGreaterThan(read.display.floor);
  });
});

describe('the request', () => {
  const site = (): string => {
    const dir = tempDir('blazon-cards-site-');
    fs.writeFileSync(path.join(dir, 'index.html'), '<html></html>');
    return dir;
  };
  const req = (extra: object = {}) => JSON.stringify({ v: 1, type: 'build', options: {}, brand: {}, site_dir: site(), out_dir: tempDir('blazon-cards-out-'), ...extra });

  it.each([
    ['not JSON', '{ nope', 'the request is not JSON'],
    ['not an object', '[]', 'the request is not a JSON object'],
    ['another version', JSON.stringify({ v: 2, type: 'build' }), 'the request is version 2; this plugin speaks version 1'],
    ['another role', JSON.stringify({ v: 1, type: 'check' }), 'the request is for the check role; this plugin is a build plugin'],
  ])('refuses a request that is %s', (_, text, reason) => {
    expect(() => jobFor(text)).toThrow(reason);
  });

  it('refuses a site_dir with no brand.json assets served, or an out_dir that is not a folder', () => {
    expect(() => jobFor(JSON.stringify({ v: 1, type: 'build', options: {}, site_dir: tempDir('e-'), out_dir: tempDir('o-') }))).toThrow('site_dir has no index.html');
    expect(() => jobFor(req({ out_dir: '/nonexistent/out' }))).toThrow('out_dir is not a folder');
  });

  it('declares the build role, a version and the one variable it reads', () => {
    expect(MANIFEST).toEqual({ v: 2, roles: ['build'], title: 'Social cards', description: expect.any(String), version: '1.0.0', timeout_ms: 60000, env: ['BLAZON_CHROME', 'HOME', 'TMPDIR'] });
    expect(MANIFEST.description.length).toBeLessThanOrEqual(160);
  });
});

describe('the social-cards plugin, shipped in blazon\'s package', () => {
  it('has a program node runs, and a lock entry', () => {
    const program = path.join(ROOT_DIR, 'plugins/blazon.social-cards/bin/blazon-blazon.social-cards.🔌');
    expect(fs.statSync(program).mode & 0o111).toBe(0o111);
    expect(fs.readFileSync(program, 'utf-8').split('\n')[0]).toBe('#!/usr/bin/env node');
    const lock = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'plugins/shipped.lock'), 'utf-8'));
    expect(lock.plugins['blazon.social-cards']).toMatchObject({ kind: 'tree', entry: 'bin/blazon-blazon.social-cards.🔌' });
  });
});
