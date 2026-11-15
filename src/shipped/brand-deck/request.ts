import fs from 'node:fs';
import { Cannot } from '../shared/plugin.js';

/** The plugin's name, which blazon's config names it by, and the prefix of its finding codes */
export const NAME = 'blazon.brand-deck';

export const MANIFEST = {
  v: 2,
  roles: ['build'],
  title: 'Brand deck',
  description: "Draws the brand as a 16:9 PDF deck: logos with their rules, colors, type, the brand book's guideline pages and the favicon set.",
  version: '1.1.0',
  timeout_ms: 60000,
  env: ['BLAZON_CHROME', 'BLAZON_DECK_FONTS', 'HOME', 'TMPDIR'],
};

/** The plugin cannot do what it was asked; the message is the reason blazon shows. It is the shared class, so the shared browser launch throws it too. */
export { Cannot };

/** What one build request asks: the site whose files the slides read, where to write, the brand, and the options as given. */
export interface Job {
  siteDir: string;
  outDir: string;
  brand: unknown;
  options: unknown;
}

const isFolder = (value: unknown): value is string => typeof value === 'string' && fs.statSync(value, { throwIfNoEntry: false })?.isDirectory() === true;

/** The job a build request asks for, or Cannot with the reason. The options are checked later, and wrong ones are findings. */
export function jobFor(text: string): Job {
  let request: unknown;
  try {
    request = JSON.parse(text);
  } catch {
    throw new Cannot('the request is not JSON');
  }
  if (typeof request !== 'object' || request === null || Array.isArray(request)) throw new Cannot('the request is not a JSON object');
  const asked = request as Record<string, unknown>;
  if (asked.v !== 1) throw new Cannot('this plugin speaks version 1 of the request');
  if (asked.type !== 'build') throw new Cannot('this plugin fills the build role');
  for (const field of ['site_dir', 'out_dir'] as const) if (!isFolder(asked[field])) throw new Cannot(`${field} must name a directory that exists`);
  return { siteDir: asked.site_dir as string, outDir: asked.out_dir as string, brand: asked.brand, options: asked.options ?? {} };
}
