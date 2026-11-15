// Typechecks mcp/, an npm workspace of this repo, with the compiler and the SDK the root install gives it. A checkout with no install is skipped with a notice.
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const mcp = path.resolve(import.meta.dirname, '../mcp');
let tsc;
try {
  tsc = createRequire(path.join(mcp, 'package.json')).resolve('typescript/bin/tsc');
  createRequire(path.join(mcp, 'package.json')).resolve('@modelcontextprotocol/sdk/package.json');
} catch {
  console.error('The MCP SDK or TypeScript is not installed: mcp/ is not typechecked (run npm install at the repo root).');
  process.exit(0);
}
const result = spawnSync(process.execPath, [tsc, '-p', mcp], { stdio: 'inherit' });
process.exit(result.status ?? 1);
