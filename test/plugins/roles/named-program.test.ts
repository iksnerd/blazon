import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PluginRun } from '../../../src/plugins/roles/roles.js';
import { DEFAULT_CONFIG } from '../../../src/core/config/index.js';
import type { BlazonConfig } from '../../../src/types/index.js';
import { tempDir } from '../../support/project';
import { BRAND, answer, cleanup, dirs, script } from '../support/fixtures.js';

// RFC 0005 section 3.6: a program's name is what lies between `blazon-` and the final `.🔌`, so a program named
// with --plugin may be spelled either way.

afterEach(cleanup);

describe('a program named with --plugin', () => {
  it.each(['blazon-acme.x', 'blazon-acme.x.🔌'])('is accepted as %s', async (file) => {
    const cwd = tempDir();
    dirs.push(cwd);
    const bin = path.join(cwd, 'bin');
    fs.mkdirSync(bin, { recursive: true, mode: 0o700 });
    const program = path.join(bin, file);
    fs.writeFileSync(program, script({ v: 2, roles: ['check'] }, answer([{ code: 'acme.x/seen', severity: 'info', path: 'p', message: 'ran' }])));
    fs.chmodSync(program, 0o755);
    const config = { ...DEFAULT_CONFIG, plugins: [] } as BlazonConfig;
    const found = await new PluginRun(config, cwd, { named: [program], log: () => {} }).check(BRAND);
    expect(found.map((f) => f.code)).toEqual(['acme.x/seen']);
  });

  it('is refused when its name is a file blazon writes in tokensOutDir, where its output folder would go', async () => {
    const cwd = tempDir();
    dirs.push(cwd);
    const config = { ...DEFAULT_CONFIG, plugins: [] } as BlazonConfig;
    const found = await new PluginRun(config, cwd, { named: [path.join(cwd, 'blazon-tokens.json')], log: () => {} }).build(BRAND, cwd);
    expect(found[0]).toMatchObject({ code: 'plugin-failed' });
    expect(found[0]!.message).toContain('a file blazon writes in tokensOutDir');
  });

  it('is still refused when its name is not a plugin name, with or without the extension', async () => {
    const cwd = tempDir();
    dirs.push(cwd);
    const config = { ...DEFAULT_CONFIG, plugins: [] } as BlazonConfig;
    for (const file of ['blazon-nodots', 'blazon-nodots.🔌', 'acme.x.🔌']) {
      const found = await new PluginRun(config, cwd, { named: [path.join(cwd, file)], log: () => {} }).check(BRAND);
      expect(found[0]).toMatchObject({ code: 'plugin-failed' });
      expect(found[0]!.message).toContain('--plugin must name a program');
    }
  });
});
