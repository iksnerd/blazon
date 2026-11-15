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

/** What a path outside the project folder is called in a message: never the real path, which differs by machine and would name it. */
export const outsideMessage = (what: string, as: string): string =>
  `${what} ("${as}") is outside the project folder, or is a link that leaves it: blazon reads only what is inside the project. Move it in, or copy it instead of linking`;
