import { expect } from 'vitest';
import { spawnSync } from './spawn';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT_DIR } from '../plugins/support/spec.js';
import { starterProject } from './init-project';

// Shared by test/plugins/examples/reference*.test.ts: the reference plugin, examples/plugins/acme.house-style, copied into a starter
// project and run through the real commands.

export const python = spawnSync('python3', ['--version']).status === 0;
export const PLUGIN = path.join(ROOT_DIR, 'examples/plugins/acme.house-style');

/** Temporary folders a test made; the test file removes them in its own afterEach. */
export const dirs: string[] = [];

const TSX = pathToFileURL(path.join(ROOT_DIR, 'node_modules/tsx/dist/esm/index.mjs')).href;
export const blazon = (cwd: string, ...args: string[]) => blazonWith({}, cwd, ...args);
export const blazonWith = (env: Record<string, string>, cwd: string, ...args: string[]) =>
  spawnSync(process.execPath, ['--import', TSX, path.join(ROOT_DIR, 'scripts/blazon-src.ts'), ...args], { encoding: 'utf-8', cwd, env: { ...process.env, ...env } });
export const output = (result: { stdout: string; stderr: string }) => result.stdout + result.stderr;

/** The starter, with the reference plugin copied in, pinned by the command, and allowed with these options. */
export async function starter(options: Record<string, unknown> | undefined, firstLine?: string): Promise<string> {
  const root = await starterProject();
  // blazon's h3 is set in the body face; the plugin wants every heading in one font, so the project sets it in the display face
  const typography = path.join(root, 'tokens/typography.json');
  const tree = JSON.parse(fs.readFileSync(typography, 'utf-8'));
  tree.type.h3.$value.fontFamily = '{font.family.display}';
  fs.writeFileSync(typography, JSON.stringify(tree, null, 2));
  fs.cpSync(PLUGIN, path.join(root, 'plugins/acme.house-style'), { recursive: true });
  if (firstLine) {
    const entry = path.join(root, 'plugins/acme.house-style/blazon-acme.house-style');
    fs.writeFileSync(entry, fs.readFileSync(entry, 'utf-8').replace(/^#!.*\n/, `${firstLine}\n`));
  }
  const pin = blazon(root, 'plugin', 'pin', 'plugins/acme.house-style', '--name', 'acme.house-style');
  expect(pin.status, output(pin)).toBe(0);
  const config = path.join(root, 'blazon.json');
  const brand = JSON.parse(fs.readFileSync(config, 'utf-8')) as Record<string, unknown>;
  fs.writeFileSync(config, `${JSON.stringify({ ...brand, plugins: [{ name: 'acme.house-style', ...(options ? { options } : {}) }] }, null, 2)}\n`);
  return root;
}
