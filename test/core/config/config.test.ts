import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { defineConfig, loadConfig, DEFAULT_CONFIG } from '../../../src/core/config/index.js';
import { tempDir } from '../../support/project';

describe('Config', () => {
  it('should return identical config object from defineConfig', () => {
    const userCfg = defineConfig({
      title: 'Acme Design System',
      port: 4000,
    });
    expect(userCfg.title).toBe('Acme Design System');
    expect(userCfg.port).toBe(4000);
  });

  it('should return default config merged with overrides', async () => {
    const config = await loadConfig(process.cwd(), {
      title: 'Custom Title',
      port: 8080,
    });

    expect(config.title).toBe('Custom Title');
    expect(config.port).toBe(8080);
    expect(config.tokensDir).toBe(DEFAULT_CONFIG.tokensDir);
    expect(config.docsDir).toBe(DEFAULT_CONFIG.docsDir);
  });
});

describe('loadConfig from a project folder', () => {
  it("loads a TypeScript config that imports defineConfig from '@iksnerd/blazon', even where blazon is not installed", async () => {
    const root = tempDir();
    fs.writeFileSync(
      path.join(root, 'blazon.config.ts'),
      [
        "import { defineConfig } from '@iksnerd/blazon';",
        "const accent: string = 'interactive.primary';",
        "export default defineConfig({ title: 'Acme', theme: { accent } });",
      ].join('\n'),
    );

    const config = await loadConfig(root);

    expect(config.title).toBe('Acme');
    expect(config.theme).toEqual({ accent: 'interactive.primary' });
  });

  it('sees edits to the config file on the next load', async () => {
    const root = tempDir();
    const file = path.join(root, 'blazon.config.ts');
    fs.writeFileSync(file, "export default { title: 'One' };");
    expect((await loadConfig(root)).title).toBe('One');

    fs.writeFileSync(file, "export default { title: 'Two' };");
    expect((await loadConfig(root)).title).toBe('Two');
  });
});
