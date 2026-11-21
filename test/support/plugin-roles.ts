import { spawnSync } from './spawn';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { recordPin } from '../../src/plugins/pins/lock.js';
import { ROOT_DIR } from '../plugins/support/spec.js';
import { starterProject } from './init-project';

// Shared by test/plugins/roles/commands-*.test.ts: blazon check, tokens and build run as processes against a starter project
// with pinned plugins (RFC 0002 of blazon, section 2).

/** Temporary folders a test made; the test file removes them in its own afterEach. */
export const dirs: string[] = [];

// The loader is named by URL, because the project is a temporary folder that has no node_modules.
const TSX = pathToFileURL(path.join(ROOT_DIR, 'node_modules/tsx/dist/esm/index.mjs')).href;
export const blazon = (cwd: string, ...args: string[]) =>
  spawnSync(process.execPath, ['--import', TSX, path.join(ROOT_DIR, 'scripts/blazon-src.ts'), ...args], { encoding: 'utf-8', cwd });
export const output = (result: { stdout: string; stderr: string }) => result.stdout + result.stderr;

export function manifest(roles: string[]): string {
  return JSON.stringify({ v: 2, roles });
}
export function plugin(roles: string[], body: string): string {
  return `#!/bin/sh\ncase "$1" in\n  --blazon-manifest) printf '%s' '${manifest(roles)}'; exit 0;;\nesac\ncat > /dev/null\n${body}\n`;
}
export const answer = (findings: unknown[]) => `cat <<'EOF'\n${JSON.stringify({ findings })}\nEOF`;
export const finding = (severity: string, extra: object = {}) => ({
  code: 'acme.house-style/heading-font',
  severity,
  path: 'type.heading',
  message: 'Headings must use the display font',
  ...extra,
});

/** The starter project, with plugins installed and allowed. A pinned plugin is in plugins/<name>/ and in the lock. */
export async function project(plugins: Record<string, { script: string; pinned?: boolean }>): Promise<string> {
  const root = await starterProject({ plugins: Object.keys(plugins) });
  for (const [name, spec] of Object.entries(plugins)) {
    const where = path.join(root, spec.pinned === false ? '.blazon/plugins' : `plugins/${name}`);
    fs.mkdirSync(where, { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(where, `blazon-${name}`), spec.script, { mode: 0o755 });
    fs.chmodSync(path.join(where, `blazon-${name}`), 0o755);
    if (spec.pinned !== false) recordPin(root, name, where);
  }
  return root;
}
