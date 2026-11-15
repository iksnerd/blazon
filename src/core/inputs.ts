import path from 'node:path';
import type { BlazonConfig } from '../types/index.js';
import { categoryDirs } from './assets/categories.js';
import { packageDir } from './icons/icon-sets.js';
import { logoFiles } from './logo.js';
import { resolverInputs } from './tokens/resolver/inputs.js';
import { DEFAULT_RESOLVER_FILE } from './tokens/resolver/parse.js';

// Everything a compile reads from disk by a path the config (or the resolver) names. One list, asked by every part that has to agree about
// it: the dev server watches these, and the output check (outputs.ts) refuses to write over them or delete them. A path a compile starts to
// read is added here, and the watcher and the protection follow.

export interface Input {
  /** How a message names it: the config key, or what the file is */
  name: string;
  /** What the config says, for the message */
  as: string;
  /** Absolute, as written: links are not followed (outputs.ts does that for the comparison) */
  path: string;
  folder: boolean;
  /** Only an output that holds it matters: the project folder holds every output */
  holdsOnly?: boolean;
  /** Read, but not to be watched: a package in node_modules does not change while the book is open */
  unwatched?: boolean;
}

/** The folders and files a compile reads, as absolute paths. */
export function projectInputs(config: BlazonConfig, cwd: string): Input[] {
  const found: Input[] = [{ name: 'the project folder', as: '.', path: path.resolve(cwd), folder: true, holdsOnly: true }];
  for (const key of ['tokensDir', 'docsDir', 'assetsDir'] as const)
    if (typeof config[key] === 'string') found.push({ name: key, as: config[key], path: path.resolve(cwd, config[key]), folder: true });
  for (const [key, dir] of Object.entries(categoryDirs(config.assets as Record<string, unknown> | undefined, cwd)))
    found.push({ name: `the folder of the "${key}" asset category`, as: path.relative(cwd, dir) || '.', path: path.resolve(dir), folder: true });

  const file = (name: string, as: unknown) => {
    if (typeof as === 'string' && as !== '') found.push({ name, as, path: path.resolve(cwd, as), folder: false });
  };
  // The resolver document, and every token file its sources name, which may be anywhere in the project
  const resolver = path.resolve(cwd, config.resolver ?? DEFAULT_RESOLVER_FILE);
  for (const input of resolverInputs(resolver))
    found.push({ name: input === resolver ? 'resolver' : 'a resolver source', as: path.relative(cwd, input) || input, path: input, folder: false });
  for (const logo of logoFiles(config)) file('a logo file', logo);
  for (const font of Array.isArray(config.fonts) ? config.fonts : []) if (font && typeof font === 'object') file(`the font file of ${String(font.family)}`, font.file);
  // An icon set is read from its package in node_modules, which a build must not empty
  for (const set of Array.isArray(config.iconSets) ? config.iconSets : []) {
    const pkg = set && typeof set.package === 'string' ? packageDir(cwd, set.package) : undefined;
    if (pkg) found.push({ name: `the icon package "${set.package}"`, as: path.relative(cwd, pkg) || pkg, path: pkg, folder: true, unwatched: true });
  }
  // An icon set's categories may be a JSON file of the project
  for (const set of Array.isArray(config.iconSets) ? config.iconSets : [])
    if (set && typeof set.categories === 'string') file(`the categories file of the "${String(set.name)}" icon set`, set.categories);
  return found;
}

/** The files among them, for a caller that only reads files. */
export const inputFiles = (config: BlazonConfig, cwd: string): string[] =>
  projectInputs(config, cwd)
    .filter((input) => !input.folder)
    .map((input) => input.path);
