import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { starterProject } from '../support/project';
import { loadConfig } from '../../src/core/config/index.js';
import { buildSite } from '../../src/builder/site-builder.js';

describe('blazon build with the prebuilt viewer', () => {
  let project: string;

  // test/support/global-setup.ts has compiled the viewer into dist/ui
  beforeAll(async () => {
    project = await starterProject();
  }, 60_000);

  it('writes the viewer, the brand book data and the brand assets', async () => {
    const config = await loadConfig(project);
    const { siteOutDir } = await buildSite(config, project);

    const html = fs.readFileSync(path.join(siteOutDir, 'index.html'), 'utf-8');
    const json = html.match(/<script id="blazon-data" type="application\/json">(.*?)<\/script>/s)?.[1];
    expect(JSON.parse(json ?? 'null')).toMatchObject({ title: config.title });

    const entry = html.match(/src="\.\/(assets\/[^"]+\.js)"/)?.[1];
    expect(entry, html.replace(json ?? '', '[data]')).toBeDefined();
    expect(fs.existsSync(path.join(siteOutDir, entry!))).toBe(true);

    expect(fs.existsSync(path.join(siteOutDir, 'brand-assets/logos/blazon-graphite.svg'))).toBe(true);
  });

  it('ships the Geist font with its OFL license beside it', async () => {
    const config = await loadConfig(project);
    const { siteOutDir } = await buildSite(config, project);
    const assets = path.join(siteOutDir, 'assets');
    expect(fs.readdirSync(assets).some((file) => /^geist-.*\.woff2$/.test(file))).toBe(true);
    const license = fs.readFileSync(path.join(assets, 'geist-OFL.txt'), 'utf-8');
    expect(license).toContain('SIL OPEN FONT LICENSE Version 1.1');
    expect(license).toContain('The Geist Project Authors');
  });

  it('replaces the previous build instead of leaving stale files', async () => {
    const config = await loadConfig(project);
    const stale = path.join(project, config.outDir, 'stale.txt');
    fs.mkdirSync(path.dirname(stale), { recursive: true });
    fs.writeFileSync(stale, 'old');

    await buildSite(config, project);
    expect(fs.existsSync(stale)).toBe(false);
  });

  it.each(['.', '..'])('refuses outDir "%s" and deletes nothing', async (outDir) => {
    const config = { ...(await loadConfig(project)), outDir };
    await expect(buildSite(config, project)).rejects.toThrow(/holds the project folder/);
    expect(fs.existsSync(path.join(project, 'blazon.config.ts'))).toBe(true);
  });
});
