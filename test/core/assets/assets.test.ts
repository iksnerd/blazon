import { describe, it, expect, beforeAll, vi } from 'vitest';
import type { Finding } from '../../../src/types/index.js';
import fs from 'node:fs';
import path from 'node:path';
import { scanAssets } from '../../../src/core/assets/scanner.js';
import { tempDir } from '../../support/project';

describe('Assets Scanner', () => {
  let tempAssetsDir: string;

  beforeAll(() => {
    tempAssetsDir = tempDir();
    const logosDir = path.join(tempAssetsDir, 'logos');
    const iconsDir = path.join(tempAssetsDir, 'icons');
    fs.mkdirSync(logosDir, { recursive: true });
    fs.mkdirSync(iconsDir, { recursive: true });

    fs.writeFileSync(
      path.join(logosDir, 'brand-logo.svg'),
      `<?xml version="1.0" encoding="UTF-8"?>
<svg viewBox="0 0 100 100" width="100" height="100" xmlns="http://www.w3.org/2000/svg">
  <circle cx="50" cy="50" r="40" fill="#2563eb" />
</svg>`,
    );

    fs.writeFileSync(
      path.join(iconsDir, 'check.svg'),
      `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <path d="M5 13l4 4L19 7" stroke="#10b981" />
</svg>`,
    );
  });

  it('should scan logos and icons, clean XML declarations, and extract attributes', () => {
    const catalog = scanAssets(tempAssetsDir);

    expect(catalog.logos).toHaveLength(1);
    expect(catalog.icons).toHaveLength(1);
    expect(catalog.all).toHaveLength(2);

    const logo = catalog.logos[0]!;
    expect(logo.name).toBe('brand-logo');
    expect(logo.viewBox).toBe('0 0 100 100');
    expect(logo.width).toBe('100');
    expect(logo.height).toBe('100');
    expect(logo.svg!.startsWith('<?xml')).toBe(false);
    expect(logo.svg!.includes('<circle')).toBe(true);

    const icon = catalog.icons[0]!;
    expect(icon.name).toBe('check');
    expect(icon.viewBox).toBe('0 0 24 24');
    expect(icon.svg!.includes('<path')).toBe(true);
  });
});

describe('a file that cannot be read', () => {
  it('is a finding, not a line on the console, and the other assets still load', () => {
    const dir = tempDir('blazon-unreadable-');
    fs.mkdirSync(path.join(dir, 'logos'));
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><path d="M0 0h1v1z"/></svg>';
    fs.writeFileSync(path.join(dir, 'logos/a.svg'), svg);
    fs.writeFileSync(path.join(dir, 'logos/b.svg'), svg);
    fs.chmodSync(path.join(dir, 'logos/b.svg'), 0o000);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const problems: Finding[] = [];
    try {
      const catalog = scanAssets(dir, { problems });
      expect(spy).not.toHaveBeenCalled();
      expect(catalog.all.map((a) => a.id)).toEqual(['logos/a']);
      expect(problems).toMatchObject([{ code: 'asset-unreadable', severity: 'error', path: 'logos/b.svg' }]);
    } finally {
      spy.mockRestore();
      fs.chmodSync(path.join(dir, 'logos/b.svg'), 0o644);
    }
  });
});

describe('folders named like Object.prototype members', () => {
  it('are ordinary categories and leave Object.prototype alone', () => {
    const dir = tempDir('blazon-proto-folders-');
    for (const name of ['constructor', '__proto__', 'toString']) {
      fs.mkdirSync(path.join(dir, name), { recursive: true });
      fs.writeFileSync(path.join(dir, name, 'one.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><path d="M0 0h1v1z"/></svg>');
    }
    try {
      const catalog = scanAssets(dir);
      for (const name of ['constructor', '__proto__', 'toString']) {
        expect(Object.hasOwn(catalog.custom, name), name).toBe(true);
        expect(
          catalog.custom[name]?.map((a) => a.id),
          name,
        ).toEqual([`${name}/one`]);
      }
      expect(Object.keys(Object.prototype)).toEqual([]);
      expect(({} as Record<string, unknown>)['one']).toBeUndefined();
    } finally {
      for (const key of Object.keys(Object.prototype)) delete (Object.prototype as Record<string, unknown>)[key];
    }
  });
});
