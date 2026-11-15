import fs from 'node:fs';
import { inProject } from './confine.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Finding } from '../types/index.js';
import { finding } from './checker/catalogue.js';

// The starter is blazon's own brand book, `examples/blazon/`, copied by `blazon init` (RFC 0003). A file that is still the
// starter's, byte for byte, is text nobody has written yet (RFC 0001 §4, `starter-file-unchanged`). There is one copy: from source
// the starter is the example itself, and in blazon's package `template/` is that example, made by `npm run build-starter`
// when the package is packed and never committed.

/** What a copy of the starter leaves out: a build's output, installed packages and a project's plugin folder. */
const LEFT_OUT = new Set(['dist', 'node_modules', '.blazon', '.DS_Store']);

/** The starter's folder: `examples/blazon/` when run from source, else the package's `template/`. */
export function getTemplateDir(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (;;) {
    // The example first: a `template/` left in a checkout by `npm pack` must not shadow the source
    for (const candidate of [path.join(dir, 'examples', 'blazon'), path.join(dir, 'template')]) {
      if (fs.existsSync(path.join(candidate, 'blazon.json'))) return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return path.resolve(process.cwd(), 'examples', 'blazon');
    dir = parent;
  }
}

/** The plugins a new book enables: the ones that need Node only. The example lists more, and a new book adds them by name. */
const STARTER_PLUGINS = ['blazon.copy'];

/**
 * The example's config as a new book's: its `plugins` list cut to the ones in `STARTER_PLUGINS`. The others draw in Google Chrome or
 * write kits a new book has no use for yet, so a first `blazon build` does not need a browser; JSON has no comments, so they are
 * left out, and the manual (chapter 12) says how to add one. A config already cut comes back as it is.
 */
export function starterConfig(source: string): string {
  const config = JSON.parse(source) as { plugins?: { name: string }[] };
  if (Array.isArray(config.plugins)) config.plugins = config.plugins.filter((entry) => STARTER_PLUGINS.includes(entry.name));
  return `${JSON.stringify(config, null, 2)}\n`;
}

/** The starter's files, as paths relative to its folder. */
export function starterFiles(template: string = getTemplateDir()): string[] {
  return filesUnder(template)
    .map((f) => path.relative(template, f).split(path.sep).join('/'))
    .sort();
}

/** Copies the starter into `dest`, leaving a file that is already there as it is; returns the files it wrote and the ones it kept (absolute). */
export function copyStarter(dest: string, template: string = getTemplateDir()): { written: string[]; kept: string[] } {
  const written: string[] = [];
  const kept: string[] = [];
  for (const rel of starterFiles(template)) {
    const to = path.join(dest, rel);
    if (fs.existsSync(to)) {
      kept.push(to);
      continue;
    }
    fs.mkdirSync(path.dirname(to), { recursive: true });
    if (rel === 'blazon.json') fs.writeFileSync(to, starterConfig(fs.readFileSync(path.join(template, rel), 'utf-8')));
    else fs.copyFileSync(path.join(template, rel), to);
    written.push(to);
  }
  return { written, kept };
}

const same = (a: string, b: string): boolean => {
  try {
    return fs.realpathSync(a) === fs.realpathSync(b);
  } catch {
    return false;
  }
};

/** Whether a folder is, or sits in, another: the repo's own examples are not starters. */
function inside(folder: string, parent: string): boolean {
  try {
    const rel = path.relative(fs.realpathSync(parent), fs.realpathSync(folder));
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
  } catch {
    return false;
  }
}

function filesUnder(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (LEFT_OUT.has(entry.name)) return [];
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(full) : entry.isFile() ? [full] : [];
  });
}

/**
 * A warning when a configured logo file is byte for byte the starter's: the book would show blazon's mark under another
 * brand's name. The `starter-file-unchanged` note says the same in passing, and is easy to miss among the others.
 */
export function starterLogoFindings(cwd: string, logoFiles: string[], template: string = getTemplateDir()): Finding[] {
  const examples = path.basename(path.dirname(template)) === 'examples' ? path.dirname(template) : path.join(template, '..', 'examples');
  if (!fs.existsSync(template) || same(cwd, template) || inside(cwd, examples)) return [];
  const starters = filesUnder(path.join(template, 'assets', 'logos')).map((file) => fs.readFileSync(file));
  return logoFiles.flatMap((file) => {
    const full = path.resolve(cwd, file);
    if (!inProject(cwd, full) || !fs.existsSync(full) || !fs.statSync(full).isFile()) return [];
    const bytes = fs.readFileSync(full);
    if (!starters.some((starter) => starter.equals(bytes))) return [];
    const shown = path.relative(cwd, full).split(path.sep).join('/');
    return [
      finding('starter-logo-unchanged', {
        path: file,
        message: `The logo ${shown} is still blazon's own mark: replace it, or the book shows blazon's logo under this brand's name.`,
      }),
    ];
  });
}

/**
 * One info finding for each file in the docs, tokens, assets or fonts folder (sidecars included) that is byte for byte the
 * file `blazon init` put there. The fonts folder is `fonts/` beside the config, as `init` makes it. The config is left out,
 */
export function starterFileFindings(cwd: string, folders: { docs: string; tokens: string; assets: string }, template: string = getTemplateDir()): Finding[] {
  const examples = path.basename(path.dirname(template)) === 'examples' ? path.dirname(template) : path.join(template, '..', 'examples');
  if (!fs.existsSync(template) || same(cwd, template) || inside(cwd, examples)) return [];
  const findings: Finding[] = [];
  for (const [name, folder] of Object.entries({ ...folders, fonts: 'fonts' })) {
    const root = path.resolve(cwd, folder);
    for (const file of filesUnder(root)) {
      const original = path.join(template, name, path.relative(root, file));
      if (!fs.existsSync(original) || !fs.readFileSync(file).equals(fs.readFileSync(original))) continue;
      const shown = path.relative(cwd, file).split(path.sep).join('/');
      findings.push(finding('starter-file-unchanged', { path: shown, message: `${shown} is still the starter's text: replace it with the brand's own.` }));
    }
  }
  return findings;
}
