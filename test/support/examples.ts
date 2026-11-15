import fs from 'node:fs';
import path from 'node:path';
import { REPO } from './paths.js';
import { hasReference, referencePath } from './reference.js';
import { tempDir } from './project.js';

// A test that builds, checks or serves an example does it in a copy. A build writes dist/ next to the config, and a build
// inside the repository's own example leaves files that later tests, and `blazon init`, then pick up.

/** `blazon` is in the repository; the others are reference material a maintainer keeps in docs/personal/reference. */
export const EXAMPLES = ['auth0', 'blazon', 'slack'] as const;
export type Example = (typeof EXAMPLES)[number];

/** The folder of an example, whether or not it is there. */
export function exampleRoot(name: Example): string {
  return name === 'blazon' ? path.join(REPO, 'examples', name) : referencePath('examples', name);
}

/** Whether an example is available here: `blazon` always is, the reference ones only on a maintainer's machine. */
export function hasExample(name: Example): boolean {
  return name === 'blazon' || hasReference('examples', name);
}

/** What a build or a run writes, and what a copy must not carry: the built site, installed packages and a project's plugin folder. */
const LEFT_OUT = new Set(['dist', 'node_modules', '.blazon']);

/** A temporary copy of a project without dist, node_modules and .blazon, at any depth. */
export function copyProject(source: string): string {
  const copy = tempDir('blazon-copy-');
  fs.cpSync(source, copy, { recursive: true, filter: (file) => !LEFT_OUT.has(path.basename(file)) });
  return copy;
}

/** A temporary copy of an example from the repository. */
export function exampleProject(name: Example): string {
  if (!EXAMPLES.includes(name)) throw new Error(`no example called ${JSON.stringify(name)}: the examples are ${EXAMPLES.join(', ')}`);
  if (!hasExample(name)) throw new Error(`the ${name} example is reference material and is not in docs/personal/reference`);
  return copyProject(exampleRoot(name));
}
