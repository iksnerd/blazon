import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from '../../support/spawn';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LOCK_FILE, readLock, recordPin } from '../../../src/plugins/pins/lock.js';
import { fileDigest } from '../../../src/plugins/pins/pin.js';
import { BLAZON_PROFILE } from '../../../src/plugins/wire/profile.js';
import { ROOT_DIR } from '../support/spec.js';
import { starterProject } from '../../support/project';

// The roles through the real commands (RFC 0002 of blazon, section 2): blazon check, blazon tokens and blazon build, with
// plugins pinned in the lock and allowed by the config, run as processes so the exit status is the real one.

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

// The loader is named by URL, because the project is a temporary folder that has no node_modules.
const TSX = pathToFileURL(path.join(ROOT_DIR, 'node_modules/tsx/dist/esm/index.mjs')).href;
const blazon = (cwd: string, ...args: string[]) => spawnSync(process.execPath, ['--import', TSX, path.join(ROOT_DIR, 'scripts/blazon-src.ts'), ...args], { encoding: 'utf-8', cwd });
const output = (result: { stdout: string; stderr: string }) => result.stdout + result.stderr;

function manifest(roles: string[]): string {
  return JSON.stringify({ v: 2, roles });
}
function plugin(roles: string[], body: string): string {
  return `#!/bin/sh\ncase "$1" in\n  --blazon-manifest) printf '%s' '${manifest(roles)}'; exit 0;;\nesac\ncat > /dev/null\n${body}\n`;
}
const answer = (findings: unknown[]) => `cat <<'EOF'\n${JSON.stringify({ findings })}\nEOF`;
const finding = (severity: string, extra: object = {}) => ({ code: 'acme.house-style/heading-font', severity, path: 'type.heading', message: 'Headings must use the display font', ...extra });

