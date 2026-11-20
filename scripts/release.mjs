// Cuts a release locally: `npm run release -- <version>` (CONTRIBUTING, "Cutting a release").
// It refuses unless the tree is clean, the branch is main, the version is a semantic version greater than the current one and
// the tag does not exist. Then it runs `npm run check`, sets the version in package.json and the lockfile, writes the new version's section into the
// CHANGELOG under a fresh empty "Unreleased" (from the fragments in changelog.d/, which the release commit removes with git rm; or, with
// none, from the text under Unreleased), regenerates docs/stats.json (`npm run docs:stats`,
// it records the version) and runs the docs tests (`npm run test:docs`). Only if they pass does it commit `release v<version>`, which
// holds package.json, the lockfile, CHANGELOG.md and docs/stats.json, and create the annotated tag `v<version>`. If the docs tests
// fail it commits and tags nothing and leaves the tree as written, so a commit that would fail the pre-push or the tag's CI is never made. It never pushes: it prints the command. Pushing the tag is what starts CI (ci.yml), and the tag
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

/** The kinds of change fragment, in the order the CHANGELOG lists them (changelog.d/README.md). */
export const FRAGMENT_KINDS = ['breaking', 'added', 'changed', 'fixed'];
const heading = (kind) => kind[0].toUpperCase() + kind.slice(1);
const UNRELEASED = /^## Unreleased[ \t]*$/m;
const COMMENT = /<!--[^]*?-->/g;

