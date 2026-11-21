import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { REPO } from './paths';
import { browserGlobs, globPattern, isBrowserTest } from './browser-tests';

// test/browser-tests.txt is read by the hooks and by the Chrome slots; this keeps it true.

const testFiles = (dir: string): string[] =>
  fs.readdirSync(path.join(REPO, dir), { withFileTypes: true }).flatMap((entry) => {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : testFiles(rel);
    return /\.test\.tsx?$/.test(entry.name) ? [rel] : [];
  });

describe('the list of the tests that start Chrome', () => {
  const files = [...testFiles('test'), ...testFiles('mcp/test')].filter((f) => f !== 'test/support/browser-tests.test.ts');
  // What starts a Chrome: the Playwright package, or a skip for a machine with none
  const startsChrome = (file: string): boolean => /from 'playwright-core'|import\('playwright-core'\)|skipIf\(!CHROME/.test(fs.readFileSync(path.join(REPO, file), 'utf-8'));

  it('holds every test file that starts Chrome', () => {
    const missing = files.filter((f) => startsChrome(f) && !isBrowserTest(f));
    expect(missing, 'add these to test/browser-tests.txt').toEqual([]);
  });

  it('has no line that matches no file', () => {
    const idle = browserGlobs().filter((glob) => !files.some((f) => globPattern(glob).test(f)));
    expect(idle).toEqual([]);
  });

  it('matches a glob within one folder', () => {
    expect(isBrowserTest('test/plugins/shipped/print-book-load.test.ts', ['test/plugins/shipped/print-book*.test.ts'])).toBe(true);
    expect(isBrowserTest('test/plugins/shipped/x/print-book-load.test.ts', ['test/plugins/shipped/print-book*.test.ts'])).toBe(false);
    expect(isBrowserTest(path.join(REPO, 'test/a.test.ts'), ['test/a.test.ts'])).toBe(true);
    expect(isBrowserTest('test/axtestxts', ['test/a.test.ts'])).toBe(false);
  });
});
