import fs from 'node:fs';
import path from 'node:path';
import { REPO } from './paths.js';

// test/browser-tests.txt is the one list of the test files that start Chrome. The hooks read it with shell (browser_excludes in
// .githooks/lib.sh); the tests read it here.

export const BROWSER_TESTS_FILE = path.join(REPO, 'test/browser-tests.txt');

/** The globs of the list: a path from the repository root, `*` within one folder. */
export function browserGlobs(file = BROWSER_TESTS_FILE): string[] {
  return fs
    .readFileSync(file, 'utf-8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));
}

/** A glob of the list as a pattern: `*` is any run of characters but `/`, everything else is literal. */
export function globPattern(glob: string): RegExp {
  return new RegExp(
    `^${glob
      .split('*')
      .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
      .join('[^/]*')}$`,
  );
}

/** Whether a test file (a path from the repository root, or an absolute one inside it) is on the list. */
export function isBrowserTest(file: string, globs: readonly string[] = browserGlobs()): boolean {
  const relative = path.isAbsolute(file) ? path.relative(REPO, file) : file;
  const posix = relative.split(path.sep).join('/');
  return globs.some((glob) => globPattern(glob).test(posix));
}
