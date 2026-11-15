import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PACKAGE_NAME } from '../../src/core/package-name.js';
import { packageRoot } from '../../src/core/package-root.js';
import { ROOT_DIR } from '../plugins/support/spec.js';

// The name blazon is published under is used in three places: package.json, the module a config imports (`import { defineConfig } from
// '@iksnerd/blazon'`), and the search for blazon's own folder. One constant names it in the code; this test keeps it equal to the file.

describe('the package name', () => {
  it('is the name in package.json', () => {
    expect(JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf-8')).name).toBe(PACKAGE_NAME);
  });

  it('is scoped, because the unscoped name `blazon` on npm belongs to an unrelated package', () => {
    expect(PACKAGE_NAME).toMatch(/^@[a-z0-9-]+\/blazon$/);
  });

  it('is how blazon finds its own folder', () => {
    expect(packageRoot()).toBe(ROOT_DIR);
  });
});
