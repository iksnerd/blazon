import { buildJob, Cannot } from '../shared/plugin.js';

/** The plugin's name, which blazon's config names it by, and the prefix of its finding codes */
export const NAME = 'blazon.social-cards';

export const MANIFEST = {
  v: 2,
  roles: ['build'],
  title: 'Social cards',
  description: "Draws marketing images (PNG) from the brand's tokens, logo and a background you already have, and checks the text and the logo on each.",
  version: '1.0.0',
  timeout_ms: 60000,
  env: ['BLAZON_CHROME', 'HOME', 'TMPDIR'],
};

/** The plugin cannot do what it was asked; the message is the reason blazon shows. It is the shared class, so the shared browser launch throws it too. */
export { Cannot };

/** What one build request asks: the site whose files the cards read, where to write, the brand, and the options as given. */
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
