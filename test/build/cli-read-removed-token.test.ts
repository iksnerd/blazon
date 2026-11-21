import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from '../support/spawn';
import { REPO } from '../support/paths';
import { starterProject } from '../support/project';

// A theme that leaves a token out does not have it: list leaves it out, get and can say there is no such token in that theme.

const blazon = (...args: string[]) =>
  spawnSync(process.execPath, ['--import', 'tsx', path.join(REPO, 'scripts/blazon-src.ts'), ...args], {
    encoding: 'utf-8',
    cwd: REPO,
    env: { ...process.env, NO_COLOR: '1' },
    input: '',
  });

let root: string;
beforeAll(async () => {
  root = await starterProject();
  // Each theme lists its own files, and dark leaves the social card tokens out
  const file = path.join(root, 'blazon.resolver.json');
  const resolver = JSON.parse(fs.readFileSync(file, 'utf-8'));
  const files = resolver.sets.base.sources as { $ref: string }[];
  resolver.modifiers.theme.contexts.light = files;
  resolver.modifiers.theme.contexts.dark = [...files.filter((f) => f.$ref !== 'tokens/social.json'), ...resolver.modifiers.theme.contexts.dark];
  resolver.resolutionOrder = [{ $ref: '#/modifiers/theme' }];
  delete resolver.sets;
  fs.writeFileSync(file, JSON.stringify(resolver));
}, 120_000);

describe('read commands with --theme on a theme that leaves a token out', () => {
  it('list --theme leaves the token out and the default list keeps it', () => {
    const dark = JSON.parse(blazon('list', root, '--theme', 'dark', '--json').stdout);
    const light = JSON.parse(blazon('list', root, '--json').stdout);
    expect(light.tokens.map((t: { path: string }) => t.path)).toContain('social.format.horizontal.width');
    expect(dark.tokens.map((t: { path: string }) => t.path)).not.toContain('social.format.horizontal.width');
    expect(dark.tokens.length).toBeGreaterThan(0);
  }, 120_000);

  it('get --theme exits 2 with no token in the theme, and without --theme the token is there', () => {
    const ran = blazon('get', 'social.format.horizontal.width', root, '--theme', 'dark');
    expect(ran.status).toBe(2);
    expect(ran.stderr).toContain('no token "social.format.horizontal.width" in theme "dark"');
    expect(blazon('get', 'social.format.horizontal.width', root).status).toBe(0);
  }, 120_000);

  it('can --theme exits 2 with no token in the theme', () => {
    const ran = blazon('can', 'social.format.horizontal.width', 'surface.canvas', root, '--theme', 'dark');
    expect(ran.status).toBe(2);
    expect(ran.stderr).toContain('no token "social.format.horizontal.width" in theme "dark"');
  }, 120_000);
});
