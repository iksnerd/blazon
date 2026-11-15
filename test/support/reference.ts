import fs from 'node:fs';
import path from 'node:path';
import { REPO } from './paths.js';

// Reference material is a third party's brand guidelines, encoded as blazon projects, with the golden files made from them. It is
// not in the repository: a maintainer keeps it in docs/personal/reference (git-ignored). A test that needs it skips when it is absent.
// The layout under the root:
//   examples/<name>/        a brand project the tests build, check or serve
//   <name>-brand-guidelines/ the source text a project was derived from
//   golden/<name>/          the expected outputs of a project (UPDATE_GOLDEN=1 writes here)

/** The folder that holds the reference material, whether or not it exists. */
export const REFERENCE_ROOT = path.join(REPO, 'docs/personal/reference');

/** A path inside the reference folder. */
export function referencePath(...parts: string[]): string {
  return path.join(REFERENCE_ROOT, ...parts);
}

/** Whether a path inside the reference folder exists, for `describe.skipIf(!hasReference('examples/auth0'))`. */
export function hasReference(...parts: string[]): boolean {
  return fs.existsSync(referencePath(...parts));
}
