import type { Brand } from './brand.js';
import { isObject } from './brand.js';
import { skippable, unknownSkips } from './plan/index.js';
import { NAME } from './request.js';
import { findingFor, type Finding } from '../shared/plugin.js';

export type { Finding };

const finding = findingFor(NAME);
const warn = (code: string, path: string, message: string): Finding => finding(code, 'warning', path, message);

/**
 * The asset categories to leave out, and the findings about the options. The plugin's only option is `skip`, a list of category
 * names. An option that is wrong is a warning and is left out, and the deck is drawn: a typo must not cost the whole book.
 */
export function readOptions(options: unknown, brand: Brand): { skip: string[]; findings: Finding[] } {
  const findings: Finding[] = [];
  if (!isObject(options)) {
    findings.push(warn('option-invalid', 'options', 'options must be an object; the deck is drawn with none'));
    return { skip: [], findings };
  }
  for (const key of Object.keys(options)) if (key !== 'skip') findings.push(warn('option-unknown', `options.${key}`, `unknown option "${key}"; the deck reads only "skip"`));
  const names = options.skip ?? [];
  if (!Array.isArray(names) || names.some((name) => typeof name !== 'string')) {
    if ('skip' in options) findings.push(warn('option-invalid', 'options.skip', 'skip must be a list of asset category names, such as ["favicons-supplied"]; nothing is left out'));
    return { skip: [], findings };
  }
  const unknown = unknownSkips(brand, names as string[]);
  for (const name of unknown) {
    findings.push(
      warn(
        'skip-unknown',
        'options.skip',
        `"${name}" is no asset category of this brand, so nothing is left out for it (the categories are ${skippable(brand).join(', ') || 'none'})`,
      ),
    );
  }
  return { skip: [...new Set(names as string[])].filter((name) => !unknown.includes(name)), findings };
}
