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
  /** Token path prefixes in dot form; when given, only the tokens under one of them are written */
  include?: string[];
  /** Token path prefixes in dot form; the tokens under one of them are not written (applied after `include`) */
  exclude?: string[];
}

const KEYS = ['platforms', 'dark', 'prefix', 'include', 'exclude'];
/** The most entries `include` or `exclude` may hold */
export const MAX_FILTER = 100;
// A token path: names joined with dots, each of letters, digits, `_` and `-`. Narrower than the names DTCG allows on purpose: a filter is
// compared as plain text, and a `*` or `[` in one is a mistake for a pattern, which this option does not take.
const PATH = /^[\p{L}\p{N}_-]+(\.[\p{L}\p{N}_-]+)*$/u;

/** True when `path` is `prefix` or lies under it: the names are compared one by one, so `breakpoint` does not reach `breakpoints.x`. Plain comparison, no pattern. */
export function underPrefix(path: string, prefix: string): boolean {
  const names = path.split('.');
  const head = prefix.split('.');
  return head.length <= names.length && head.every((name, at) => name === names[at]);
}

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
  for (const key of ['include', 'exclude'] as const) {
    const list = raw[key];
    if (list === undefined) continue;
    if (!Array.isArray(list) || list.length === 0 || list.length > MAX_FILTER || list.some((item) => typeof item !== 'string' || !PATH.test(item)))
      findings.push(
        invalid(
          `${key} must be a list of 1 to ${MAX_FILTER} token paths in dot form, such as "breakpoint" or "component.button.website", each name letters, digits, "_" and "-" (no pattern characters)`,
        ),
      );
    else options[key] = [...new Set(list as string[])];
  }
  return { options, findings };
}
