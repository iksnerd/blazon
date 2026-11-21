import { spawnSync } from './spawn';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT_DIR } from '../plugins/support/spec.js';
import { tempDir } from './project';

// Shared by test/plugins/host/cli*.test.ts: `blazon plugin check <program>` and `blazon plugin pin <path>` run as the real command,
// and a plugin program that conforms.

// NO_COLOR wins over FORCE_COLOR in picocolors, and CI sets FORCE_COLOR: without it the output carries ANSI codes the assertions do not expect.
export const blazon = (...args: string[]) =>
  spawnSync(process.execPath, ['--import', 'tsx', path.join(ROOT_DIR, 'scripts/blazon-src.ts'), ...args], {
    encoding: 'utf-8',
    cwd: ROOT_DIR,
    env: { ...process.env, NO_COLOR: '1' },
  });

export function program(script: string): string {
  const file = path.join(tempDir(), 'blazon-acme.conforming');
  fs.writeFileSync(file, script);
  fs.chmodSync(file, 0o755);
  return file;
}

export const CONFORMING = `#!/bin/sh
case "$1" in
  --blazon-manifest) printf '%s' '{"v":2,"roles":["check","build"]}'; exit 0;;
esac
in=$(cat)
case "$in" in
  '{'*) ;;
  *) echo 'the request is not JSON'; exit 2;;
esac
if printf '%s' "$in" | grep -Eq '"v" *: *[12][,}]'; then
  echo '{"findings":[]}'
  exit 0
fi
echo 'unsupported record version'; exit 2
`;
