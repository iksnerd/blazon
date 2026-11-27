import { NAME } from './request.js';
import { findingFor, isObject, type Finding } from '../shared/plugin.js';
import type { ColorFormat } from './color.js';
import { SHADCN_VARIABLES, type ShadcnVariable } from './derive.js';

export type { Finding };
export const finding = findingFor(NAME);
const invalid = (message: string): Finding => finding('option-invalid', 'error', 'options', message);

/** The variables `destructive` is compared with, and the only key `allowSame` takes. */
export const CLASH_PARTNERS = ['primary', 'accent', 'ring'] as const;
export type ClashPartner = (typeof CLASH_PARTNERS)[number];

const FORMATS: readonly ColorFormat[] = ['as-authored', 'oklch', 'hex'];
const OPTION_NAMES = ['variables', 'format', 'themeInline', 'chart', 'allowSame'];

export interface Options {
  /** A shadcn variable to the token it takes, in place of what the theme role gives it */
  variables: Partial<Record<ShadcnVariable, string>>;
  /** How colors are written in shadcn.css */
  format: ColorFormat;
  /** Whether to write shadcn-theme.css, the `@theme inline` block */
  themeInline: boolean;
  /** A token group whose first five color tokens fill `chart-1` to `chart-5` */
  chart?: string;
  /** The `destructive` pairs a brand says may be one color: the partners it may share a color with */
  allowSame: ClashPartner[];
}

/**
 * The options as the plugin uses them, and an `option-invalid` finding for each thing wrong. Nothing here throws: the options are the
 * person's, not the request's. A wrong option is left out and the rest is written.
 */
export function parseOptions(raw: unknown): { options: Options; findings: Finding[] } {
  const findings: Finding[] = [];
  const options: Options = { variables: {}, format: 'as-authored', themeInline: false, allowSame: [] };
  if (!isObject(raw)) return { options, findings: [invalid('options must be an object')] };
  for (const key of Object.keys(raw)) if (!OPTION_NAMES.includes(key)) findings.push(invalid(`unknown option "${key}"; the options are ${OPTION_NAMES.join(', ')}`));

  if (raw.format !== undefined) {
    if (typeof raw.format === 'string' && (FORMATS as readonly string[]).includes(raw.format)) options.format = raw.format as ColorFormat;
    else findings.push(invalid(`format must be one of ${FORMATS.map((f) => `"${f}"`).join(', ')}`));
  }
  if (raw.themeInline !== undefined) {
    if (typeof raw.themeInline === 'boolean') options.themeInline = raw.themeInline;
    else findings.push(invalid('themeInline must be true or false'));
  }
  if (raw.chart !== undefined) {
    if (typeof raw.chart === 'string' && raw.chart !== '') options.chart = raw.chart;
    else findings.push(invalid('chart must be a token group path (a string)'));
  }
  if (raw.allowSame !== undefined) {
    if (!isObject(raw.allowSame)) findings.push(invalid('allowSame must be an object such as { "destructive": "primary" }'));
    else
      for (const [name, partner] of Object.entries(raw.allowSame)) {
        const partners = Array.isArray(partner) ? partner : [partner];
        if (name !== 'destructive') findings.push(invalid(`allowSame has unknown variable "${name}"; the only one is destructive`));
        else if (partners.length === 0 || !partners.every((p) => (CLASH_PARTNERS as readonly unknown[]).includes(p)))
          findings.push(invalid(`allowSame.destructive must be ${CLASH_PARTNERS.join(', ')} or a list of them`));
        else options.allowSame = [...new Set([...options.allowSame, ...(partners as ClashPartner[])])];
      }
  }

  if (raw.variables === undefined) return { options, findings };
  if (!isObject(raw.variables)) return { options, findings: [...findings, invalid('variables must be an object of shadcn variable names to token paths')] };
  for (const [name, tokenPath] of Object.entries(raw.variables)) {
    if (!(SHADCN_VARIABLES as readonly string[]).includes(name)) findings.push(invalid(`variables has unknown variable "${name}"; known: ${SHADCN_VARIABLES.join(', ')}`));
    else if (typeof tokenPath !== 'string' || tokenPath === '') findings.push(invalid(`variables.${name} must be a token path (a string)`));
    else options.variables[name as ShadcnVariable] = tokenPath;
  }
  return { options, findings };
}
