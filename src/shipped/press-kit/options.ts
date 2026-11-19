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
  /** What the brand book's own title and description cannot say: the company behind the brand */
  company?: Company;
  /** A short line printed in README.txt, about.txt, colors.txt and the PDF, such as that the colors are proposed */
  note?: string;
}

export interface Fact {
  label: string;
  value: string;
}

export interface Company {
  /** Replaces the brand's description in about.txt and the PDF */
  description?: string;
  /** One text printed after the description */
  boilerplate?: string;
  /** Labelled lines such as the legal name, in the order given */
  facts?: Fact[];
}

/** What each text may hold, in characters, and how many facts there may be */
export const LIMITS = { description: 1000, boilerplate: 2000, facts: 20, label: 60, value: 300, note: 280 };

const KEYS = ['name', 'pdf', 'unreviewed', 'logos', 'company', 'note'];
const COMPANY_KEYS = ['description', 'boilerplate', 'facts'];
const FACT_KEYS = ['label', 'value'];

export type { Finding };
export const finding = findingFor(NAME);
const invalid = (message: string, at = 'options'): Finding => finding('option-invalid', 'error', at, message);

/** A text the person wrote: a string with something in it, up to `max` characters, and on one line when `oneLine`. Otherwise the reason it is not. */
function textProblem(value: unknown, max: number, oneLine: boolean): string | undefined {
  if (typeof value !== 'string') return 'must be a string';
  if (value.trim() === '') return 'must not be empty';
  if (value.length > max) return `must be at most ${max} characters, not ${value.length}`;
  if (oneLine && /[\r\n]/.test(value)) return 'must be on one line';
  return undefined;
}

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

  if (raw.company !== undefined) readCompany(raw.company, options, findings);
  if (raw.note !== undefined) {
    const problem = textProblem(raw.note, LIMITS.note, true);
    if (problem) findings.push(invalid(`note ${problem}`, 'options.note'));
    else options.note = (raw.note as string).trim();
  }
  return { options, findings };
}

/** The company option: every key optional, each value checked on its own so one wrong text does not cost the others */
function readCompany(raw: unknown, options: Options, findings: Finding[]): void {
  if (!isObject(raw)) {
    findings.push(invalid('company must be an object with description, boilerplate and facts', 'options.company'));
    return;
  }
  for (const key of Object.keys(raw))
    if (!COMPANY_KEYS.includes(key)) findings.push(invalid(`unknown key "company.${key}"; company takes ${COMPANY_KEYS.join(', ')}`, 'options.company'));
  const company: Company = {};
  for (const key of ['description', 'boilerplate'] as const) {
    if (raw[key] === undefined) continue;
    const problem = textProblem(raw[key], LIMITS[key], false);
    if (problem) findings.push(invalid(`company.${key} ${problem}`, `options.company.${key}`));
    else company[key] = (raw[key] as string).trim();
  }
  if (raw.facts !== undefined) {
    if (!Array.isArray(raw.facts) || raw.facts.length === 0)
      findings.push(invalid('company.facts must be a non-empty list of {"label": ..., "value": ...}', 'options.company.facts'));
    else if (raw.facts.length > LIMITS.facts) findings.push(invalid(`company.facts holds ${raw.facts.length} facts, at most ${LIMITS.facts}`, 'options.company.facts'));
    else {
      const facts: Fact[] = [];
      raw.facts.forEach((item, index) => {
        const at = `options.company.facts[${index}]`;
        if (!isObject(item)) return void findings.push(invalid(`company.facts[${index}] must be an object with a label and a value`, at));
        const unknown = Object.keys(item).filter((key) => !FACT_KEYS.includes(key));
        for (const key of unknown) findings.push(invalid(`unknown key "company.facts[${index}].${key}"; a fact takes label and value`, at));
        const [label, value] = [textProblem(item.label, LIMITS.label, true), textProblem(item.value, LIMITS.value, true)];
        if (label) findings.push(invalid(`company.facts[${index}].label ${label}`, `${at}.label`));
        if (value) findings.push(invalid(`company.facts[${index}].value ${value}`, `${at}.value`));
        if (!label && !value && unknown.length === 0) facts.push({ label: (item.label as string).trim(), value: (item.value as string).trim() });
      });
      if (facts.length > 0) company.facts = facts;
    }
  }
  if (Object.keys(company).length > 0) options.company = company;
}
