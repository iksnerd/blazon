import fs from 'node:fs';
import path from 'node:path';
import { REPO } from './paths.js';

// What a new project holds and what blazon ships, read from the folders they are made from: the starter is a copy of examples/blazon, and the
// shipped plugins are the folders under plugins/. A test that states a count or a list from here changes with the folders, so adding a page
// to the starter or a plugin to the package breaks no test that only counted it. The code under test (the copy, the lock reader) is not used.

const files = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? files(path.join(dir, entry.name)).map((f) => path.join(entry.name, f)) : [entry.name]));

export interface StarterFacts {
  /** The pages, by file name, in the order of the number in front of the name: the order of the brand book */
  docs: string[];
  /** The same file names sorted as text, which is how `blazon check` and `blazon init` list them */
  docsByName: string[];
  /** The slug of each page: its name without the number in front, as `blazon dev` and brand.json call it */
  slugs: string[];
  /** The token files, by path from tokens/ (a context's file is in its folder: theme/dark.json), sorted */
  tokens: string[];
  /** Every file under fonts/, by path from it */
  fonts: string[];
  /** Every file under assets/, by path from it */
  assets: string[];
  /** The folders directly under assets/, sorted */
  assetFolders: string[];
  /** One `starter-file-unchanged` note for each page, token file and asset: what `blazon check` counts in a project nothing was changed in */
  notes: number;
}

/** The starter's contents. */
export function starterFacts(): StarterFacts {
  const root = path.join(REPO, 'examples/blazon');
  const order = (name: string) => Number.parseFloat(/^[\d.]+/.exec(name)?.[0] ?? '0');
  const docs = fs
    .readdirSync(path.join(root, 'docs'))
    .filter((name) => name.endsWith('.md'))
    .sort((a, b) => order(a) - order(b) || a.localeCompare(b));
  const tokens = files(path.join(root, 'tokens'))
    .map((name) => name.split(path.sep).join('/'))
    .filter((name) => name.endsWith('.json'))
    .sort();
  const assets = files(path.join(root, 'assets')).sort();
  const fonts = files(path.join(root, 'fonts')).sort();
  return {
    docs,
    docsByName: [...docs].sort(),
    slugs: docs.map((name) => name.replace(/\.md$/, '').replace(/^[\d.]+-/, '')),
    tokens,
    assets,
    fonts,
    assetFolders: fs
      .readdirSync(path.join(root, 'assets'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort(),
    notes: docs.length + tokens.length + assets.length + fonts.length,
  };
}

/** The names of the plugins blazon ships, sorted: the `blazon.*` folders of plugins/. */
export function shippedPluginNames(): string[] {
  return fs
    .readdirSync(path.join(REPO, 'plugins'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('blazon.'))
    .map((entry) => entry.name)
    .sort();
}

/** A string as a pattern that matches it exactly. */
export const literal = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
