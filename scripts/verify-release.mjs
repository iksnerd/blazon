#!/usr/bin/env node
// What a person did by hand after every tag, as code: download the GitHub release, check its checksum and attestation, look inside the
// tarball, install it fresh and use it. With --registry it then does the same against what the owner published on npm.
//
//   npm run verify-release -- <version> [--registry]
//
// Each step prints one line, `ok   <what>` or `FAIL <what>: <reason>`, and the first FAIL stops the run (exit 1). Scratch folders are
// removed either way; the release folder (~/blazon-release-<version>, with the tarball and SHA256SUMS) is kept.
//
// Everything lives under the home folder, never the system temp folder: a node_modules linked from a folder that others can write fails
// the plugin interpreter test (CLAUDE.md, Traps). Every child process runs with the home folder as cwd, or with a folder this script
// keeps for the whole run: a deleted cwd breaks npm.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const REPO = 'iksnerd/blazon';
const PACKAGE = '@iksnerd/blazon';
const SCRIPT_DIR = import.meta.dirname;
const VERSION_PATTERN = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

/** The marker file could not be turned into a usable list. A scan that goes on without markers would check nothing. */
export class MarkersNotLoadedError extends Error {
  constructor(reason) {
    super(`markers not loaded: the scan would check nothing (${reason})`);
    this.name = 'MarkersNotLoadedError';
  }
}

/** `<version> [--registry]` in any order. The version has no `v` and no path characters, because it names a folder. */
export function parseArgs(argv) {
  let version;
  let registry = false;
  for (const arg of argv) {
    if (arg === '--registry') registry = true;
    else if (arg.startsWith('-')) throw new Error(`unknown option ${arg}`);
    else if (version !== undefined) throw new Error('give one version');
    else if (!VERSION_PATTERN.test(arg)) throw new Error(`"${arg}" is not a version like 0.10.0 (no leading v)`);
    else version = arg;
  }
  if (version === undefined) throw new Error('a version is required, like 0.10.0');
  return { version, registry };
}

function collectStrings(value, into) {
  if (typeof value === 'string') into.push(value);
  else if (Array.isArray(value)) for (const item of value) collectStrings(item, into);
  else if (value && typeof value === 'object') for (const item of Object.values(value)) collectStrings(item, into);
}

/**
 * Every string in the file (nested arrays and objects too), trimmed, lower-cased, two characters or longer. A missing or unreadable file,
 * or one that gives zero markers, throws MarkersNotLoadedError: on 2026-11-25 a scan that filtered the markers wrongly loaded none of
 * them and printed "0 hits". The error never holds a marker.
 */
export function loadMarkers(file) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf-8');
  } catch {
    throw new MarkersNotLoadedError('the file is missing or unreadable');
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new MarkersNotLoadedError('the file is not JSON');
  }
  const strings = [];
  collectStrings(parsed, strings);
  const markers = [...new Set(strings.map((s) => s.trim().toLowerCase()).filter((s) => s.length >= 2))];
  if (markers.length === 0) throw new MarkersNotLoadedError('the file holds no usable string');
  return markers;
}

/**
 * Files are `{ path, content }` (content a string or Buffer). The result holds counts and file names only, never a marker or the text
 * around a hit. A file whose own name holds a marker is counted in `nameHits` and its name is left out of `contentFiles`.
 */
export function scanFiles(files, markers) {
  if (!Array.isArray(markers) || markers.length === 0) throw new MarkersNotLoadedError('no markers were given');
  let contentHits = 0;
  let nameHits = 0;
  const contentFiles = [];
  for (const file of files) {
    const nameHit = markers.some((m) => file.path.toLowerCase().includes(m));
    const text = (typeof file.content === 'string' ? file.content : Buffer.from(file.content).toString('latin1')).toLowerCase();
    const contentHit = markers.some((m) => text.includes(m));
    if (nameHit) nameHits += 1;
    if (contentHit) {
      contentHits += 1;
      if (!nameHit) contentFiles.push(file.path);
    }
  }
  return { filesChecked: files.length, contentHits, nameHits, contentFiles };
}

