import { NAME } from './request.js';
import { findingFor, isObject, type Finding } from '../shared/plugin.js';
import { SHADCN_VARIABLES, type ShadcnVariable } from './derive.js';

export type { Finding };
export const finding = findingFor(NAME);
const invalid = (message: string): Finding => finding('option-invalid', 'error', 'options', message);

export interface Options {
  /** A shadcn variable to the token it takes, in place of what the theme role gives it */
  variables: Partial<Record<ShadcnVariable, string>>;
}

/**
 * The options as the plugin uses them, and an `option-invalid` finding for each thing wrong. Nothing here throws: the options are the
 * person's, not the request's. A wrong option is left out and the rest is written.
 */
export function parseOptions(raw: unknown): { options: Options; findings: Finding[] } {
  const findings: Finding[] = [];
  const options: Options = { variables: {} };
  if (!isObject(raw)) return { options, findings: [invalid('options must be an object')] };
  for (const key of Object.keys(raw)) if (key !== 'variables') findings.push(invalid(`unknown option "${key}"; the option is variables`));
  if (raw.variables === undefined) return { options, findings };
  if (!isObject(raw.variables)) return { options, findings: [...findings, invalid('variables must be an object of shadcn variable names to token paths')] };
  for (const [name, tokenPath] of Object.entries(raw.variables)) {
    if (!(SHADCN_VARIABLES as readonly string[]).includes(name)) findings.push(invalid(`variables has unknown variable "${name}"; known: ${SHADCN_VARIABLES.join(', ')}`));
    else if (typeof tokenPath !== 'string' || tokenPath === '') findings.push(invalid(`variables.${name} must be a token path (a string)`));
    else options.variables[name as ShadcnVariable] = tokenPath;
  }
  return { options, findings };
}
