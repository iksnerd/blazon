import { Cannot, isObject, readRequest, requireBrand } from '../shared/plugin.js';

/** The plugin's name, which blazon's config names it by, and the prefix of its finding codes */
export const NAME = 'blazon.copy';

export const MANIFEST = {
  v: 2,
  roles: ['check'],
  title: 'Copy rules',
  description: "Holds the brand book's text to the brand's word rules: terms it avoids, heading case and sentence length.",
  version: '1.1.0',
  timeout_ms: 10000,
  env: [] as string[],
};

export { Cannot };

/** What one check request holds: the brand, and the options as given. */
export interface Job {
  brand: Record<string, unknown>;
  options: unknown;
}

/** The job a check request asks for, or Cannot with the reason. The options are checked later, and wrong ones are findings. */
export function jobFor(text: string): Job {
  const request = readRequest(text);
  if (request.type !== 'check') throw new Cannot(`the request is for the ${String(request.type)} role; this plugin is a check plugin`);
  if (!isObject(request.brand)) throw new Cannot('the request has no brand');
  return { brand: requireBrand(request.brand), options: request.options ?? {} };
}