/** One line from a scan result: counts, plus the names of files with a content hit (names that hold a marker are only counted). */
export function formatScan(result) {
  const names = result.contentFiles.length > 0 ? ` (${result.contentFiles.join(', ')})` : '';
  return `${result.contentHits} file(s) with a hit in content${names}, ${result.nameHits} with a hit in the name`;
}

/**
 * `gh attestation verify --format json` prints an array; each entry has verificationResult.signature.certificate. The signer must be
 * this repository's ci.yml at this version's tag, and the source digest must start with the commit the tag points at.
 */
export function checkAttestation(json, { version, commit }) {
  if (!Array.isArray(json) || json.length === 0) return { ok: false, reason: 'no attestation in the output' };
  const signer = `https://github.com/${REPO}/.github/workflows/ci.yml@refs/tags/v${version}`;
  let first;
  for (const entry of json) {
    const cert = entry?.verificationResult?.signature?.certificate;
    let reason;
    if (!cert || typeof cert !== 'object') reason = 'no certificate in the attestation';
    else if (cert.buildSignerURI !== signer) reason = `signer workflow is not ${signer.replace('https://github.com/', '')}`;
    else if (cert.sourceRepositoryRef !== `refs/tags/v${version}`) reason = `source ref is not refs/tags/v${version}`;
    else if (typeof cert.sourceRepositoryDigest !== 'string' || !commit || !cert.sourceRepositoryDigest.startsWith(commit)) {
      reason = `source digest does not start with the tag's commit ${String(commit).slice(0, 12)}`;
    } else return { ok: true };
    first ??= reason;
  }
  return { ok: false, reason: first };
}

// ---- the run ----

const HOME = os.homedir();

function run(command, args, cwd = HOME) {
  const r = spawnSync(command, args, { cwd, encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 });
  return { status: r.status ?? -1, stdout: r.stdout ?? '', stderr: r.stderr ?? '', error: r.error };
}

function tail(text) {
  const lines = text.trim().split('\n').filter(Boolean);
  return lines.slice(-3).join(' | ').slice(0, 300);
}

function hash(algorithm, file) {
  return createHash(algorithm).update(fs.readFileSync(file)).digest('hex');
}

function filesUnder(dir) {
  const out = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) out.push(full);
    }
  };
  walk(dir);
  return out;
}

class StepFailed extends Error {}

const scratch = [];

function newScratch(prefix) {
  const dir = fs.mkdtempSync(path.join(HOME, prefix));
  scratch.push(dir);
  return dir;
}

/** Runs one step: prints `ok   label` (plus any detail the step returns) or `FAIL label: reason` and stops the run. */
async function step(label, fn) {
  try {
    const detail = await fn();
    console.log(`ok   ${label}${detail ? ` (${detail})` : ''}`);
  } catch (error) {
    console.log(`FAIL ${label}: ${error instanceof Error ? error.message : String(error)}`);
    throw new StepFailed(label);
  }
}

