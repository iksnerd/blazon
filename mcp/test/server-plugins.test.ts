// Covers that the server runs no plugin the brand config names, and what check_brand says about the plugins it did not run.
// One of the server-*.test.ts files, kept small so the files run in parallel; the shared setup is in support.ts.

import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { tempDir } from '../../test/support/project.js';
import { starterProject } from '../../test/support/init-project.js';
import { connect, installed, startShared, structured, textOf } from './support.js';

describe.skipIf(!installed)('blazon-mcp', () => {
  let client: import('@modelcontextprotocol/sdk/client/index.js').Client;
  let bin: string;

  beforeAll(async () => {
    ({ client, bin } = await startShared());
  });
  afterAll(async () => {
    await client?.close();
  });

  const call = (name: string, args: Record<string, unknown> = {}) => client.callTool({ name, arguments: args });

  it('runs no plugin the brand config names, whichever tool is called', async () => {
    const project = await starterProject();
    const bins = tempDir('blazon-mcp-plugin-');
    const marker = path.join(bins, 'ran');
    fs.writeFileSync(path.join(bins, 'blazon-evil.mark'), `#!/bin/sh\ntouch "${marker}"\nexit 2\n`, { mode: 0o755 });
    const config = path.join(project, 'blazon.json');
    fs.writeFileSync(config, JSON.stringify({ ...JSON.parse(fs.readFileSync(config, 'utf8')), plugins: [{ name: 'evil.mark' }] }));
    const was = process.env.PATH;
    process.env.PATH = `${bins}${path.delimiter}${was}`;
    try {
      const other = await connect({ bin, brand: project });
      for (const [name, args] of [
        ['check_brand', {}],
        ['list_tokens', {}],
        ['get_token', { path: 'color.brand.primary' }],
        ['get_rules', {}],
        ['can_use', { fg: 'text.primary', bg: 'surface.background' }],
        ['get_fonts', {}],
        ['get_logo', {}],
      ] as const)
        await other.callTool({ name, arguments: args });
      expect(fs.existsSync(marker)).toBe(false);
      await other.close();
    } finally {
      process.env.PATH = was;
    }
  });

  it('says in check_brand that the plugins the config names did not run, and names them from blazon.json', async () => {
    const project = await starterProject({ plugins: ['blazon.copy', { name: 'acme.house-style' }] });
    const other = await connect({ bin, brand: project });
    const result = await other.callTool({ name: 'check_brand', arguments: {} });
    const check = structured(result);
    expect(check.pluginsSkipped).toEqual(['blazon.copy', 'acme.house-style']);
    const line = `Plugins in blazon.json did not run: blazon.copy, acme.house-style. Only a plugin with a check role can add findings to these counts; a build-only plugin adds none. The server cannot read a plugin's role without starting it, so it lists every configured plugin. Run \`blazon check\` for the full counts.`;
    expect(check.warnings).toContain(line);
    expect(textOf(result)).toMatch(/^Warning from blazon: Plugins in blazon.json did not run/);
    await other.close();
  });

  it('lists build-only plugins too, since their roles are only in a manifest the server cannot read without starting them, and says so', async () => {
    const project = await starterProject({ plugins: ['blazon.tailwind', 'blazon.shadcn'] });
    const other = await connect({ bin, brand: project });
    const check = structured(await other.callTool({ name: 'check_brand', arguments: {} }));
    expect(check.pluginsSkipped).toEqual(['blazon.tailwind', 'blazon.shadcn']);
    expect(check.warnings.join(' ')).toMatch(/Only a plugin with a check role can add findings.*cannot read a plugin's role without starting it/);
    await other.close();
  });

  it('adds no plugin line to check_brand when the config names no plugin', async () => {
    const check = structured(await call('check_brand', {}));
    expect(check.pluginsSkipped).toBeUndefined();
    expect(check.warnings.join(' ')).not.toMatch(/plugin/);
  });
});
