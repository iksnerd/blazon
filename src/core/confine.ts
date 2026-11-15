import fs from 'node:fs';
import path from 'node:path';

// Where a path really is, for the checks that keep a brand's own paths inside its folder. No imports from the rest of core, so that a loader
// and the output check can both ask it.

/** Whether `child` is `parent` or inside it, by path and not by spelling: `docs/` and `./docs` are one folder, `docs-site` is not inside `docs`. */
export function isWithin(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

/**
 * The folder or file a path really is: the existing part of it with its links followed, and the rest as written. A link to an input, or a
 * folder reached through one, is that input, whatever it is called. A path that does not exist yet is compared by the deepest part that does.
 */
export function canonical(target: string): string {
  const rest: string[] = [];
  let current = path.resolve(target);
  for (;;) {
    try {
      return path.join(fs.realpathSync.native(current), ...rest);
    } catch {
      const parent = path.dirname(current);
      if (parent === current) return path.resolve(target);
      rest.unshift(path.basename(current));
      current = parent;
    }
  }
}

/** Whether `target` is the project folder or inside it, by where it really is: a link that leaves the folder is outside, whatever it is called. */
export const inProject = (cwd: string, target: string): boolean => isWithin(canonical(cwd), canonical(target));

// Folders outside the project that the PERSON RUNNING blazon approved (`--allow-dir`, BLAZON_ALLOW_DIRS). A brand can write any key of its own
// blazon.json, so a key there would approve nothing: the list comes only from the command line and the environment, is set once at the start of
// a run (setApprovedDirs, the way --cwd is applied) and is never part of the config. Empty means nothing outside the project is read.

/** The environment variable that names approved folders, separated by the platform's path delimiter. */
export const ALLOW_DIRS_ENV = 'BLAZON_ALLOW_DIRS';

let approved: readonly string[] = [];

/**
 * What the operator typed and set, as absolute folders with links followed: the `--allow-dir` values and the entries of BLAZON_ALLOW_DIRS,
 * relative ones from `base` (the folder blazon was started in). An empty entry is left out.
 */
export function operatorDirs(typed: readonly string[], env: NodeJS.ProcessEnv, base: string): string[] {
  const named = [...typed, ...(env[ALLOW_DIRS_ENV] ?? '').split(path.delimiter)].filter((entry) => entry.trim() !== '');
  return [...new Set(named.map((entry) => canonical(path.resolve(base, entry))))];
}

/** Sets the folders approved for this run, replacing the last list. The command line calls it once, before a command starts. */
export function setApprovedDirs(dirs: readonly string[]): void {
  approved = dirs.map((dir) => canonical(dir));
}

/** Whether `target` is the project folder or inside it, or inside a folder the operator approved: by where it really is, links followed. */
export function inProjectOrApproved(cwd: string, target: string): boolean {
  const real = canonical(target);
  return isWithin(canonical(cwd), real) || approved.some((dir) => isWithin(dir, real));
}

/** The refusal for a folder that is outside and not approved: the same words whether or not it exists, and never the real path. */
export const notApprovedMessage = (what: string, as: string): string =>
  `${what} ("${as}") is outside the project folder, or is a link that leaves it, and the person running blazon has not approved it. A brand cannot approve a folder for itself: to read it, run blazon with --allow-dir <folder> or set ${ALLOW_DIRS_ENV} to the folder`;

/** What a path outside the project folder is called in a message: never the real path, which differs by machine and would name it. */
export const outsideMessage = (what: string, as: string): string =>
  `${what} ("${as}") is outside the project folder, or is a link that leaves it: blazon reads only what is inside the project. Move it in, or copy it instead of linking`;
