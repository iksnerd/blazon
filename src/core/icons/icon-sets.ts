import fs from 'node:fs';
import path from 'node:path';
import type { Finding, IconCategory, IconSet, IconSetConfig } from '../../types/index.js';
import { finding } from '../checker/catalogue.js';
import { compareText } from '../order.js';
import { inProject } from '../confine.js';

/** The folder of SVGs and the metadata file for packages blazon knows; any other package states `dir`. */
const KNOWN_PACKAGES: { match: RegExp; dir: string; categories?: 'tabler' | 'mdi' }[] = [
  { match: /^lucide-static$/, dir: 'icons' },
  { match: /^@tabler\/icons$/, dir: 'icons/outline', categories: 'tabler' },
  { match: /^@mdi\/svg$/, dir: 'svg', categories: 'mdi' },
  { match: /^@material-symbols\/svg-\d+$/, dir: 'outlined' },
];

const OTHER = 'Other';
const NAME = /^[a-z][a-z0-9-]*$/;

export interface IconSetSource {
  /** The folder holding the SVGs, absolute */
  dir: string;
}

export interface ScannedIconSets {
  iconSets: IconSet[];
  /** Where each set's files are, by set name; kept out of BlazonData so no local path reaches the page */
  sources: Map<string, IconSetSource>;
  problems: Finding[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isInside(root: string, file: string): boolean {
  return file === root || file.startsWith(root + path.sep);
}

/** A package name as npm writes it: `name` or `@scope/name`, never a path. A `..` or a leading slash would leave node_modules. */
const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;

/** The package folder in the project's node_modules, resolved through symlinks (pnpm links them). Undefined for a name that is not a package name. */
export function packageDir(cwd: string, name: string): string | undefined {
  if (!PACKAGE_NAME.test(name)) return undefined;
  try {
    return fs.realpathSync(path.join(cwd, 'node_modules', name));
  } catch {
    return undefined;
  }
}

function linksInside(root: string, link: string): boolean {
  try {
    const real = fs.realpathSync(link);
    return isInside(root, real) && fs.statSync(real).isFile();
  } catch {
    return false;
  }
}

function readJson(file: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return undefined;
  }
}

/** The brand's category map: inline, or a JSON file inside the project. */
function brandCategories(set: IconSetConfig, cwd: string): { map?: Record<string, string[]>; error?: string } {
  let raw: unknown = set.categories;
  if (raw === undefined) return {};
  if (typeof raw === 'string') {
    const file = path.resolve(cwd, raw);
    if (!inProject(cwd, file)) return { error: `categories ${raw} is outside the project` };
    try {
      raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
    } catch (err) {
      return { error: `categories ${raw} is not valid JSON: ${err instanceof Error ? err.message : String(err)}` };
    }
  }
  const valid = isObject(raw) && Object.values(raw).every((v) => Array.isArray(v) && v.every((n) => typeof n === 'string'));
  return valid ? { map: raw as Record<string, string[]> } : { error: 'categories must map each category name to a list of icon names' };
}

/** Package metadata that already names a category per icon. */
function packageCategories(kind: 'tabler' | 'mdi' | undefined, pkg: string): Map<string, string> {
  const byIcon = new Map<string, string>();
  if (kind === 'tabler') {
    const json = readJson(path.join(pkg, 'icons.json'));
    if (isObject(json)) for (const [name, entry] of Object.entries(json)) if (isObject(entry) && typeof entry.category === 'string') byIcon.set(name, entry.category);
  } else if (kind === 'mdi') {
    const json = readJson(path.join(pkg, 'meta.json'));
    if (Array.isArray(json)) {
      for (const entry of json) {
        if (isObject(entry) && typeof entry.name === 'string' && Array.isArray(entry.tags) && typeof entry.tags[0] === 'string') byIcon.set(entry.name, entry.tags[0]);
      }
    }
  }
  return byIcon;
}

/** Category groups, brand categories first in the order given, Other last; empty groups are dropped. */
function group(icons: string[], assigned: Map<string, string>): IconCategory[] {
  const groups = new Map<string, string[]>();
  for (const icon of icons) {
    const category = assigned.get(icon) ?? OTHER;
    groups.set(category, [...(groups.get(category) ?? []), icon]);
  }
  const named = [...groups.keys()].filter((name) => name !== OTHER);
  return [...named, ...(groups.has(OTHER) ? [OTHER] : [])].map((name) => ({ name, icons: groups.get(name)! }));
}

/** Where a configured set's SVGs live, without reading them: for the dev server route. Undefined when it is invalid. */
export function iconSetDir(set: IconSetConfig, cwd: string): string | undefined {
  const pkg = packageDir(cwd, set.package);
  const dir = set.dir ?? KNOWN_PACKAGES.find((k) => k.match.test(set.package))?.dir;
  if (!pkg || !dir) return undefined;
  const full = path.resolve(pkg, dir);
  try {
    const real = fs.realpathSync(full);
    return isInside(pkg, real) && fs.statSync(real).isDirectory() ? real : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Reads each configured icon package from `node_modules`: its icon names and version, grouped into the
 * brand's categories, the package's own where it has them, or Other. A set that cannot be read is an
 * error finding and is left out; the rest still load.
 */
export function scanIconSets(configs: IconSetConfig[] | undefined, cwd: string): ScannedIconSets {
  const result: ScannedIconSets = { iconSets: [], sources: new Map(), problems: [] };
  const seen = new Set<string>();

  for (const set of configs ?? []) {
    const fail = (message: string) => result.problems.push(finding('icon-set-invalid', { path: set.name, message }));
    if (!NAME.test(set.name)) {
      fail(`name must be lowercase letters, digits and hyphens, starting with a letter, got "${set.name}"`);
      continue;
    }
    if (seen.has(set.name)) {
      fail(`name "${set.name}" is used twice`);
      continue;
    }
    seen.add(set.name);

    const known = KNOWN_PACKAGES.find((k) => k.match.test(set.package));
    if (!PACKAGE_NAME.test(set.package)) {
      fail(`package "${set.package}" is not a package name: write it as npm does ("name" or "@scope/name"), not as a path`);
      continue;
    }
    const pkg = packageDir(cwd, set.package);
    if (!pkg) {
      fail(`package "${set.package}" is not installed (looked in node_modules/${set.package}); run npm install ${set.package}`);
      continue;
    }
    const dirName = set.dir ?? known?.dir;
    if (!dirName) {
      fail(`${set.package} needs dir: the folder of SVGs inside the package`);
      continue;
    }
    if (!isInside(pkg, path.resolve(pkg, dirName))) {
      fail(`dir "${dirName}" is outside the package`);
      continue;
    }
    const dir = iconSetDir(set, cwd);
    if (!dir) {
      fail(`${set.package} has no directory "${dirName}"`);
      continue;
    }

    // A link that leaves the package is no icon of it: the build would publish what it points at
    const icons = fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.name.endsWith('.svg') && (entry.isFile() || (entry.isSymbolicLink() && linksInside(pkg, path.join(dir, entry.name)))))
      .map((entry) => entry.name.slice(0, -'.svg'.length))
      .sort();
    if (icons.length === 0) {
      fail(`${set.package}/${dirName} holds no .svg files`);
      continue;
    }

    const brand = brandCategories(set, cwd);
    if (brand.error) {
      fail(brand.error);
      continue;
    }
    const assigned = new Map<string, string>();
    if (brand.map) {
      const have = new Set(icons);
      for (const [category, names] of Object.entries(brand.map)) {
        for (const name of names) {
          if (have.has(name)) assigned.set(name, category);
          else result.problems.push(finding('icon-unknown', { path: set.name, message: `categories lists "${name}" under ${category}, which ${set.package} does not have` }));
        }
      }
    } else {
      for (const [name, category] of packageCategories(known?.categories, pkg)) assigned.set(name, category);
    }

    const meta = readJson(path.join(pkg, 'package.json'));
    const info = isObject(meta) ? meta : {};
    const categories = group(icons, assigned);
    // The brand's own order for a brand map; alphabetical for package metadata, which has no order of its own
    const ordered = brand.map
      ? [...Object.keys(brand.map), OTHER].flatMap((name) => categories.filter((c) => c.name === name))
      : [...categories].sort((a, b) => (a.name === OTHER ? 1 : b.name === OTHER ? -1 : compareText(a.name, b.name)));
    result.iconSets.push({
      name: set.name,
      package: set.package,
      ...(typeof info.version === 'string' && { version: info.version }),
      ...(typeof info.license === 'string' && { license: info.license }),
      count: icons.length,
      categories: ordered,
    });
    result.sources.set(set.name, { dir });
  }
  return result;
}