function must(r, what) {
  if (r.error) throw new Error(`${what} could not start: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`${what} exited ${r.status}: ${tail(r.stderr || r.stdout)}`);
  return r;
}

/** Steps 5 and 6 for one source of the package: a local tarball path or `@iksnerd/blazon@<version>`. */
async function installAndExercise(spec, tag, version) {
  const work = newScratch(`blazon-verify-${tag}-`);
  const pkgDir = path.join(work, 'node_modules', ...PACKAGE.split('/'));
  await step(`${tag}: fresh install`, () => {
    must(run('npm', ['init', '-y'], work), 'npm init');
    must(run('npm', ['install', '--no-fund', '--no-audit', spec], work), 'npm install');
    const installed = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf-8')).version;
    if (installed !== version) throw new Error(`installed version is ${installed}, not ${version}`);
  });
  await step(`${tag}: npm audit --omit=dev`, () => {
    const r = run('npm', ['audit', '--omit=dev'], work);
    if (r.error || r.status !== 0 || !/found 0 vulnerabilities/.test(r.stdout)) throw new Error(`not 0 vulnerabilities: ${tail(r.stdout || r.stderr)}`);
    return '0 vulnerabilities';
  });
  await step(`${tag}: npm audit signatures`, () => {
    const r = run('npm', ['audit', 'signatures'], work);
    const out = r.stdout + r.stderr;
    const signatures = /(\d+) packages? ha(?:s|ve) verified registry signatures?/.exec(out);
    if (r.error || r.status !== 0 || !signatures) throw new Error(`registry signatures not all verified: ${tail(out)}`);
    // The attestation count varies with the dependency versions: printed, never asserted.
    const attestations = /(\d+) packages? ha(?:s|ve) verified attestations?/.exec(out);
    return `${signatures[1]} registry signatures, ${attestations ? attestations[1] : 0} attestations`;
  });

  const bin = path.join(pkgDir, 'bin', 'blazon.js');
  const blazon = (args) => run('node', [bin, ...args], work);
  await step(`${tag}: init full, check, check --json, build`, () => {
    must(blazon(['init', 'full', '--yes']), 'init');
    must(blazon(['check', 'full']), 'check');
    const json = must(blazon(['check', 'full', '--json']), 'check --json');
    if (json.stderr !== '') throw new Error(`check --json wrote to stderr: ${tail(json.stderr)}`);
    must(blazon(['build', 'full']), 'build');
  });
  const help = blazon(['init', '--help']);
  if (!(help.stdout + help.stderr).includes('--minimal')) {
    console.log(`skip ${tag}: init --minimal (this version's init has no --minimal)`);
  } else {
    await step(`${tag}: init small --minimal, check, build`, () => {
      must(blazon(['init', 'small', '--yes', '--minimal']), 'init --minimal');
      must(blazon(['check', 'small']), 'check');
      must(blazon(['build', 'small']), 'build');
    });
  }
  await step(`${tag}: starter .gitignore`, () => {
    // npm drops a .gitignore from a package, so the packed template has none and init writes one from code.
    const template = path.join(pkgDir, 'template');
    if (!fs.existsSync(template)) throw new Error('the package has no template/ folder');
    if (filesUnder(template).some((f) => path.basename(f) === '.gitignore')) throw new Error('template/ holds a .gitignore');
    const written = path.join(work, 'full', '.gitignore');
    if (!fs.existsSync(written) || !fs.readFileSync(written, 'utf-8').split('\n').includes('dist/')) throw new Error('init wrote no .gitignore with dist/');
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  process.chdir(HOME);
  const { version, registry } = parseArgs(process.argv.slice(2));
  const folder = path.join(HOME, `blazon-release-${version}`);
  const tarball = path.join(folder, `iksnerd-blazon-${version}.tgz`);
  const repoRoot = path.join(SCRIPT_DIR, '..');
  let sha1 = '';
  let fileCount = 0;

  await step(`download v${version} into ~/blazon-release-${version}`, () => {
    if (fs.existsSync(folder)) throw new Error(`${folder} exists; remove it or pick another version`);
    fs.mkdirSync(folder);
    try {
      must(run('gh', ['release', 'download', `v${version}`, '--repo', REPO, '--dir', folder]), 'gh release download');
    } catch (error) {
      // A failed download (no such release, no network) must not leave an empty folder: the next run would refuse to start on it.
      if (fs.readdirSync(folder).length === 0) fs.rmdirSync(folder);
      throw error;
    }
    if (!fs.existsSync(tarball)) throw new Error(`no ${path.basename(tarball)} in the release`);
    if (!fs.existsSync(path.join(folder, 'SHA256SUMS'))) throw new Error('no SHA256SUMS in the release');
  });

  await step('SHA256SUMS matches', () => {
    // The release folder is kept for the whole run, so it is safe as a cwd, and the sums file names the tarball relative to itself.
    const r = must(run('shasum', ['-a', '256', '-c', 'SHA256SUMS'], folder), 'shasum');
    if (!r.stdout.includes(path.basename(tarball))) throw new Error('SHA256SUMS does not list the tarball');
  });

  await step('attestation: ci.yml on the tag, built from the tag commit', () => {
    let commit = run('git', ['rev-parse', `v${version}^{commit}`], repoRoot);
    if (commit.status !== 0) {
      run('git', ['fetch', '--tags'], repoRoot);
      commit = run('git', ['rev-parse', `v${version}^{commit}`], repoRoot);
    }
    if (commit.status !== 0) throw new Error(`tag v${version} is not in this repository, even after git fetch --tags`);
    // `gh attestation verify` prints NOTHING when it has no terminal unless it is given --format json. Without it this step would
    // read an empty string and either pass on nothing or fail with no reason.
    const r = must(run('gh', ['attestation', 'verify', tarball, '--repo', REPO, '--format', 'json']), 'gh attestation verify');
    let json;
    try {
      json = JSON.parse(r.stdout);
    } catch {
      throw new Error('gh attestation verify printed no JSON');
    }
    const verdict = checkAttestation(json, { version, commit: commit.stdout.trim() });
    if (!verdict.ok) throw new Error(verdict.reason);
    return `commit ${commit.stdout.trim().slice(0, 12)}`;
  });

  sha1 = hash('sha1', tarball);

  const extract = newScratch('blazon-verify-extract-');
  await step('tarball: extract and read package.json', () => {
    must(run('tar', ['-xzf', tarball, '-C', extract]), 'tar');
    const manifest = JSON.parse(fs.readFileSync(path.join(extract, 'package', 'package.json'), 'utf-8'));
    if (manifest.version !== version) throw new Error(`package.json version is ${manifest.version}, not ${version}`);
  });
  const files = filesUnder(extract).map((file) => ({ path: path.relative(extract, file), content: fs.readFileSync(file) }));
  fileCount = files.length;
  await step('tarball: file count', () => `${fileCount} files`);
  await step('tarball: no /Users/ in any file', () => {
    const hits = files.filter((f) => f.content.includes('/Users/')).map((f) => f.path);
    if (hits.length > 0) throw new Error(`${hits.length} file(s): ${hits.join(', ')}`);
  });
  await step('tarball: no private marker in any path or content', () => {
    // The markers are loaded by loadMarkers, which throws when it gets none: a scan with nothing to look for must not pass.
    // Only counts and file names are printed, never a marker or the text around a hit.
    const markers = loadMarkers(path.join(HOME, '.config', 'blazon', 'private-markers.json'));
    const result = scanFiles(files, markers);
    if (result.contentHits + result.nameHits > 0) throw new Error(formatScan(result));
    return `${markers.length} markers loaded, ${result.filesChecked} files, 0 hits`;
  });

  await installAndExercise(tarball, 'tarball', version);

  if (registry) {
    let found = false;
    const deadline = Date.now() + 15 * 60 * 1000;
    let waited = 0;
    await step(`registry: ${PACKAGE}@${version} is published`, async () => {
      for (;;) {
        const r = run('npm', ['view', `${PACKAGE}@${version}`, 'version']);
        if (r.status === 0 && r.stdout.trim() === version) {
          found = true;
          break;
        }
        if (Date.now() + 20_000 > deadline) break;
        await sleep(20_000);
        waited += 20;
      }
      if (!found) throw new Error('not on the registry after 15 minutes');
      return `after ${waited} s`;
    });
    await step('registry: dist.shasum equals the tarball sha1', () => {
      const r = must(run('npm', ['view', `${PACKAGE}@${version}`, 'dist.shasum']), 'npm view');
      if (r.stdout.trim() !== sha1) throw new Error(`registry has ${r.stdout.trim()}, the release tarball is ${sha1}`);
      return sha1;
    });
    await step('registry: dist-tags.latest', () => {
      const r = must(run('npm', ['view', PACKAGE, 'dist-tags.latest']), 'npm view');
      if (r.stdout.trim() !== version) throw new Error(`latest is ${r.stdout.trim()}, not ${version}`);
    });
    await installAndExercise(`${PACKAGE}@${version}`, 'registry', version);
  }

  console.log(`\nsummary: v${version} verified from ${registry ? 'the release and the registry' : 'the release'} (${fileCount} files, release folder ${folder}).`);
  if (!registry) {
    // The tarball path is required: without it npm looks for a package.json in the cwd.
    console.log(`to publish (sha1 ${sha1}):\ncd ~ && npm login && npm publish ./blazon-release-${version}/iksnerd-blazon-${version}.tgz --access public`);
  }
}

function cleanup() {
  process.chdir(HOME);
  for (const dir of scratch) fs.rmSync(dir, { recursive: true, force: true });
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(new URL(import.meta.url).pathname)) {
  let code = 0;
  try {
    await main();
  } catch (error) {
    code = 1;
    if (!(error instanceof StepFailed)) console.log(`FAIL ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    cleanup();
  }
  process.exit(code);
}
