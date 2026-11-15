import { NAME } from './request.js';
import { findingFor, isObject, type Finding } from '../shared/plugin.js';

export const PLATFORMS = ['android', 'ios', 'compose'] as const;
export type Platform = (typeof PLATFORMS)[number];

export interface Options {
  /** The platforms to write, in the order Android, iOS, Compose */
  platforms: Platform[];
  /** The context that is the dark appearance; absent, the context named `dark` */
  dark?: string;
  /** Letters and digits: first in an Android resource name, and the start of the Swift and Kotlin type names in place of `Blazon`. Empty for none */
  prefix: string;
}

const KEYS = ['platforms', 'dark', 'prefix'];

export type { Finding };
export const finding = findingFor(NAME);
const invalid = (message: string): Finding => finding('option-invalid', 'error', 'options', message);

/**
 * The options as the plugin uses them, and an `option-invalid` finding for each thing wrong. Nothing here throws: the options are the
 * person's, not the request's. A wrong option is left at its default and the rest is written. `contexts` are the names of the contexts
 * the brand has besides its defaults.
 */
export function parseOptions(raw: unknown, contexts: ReadonlySet<string>): { options: Options; findings: Finding[] } {
  const findings: Finding[] = [];
  const options: Options = { platforms: [...PLATFORMS], prefix: '' };
  if (!isObject(raw)) return { options, findings: [invalid('options must be an object')] };
  for (const key of Object.keys(raw)) if (!KEYS.includes(key)) findings.push(invalid(`unknown option "${key}"; the options are ${KEYS.join(', ')}`));

  if (raw.platforms !== undefined) {
    const platforms = raw.platforms;
    const wrong = Array.isArray(platforms) ? platforms.filter((platform) => !PLATFORMS.includes(platform as Platform)) : [];
    if (!Array.isArray(platforms) || platforms.length === 0 || wrong.length > 0)
      findings.push(
        invalid(`platforms must be a non-empty list of ${PLATFORMS.join(', ')}${wrong.length > 0 ? `, not ${wrong.map((platform) => JSON.stringify(platform)).join(', ')}` : ''}`),
      );
    else options.platforms = PLATFORMS.filter((platform) => platforms.includes(platform));
  }
  if (raw.dark !== undefined) {
    if (typeof raw.dark !== 'string') findings.push(invalid('dark must be the name of a context'));
    else if (!contexts.has(raw.dark))
      findings.push(invalid(`dark names ${JSON.stringify(raw.dark)}, which the brand has no context for${contexts.size ? ` (it has ${[...contexts].sort().join(', ')})` : ''}`));
    else options.dark = raw.dark;
  }
  if (raw.prefix !== undefined) {
    if (typeof raw.prefix !== 'string' || !/^([A-Za-z][A-Za-z0-9]*)?$/.test(raw.prefix)) findings.push(invalid('prefix must be letters and digits, starting with a letter'));
    else options.prefix = raw.prefix;
  }
  return { options, findings };
}
