import fs from 'node:fs';
import path from 'node:path';
import { canonical, inProject, isWithin } from '../../confine.js';
import { MAX_BYTES, type FetchKind } from '../../drift/fetch.js';
import { MAX_STYLESHEETS, stylesheetHrefs } from '../../drift/read.js';
import type { SiteInput, SitePage } from './types.js';

// `blazon init --from-dir <folder>`: the same reading as `--from`, on a page and its stylesheets saved in a folder. Nothing outside the folder is
// read: a reference that is a URL, an absolute path, one with `..`, or a link that leads out of the folder is skipped and named in the output.
// Nothing is fetched.

/** Why a reference from `from` (a folder-relative file) cannot be read, or the folder-relative path it names. */
export function folderPath(folder: string, from: string, href: string): { file: string } | { reason: string } {
  const raw = href.trim();
  if (raw === '') return { reason: 'is empty' };
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith('//')) return { reason: `is a URL (${raw}): --from-dir reads only files in the folder and fetches nothing` };
  let wanted: string;
  try {
    wanted = decodeURIComponent(raw.replace(/[?#].*$/, ''));
  } catch {
    return { reason: `(${raw}) is not a valid path` };
  }
  if (wanted.startsWith('/') || wanted.startsWith('\\') || path.isAbsolute(wanted)) return { reason: `(${raw}) is an absolute path: give it relative to the page` };
  if (wanted.split(/[/\\]/).includes('..')) return { reason: `(${raw}) goes up with "..": only files inside the folder are read` };
  const file = path.posix.normalize(path.posix.join(path.posix.dirname(from), wanted.replace(/\\/g, '/')));
  if (file === '..' || file.startsWith('../') || file === '.') return { reason: `(${raw}) is outside the folder` };
  if (!inProject(folder, path.join(folder, file))) return { reason: `(${raw}) is a link that leads out of the folder` };
  return { file };
}

/**
 * A file of the folder, opened once and read from that descriptor. `folderPath` checks a path and this opens it again, so a link swapped in
 * between (check, then open) would be read: the check is therefore made again on what was opened. Its real path must be inside the folder,
 * and the file there must be the one the descriptor holds (same device and inode). What is left: a folder on that real path replaced by a link
 * between `realpath` and `stat`, by a process changing the folder while blazon reads it; that needs code already running on the machine.
 */
function readInside(folder: string, file: string): Buffer {
  const full = path.join(folder, file);
  // O_NONBLOCK: opening a FIFO saved under a page's name returns at once instead of waiting for a writer; it then fails the file check
  const fd = fs.openSync(full, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK);
  try {
    const opened = fs.fstatSync(fd);
    const real = fs.realpathSync.native(full);
    if (!isWithin(canonical(folder), real)) throw new Error(`(${file}) is a link that leads out of the folder`);
    const there = fs.statSync(real);
    if (there.dev !== opened.dev || there.ino !== opened.ino) throw new Error(`${file} changed while it was read`);
    if (!opened.isFile()) throw new Error(`${file} is not a file`);
    if (opened.size > MAX_BYTES) throw new Error(`${file} is larger than 5 MB`);
    const bytes = fs.readFileSync(fd);
    if (bytes.byteLength > MAX_BYTES) throw new Error(`${file} is larger than 5 MB`);
    return bytes;
  } finally {
    fs.closeSync(fd);
  }
}

/** The page, held to the confinement of the stylesheets: a page that is a link out of the folder is refused with the same reason. */
function pagePath(folder: string, page: string): string {
  const where = folderPath(folder, '', page);
  if ('reason' in where) throw new Error(`the page ${where.reason}, so it was not read`);
  return where.file;
}

const IMPORT = /@import\s+(?:url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)|"([^"]*)"|'([^']*)')[^;]*;/gi;

/** The page and the stylesheets it links (and their `@import`s), read from the folder; what was skipped, and why, in `notRead`. */
export function readSavedPage(folder: string, page: string): SitePage {
  const notRead: string[] = [];
  const html = readInside(folder, pagePath(folder, page)).toString('utf8');
  const sources: string[] = [];
  const sheets: string[] = [];
  const queue: { href: string; from: string; via: string }[] = stylesheetHrefs(html).map((href) => ({ href, from: page, via: page }));
  while (queue.length > 0) {
    const { href, from, via } = queue.shift()!;
    const where = folderPath(folder, from, href);
    if ('reason' in where) {
      notRead.push(`the stylesheet in ${via} ${where.reason}, so it was not read`);
      continue;
    }
    if (sources.includes(where.file)) continue;
    if (sources.length >= MAX_STYLESHEETS) {
      notRead.push(`${where.file}: only the first ${MAX_STYLESHEETS} stylesheets are read`);
      continue;
    }
    let css: string;
    try {
      css = readInside(folder, where.file).toString('utf8');
    } catch (err) {
      notRead.push(`${where.file} could not be read: ${err instanceof Error ? err.message.replace(folder, '<folder>') : String(err)}`);
      continue;
    }
    sources.push(where.file);
    sheets.push(css);
    for (const m of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(IMPORT)) {
      const target = m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5] ?? '';
      queue.push({ href: target, from: where.file, via: where.file });
    }
  }
  return { html, css: sheets.join('\n'), sources, sheets: sources.map((source, i) => ({ source, css: sheets[i]! })), notRead };
}

/** A slug for logo file names: the folder's name, else `site`. */
const slug = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'site';

/**
 * A saved site as `applyFromSite` reads it. `target` is the folder, or an `.html` file in it (the page to read; `index.html` by default).
 * Throws when the folder or the page is not there.
 */
export function savedSite(target: string): SiteInput {
  const full = path.resolve(target);
  let folder = full;
  let page = 'index.html';
  if (fs.existsSync(full) && fs.statSync(full).isFile()) {
    folder = path.dirname(full);
    page = path.basename(full);
  }
  if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) throw new Error(`--from-dir needs a folder, and there is no folder "${target}"`);
  if (!fs.existsSync(path.join(folder, page))) throw new Error(`there is no ${page} in "${target}": name the page, as --from-dir <folder>/<page>.html`);
  pagePath(folder, page);
  const name = path.basename(folder);
  return {
    label: `${path.basename(folder)}/${page} (a saved copy)`,
    offline: true,
    logoName: slug(name),
    fallbackName: name,
    page: () => Promise.resolve(readSavedPage(folder, page)),
    resolve: (href) => {
      const where = folderPath(folder, page, href);
      return 'reason' in where ? { reason: where.reason } : { ref: where.file };
    },
    isHome: (href) => ['/', './', '.', 'index.html', './index.html', page, `./${page}`].includes(href.trim()),
    read: (ref: string, _kind: FetchKind) => Promise.resolve(readInside(folder, ref)),
    sourceDoc: (what) => (what === 'page' ? `${page} in the saved folder ${name}` : `the stylesheets of ${page} in the saved folder ${name}`),
  };
}
