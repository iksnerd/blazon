import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';
import { runInit } from '../../src/cli/commands/init.js';

// Temporary folders for tests. Every folder made here is removed after the test file that made it, so a test writes no
// cleanup of its own: the module is loaded once for each test file, and this registers the removal with that file.

const made = new Set<string>();

/** Remove every folder made so far, and say how many. The test file's own end does this; a test may too. */
export function removeAll(): number {
  const folders = [...made];
  made.clear();
  for (const folder of folders) fs.rmSync(folder, { recursive: true, force: true });
  return folders.length;
}
afterAll(removeAll);

/** An empty folder under the system's temporary folder, its path resolved so it compares equal to a real path. */
export function tempDir(prefix = 'blazon-test-'): string {
  const folder = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  made.add(folder);
  return folder;
}

/** A temporary project with these files at project-relative paths: objects are written as JSON, text as it is. */
export function tempProject(files: Record<string, unknown> = {}): string {
  const root = tempDir();
  for (const [relative, content] of Object.entries(files)) {
    const full = path.join(root, relative);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, typeof content === 'string' ? content : JSON.stringify(content));
  }
  return root;
}

/** A plugin a test allows by name, with its options as data. */
export type PluginEntry = string | { name: string; options?: unknown; env?: string[] };

/**
 * The plugins a test wants in a new project: `'none'` (the default) allows no plugin, `'starter'` keeps the list the starter was made with
 * (today `blazon.copy`, which the built package runs), and a list names exactly the plugins to allow.
 */
export type StarterPlugins = 'none' | 'starter' | PluginEntry[];

const entryValue = (entry: PluginEntry): Record<string, unknown> => {
  if (typeof entry === 'string') return { name: entry };
  return { name: entry.name, ...(entry.options === undefined ? {} : { options: entry.options }), ...(entry.env === undefined ? {} : { env: entry.env }) };
};

/**
 * Sets the plugins a project's config allows. The starter's own list is replaced: `'none'` leaves no `plugins` key, and a list of
 * entries is written as the `plugins` key.
 */
export function setPlugins(root: string, plugins: StarterPlugins): void {
  if (plugins === 'starter') return;
  const file = path.join(root, 'blazon.json');
  const config: unknown = JSON.parse(fs.readFileSync(file, 'utf-8'));
  if (typeof config !== 'object' || config === null || Array.isArray(config)) throw new Error(`${file} must be a JSON object`);
  const next = { ...(config as Record<string, unknown>) };
  delete next['plugins'];
  if (plugins !== 'none' && plugins.length > 0) next['plugins'] = plugins.map(entryValue);
  fs.writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);
}

/** Runs `blazon init` in `dir` and sets the plugins the project allows (none unless the test says). */
export async function initStarter(dir: string, { plugins = 'none' }: { plugins?: StarterPlugins } = {}): Promise<void> {
  await runInit(dir);
  setPlugins(dir, plugins);
}

/** A temporary project that `blazon init` wrote: the starter brand, with the plugins the test names and none by default. */
export async function starterProject(options: { plugins?: StarterPlugins } = {}): Promise<string> {
  const root = tempDir('blazon-starter-');
  await initStarter(root, options);
  return root;
}
