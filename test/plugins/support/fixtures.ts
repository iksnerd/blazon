import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_CONFIG } from '../../../src/core/config/index.js';
import { recordPin } from '../../../src/plugins/pins/lock.js';
import type { BlazonConfig } from '../../../src/types/index.js';
import { tempDir } from '../../support/project';

// Fixture plugins and the projects they are installed in, shared by the tests of the roles and of the profile.

export const dirs: string[] = [];
export function cleanup(): void {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
}

export const BRAND = { format: 'blazon-brand', version: 1, tokens: [] };

/** A fixture plugin: the manifest call answers with `manifest`, and a request runs `body` after its stdin is read. */
export function script(manifest: object, body: string): string {
  return `#!/bin/sh
case "$1" in
  --blazon-manifest) printf '%s' '${JSON.stringify(manifest)}'; exit 0;;
esac
cat > "\${REQUEST_COPY:-/dev/null}"
${body}
`;
}
export const answer = (findings: unknown[]) => `cat <<'EOF'\n${JSON.stringify({ findings })}\nEOF`;

export interface Installed {
  cwd: string;
  config: BlazonConfig;
}

/** A project with plugins installed: pinned ones in plugins/<name>/ and recorded in the lock, unpinned ones where blazon looks for them. */
export function install(plugins: Record<string, { script: string; pinned?: boolean; options?: object }>, extra: Partial<BlazonConfig> = {}): Installed {
  const cwd = tempDir();
  for (const [name, plugin] of Object.entries(plugins)) {
    const where = plugin.pinned === false ? path.join(cwd, '.blazon', 'plugins') : path.join(cwd, 'plugins', name);
    fs.mkdirSync(where, { recursive: true, mode: 0o700 });
    const file = path.join(where, `blazon-${name}`);
    fs.writeFileSync(file, plugin.script);
    fs.chmodSync(file, 0o755);
    if (plugin.pinned !== false) recordPin(cwd, name, where);
  }
  const config = { ...DEFAULT_CONFIG, plugins: Object.entries(plugins).map(([name, plugin]) => ({ name, ...(plugin.options && { options: plugin.options }) })), ...extra } as BlazonConfig;
  return { cwd, config };
}

