import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { loadConfig, DEFAULT_CONFIG } from '../../../src/core/config/index.js';
import { tempDir } from '../../support/project';

describe('Config', () => {
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
  it('loads blazon.json', async () => {
    const root = tempDir();
    fs.writeFileSync(path.join(root, 'blazon.json'), JSON.stringify({ title: 'Acme', theme: { accent: 'interactive.primary' } }));

    const config = await loadConfig(root);

    expect(config.title).toBe('Acme');
    expect(config.theme).toEqual({ accent: 'interactive.primary' });
  });

  it('sees edits to the config file on the next load', async () => {
    const root = tempDir();
    const file = path.join(root, 'blazon.json');
    fs.writeFileSync(file, '{"title": "One"}');
    expect((await loadConfig(root)).title).toBe('One');

    fs.writeFileSync(file, '{"title": "Two"}');
    expect((await loadConfig(root)).title).toBe('Two');
  });
});
