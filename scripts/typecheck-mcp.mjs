// Typechecks mcp/, an npm workspace of this repo, with the TypeScript 7 compiler (the root `typescript7` alias, as the root typecheck uses) and the SDK the root install gives it. A checkout with no install is skipped with a notice, except in CI, where it fails.
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const mcp = path.resolve(import.meta.dirname, '../mcp');
let tsc;
try {
  // the package's exports map hides bin/tsc, so find the folder through package.json
  tsc = path.join(path.dirname(createRequire(path.join(mcp, 'package.json')).resolve('typescript7/package.json')), 'bin/tsc');
  createRequire(path.join(mcp, 'package.json')).resolve('@modelcontextprotocol/sdk/package.json');
} catch {
  console.error('The MCP SDK or TypeScript 7 is not installed: mcp/ is not typechecked (run npm install at the repo root).');
  // A developer checkout without an install is skipped; CI always installs, so there a missing compiler is a failure, not a pass.
  process.exit(process.env.CI ? 1 : 0);
}
const result = spawnSync(process.execPath, [tsc, '-p', mcp], { stdio: 'inherit' });
process.exit(result.status ?? 1);
