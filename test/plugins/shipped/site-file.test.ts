import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { siteFile } from '../../../src/shipped/shared/site.js';
import { tempDir } from '../../support/project';

// The one reader that blazon.logo-kit, blazon.office-template and blazon.press-kit take a logo's file with. Each had its own copy, the same
// in all three: the path must resolve inside the site, and so must the file it names once links are followed.

describe('siteFile', () => {
  const root = tempDir('blazon-site-file-');
  const site = path.join(root, 'site');
  fs.mkdirSync(path.join(site, 'brand-assets'), { recursive: true });
  fs.writeFileSync(path.join(site, 'brand-assets/a.svg'), '<svg/>');
  fs.writeFileSync(path.join(root, 'x'), 'secret');
  fs.symlinkSync(path.join(root, 'x'), path.join(site, 'brand-assets/link.svg'));

  it('reads a file in the site', () => {
    expect(siteFile(site, 'brand-assets/a.svg')?.toString()).toBe('<svg/>');
  });

  it('refuses a path that leaves the site, an absolute path and a link out of it', () => {
    expect(siteFile(site, '../x')).toBeUndefined();
    expect(siteFile(site, path.join(root, 'x'))).toBeUndefined();
    expect(siteFile(site, 'brand-assets/link.svg')).toBeUndefined();
  });

  it('refuses a file that is not there, and a folder', () => {
    expect(siteFile(site, 'brand-assets/none.svg')).toBeUndefined();
    expect(siteFile(site, 'brand-assets')).toBeUndefined();
  });
});
