import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from '../support/spawn';
import { describe, it, expect, beforeAll } from 'vitest';
import { runInit } from '../../src/cli/commands/init.js';
import { loadConfig } from '../../src/core/config/index.js';
import { buildSite } from '../../src/builder/site-builder.js';
import { tempDir } from '../support/project';
import { starterFacts } from '../support/starter-facts';
import { REPO } from '../support/paths';

// brand.json is for tools in any language. This reads a built one with nothing but Python's standard library:
// the proof that the contract can be used from outside, and the start of the deck tool.

const SCRIPT = path.join(REPO, 'scripts/read-brand.py');
const python = spawnSync('python3', ['--version']).status === 0;

describe.skipIf(!python)('scripts/read-brand.py', () => {
  let root: string;
  let brandJson: string;
  beforeAll(async () => {
    root = tempDir();
    // A fixed folder name, because init names the brand book after it.
    const project = path.join(root, 'acme');
    await runInit(project);
    const { siteOutDir } = await buildSite(await loadConfig(project), project);
    brandJson = path.join(siteOutDir, 'brand.json');
  }, 60_000);

  const run = (file: string) => spawnSync('python3', ['-I', SCRIPT, file], { encoding: 'utf-8' });

  it('reads the built file and summarizes the brand', () => {
    const out = JSON.parse(fs.readFileSync(brandJson, 'utf-8'));
    const result = run(brandJson);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('Acme Brand Book (blazon-brand v2)');
    expect(result.stdout).toContain(`Tokens: ${out.tokens.length}`);
    expect(result.stdout).toMatch(/interactive\.primary\s+#FF5A1F/);
    // Logo rules come through, with their unit in pixels
    expect(result.stdout).toMatch(/logos\/blazon-graphite\s+clear space 24px/);
    expect(result.stdout).toContain(`Pages: ${starterFacts().docs.length}`);
  });

  it('ignores a logo sidecar `initiative` as it does `partnership`: it reads the rules it knows, and does not choke on the one it does not', () => {
    const brand = JSON.parse(fs.readFileSync(brandJson, 'utf-8'));
    const rules = { lockup: 'horizontal', unit: { value: 20, unit: 'px' }, clearSpace: { units: 2 } };
    const initiative = { name: 'Open Banking Lab', mark: 'initiatives/lab', gap: { units: 2 }, position: 'below', markHeight: { units: 3 } };
    const withMeta = (meta: object) => {
      const logo = { id: 'logos/program', name: 'program', category: 'logos', file: 'brand-assets/logos/program.svg', format: 'svg', width: 100, height: 40, meta };
      const file = path.join(root, `initiative-${Math.random().toString(36).slice(2)}.json`);
      fs.writeFileSync(file, JSON.stringify({ ...brand, assets: [...brand.assets, logo] }));
      return run(file);
    };
    const line = (stdout: string) => stdout.split('\n').find((l) => l.includes('logos/program'));

    const plain = withMeta(rules);
    const partnered = withMeta({ ...rules, partnership: { gap: { units: 1 }, dividerHeight: { value: 40, unit: 'px' } } });
    const lockedUp = withMeta({ ...rules, partnership: { gap: { units: 1 } }, initiative });
    expect(lockedUp.status, lockedUp.stderr).toBe(0);
    expect(lockedUp.stderr).toBe('');
    // The reader reports clear space and the lockup, and nothing of partnership or initiative: the same line with or without them
    expect(line(lockedUp.stdout)).toMatch(/^\s+logos\/program\s+horizontal\s+clear space 40px$/);
    expect(line(lockedUp.stdout)).toBe(line(plain.stdout));
    expect(line(lockedUp.stdout)).toBe(line(partnered.stdout));
    expect(lockedUp.stdout).not.toMatch(/initiative|Open Banking Lab/i);

    // A logo whose only rule is an initiative states nothing the reader reports, so it is left out, as one with only a partnership is
    const only = withMeta({ initiative });
    expect(only.status, only.stderr).toBe(0);
    expect(line(only.stdout)).toBeUndefined();
    expect(only.stdout).toBe(withMeta({ partnership: { gap: { units: 1 } } }).stdout);
  });

  it('refuses a version it does not know, and says which', () => {
    const file = path.join(root, 'future.json');
    fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(fs.readFileSync(brandJson, 'utf-8')), version: 99 }));
    const result = run(file);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('version 99');
  });

  it('refuses a file that is not a blazon brand', () => {
    const file = path.join(root, 'other.json');
    fs.writeFileSync(file, '{"format":"something-else","version":1}');
    const result = run(file);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('not a blazon brand');
  });
});
