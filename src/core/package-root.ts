import { PACKAGE_NAME } from './package-name.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** blazon's own package root, whether this module runs from src/core, dist or dist/chunks. */
export function packageRoot(): string {
  for (let dir = path.dirname(fileURLToPath(import.meta.url)); dir !== path.dirname(dir); dir = path.dirname(dir)) {
    const manifest = path.join(dir, 'package.json');
    if (fs.existsSync(manifest) && JSON.parse(fs.readFileSync(manifest, 'utf-8')).name === PACKAGE_NAME) return dir;
  }
  throw new Error('[blazon] Cannot find the blazon package root');
}
