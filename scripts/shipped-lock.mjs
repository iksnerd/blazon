// Writes plugins/shipped.lock, the lock that ships beside the plugins in blazon's package (RFC 0005 section 3.6):
// one tree pin for each folder in plugins/. `--check` writes nothing and exits 1 when the committed lock is not the one
// the folders make. `--dir <folder>` points it at another plugins folder; the tests do. The digest is the host's own
// (src/plugins/pins/pin.ts), so it runs through tsx: `npm run shipped-lock`, which `prepack` runs too.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLockFile, writeLockFile } from '../src/plugins/pins/lock.ts';
import { isPluginName, pluginEntry, shippedLayoutProblem } from '../src/core/plugin-name.ts';
import { treeDigest } from '../src/plugins/pins/pin.ts';

const args = process.argv.slice(2);
const check = args.includes('--check');
const at = args.indexOf('--dir');
const fail = (line) => {
  console.error(`shipped-lock: ${line}`);
  process.exit(1);
};

if (at >= 0 && !args[at + 1]) fail('--dir needs a folder');
const dir = path.resolve(at >= 0 ? args[at + 1] : path.join(path.dirname(fileURLToPath(import.meta.url)), '../plugins'));
const file = path.join(dir, 'shipped.lock');
if (!fs.statSync(dir, { throwIfNoEntry: false })?.isDirectory()) fail(`--dir ${dir} is not a folder`);

const plugins = {};
for (const folder of fs
  .readdirSync(dir, { withFileTypes: true })
  .filter((item) => item.isDirectory())
  .map((item) => item.name)
  .sort()) {
  if (!isPluginName(folder)) fail(`${folder} is not a plugin name: dotted lowercase words such as blazon.print-book`);
  const entry = pluginEntry(folder);
  const program = fs.lstatSync(path.join(dir, folder, entry), { throwIfNoEntry: false });
  if (!program?.isFile()) {
    const binDir = path.join(dir, folder, 'bin');
    const misnamed = fs.existsSync(binDir) ? fs.readdirSync(binDir) : [];
    const hint = misnamed.map((file) => shippedLayoutProblem(path.join(binDir, file))).find(Boolean);
    fail(`${folder} has no program at ${entry}${hint ? `: ${hint}` : ''}`);
  }
  if ((program.mode & 0o111) !== 0o111) fail(`${folder}: the program at ${entry} is not executable`);
  plugins[folder] = { kind: 'tree', path: folder, entry, digest: treeDigest(path.join(dir, folder)), source: 'computed' };
}

if (!check) {
  writeLockFile(file, { v: 1, plugins });
  console.log(`shipped-lock: wrote ${file} (${Object.keys(plugins).length} plugin${Object.keys(plugins).length === 1 ? '' : 's'})`);
  process.exit(0);
}

if (!fs.existsSync(file)) fail(`${file} does not exist; run npm run shipped-lock`);
const committed = readLockFile(file, 'shipped.lock');
if (committed.problems.length > 0) fail(committed.problems.map((problem) => problem.message).join('; '));
const differences = [];
for (const [name, want] of Object.entries(plugins)) {
  const have = committed.lock.plugins[name];
  if (!have) differences.push(`${name}: not in the lock`);
  else if (JSON.stringify(have) !== JSON.stringify(want)) differences.push(`${name}: changed (lock ${have.digest}, folder ${want.digest})`);
}
for (const name of Object.keys(committed.lock.plugins)) if (!plugins[name]) differences.push(`${name}: in the lock but there is no folder`);
if (differences.length > 0) fail(`${file} is out of date; run npm run shipped-lock\n  ${differences.join('\n  ')}`);
console.log('shipped-lock: the lock matches the folders');
