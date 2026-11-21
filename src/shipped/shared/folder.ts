import fs from 'node:fs';
import path from 'node:path';
import type { Entry } from './zip.js';

// Writes a set of files so that a failure part-way, or a kill, does not leave half a set. The files are first written to a folder
// of their own beside (or inside) the target, and only a finished set is moved into place. A leftover from a killed run is
// removed at the start of the next one, because the name is fixed. Nothing here depends on the clock or on a random name.

export type { Entry };

/** Replaces `dir` with a folder holding exactly `entries`: what `dir` held before, such as a file of an earlier run, is gone. */
export function replaceFolder(dir: string, entries: Iterable<Entry>): void {
  const staged = `${dir}.part`;
  const old = `${dir}.old`;
  fs.rmSync(staged, { recursive: true, force: true });
  fs.rmSync(old, { recursive: true, force: true });
  try {
    stage(staged, entries);
    const had = fs.lstatSync(dir, { throwIfNoEntry: false }) !== undefined;
    if (had) fs.renameSync(dir, old);
    try {
      fs.renameSync(staged, dir);
    } catch (error) {
      if (had) fs.renameSync(old, dir);
      throw error;
    }
  } finally {
    fs.rmSync(staged, { recursive: true, force: true });
  }
  fs.rmSync(old, { recursive: true, force: true });
}

/**
 * Writes `entries` into `dir`, leaving the other files in it. A file is never seen half written. Used where `dir` is the host's own
 * out_dir, which a plugin may not replace, so the set is staged in a folder inside it and moved up once it is all made.
 */
export function writeFolder(dir: string, entries: Iterable<Entry>): void {
  const staged = path.join(dir, '.part');
  fs.rmSync(staged, { recursive: true, force: true });
  try {
    stage(staged, entries);
    for (const file of walk(staged)) {
      const target = path.join(dir, file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.renameSync(path.join(staged, file), target);
    }
  } finally {
    fs.rmSync(staged, { recursive: true, force: true });
  }
}

function stage(folder: string, entries: Iterable<Entry>): void {
  fs.mkdirSync(folder, { recursive: true });
  for (const [file, content] of entries) {
    const target = path.join(folder, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
}

function walk(root: string, sub = ''): string[] {
  return fs.readdirSync(path.join(root, sub), { withFileTypes: true }).flatMap((item) => {
    const rel = path.join(sub, item.name);
    return item.isDirectory() ? walk(root, rel) : [rel];
  });
}