/** The starter project, with plugins installed and allowed. A pinned plugin is in plugins/<name>/ and in the lock. */
async function project(plugins: Record<string, { script: string; pinned?: boolean }>): Promise<string> {
  const root = await starterProject({ plugins: Object.keys(plugins) });
  for (const [name, spec] of Object.entries(plugins)) {
    const where = path.join(root, spec.pinned === false ? '.blazon/plugins' : `plugins/${name}`);
    fs.mkdirSync(where, { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(where, `blazon-${name}`), spec.script, { mode: 0o755 });
    fs.chmodSync(path.join(where, `blazon-${name}`), 0o755);
    if (spec.pinned !== false) recordPin(root, name, where);
  }
  return root;
}

describe('blazon check', () => {
  it('shows what a check plugin found, and exits 1 for an error', async () => {
    const root = await project({ 'acme.house-style': { script: plugin(['check'], answer([finding('error')])) } });
    const result = blazon(root, 'check');
    expect(result.status, output(result)).toBe(1);
    expect(output(result)).toContain('type.heading');
    expect(output(result)).toContain('Headings must use the display font');
    expect(output(result)).toContain('[acme.house-style/heading-font]');
  }, 120_000);

  it('shows a warning and exits 0, and --strict turns it into a failure like any other warning', async () => {
    const root = await project({ 'acme.house-style': { script: plugin(['check'], answer([finding('warning')])) } });
    const result = blazon(root, 'check');
    expect(result.status, output(result)).toBe(0);
    expect(output(result)).toContain('WARN');
    expect(output(result)).toContain('Headings must use the display font');
    expect(blazon(root, 'check', '--strict').status).toBe(1);
  }, 120_000);

  it('says nothing about plugins in a project that allows none', async () => {
    const root = await project({});
    const result = blazon(root, 'check');
    expect(result.status, output(result)).toBe(0);
    expect(output(result)).not.toContain('plugin');
  }, 120_000);

  it('refuses an unpinned check plugin the config allows, as an error that says how to pin it', async () => {
    const root = await project({ 'acme.house-style': { script: plugin(['check'], answer([])), pinned: false } });
    const result = blazon(root, 'check');
    expect(result.status).toBe(1);
    expect(output(result)).toContain('is not pinned, and a check plugin must be: run blazon plugin pin <path> --name acme.house-style');
  }, 120_000);

  it('runs an unpinned plugin named with --plugin, with a warning, and it needs no config entry', async () => {
    const root = await project({});
    const program = path.join(root, 'blazon-acme.adhoc');
    fs.writeFileSync(program, plugin(['check'], answer([finding('warning', { code: 'acme.adhoc/x' })])), { mode: 0o755 });
    fs.chmodSync(program, 0o755);
    const result = blazon(root, 'check', '--plugin', program);
    expect(result.status, output(result)).toBe(0);
    expect(output(result)).toContain('acme.adhoc runs unpinned because it was named on the command line');
    expect(output(result)).toContain('[acme.adhoc/x]');
  }, 120_000);

  it('reports a plugin whose pin no longer matches, and does not run it', async () => {
    const marker = path.join(os.tmpdir(), `blazon-ran-${process.pid}-${Date.now()}`);
    dirs.push(marker);
    const root = await project({ 'acme.house-style': { script: plugin(['check'], `touch ${marker}\n${answer([])}`) } });
    fs.appendFileSync(path.join(root, 'plugins/acme.house-style/blazon-acme.house-style'), '# changed\n');
    const result = blazon(root, 'check');
    expect(result.status).toBe(1);
    expect(output(result)).toMatch(/pin mismatch: pinned t1:[0-9a-f]+, found t1:[0-9a-f]+/);
    expect(fs.existsSync(marker)).toBe(false);
  }, 120_000);
});

describe('blazon tokens', () => {
  it('stops on a check plugin\'s error before it writes anything', async () => {
    const root = await project({ 'acme.house-style': { script: plugin(['check'], answer([finding('error')])) } });
    const result = blazon(root, 'tokens');
    expect(result.status).toBe(1);
    expect(fs.existsSync(path.join(root, 'dist/tokens/theme.css'))).toBe(false);
  }, 120_000);

  it('writes the tokens when the plugin finds nothing', async () => {
    const root = await project({ 'acme.house-style': { script: plugin(['check'], answer([])) } });
    expect(blazon(root, 'tokens').status).toBe(0);
    expect(fs.existsSync(path.join(root, 'dist/tokens/theme.css'))).toBe(true);
  }, 120_000);

  it('runs a build plugin after the token files, with a version 2 request that has no site_dir', async () => {
    const reading = `#!/bin/sh
case "$1" in
  --blazon-manifest) printf '%s' '${manifest(['build'])}'; exit 0;;
esac
request="$PWD/.request"
cat > "$request"
out=$(sed -n 's/.*"out_dir":"\\([^"]*\\)".*/\\1/p' "$request")
if grep -q '"site_dir"' "$request"; then echo site > "$out/saw.txt"; else echo none > "$out/saw.txt"; fi
sed -n 's/.*"v":\\([0-9]*\\),.*/\\1/p' "$request" > "$out/version.txt"
ls "$(dirname "$out")" > "$out/tokens-listing.txt"
rm "$request"
`;
    const root = await project({ 'acme.deck': { script: reading } });
    const result = blazon(root, 'tokens');
    expect(result.status, output(result)).toBe(0);
    const out = path.join(root, 'dist/tokens/acme.deck');
    expect(fs.readFileSync(path.join(out, 'saw.txt'), 'utf-8').trim()).toBe('none');
    expect(fs.readFileSync(path.join(out, 'version.txt'), 'utf-8').trim()).toBe('2');
    expect(fs.readFileSync(path.join(out, 'tokens-listing.txt'), 'utf-8')).toContain('theme.css');
    expect(fs.existsSync(path.join(root, 'dist/site'))).toBe(false);
  }, 120_000);

  it('exits 1 when a build plugin reports an error, after the token files are written', async () => {
    const root = await project({ 'acme.deck': { script: plugin(['build'], answer([{ code: 'acme.deck/failed', severity: 'error', path: 'deck', message: 'The deck could not be drawn' }])) } });
    const result = blazon(root, 'tokens');
    expect(result.status, output(result)).toBe(1);
    expect(output(result)).toContain('The deck could not be drawn');
    expect(fs.existsSync(path.join(root, 'dist/tokens/theme.css'))).toBe(true);
  }, 120_000);
});

describe('blazon build', () => {
  it('stops on a check plugin\'s error before it builds the site', async () => {
    const root = await project({ 'acme.house-style': { script: plugin(['check'], answer([finding('error')])) } });
    const result = blazon(root, 'build');
    expect(result.status).toBe(1);
    expect(fs.existsSync(path.join(root, 'dist/site'))).toBe(false);
  }, 120_000);

  it('builds, and the check plugin\'s findings are in the site\'s brand.json, which the Review page reads', async () => {
    const root = await project({ 'acme.house-style': { script: plugin(['check'], answer([finding('warning')])) } });
    const result = blazon(root, 'build');
    expect(result.status, output(result)).toBe(0);
    const brand = JSON.parse(fs.readFileSync(path.join(root, 'dist/site/brand.json'), 'utf-8'));
    expect(brand.findings.filter((f: { code: string }) => f.code === 'acme.house-style/heading-font')).toHaveLength(1);
  }, 120_000);

  it('runs a build plugin after the site exists, into its own out_dir, and gives it the site directory', async () => {
    // A plugin that reads its request: the site and out directories are in it.
    const reading = `#!/bin/sh
case "$1" in
  --blazon-manifest) printf '%s' '${manifest(['build'])}'; exit 0;;
esac
request="$PWD/.request"
cat > "$request"
site=$(sed -n 's/.*"site_dir":"\\([^"]*\\)".*/\\1/p' "$request")
out=$(sed -n 's/.*"out_dir":"\\([^"]*\\)".*/\\1/p' "$request")
ls "$site" > "$out/site-listing.txt"
rm "$request"
`;
    const root = await project({ 'acme.deck': { script: reading } });
    const result = blazon(root, 'build');
    expect(result.status, output(result)).toBe(0);
    const listing = fs.readFileSync(path.join(root, 'dist/tokens/acme.deck/site-listing.txt'), 'utf-8');
    expect(listing).toContain('index.html');
    expect(listing).toContain('brand.json');
  }, 120_000);

  it('exits 1 when a build plugin reports an error, after the site is written', async () => {
    const root = await project({ 'acme.deck': { script: plugin(['build'], answer([{ code: 'acme.deck/failed', severity: 'error', path: 'deck', message: 'The deck could not be drawn' }])) } });
    const result = blazon(root, 'build');
    expect(result.status).toBe(1);
    expect(output(result)).toContain('The deck could not be drawn');
    expect(fs.existsSync(path.join(root, 'dist/site/index.html'))).toBe(true);
  }, 120_000);

  it('does not run a build plugin when the check roles stopped the build', async () => {
    const marker = path.join(os.tmpdir(), `blazon-built-${process.pid}-${Date.now()}`);
    dirs.push(marker);
    const root = await project({
      'acme.house-style': { script: plugin(['check'], answer([finding('error')])) },
      'acme.deck': { script: plugin(['build'], `touch ${marker}`) },
    });
    expect(blazon(root, 'build').status).toBe(1);
    expect(fs.existsSync(marker)).toBe(false);
  }, 120_000);
});

describe('blazon plugin pin --name', () => {
  const tree = (root: string, name = 'acme.house-style') => {
    const dir = path.join(root, 'plugins', name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `blazon-${name}`), plugin(['check'], answer([])), { mode: 0o755 });
    fs.chmodSync(path.join(dir, `blazon-${name}`), 0o755);
    return dir;
  };

  it('records the pin as computed, says so, and `blazon check` then runs the plugin', async () => {
    const root = await project({});
    const dir = tree(root);
    const result = blazon(root, 'plugin', 'pin', dir, '--name', 'acme.house-style');
    expect(result.status, output(result)).toBe(0);
    expect(result.stdout).toContain('acme.house-style');
    expect(result.stdout).toMatch(/t1:[0-9a-f]{64}/);
    expect(result.stdout).toContain('computed');
    expect(readLock(root).lock.plugins['acme.house-style']).toMatchObject({ kind: 'tree', source: 'computed', entry: 'blazon-acme.house-style' });
  }, 120_000);

  it('records a digest the operator vouched for when the bytes match, and refuses it when they do not', async () => {
    const root = await project({});
    const file = path.join(tree(root), 'blazon-acme.house-style');
    const good = blazon(root, 'plugin', 'pin', file, '--name', 'acme.house-style', '--digest', fileDigest(file));
    expect(good.status, output(good)).toBe(0);
    expect(good.stdout).toContain('vouched');
    const before = fs.readFileSync(path.join(root, LOCK_FILE), 'utf-8');
    const bad = blazon(root, 'plugin', 'pin', file, '--name', 'acme.house-style', '--digest', `sha256:${'0'.repeat(64)}`);
    expect(bad.status).toBe(1);
    expect(bad.stderr).toContain('you vouched for');
    expect(fs.readFileSync(path.join(root, LOCK_FILE), 'utf-8')).toBe(before);
  }, 120_000);

  it('takes the entry from --entry, and refuses a name that is not a plugin name', async () => {
    const root = await project({});
    const dir = tree(root);
    fs.renameSync(path.join(dir, 'blazon-acme.house-style'), path.join(dir, 'run'));
    expect(blazon(root, 'plugin', 'pin', dir, '--name', 'acme.house-style').stderr).toContain('needs --entry');
    expect(blazon(root, 'plugin', 'pin', dir, '--name', 'acme.house-style', '--entry', 'run').status).toBe(0);
    const bad = blazon(root, 'plugin', 'pin', dir, '--name', 'House Style');
    expect(bad.status).toBe(1);
    expect(bad.stderr).toContain('not a plugin name');
  }, 120_000);

  it('still only prints the digest without --name, and writes no lock', async () => {
    const root = await project({});
    const result = blazon(root, 'plugin', 'pin', tree(root));
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toMatch(/^t1:[0-9a-f]{64}$/);
    expect(fs.existsSync(path.join(root, LOCK_FILE))).toBe(false);
  }, 120_000);
});

