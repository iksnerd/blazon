import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { starterProject } from '../../support/init-project';
import { blazon, output, manifest, plugin, answer, finding, project } from '../../support/plugin-roles';

// The roles through the real commands (RFC 0002 of blazon, section 2), the part on blazon tokens: plugins pinned in the lock and allowed by the
// config, run as processes so the exit status is the real one. The other parts are in commands-*.test.ts.

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

  it('runs the shipped blazon.tailwind, which writes tailwind.css and tailwind-reset.css into its own folder and none beside the token files', async () => {
    const root = await starterProject({ plugins: ['blazon.tailwind'] });
    const result = blazon(root, 'tokens');
    expect(result.status, output(result)).toBe(0);
    const out = path.join(root, 'dist/tokens/blazon.tailwind');
    expect(fs.readFileSync(path.join(out, 'tailwind.css'), 'utf-8')).toContain('@theme {');
    expect(fs.readFileSync(path.join(out, 'tailwind-reset.css'), 'utf-8')).toContain('--color-*: initial;');
    expect(fs.existsSync(path.join(root, 'dist/tokens/tailwind.css'))).toBe(false);
  }, 120_000);

  it('runs the shipped blazon.shadcn with its options, and refuses the old shadcn key of the config naming the plugin', async () => {
    const root = await starterProject({ plugins: [{ name: 'blazon.shadcn', options: { variables: { destructive: 'text.primary' } } }] });
    const result = blazon(root, 'tokens');
    expect(result.status, output(result)).toBe(0);
    const out = path.join(root, 'dist/tokens/blazon.shadcn');
    expect(JSON.parse(fs.readFileSync(path.join(out, 'shadcn.json'), 'utf-8')).variables.destructive).toEqual({ token: 'text.primary', value: expect.any(String), from: 'config' });
    expect(fs.readFileSync(path.join(out, 'shadcn.css'), 'utf-8')).toContain('--destructive:');

    const file = path.join(root, 'blazon.json');
    fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(fs.readFileSync(file, 'utf-8')), shadcn: { destructive: 'text.primary' } }));
    const old = blazon(root, 'tokens');
    expect(old.status).toBe(1);
    expect(output(old)).toContain('blazon.shadcn');
    expect(output(old)).toContain('"variables"');
  }, 120_000);

  // A plugin that needs the site: with none it says so and writes nothing, as the shipped ones do
  const needsSiteScript = () => `#!/bin/sh
case "$1" in
  --blazon-manifest) printf '%s' '${manifest(['build'])}'; exit 0;;
esac
request=$(cat)
case "$request" in
  *'"site_dir"'*) printf '%s' '{"findings":[]}';;
  *) printf '%s' '{"findings":[{"code":"acme.deck/needs-site","severity":"info","path":"site_dir","message":"site_dir is absent. Nothing was written; blazon build runs it."}]}';;
esac
`;

  it('keeps what a plugin wrote before in its folder, and still reports needs-site as info', async () => {
    const root = await project({ 'acme.deck': { script: needsSiteScript() } });
    const out = path.join(root, 'dist/tokens/acme.deck');
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, 'deck.pdf'), 'earlier deck');
    const result = blazon(root, 'tokens', '--json');
    expect(result.status, output(result)).toBe(0);
    expect(fs.readFileSync(path.join(out, 'deck.pdf'), 'utf-8')).toBe('earlier deck');
    expect(JSON.parse(result.stdout).findings).toContainEqual(expect.objectContaining({ code: 'acme.deck/needs-site', severity: 'info' }));
  }, 120_000);

  it('leaves blazon build as it was: the folder is emptied before the plugin runs with a site', async () => {
    const root = await project({ 'acme.deck': { script: needsSiteScript() } });
    const out = path.join(root, 'dist/tokens/acme.deck');
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, 'deck.pdf'), 'earlier deck');
    const result = blazon(root, 'build');
    expect(result.status, output(result)).toBe(0);
    expect(fs.existsSync(path.join(out, 'deck.pdf'))).toBe(false);
  }, 120_000);

  it('overwrites the files of blazon.tailwind on a second run', async () => {
    const root = await starterProject({ plugins: ['blazon.tailwind'] });
    expect(blazon(root, 'tokens').status).toBe(0);
    const file = path.join(root, 'dist/tokens/blazon.tailwind/tailwind.css');
    fs.writeFileSync(file, 'stale');
    expect(blazon(root, 'tokens').status).toBe(0);
    expect(fs.readFileSync(file, 'utf-8')).toContain('@theme {');
  }, 120_000);

  it('exits 1 when a build plugin reports an error, after the token files are written', async () => {
    const root = await project({ 'acme.deck': { script: plugin(['build'], answer([{ code: 'acme.deck/failed', severity: 'error', path: 'deck', message: 'The deck could not be drawn' }])) } });
    const result = blazon(root, 'tokens');
    expect(result.status, output(result)).toBe(1);
    expect(output(result)).toContain('The deck could not be drawn');
    expect(fs.existsSync(path.join(root, 'dist/tokens/theme.css'))).toBe(true);
  }, 120_000);
});
