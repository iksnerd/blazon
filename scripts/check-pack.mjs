// Says whether the package holds what blazon needs to run for someone who installs it. It lists what `npm pack` would put in the
// package (without running any lifecycle script, so it reads the tree as it is) or what a packed tarball holds, and exits 1 naming
// every required file that is missing. The release job runs it on the tarball it is about to attach.
//   node scripts/check-pack.mjs                  the tree in the current package
//   node scripts/check-pack.mjs --dir <folder>   the tree in another folder
//   node scripts/check-pack.mjs --tarball <tgz>  a tarball
// Required: the compiled library and CLI, the viewer and Geist's license, the MCP server (mcp/dist/index.js, one bundled file), the starter (template/), every shipped plugin's program
// (one for each folder in plugins/) and plugins/shipped.lock. Every plain path in package.json `files` must also be in the package, so the manifest never names what it does not ship. The plugin names come from the folders, so a new plugin needs no edit here.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Paths the package must hold, given the names of the plugin folders in it. */
export function requiredFiles(pluginNames) {
  return [
    'package.json',
    'bin/blazon.js',
    'dist/index.js',
    'dist/index.d.ts',
    'dist/cli/index.js',
    'dist/ui/index.html',
    'dist/ui/assets/geist-OFL.txt',
    'mcp/dist/index.js',
    'template/blazon.json',
    'THIRD-PARTY-NOTICES.md',
    'plugins/shipped.lock',
    ...pluginNames.map((name) => `plugins/${name}/bin/blazon-${name}.🔌`),
  ];
}

/** The required paths that `files` (paths inside the package) lacks. */
export function missingFiles(files, pluginNames) {
  const have = new Set(files);
  return requiredFiles(pluginNames).filter((file) => !have.has(file));
}

/** Names of the folders in <dir>/plugins. */
function pluginNames(dir) {
  const plugins = path.join(dir, 'plugins');
  if (!fs.existsSync(plugins)) return [];
  return fs
    .readdirSync(plugins, { withFileTypes: true })
    .filter((item) => item.isDirectory())
    .map((item) => item.name)
    .sort();
}

/** The entries of `listed` (the manifest's `files`) that no packed file equals or sits under: a path the package names and does not ship. */
export function missingListed(listed, files) {
  return listed.filter((entry) => {
    const base = entry.replace(/^\.\//, '').replace(/\/+$/, '');
    return !files.some((file) => file === base || file.startsWith(`${base}/`));
  });
}

/** The `files` entries of <dir>/package.json that are plain paths (a pattern with a wildcard or a `!` is not checked). */
function listedFiles(dir) {
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8'));
  return (manifest.files ?? []).filter((entry) => !/[*?[\]{}!]/.test(entry));
}

function listTree(dir) {
  const out = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: dir, encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 });
  return JSON.parse(out)[0].files.map((file) => file.path);
}

function listTarball(tarball) {
  const out = execFileSync('tar', ['-tzf', tarball], { encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 });
  return out
    .split('\n')
    .filter(Boolean)
    .map((line) => line.replace(/^package\//, ''));
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2);
  const value = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const tarball = value('--tarball');
  if (args.includes('--tarball') && !tarball) {
    console.error('check-pack: --tarball needs a file');
    process.exit(1);
  }
  const dir = path.resolve(value('--dir') ?? root);
  const files = tarball ? listTarball(path.resolve(tarball)) : listTree(dir);
  // The plugin folders come from the tree on disk, never from the tarball under test, so a tarball that lost a plugin is caught.
  const names = pluginNames(dir);
  const missing = missingFiles(files, names);
  if (missing.length > 0) {
    console.error(`check-pack: the package lacks ${missing.length} required file${missing.length === 1 ? '' : 's'}; run npm run build, then npm pack:\n  ${missing.join('\n  ')}`);
    process.exit(1);
  }
  const unshipped = missingListed(listedFiles(dir), files);
  if (unshipped.length > 0) {
    console.error(
      `check-pack: package.json "files" names ${unshipped.length} path${unshipped.length === 1 ? '' : 's'} the package does not hold; remove the entry or ship the path:\n  ${unshipped.join('\n  ')}`,
    );
    process.exit(1);
  }
  console.log(`check-pack: ok (${files.length} files, ${names.length} plugin programs)`);
}
