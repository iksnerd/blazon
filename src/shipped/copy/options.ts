import { findingFor, isObject, type Finding } from '../shared/plugin.js';
import { NAME } from './request.js';

export type { Finding };
export const finding = findingFor(NAME);

/** Terms the brand avoids, with the advice a finding quotes, and the pages the group applies to: all of them, or those in `only`, less those in `skip`. */
export interface AvoidGroup {
  terms: string[];
  say?: string;
  only?: Set<string>;
  skip?: Set<string>;
}

export interface Options {
  avoid: AvoidGroup[];
  headings: 'sentence' | 'any';
  /** The most words a heading may have; none when the brand sets no limit. */
  headingMaxWords?: number;
  /** The pages the heading checks (case and length) apply to, and those they leave out; a trailing `*` makes a path a prefix. */
  headingOnly?: Set<string>;
  headingSkip?: Set<string>;
  /** Text inside quotation marks is not searched for avoided terms. */
  ignoreQuoted: boolean;
  /** Words the brand writes in capitals, which the heading check leaves out. */
  names: Set<string>;
  /** The longest sentence in words; none when the brand sets no limit. */
  maxWords?: number;
  /** Pages, by their path from the docs folder, that quote counter-examples on purpose. */
  skip: Set<string>;
}

const KNOWN = ['avoid', 'headings', 'ignoreQuoted', 'names', 'sentences', 'skip'];
const GROUP_KEYS = ['terms', 'say', 'only', 'skip'];
const HEADING_KEYS = ['case', 'maxWords', 'only', 'skip'];

const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === 'string');

/** The options the config gave, with a finding for each one that is wrong; a wrong option is left out and the others stay. */
export function parseOptions(raw: unknown): { options: Options; findings: Finding[] } {
  const options: Options = { avoid: [], headings: 'any', ignoreQuoted: false, names: new Set(), skip: new Set() };
  const findings: Finding[] = [];
  const bad = (message: string) => findings.push(finding('option-invalid', 'error', 'options', message));
  if (!isObject(raw)) {
    bad('options must be an object');
    return { options, findings };
  }
  for (const key of Object.keys(raw)) if (!KNOWN.includes(key)) bad(`${key} is not an option; the options are ${KNOWN.join(', ')}`);

  if (raw.avoid !== undefined) {
    if (!Array.isArray(raw.avoid)) bad('avoid must be a list of groups');
    else
      raw.avoid.forEach((group: unknown, i: number) => {
        if (!isObject(group) || !strings(group.terms) || group.terms.length === 0) return bad(`avoid[${i}].terms must be a list of strings`);
        // A term is text; a single trailing * makes it a stem, so a * alone has nothing to match
        if (group.terms.some((term) => term.trim() === '' || term.trim() === '*')) return bad(`avoid[${i}].terms holds an empty term`);
        if (group.say !== undefined && typeof group.say !== 'string') return bad(`avoid[${i}].say must be a string`);
        for (const key of Object.keys(group)) if (!GROUP_KEYS.includes(key)) return bad(`avoid[${i}].${key} is not an option of a group; they are ${GROUP_KEYS.join(', ')}`);
        for (const key of ['only', 'skip'] as const) if (group[key] !== undefined && !strings(group[key])) return bad(`avoid[${i}].${key} must be a list of page paths`);
        options.avoid.push({
          terms: group.terms,
          ...(typeof group.say === 'string' && { say: group.say }),
          ...(strings(group.only) && { only: new Set(group.only) }),
          ...(strings(group.skip) && { skip: new Set(group.skip) }),
        });
      });
  }
  if (raw.headings !== undefined) {
    // A word is the case alone ("sentence" or "any"); an object adds the most words a heading may have
    if (raw.headings === 'sentence' || raw.headings === 'any') options.headings = raw.headings;
    else if (isObject(raw.headings)) {
      const unknown = Object.keys(raw.headings).find((key) => !HEADING_KEYS.includes(key));
      const { case: kind, maxWords, only, skip } = raw.headings;
      if (unknown) bad(`headings.${unknown} is not an option of headings; they are ${HEADING_KEYS.join(', ')}`);
      else if (kind !== undefined && kind !== 'sentence' && kind !== 'any') bad('headings.case must be "sentence" or "any"');
      else if (maxWords !== undefined && !(Number.isInteger(maxWords) && (maxWords as number) > 0)) bad('headings.maxWords must be a positive integer');
      else if (only !== undefined && !strings(only)) bad('headings.only must be a list of page paths');
      else if (skip !== undefined && !strings(skip)) bad('headings.skip must be a list of page paths');
      else {
        if (kind === 'sentence' || kind === 'any') options.headings = kind;
        if (maxWords !== undefined) options.headingMaxWords = maxWords as number;
        if (strings(only)) options.headingOnly = new Set(only);
        if (strings(skip)) options.headingSkip = new Set(skip);
      }
    } else bad('headings must be "sentence", "any" or an object with case and maxWords');
  }
  if (raw.ignoreQuoted !== undefined) {
    if (typeof raw.ignoreQuoted === 'boolean') options.ignoreQuoted = raw.ignoreQuoted;
    else bad('ignoreQuoted must be true or false');
  }
  if (raw.names !== undefined) {
    if (strings(raw.names)) options.names = new Set(raw.names);
    else bad('names must be a list of strings');
  }
  if (raw.sentences !== undefined) {
    const max = isObject(raw.sentences) ? raw.sentences.maxWords : undefined;
    if (Number.isInteger(max) && (max as number) > 0) options.maxWords = max as number;
    else bad('sentences.maxWords must be a positive integer');
  }
  if (raw.skip !== undefined) {
    if (strings(raw.skip)) options.skip = new Set(raw.skip);
    else bad('skip must be a list of page paths');
  }
  return { options, findings };
}
