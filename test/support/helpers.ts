import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_CONFIG } from '../../src/core/config/index.js';
import { compileBlazonData } from '../../src/core/index.js';
import type { BlazonData } from '../../src/types/index.js';

const LOGO_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#000"/></svg>';

/** The default config with the logo every brand must have: the `logo.svg` the writers below put at a project's root, outside `assets/`. */
export const TEST_CONFIG = { ...DEFAULT_CONFIG, logo: './logo.svg' };

/** `TEST_CONFIG` for a project that was not made by a writer below: puts the `logo.svg` it points at in the root if it is not there. */
export function logoConfig(root: string): typeof TEST_CONFIG {
  const file = path.join(root, 'logo.svg');
  if (!fs.existsSync(file)) fs.writeFileSync(file, LOGO_SVG);
  return { ...TEST_CONFIG };
}

/** Writes `tokens/<name>` files into a fresh temp project and returns its root. */
export function writeTokenProject(files: Record<string, unknown>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blazon-test-'));
  const tokensDir = path.join(root, 'tokens');
  fs.mkdirSync(tokensDir);
  fs.writeFileSync(path.join(root, 'logo.svg'), LOGO_SVG);
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(tokensDir, name), JSON.stringify(content));
  }
  return root;
}

/** Writes files at project-relative paths (objects as JSON) into a fresh temp project and returns its root. */
export function writeProject(files: Record<string, unknown>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blazon-test-'));
  if (!('logo.svg' in files)) fs.writeFileSync(path.join(root, 'logo.svg'), LOGO_SVG);
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, typeof content === 'string' ? content : JSON.stringify(content));
  }
  return root;
}

export async function compileTokens(files: Record<string, unknown>): Promise<BlazonData> {
  return compileBlazonData({ ...TEST_CONFIG }, writeTokenProject(files));
}
