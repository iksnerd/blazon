import { Cannot, readRequest, tokensJob } from '../shared/plugin.js';

/** The plugin's name, which blazon's config names it by, and the prefix of its finding codes */
export const NAME = 'blazon.shadcn';

export const MANIFEST = {
  v: 2,
  roles: ['check', 'build'],
  title: 'shadcn/ui',
  description: 'Writes which token each shadcn/ui variable takes (shadcn.json) and the variables as CSS, with a block for each context that changes one (shadcn.css).',
  version: '1.1.0',
  timeout_ms: 10000,
  env: [],
};

export { Cannot };

/** What one request asks: the role, where to write (a build only), the brand and the options as given. The plugin reads no site. */
export interface Job {
  type: 'check' | 'build';
  outDir: string;
  brand: unknown;
  options: unknown;
}

/** The job a request asks for, or Cannot with the reason. A check carries no folder. The options are checked later, and wrong ones are findings. */
export function jobFor(text: string): Job {
  const request = readRequest(text);
  if (request.type === 'check') return { type: 'check', outDir: '', brand: request.brand ?? {}, options: request.options ?? {} };
  return { type: 'build', ...tokensJob(text) };
}
