import fs from 'node:fs';
import path from 'node:path';
import { Cannot, isObject, OptionError, readRequest, requireBrand } from '../shared/plugin.js';

export { Cannot, isObject, OptionError };

/** The plugin's name, which blazon's config names it by, and the prefix of its finding codes */
export const NAME = 'blazon.favicons';

export const MANIFEST = {
  v: 2,
  roles: ['check', 'build'],
  title: 'Favicons',
  description: 'Draws the favicon and app-icon set and three preview views from the brand symbol, and warns when it is too small, too faint or outside a safe zone.',
  version: '1.2.0',
  timeout_ms: 60000,
  env: ['BLAZON_CHROME'],
};

/** What a request holds: the role, the options, the brand, and for a build the two folders. */
export interface Request {
  type: 'check' | 'build';
  options: Record<string, unknown>;
  brand: Record<string, unknown>;
  siteDir: string;
  outDir: string;
}

/** The request, or Cannot with the reason. A check carries no folders, so only a build has them checked. */
export function requestFrom(text: string): Request {
  const request = readRequest(text);
  if (request.type !== 'check' && request.type !== 'build') throw new Cannot(`the request is for the ${String(request.type)} role; this plugin has the check and build roles`);
  const options = request.options ?? {};
  if (!isObject(options)) throw new OptionError('options must be an object');
  const { site_dir: siteDir, out_dir: outDir } = request;
  if (request.type === 'build') {
    if (typeof siteDir !== 'string' || !fs.statSync(siteDir, { throwIfNoEntry: false })?.isDirectory()) throw new Cannot('site_dir is not a folder');
    if (typeof outDir !== 'string' || !fs.statSync(outDir, { throwIfNoEntry: false })?.isDirectory()) throw new Cannot('out_dir is not a folder');
  }
  // Folders first, as the other plugins' requests do: the brand is read only once the request itself is sound
  const brand = requireBrand(request.brand);
  return { type: request.type, options, brand, siteDir: typeof siteDir === 'string' ? path.resolve(siteDir) : '', outDir: typeof outDir === 'string' ? outDir : '' };
}