/** The text under "## Unreleased" up to the next version heading, HTML comments left out. It is empty when the heading is. */
export function unreleasedText(text) {
  const match = UNRELEASED.exec(text);
  if (!match) return '';
  const rest = text.slice(match.index + match[0].length);
  const next = rest.search(/^## /m);
  return (next < 0 ? rest : rest.slice(0, next)).replace(COMMENT, '').trim();
}

/**
 * The fragments in `<cwd>/changelog.d/`: `<slug>.<kind>.md`, the text of one bullet. Sorted by file name. Refuses, naming the file, a name
 * outside [a-z0-9._-], an unknown kind, an empty body and an em-dash. README.md is not a fragment.
 */
export function readFragments(cwd = process.cwd()) {
  const dir = path.join(cwd, 'changelog.d');
  if (!fs.existsSync(dir)) return [];
  const found = [];
  for (const file of fs.readdirSync(dir).sort()) {
    if (file === 'README.md') continue;
    const where = `changelog.d/${file}`;
    if (!/^[a-z0-9._-]+$/.test(file)) refuse(`${where}: a fragment name uses only [a-z0-9._-]`);
    const match = /^(.+)\.([a-z]+)\.md$/.exec(file);
    if (!match) refuse(`${where}: a fragment is named <slug>.<kind>.md, with kind one of ${FRAGMENT_KINDS.join(', ')}`);
    const kind = match[2];
    if (!FRAGMENT_KINDS.includes(kind)) refuse(`${where}: unknown kind "${kind}"; use one of ${FRAGMENT_KINDS.join(', ')}`);
    const body = fs.readFileSync(path.join(dir, file), 'utf-8').trim();
    if (body === '') refuse(`${where}: the body is empty`);
    if (body.includes('—')) refuse(`${where}: contains an em-dash; reword it`);
    found.push({ file, kind, body });
  }
  return found;
}

/** The new version's section: "## <version> (<date>)", then a list per kind in CHANGELOG order, bullets in file-name order. No trailing newline. */
export function assembleSection(fragments, version, date) {
  const lists = FRAGMENT_KINDS.flatMap((kind) => {
    const items = fragments.filter((f) => f.kind === kind).sort((a, b) => (a.file < b.file ? -1 : 1));
    if (items.length === 0) return [];
    return [`### ${heading(kind)}\n\n${items.map((f) => `- ${f.body.split('\n').join('\n  ')}`).join('\n')}`];
  });
  return [`## ${version} (${date})`, ...lists].join('\n\n');
}

/**
 * The changelog with its "Unreleased" heading kept, empty, above a new "<version> (<date>)" heading. The section is made from the
 * fragments, or, with none, from the text under Unreleased. Both at once, or neither, is refused. A comment under Unreleased stays.
 */
export function releaseChangelog(text, version, date, fragments = []) {
  const match = UNRELEASED.exec(text);
  if (!match) refuse('CHANGELOG.md has no "## Unreleased" heading to release');
  const hand = unreleasedText(text);
  if (fragments.length > 0 && hand !== '')
    refuse('there are two sources of release notes: hand-written text under "## Unreleased" and fragments in changelog.d/. Move the text into fragments');
  if (fragments.length === 0 && hand === '') refuse('nothing to release: no fragments in changelog.d/ and nothing under "## Unreleased"');
  if (fragments.length === 0) return text.replace(UNRELEASED, `## Unreleased\n\n## ${version} (${date})`);
  const rest = text.slice(match.index + match[0].length);
  const next = rest.search(/^## /m);
  const comments = (next < 0 ? rest : rest.slice(0, next)).match(COMMENT) ?? [];
  const tail = next < 0 ? '\n' : `\n\n${rest.slice(next)}`;
  const head = text.slice(0, match.index + match[0].length);
  return `${head}\n\n${comments.map((c) => `${c}\n\n`).join('')}${assembleSection(fragments, version, date)}${tail}`;
}

/** The section the next release would write, with "<version>" in the heading. Changes nothing. */
export function previewChangelog(cwd = process.cwd(), now = new Date()) {
  const date = now.toISOString().slice(0, 10);
  const out = releaseChangelog(fs.readFileSync(path.join(cwd, 'CHANGELOG.md'), 'utf-8'), '<version>', date, readFragments(cwd));
  const rest = out.slice(out.indexOf('## <version>'));
  const next = rest.slice(3).search(/^## /m);
  return (next < 0 ? rest : rest.slice(0, next + 3)).trim();
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
  const fragments = readFragments(cwd);
  const notes = releaseChangelog(fs.readFileSync(changelog, 'utf-8'), version, date, fragments);

  console.log(`release: checking before ${current} -> ${version}`);
  execFileSync('npm', ['run', 'check'], { cwd, stdio: 'inherit' });
  if (git('status', '--porcelain', '--untracked-files=all') !== '') refuse('npm run check changed the working tree; review it, commit it and run the release again');

  // --workspaces=false: the root only. mcp/ is private and keeps its own version.
  run('npm', ['version', version, '--no-git-tag-version', '--workspaces=false'], cwd);
  fs.writeFileSync(changelog, notes);
  console.log('release: regenerating docs/stats.json and running the docs tests');
  execFileSync('npm', ['run', 'docs:stats'], { cwd, stdio: 'inherit' });
  try {
    execFileSync('npm', ['run', 'test:docs'], { cwd, stdio: 'inherit' });
  } catch {
    refuse('the docs tests failed, so nothing is committed or tagged. The tree holds the release edits as written; fix the cause, then `git restore .` and run the release again');
  }
  const files = ['package.json', 'CHANGELOG.md', 'docs/stats.json', ...(fs.existsSync(path.join(cwd, 'package-lock.json')) ? ['package-lock.json'] : [])];
  git('add', '--', ...files);
  if (fragments.length > 0) git('rm', '-q', '--', ...fragments.map((f) => `changelog.d/${f.file}`));
  // --no-verify: the same check just ran on this tree, and the change is a version, a lockfile line, a changelog heading and the stats file, and the docs tests just passed on it.
  git('commit', '--no-verify', '-m', `release v${version}`);
  git('tag', '-a', `v${version}`, '-m', `blazon ${version}`);

  console.log(`release: committed "release v${version}" and tagged v${version}. Nothing is pushed.`);
  console.log('Review it (git show), then start CI with:');
  console.log(`  git push origin main v${version}`);
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(new URL(import.meta.url).pathname)) {
  try {
    if (process.argv[2] === '--preview') console.log(previewChangelog());
    else release(process.argv[2]);
  } catch (error) {
    if (error instanceof Refusal) {
      console.error(`release: ${error.message}`);
      process.exit(1);
    }
    throw error;
  }
}
