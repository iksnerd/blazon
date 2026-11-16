import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { loadConfig } from '../../src/core/config/index.js';
import { startDevServer } from '../../src/server/dev-server.js';
import { starterProject } from '../support/project';

// The dev server answers /brand.json with the brand as it is now, so a tool can be written against it.

describe('dev server: /brand.json', () => {
  it('serves the current brand as JSON, and follows an edit with no restart', async () => {
    const root = await starterProject();
    const server = await startDevServer({ ...(await loadConfig(root)), port: 0 }, root);
    try {
      const base = server.resolvedUrls!.local[0]!;
      const res = await fetch(new URL('brand.json', base));
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toMatch(/application\/json/);
      const before = await res.json();
      expect(before).toMatchObject({ format: 'blazon-brand', version: 2 });
      expect(before.tokens.find((t: { path: string }) => t.path === 'interactive.primary').resolvedValue).toBeDefined();

      const file = path.join(root, 'tokens/colors.json');
      fs.writeFileSync(file, fs.readFileSync(file, 'utf-8').replace('"#FF5A1F"', '"#123456"'));
      const after = await (await fetch(new URL('brand.json', base))).json();
      const primary = (brand: typeof after) => brand.tokens.find((t: { path: string }) => t.path === 'color.signal.orange').value;
      expect(primary(before)).toBe('#FF5A1F');
      expect(primary(after)).toBe('#123456');
    } finally {
      await server.close();
    }
  });
});
