import fs from 'node:fs';
import path from 'node:path';
import { REPO } from './paths';
import { tempDir } from './project';

// Shared by the guards*.test.ts files, which are one suite split by hook so that vitest runs them on separate workers.

export const LABEL = 'tests: whole-tree guards';
export const WORD = 'Zorblax';

/** The marker file the guard reads, naming the made-up word. */
export const markersFile = (): string => {
  const file = path.join(tempDir('blazon-markers-'), 'private-markers.json');
  fs.writeFileSync(file, JSON.stringify([{ what: 'a made-up marker', pattern: WORD, flags: 'i' }]));
  return file;
};

/** The real guard and what it imports, copied from this repository, and a `test:guards` script that runs only it (the other guard needs the layers of src/). */
export const guardFiles = (): Record<string, string> => {
  const copy = (file: string) => fs.readFileSync(path.join(REPO, file), 'utf-8');
  return {
    'test/core/no-private-markers.test.ts': copy('test/core/no-private-markers.test.ts'),
    'test/plugins/support/spec.ts': copy('test/plugins/support/spec.ts'),
    'test/support/spawn.ts': copy('test/support/spawn.ts'),
  };
};
export const withGuardScript = (manifest: string): string => {
  const parsed = JSON.parse(manifest);
  parsed.scripts['test:guards'] = 'vitest run test/core/no-private-markers.test.ts';
  return JSON.stringify(parsed);
};