describe('blazon plugin profile', () => {
  it('prints the document the host enforces, as JSON, and nothing else', async () => {
    const root = await project({});
    const result = blazon(root, 'plugin', 'profile');
    expect(result.status, output(result)).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(JSON.parse(JSON.stringify(BLAZON_PROFILE)));
    expect(result.stdout.endsWith('\n')).toBe(true);
    expect(result.stderr).toBe('');
  }, 120_000);
});

describe('--no-plugins', () => {
  // A check plugin the config allows but nothing pins is an error on its own, so the run fails unless no plugin is run at all.
  const failing = () => project({ 'acme.house-style': { script: plugin(['check'], answer([])), pinned: false } });

  it('runs no plugin in blazon check, though the config allows one that would fail it', async () => {
    const root = await failing();
    expect(blazon(root, 'check').status).toBe(1);
    const result = blazon(root, 'check', '--no-plugins');
    expect(result.status, output(result)).toBe(0);
    expect(output(result)).not.toContain('is not pinned');
  }, 120_000);

  it('runs no plugin in blazon tokens, and still writes the tokens', async () => {
    const root = await failing();
    expect(blazon(root, 'tokens').status).toBe(1);
    const result = blazon(root, 'tokens', '--no-plugins');
    expect(result.status, output(result)).toBe(0);
    expect(fs.existsSync(path.join(root, 'dist/tokens/tokens.json'))).toBe(true);
  }, 120_000);

  it('runs no plugin in blazon build, and still builds the book', async () => {
    const root = await failing();
    expect(blazon(root, 'build').status).toBe(1);
    const result = blazon(root, 'build', '--no-plugins');
    expect(result.status, output(result)).toBe(0);
    expect(fs.existsSync(path.join(root, 'dist/site/index.html'))).toBe(true);
  }, 120_000);

  it('cannot be combined with --plugin: exit 2 and nothing runs', async () => {
    const root = await failing();
    const result = blazon(root, 'check', '--no-plugins', '--plugin', '/bin/true');
    expect(result.status).toBe(2);
    expect(output(result)).toContain('--no-plugins runs no plugin, so it cannot be used with --plugin');
  }, 120_000);
});
