import { findingFor, isObject, type Finding } from '../shared/plugin.js';
import { NAME } from './request.js';

export interface Options {
  /** The folder and zip name, without an extension */
  name: string;
  /** Whether to draw the one-page PDF */
  pdf: boolean;
  /** Whether to include the colors marked needs-review, labelled as unreviewed */
  unreviewed: boolean;
  /** The logos to include, as asset ids; absent, every logo */
  logos?: string[];
}

const KEYS = ['name', 'pdf', 'unreviewed', 'logos'];

export type { Finding };
export const finding = findingFor(NAME);
const invalid = (message: string): Finding => finding('option-invalid', 'error', 'options', message);

/** A text as a file name: letters, digits, dots, hyphens and underscores, so it is plain ASCII and cannot leave the folder. */
export const fileName = (text: string): string => text.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[-.]+/, '') || 'file';

/**
 * The options as the kit uses them, and an `option-invalid` finding for each thing wrong. Nothing here throws: the options are the
 * person's, not the request's. A wrong option is left at its default and the rest is written. `logoIds` are the assets that are logos.
 */
export function parseOptions(raw: unknown, logoIds: ReadonlySet<string>): { options: Options; findings: Finding[] } {
  const findings: Finding[] = [];
  const options: Options = { name: 'press-kit', pdf: true, unreviewed: false };
  if (!isObject(raw)) return { options, findings: [invalid('options must be an object')] };
  for (const key of Object.keys(raw)) if (!KEYS.includes(key)) findings.push(invalid(`unknown option "${key}"; the options are ${KEYS.join(', ')}`));

  if (raw.name !== undefined) {
    if (typeof raw.name !== 'string' || !/^[A-Za-z0-9_-][A-Za-z0-9._-]{0,63}$/.test(raw.name))
      findings.push(invalid('name must be a file name of letters, digits, dots, hyphens and underscores, not starting with a dot, up to 64 characters, with no extension'));
    else options.name = raw.name;
  }
  if (raw.pdf !== undefined) {
    if (typeof raw.pdf !== 'boolean') findings.push(invalid('pdf must be true or false'));
    else options.pdf = raw.pdf;
  }
  if (raw.unreviewed !== undefined) {
    if (typeof raw.unreviewed !== 'boolean') findings.push(invalid('unreviewed must be true or false'));
    else options.unreviewed = raw.unreviewed;
  }
  if (raw.logos !== undefined) {
    if (!Array.isArray(raw.logos) || raw.logos.length === 0 || raw.logos.some((id) => typeof id !== 'string'))
      findings.push(invalid('logos must be a non-empty list of asset ids'));
    else {
      const ids = raw.logos as string[];
      const bad = ids.filter((id) => !logoIds.has(id));
      for (const id of bad) findings.push(invalid(`logos names ${JSON.stringify(id)}, which the brand has no logo for`));
      const known = ids.filter((id) => logoIds.has(id));
      if (known.length > 0) options.logos = known;
    }
  }
  return { options, findings };
}
