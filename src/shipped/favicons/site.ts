import fs from 'node:fs';
import path from 'node:path';
import { replaceFolder, type Entry } from '../shared/folder.js';
import { Cannot } from './request.js';
import { VIEWS } from './views.js';

// The one place the plugin writes outside out_dir: the viewer is a static page whose data is fixed before the plugins run,
// so it cannot see out_dir. It fetches favicons/favicons.json from the site at runtime, and this copy is what it finds.

/** The folder of the site that holds the copy, and the file the viewer asks for in it */
export const SITE_FOLDER = 'favicons';
export const DATA_FILE = 'favicons.json';

/** What the Favicons page shows: the data, and the three views. Everything else in the set is listed in the data, not shown. */
export const SITE_FILES: readonly string[] = [DATA_FILE, ...VIEWS.map((view) => view.file)];

/** True when `dir` is a real folder holding a favicons.json of this plugin, so it is a copy this plugin may replace. */
function isOurCopy(dir: string): boolean {
  try {
    if (!fs.lstatSync(dir).isDirectory()) return false;
    const data: unknown = JSON.parse(fs.readFileSync(path.join(dir, DATA_FILE), 'utf-8'));
    return typeof data === 'object' && data !== null && (data as { format?: unknown }).format === 'blazon-favicons';
  } catch {
    return false;
  }
}

/**
 * Cannot, with the reason, when the site already has a favicons/ that is not this plugin's own copy: a folder of the
 * project's, which the copy would replace. Asked before anything is drawn, so a refusal writes nothing.
 */
export function checkSite(siteDir: string): void {
  const dir = path.join(siteDir, SITE_FOLDER);
  if (fs.lstatSync(dir, { throwIfNoEntry: false }) && !isOurCopy(dir)) {
    throw new Cannot(`site_dir already has ${SITE_FOLDER}/, which is not the Favicons page's own copy, and the plugin will not replace it`);
  }
}

/** Replaces the site's favicons/ with the files the Favicons page shows, taken from the set just made. */
export function copyToSite(siteDir: string, files: ReadonlyMap<string, Buffer | string>): void {
  const dir = path.join(siteDir, SITE_FOLDER);
  replaceFolder(
    dir,
    [...SITE_FILES].sort().map((file): Entry => [file, files.get(file)!]),
  );
}
