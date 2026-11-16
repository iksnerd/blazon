import { NAME } from './request.js';
import { findingFor, isObject, type Finding } from '../shared/plugin.js';

export type { Finding };
export const finding = findingFor(NAME);

/** The plugin has no option, so anything the config gives it is a finding: `blazon.tailwind` is listed with no `options`. */
export function optionFindings(raw: unknown): Finding[] {
  if (!isObject(raw)) return [finding('option-invalid', 'error', 'options', 'options must be an object')];
  return Object.keys(raw).map((key) => finding('option-invalid', 'error', 'options', `unknown option "${key}"; this plugin has no options`));
}
