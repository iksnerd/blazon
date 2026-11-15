import { NAME } from './request.js';
import { findingFor, isObject, type Finding } from '../shared/plugin.js';

export interface Options {
  /** The logos to draw, as asset ids; absent, every logo that states a rule */
  logos?: string[];
  /** The partners to draw beside them, as asset ids; absent, every asset in the `partners` category */
  partners?: string[];
  formats: ('svg' | 'png')[];
  scale: 1 | 2;
}

const KEYS = ['logos', 'partners', 'formats', 'scale'];
const FORMATS = ['svg', 'png'];

export type { Finding };
export const finding = findingFor(NAME);
const invalid = (message: string): Finding => finding('option-invalid', 'error', 'options', message);

/**
 * The options as the kit uses them, and a `option-invalid` finding for each thing wrong. Nothing here throws: the options are the
 * person's, not the request's. A wrong option is left at its default and the rest is drawn.
 */
export function parseOptions(raw: unknown, known: ReadonlySet<string>): { options: Options; findings: Finding[] } {
  const findings: Finding[] = [];
  const options: Options = { formats: ['svg', 'png'], scale: 1 };
  if (!isObject(raw)) return { options, findings: [invalid('options must be an object')] };
  for (const key of Object.keys(raw)) if (!KEYS.includes(key)) findings.push(invalid(`unknown option "${key}"; the options are ${KEYS.join(', ')}`));

  const ids = (key: 'logos' | 'partners') => {
    const value = raw[key];
    if (value === undefined) return;
    if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) return void findings.push(invalid(`${key} must be a list of asset ids`));
    const missing = (value as string[]).filter((id) => !known.has(id));
    if (missing.length > 0) findings.push(invalid(`${key} names ${missing.map((id) => JSON.stringify(id)).join(', ')}, which the brand has no asset for`));
    options[key] = (value as string[]).filter((id) => known.has(id));
  };
  ids('logos');
  ids('partners');

  if (raw.formats !== undefined) {
    const formats = raw.formats;
    if (!Array.isArray(formats) || formats.length === 0 || formats.some((format) => !FORMATS.includes(format as string)))
      findings.push(invalid('formats must be a non-empty list of svg and png'));
    else options.formats = [...new Set(formats as ('svg' | 'png')[])];
  }
  if (raw.scale !== undefined) {
    if (raw.scale !== 1 && raw.scale !== 2) findings.push(invalid('scale must be 1 or 2'));
    else options.scale = raw.scale;
  }
  return { options, findings };
}
