import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../core/config/index.js';
import type { BlazonConfig, UserBlazonConfig } from '../types/index.js';
import { UsageError } from './errors.js';
import { blazonCommand, shownDir } from './where.js';

const isDirectory = (dir: string): boolean => fs.statSync(dir, { throwIfNoEntry: false })?.isDirectory() ?? false;

const startOne = (cwd: string): string => `Run ${blazonCommand('init', shownDir(cwd))} to start a brand book there`;

/** The folder a command was pointed at must exist: a build of a folder that is not there must not make one. */
export function requireFolder(cwd: string): void {
  if (!isDirectory(cwd)) throw new UsageError(`no folder "${cwd}"`, `${startOne(cwd)}.`, 'no-folder');
}

/** The folder of tokens must exist: a brand book with no tokens is a typo in the path, not an empty brand. */
export function requireTokens(cwd: string, tokensDir: string): void {
  if (isDirectory(path.resolve(cwd, tokensDir))) return;
  const named = tokensDir.replace(/^\.\//, '').replace(/\/$/, '');
  throw new UsageError(`no tokens folder (${named}) in "${cwd}"`, `${startOne(cwd)}, or set tokensDir in blazon.config.ts.`, 'no-tokens-folder');
}

/** The config of the brand book in `cwd`, after checking that there is a folder and a tokens folder to read. */
export async function loadProject(cwd: string, overrides?: UserBlazonConfig): Promise<BlazonConfig> {
  requireFolder(cwd);
  const config = await loadConfig(cwd, overrides);
  requireTokens(cwd, config.tokensDir);
  return config;
}
