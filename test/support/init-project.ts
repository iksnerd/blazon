import { runInit } from '../../src/cli/commands/init.js';
import { setPlugins, tempDir, type StarterPlugins } from './project.js';

// The helpers that run `blazon init`. They are apart from `project.ts` on purpose: a test that imports this file has init in its
// import closure, so `vitest related` selects it when init changes, and a test that only makes a temp folder does not have it.

/** Runs `blazon init` in `dir` and sets the plugins the project allows (none unless the test says). */
export async function initStarter(dir: string, { plugins = 'none', minimal = false }: { plugins?: StarterPlugins; minimal?: boolean } = {}): Promise<void> {
  await runInit(dir, { minimal });
  setPlugins(dir, plugins);
}

/** A temporary project that `blazon init` wrote: the starter brand, with the plugins the test names and none by default. */
export async function starterProject(options: { plugins?: StarterPlugins; minimal?: boolean } = {}): Promise<string> {
  const root = tempDir('blazon-starter-');
  await initStarter(root, options);
  return root;
}
