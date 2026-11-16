// Installs a packed tarball into an empty folder, as someone who has never seen this repository would, and runs the commands they
// would run first. It proves the package works from its own files, not from this checkout. The release job runs it on the tarball
// it is about to attach (ci.yml); run it by hand the same way:
//   npm pack && node scripts/smoke-tarball.mjs iksnerd-blazon-<version>.tgz
// Nothing here reads the repository: the tarball and a temporary folder are all it uses. blazon refuses to run a plugin that has a
// folder others can write above it, so on a machine where the system temp folder is one, set BLAZON_SMOKE_DIR to a folder under home.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tarball = process.argv[2] ? path.resolve(process.argv[2]) : undefined;
if (!tarball || !fs.existsSync(tarball)) {
  console.error('usage: node scripts/smoke-tarball.mjs <package.tgz>');
  process.exit(1);
}

// Under the home folder, not os.tmpdir(): the plugin host refuses an install in a folder that group or others can write, and the
// system temp folder is one on a CI runner, so the shipped plugins would fail to start there.
const base = process.env.BLAZON_SMOKE_DIR ? path.resolve(process.env.BLAZON_SMOKE_DIR) : os.homedir();
fs.mkdirSync(base, { recursive: true });
const work = fs.realpathSync(fs.mkdtempSync(path.join(base, 'blazon-smoke-')));

let failed = false;
function step(label, file, args, options = {}) {
  const run = spawnSync(file, args, { cwd: work, encoding: 'utf-8', timeout: 300_000, ...options });
  const ok = run.status === 0 && (!options.expect || `${run.stdout}${run.stderr}`.includes(options.expect));
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
  if (!ok) {
    failed = true;
    console.error(`${run.stdout ?? ''}${run.stderr ?? ''}`.trim().split('\n').slice(-20).join('\n'));
    throw new Error(`${label} failed`);
  }
  return run;
}

try {
  step('npm init', 'npm', ['init', '-y']);
  step('npm install <tarball>', 'npm', ['install', '--no-audit', '--no-fund', tarball]);
  // npm 12 warns an installer about a script of the package it was not told to trust. The packed manifest must carry none that npm
  // runs for an installer or a git dependency, so the warning cannot appear (the contributor hooks are `npm run hooks`).
  const manifest = JSON.parse(fs.readFileSync(path.join(work, 'node_modules', '@iksnerd', 'blazon', 'package.json'), 'utf-8'));
  const lifecycle = ['preinstall', 'install', 'postinstall', 'prepublish', 'preprepare', 'prepare', 'postprepare'].filter((name) => manifest.scripts?.[name]);
  if (lifecycle.length > 0) {
    failed = true;
    console.error(`FAIL the package's manifest has install-time scripts: ${lifecycle.join(', ')}`);
    throw new Error('install-time scripts');
  }
  console.log('ok   no install-time script in the package');
  const blazon = path.join(work, 'node_modules', '.bin', 'blazon');
  const programs = path.join(work, 'node_modules', '@iksnerd', 'blazon', 'plugins');
  step('blazon --help', blazon, ['--help'], { expect: 'Usage' });
  step('blazon init', blazon, ['init', 'brand', '--yes']);
  step('blazon check', blazon, ['check', 'brand']);
  step('blazon build', blazon, ['build', 'brand']);
  const name = 'blazon.copy';
  step(`blazon plugin check --core (${name})`, blazon, ['plugin', 'check', path.join(programs, name, 'bin', `blazon-${name}.🔌`), '--core']);
  step('blazon doctor', blazon, ['doctor'], { cwd: path.join(work, 'brand') });
  console.log('smoke: the tarball installs and runs');
} catch (error) {
  if (!failed) console.error(String(error));
  process.exitCode = 1;
} finally {
  fs.rmSync(work, { recursive: true, force: true });
}
