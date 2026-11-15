import { NAME } from './request.js';
import { findingFor, isObject, type Finding } from '../shared/plugin.js';

export interface Options {
  /** The file name without its extension; absent, made from the brand's title */
  name?: string;
  /** The logo to place, as an asset id; absent, the logo brand.json names */
  logo?: string;
  formats: ('potx' | 'pptx')[];
  /** Up to five color tokens (by path) or colors (hex or rgb()) for accent2 to accent6, ahead of the colors the plugin picks itself */
  accents?: string[];
}

const KEYS = ['name', 'logo', 'formats', 'accents'];
const MAX_ACCENTS = 5;
const FORMATS = ['potx', 'pptx'];

export type { Finding };
export const finding = findingFor(NAME);
const invalid = (message: string): Finding => finding('option-invalid', 'error', 'options', message);

/** A name as a file name: lowercase letters, digits, dots, hyphens and underscores, so it cannot leave out_dir. `fallback` when nothing is left. */
export const slug = (text: string, fallback = 'brand'): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9._]+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 80) || fallback;

/**
 * The options as the template uses them, and an `option-invalid` finding for each thing wrong. Nothing here throws: the options are the
 * person's, not the request's. A wrong option is left at its default and the rest is written.
 */
export function parseOptions(raw: unknown, known: ReadonlySet<string>): { options: Options; findings: Finding[] } {
  const findings: Finding[] = [];
  const options: Options = { formats: ['potx', 'pptx'] };
  if (!isObject(raw)) return { options, findings: [invalid('options must be an object')] };
  for (const key of Object.keys(raw)) if (!KEYS.includes(key)) findings.push(invalid(`unknown option "${key}"; the options are ${KEYS.join(', ')}`));

  if (raw.name !== undefined) {
    if (typeof raw.name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(raw.name) || raw.name.includes('..'))
      findings.push(invalid('name must be a file name of letters, digits, dots, hyphens and underscores, up to 80 characters, with no extension'));
    else options.name = raw.name;
  }
  if (raw.logo !== undefined) {
    if (typeof raw.logo !== 'string') findings.push(invalid('logo must be an asset id'));
    else if (!known.has(raw.logo)) findings.push(invalid(`logo names ${JSON.stringify(raw.logo)}, which the brand has no asset for`));
    else options.logo = raw.logo;
  }
  if (raw.formats !== undefined) {
    const formats = raw.formats;
    if (!Array.isArray(formats) || formats.length === 0 || formats.some((format) => !FORMATS.includes(format as string)))
      findings.push(invalid('formats must be a non-empty list of potx and pptx'));
    else options.formats = FORMATS.filter((format) => formats.includes(format)) as Options['formats'];
  }
  if (raw.accents !== undefined) {
    const accents = raw.accents;
    if (!Array.isArray(accents) || accents.length === 0 || accents.length > MAX_ACCENTS || accents.some((accent) => typeof accent !== 'string' || accent.trim() === ''))
      findings.push(invalid(`accents must be a list of one to ${MAX_ACCENTS} color tokens or colors`));
    else options.accents = (accents as string[]).map((accent) => accent.trim());
  }
  return { options, findings };
}
