// Cuts a release locally: `npm run release -- <version>` (CONTRIBUTING, "Cutting a release").
// It refuses unless the tree is clean, the branch is main, the version is a semantic version greater than the current one and
// the tag does not exist. Then it runs `npm run check`, sets the version in package.json and the lockfile, turns the CHANGELOG's
// "Unreleased" heading into "<version> (<date>)" under a fresh empty "Unreleased", commits `release v<version>` and creates the
// annotated tag `v<version>`. It never pushes: it prints the command. Pushing the tag is what starts CI (ci.yml), and the tag
// is the only thing that does.
// It works in the git repository of the current folder, so a test can run it in a throwaway one. mcp/ is private and has its own
// version, so it is not bumped.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

class Refusal extends Error {}
const refuse = (message) => {
  throw new Refusal(message);
};

/** -1, 0 or 1: how semantic version `a` orders against `b` (semver.org section 11, build metadata not allowed). */
export function compareVersions(a, b) {
  const [pa, pb] = [SEMVER.exec(a), SEMVER.exec(b)];
  if (!pa || !pb) throw new Error(`not a semantic version: ${!pa ? a : b}`);
  for (let i = 1; i <= 3; i++) if (Number(pa[i]) !== Number(pb[i])) return Number(pa[i]) < Number(pb[i]) ? -1 : 1;
  if (!pa[4] && !pb[4]) return 0;
  if (!pa[4]) return 1;
  if (!pb[4]) return -1;
  const [ia, ib] = [pa[4].split('.'), pb[4].split('.')];
  for (let i = 0; i < Math.max(ia.length, ib.length); i++) {
    if (ia[i] === undefined) return -1;
    if (ib[i] === undefined) return 1;
    const [na, nb] = [/^\d+$/.test(ia[i]), /^\d+$/.test(ib[i])];
    if (na && nb) {
      if (Number(ia[i]) !== Number(ib[i])) return Number(ia[i]) < Number(ib[i]) ? -1 : 1;
    } else if (na !== nb) return na ? -1 : 1;
    else if (ia[i] !== ib[i]) return ia[i] < ib[i] ? -1 : 1;
  }
  return 0;
}

/** The changelog with its "Unreleased" heading kept, empty, above a new "<version> (<date>)" heading that takes its notes. */
export function releaseChangelog(text, version, date) {
  const heading = /^## Unreleased[ \t]*$/m;
  if (!heading.test(text)) refuse('CHANGELOG.md has no "## Unreleased" heading to release');
  return text.replace(heading, `## Unreleased\n\n## ${version} (${date})`);
}

function run(file, args, cwd, options = {}) {
  return execFileSync(file, args, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], ...options }).trim();
}

export function release(version, cwd = process.cwd(), now = new Date()) {
  const git = (...args) => run('git', args, cwd);
  if (!version) refuse('usage: npm run release -- <version>   (for example 0.2.0)');
  if (!SEMVER.test(version)) refuse(`"${version}" is not a semantic version such as 0.2.0 (no leading v)`);
  let top;
  try {
    top = git('rev-parse', '--show-toplevel');
  } catch {
    refuse('this is not a git repository');
  }
  if (fs.realpathSync(top) !== fs.realpathSync(cwd)) refuse(`run it from the repository root (${top})`);
  const branch = git('branch', '--show-current');
  if (branch !== 'main') refuse(`releases are cut on main, and this is ${branch || 'a detached HEAD'}`);
  if (git('status', '--porcelain', '--untracked-files=all') !== '') refuse('the working tree is not clean: commit or stash first');
  const manifest = path.join(cwd, 'package.json');
  const current = JSON.parse(fs.readFileSync(manifest, 'utf-8')).version;
  if (compareVersions(version, current) <= 0) refuse(`${version} is not greater than the current version ${current}`);
  if (git('tag', '--list', `v${version}`) !== '') refuse(`the tag v${version} already exists`);
  const changelog = path.join(cwd, 'CHANGELOG.md');
  const date = now.toISOString().slice(0, 10);
  const notes = releaseChangelog(fs.readFileSync(changelog, 'utf-8'), version, date);

  console.log(`release: checking before ${current} -> ${version}`);
  execFileSync('npm', ['run', 'check'], { cwd, stdio: 'inherit' });
  if (git('status', '--porcelain', '--untracked-files=all') !== '') refuse('npm run check changed the working tree; review it, commit it and run the release again');

  // --workspaces=false: the root only. mcp/ is private and keeps its own version.
  run('npm', ['version', version, '--no-git-tag-version', '--workspaces=false'], cwd);
  fs.writeFileSync(changelog, notes);
  const files = ['package.json', 'CHANGELOG.md', ...(fs.existsSync(path.join(cwd, 'package-lock.json')) ? ['package-lock.json'] : [])];
  git('add', '--', ...files);
  // --no-verify: the same check just ran on this tree, and the change is a version, a lockfile line and a changelog heading.
  git('commit', '--no-verify', '-m', `release v${version}`);
  git('tag', '-a', `v${version}`, '-m', `blazon ${version}`);

  console.log(`release: committed "release v${version}" and tagged v${version}. Nothing is pushed.`);
  console.log('Review it (git show), then start CI with:');
  console.log(`  git push origin main v${version}`);
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(new URL(import.meta.url).pathname)) {
  try {
    release(process.argv[2]);
  } catch (error) {
    if (error instanceof Refusal) {
      console.error(`release: ${error.message}`);
      process.exit(1);
    }
    throw error;
  }
}
