import { Cannot, tokensJob } from '../shared/plugin.js';

/** The plugin's name, which blazon's config names it by, and the prefix of its finding codes */
export const NAME = 'blazon.tailwind';

export const MANIFEST = {
  v: 2,
  roles: ['build'],
  title: 'Tailwind',
  description: "Writes the brand's tokens as a Tailwind v4 theme (tailwind.css) and the reset that closes Tailwind's default theme (tailwind-reset.css).",
  version: '1.0.0',
  timeout_ms: 10000,
  env: [],
};

export { Cannot };

/** What one build request asks: where to write, the brand, and the options as given. The plugin reads no site. */
export interface Job {
  outDir: string;
  brand: unknown;
  options: unknown;
}

/** The job a build request asks for, or Cannot with the reason. The options are checked later, and wrong ones are findings. */
export function jobFor(text: string): Job {
  return tokensJob(text);
}
