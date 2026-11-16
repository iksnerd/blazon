import { Cannot, tokensJob } from '../shared/plugin.js';

/** The plugin's name, which blazon's config names it by, and the prefix of its finding codes */
export const NAME = 'blazon.platform-tokens';

export const MANIFEST = {
  v: 2,
  roles: ['build'],
  title: 'Platform tokens',
  description: "Writes the brand's color and dimension tokens as native files: Android XML, an iOS Swift file and asset catalog, and Jetpack Compose Kotlin.",
  version: '1.0.0',
  timeout_ms: 60000,
  env: [],
};

export { Cannot };

/** What one build request asks: where to write, the brand, and the options as given. */
export interface Job {
  outDir: string;
  brand: unknown;
  options: unknown;
}

/** The job a build request asks for, or Cannot with the reason. The options are checked later, and wrong ones are findings. */
export function jobFor(text: string): Job {
  const { outDir, brand, options } = tokensJob(text);
  return { outDir, brand, options };
}
