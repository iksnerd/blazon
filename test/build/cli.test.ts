import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { initStarter, tempDir as makeTempDir } from '../support/project';
import { runInit } from '../../src/cli/commands/init.js';
import { runTokens } from '../../src/cli/commands/tokens.js';
import { compileBlazonData } from '../../src/core/index.js';
import { loadConfig } from '../../src/core/config/index.js';

describe('CLI & End-to-End Workflow', () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = makeTempDir('blazon-e2e-');
  });

  it('should initialize a complete brandbook directory structure', async () => {
    // The starter enables blazon.copy, which the built package runs. This project is run from source, where no build is assumed.
    await initStarter(tempDir);

    expect(fs.existsSync(path.join(tempDir, 'tokens/colors.json'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'tokens/typography.json'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'tokens/spacing.json'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'tokens/form.json'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'assets/logos/blazon-graphite.svg'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'assets/logos/blazon-bone.svg'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'docs/01-principles.md'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'docs/03-color.md'))).toBe(true);
    for (const page of ['02-logo', '04-type', '05-form', '06-layout', '07-icons', '09-social']) {
      expect(fs.existsSync(path.join(tempDir, `docs/${page}.md`))).toBe(true);
    }
    expect(fs.existsSync(path.join(tempDir, 'blazon.config.ts'))).toBe(true);
  });

  it('names the brand book after the project folder', async () => {
    const dir = path.join(tempDir, 'acme');
    await runInit(dir);

    const config = await loadConfig(dir);
    expect(config.title).toBe('Acme Brand Book');
  });

  it.each([
    ['acme-brand', 'Acme Brand Book'],
    ['auth0-brand-book', 'Auth0 Brand Book'],
    ['north_star_guidelines', 'North Star Brand Book'],
    ['brand', 'Brand Book'],
  ])('does not say "brand" twice when the folder %s already says it', async (folder, title) => {
    const dir = path.join(tempDir, folder);
    await runInit(dir);

    expect((await loadConfig(dir)).title).toBe(title);
  });

  it('keeps an existing config as it is', async () => {
    const dir = path.join(tempDir, 'kept-brand');
    fs.mkdirSync(dir);
    const own = "export default { title: 'Blazon Brand Book' };\n";
    fs.writeFileSync(path.join(dir, 'blazon.config.ts'), own);
    await runInit(dir);

    expect(fs.readFileSync(path.join(dir, 'blazon.config.ts'), 'utf-8')).toBe(own);
  });

  it('should compile tokens and emit theme.css and tokens.ts', async () => {
    await runTokens(tempDir);

    const distTokens = path.join(tempDir, 'dist/tokens');
    expect(fs.existsSync(path.join(distTokens, 'theme.css'))).toBe(true);
    expect(fs.existsSync(path.join(distTokens, 'tokens.ts'))).toBe(true);
    expect(fs.existsSync(path.join(distTokens, 'tokens.json'))).toBe(true);

    const cssContent = fs.readFileSync(path.join(distTokens, 'theme.css'), 'utf-8');
    expect(cssContent).toContain('--interactive-primary: #FF5A1F;');
    expect(cssContent).toContain('--surface-background: #F2F0EB;');

    const tsContent = fs.readFileSync(path.join(distTokens, 'tokens.ts'), 'utf-8');
    expect(tsContent).toContain('export const tokens =');
    expect(tsContent).toContain('export const flatTokens =');
    expect(tsContent).toContain('"interactive.primary": "#FF5A1F"');
  });

  it('should compile complete BlazonData model with assets, docs, and resolved tokens', async () => {
    const config = await loadConfig(tempDir);
    const data = await compileBlazonData(config, tempDir);

    expect(data.docs.length).toBeGreaterThanOrEqual(2);
    expect(data.docs[0]?.title).toBe('Built to spec');
    expect(data.docs[1]?.title).toBe('Logo');

    expect(data.assets.logos.length).toBeGreaterThanOrEqual(1);

    expect(data.tokens.items.length).toBeGreaterThan(10);
    // Check alias resolution in the starter
    const primary = data.tokens.items.find((t) => t.path === 'interactive.primary');
    expect(primary?.value).toBe('#FF5A1F'); // resolved from {color.signal.orange}
  });
});
