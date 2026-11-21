import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BLAZON_PROFILE } from '../../../src/plugins/wire/profile.js';
import { dirs, blazon, output, manifest, plugin, answer, finding, project } from '../../support/plugin-roles';

// The roles through the real commands (RFC 0002 of blazon, section 2), the part on blazon check, blazon build and blazon plugin profile: plugins pinned in the lock and allowed by the
// config, run as processes so the exit status is the real one. The other parts are in commands-*.test.ts.

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

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
