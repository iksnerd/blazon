import { buildJob, Cannot } from '../shared/plugin.js';

/** The plugin's name, which blazon's config names it by, and the prefix of its finding codes */
export const NAME = 'blazon.logo-kit';

export const MANIFEST = {
  v: 2,
  roles: ['build'],
  title: 'Logo kit',
  description: "Draws the brand's partnership lockups and clear-space sheets from the rules in the logo sidecars, as SVG and PNG.",
  version: '1.0.0',
  timeout_ms: 60000,
  env: ['BLAZON_CHROME', 'HOME', 'TMPDIR'],
};

export { Cannot };

/** What one build request asks: the site whose files the kit reads, where to write, the brand, and the options as given. */
export interface Job {
  siteDir: string;
  outDir: string;
  brand: unknown;
  options: unknown;
}

/** The job a build request asks for, or Cannot with the reason. The options are checked later, and wrong ones are findings. */
export function jobFor(text: string): Job {
  return buildJob(text);
}
