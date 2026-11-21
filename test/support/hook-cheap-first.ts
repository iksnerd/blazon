import fs from 'node:fs';
import path from 'node:path';
import { tempDir } from './project';
import { BASE } from './hook-commit';

// Shared by the cheap-first-*.test.ts files, which are one suite split by hook so that vitest runs them on separate workers.

export const WORD = 'Zorblax';
export const SKIPPED = 'tests not run';

/** A marker file a stub suite appends to, and how often it has run. */
export const marker = () => path.join(tempDir('blazon-marker-'), 'ran');
export const ranCount = (file: string) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf-8').length : 0);
export const touch = (file: string, exit = 0) => `node -e "require('fs').appendFileSync('${file}', 'x'); process.exit(${exit})" --`;
/** A step that fails while the flag file exists: its verdict changes with no change to the tree. */
export const failWhile = (flag: string) => `node -e "process.exit(require('fs').existsSync('${flag}') ? 1 : 0)"`;
export const newFlag = (present: boolean) => {
  const flag = path.join(tempDir('blazon-flag-'), 'fail');
  if (present) fs.writeFileSync(flag, '');
  return flag;
};

export const commitManifest = (suite: string, scripts: Record<string, string> = {}) => {
  const base = JSON.parse(BASE['package.json']!);
  const stubs = Object.fromEntries(['test:related', 'test:deck', 'test:docs', 'test:files'].map((name) => [name, suite]));
  return JSON.stringify({ ...base, scripts: { ...base.scripts, ...stubs, ...scripts } });
};
