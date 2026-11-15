import type { DocItem, Finding, SectionId } from '../../types/index.js';
import { finding } from '../checker/catalogue.js';

// Sections (RFC 0001 §13, RFC 0002 §1): a page declares the ones it holds with `section:` in its front matter, and
// `blazon check` notes the ones no page holds. A section is a standard one or one the brand added.

const unknown = (value: unknown, valid: readonly SectionId[]): string => `"${String(value)}" is not a section; known: ${valid.join(', ')}`;

/** The ids in a list, once each in the order written; an id that is not a section is reported and left out. */
function validIds(values: unknown[], path: string, valid: readonly SectionId[], problems: Finding[]): SectionId[] {
  const ids: SectionId[] = [];
  for (const value of values) {
    if (typeof value !== 'string' || !valid.includes(value)) problems.push(finding('section-invalid', { path, message: unknown(value, valid) }));
    else if (!ids.includes(value)) ids.push(value);
  }
  return ids;
}

/** The sections a page's `section:` names: one id or a list. Absent means none. */
export function pageSections(value: unknown, file: string, valid: readonly SectionId[], problems: Finding[]): SectionId[] {
  return value === undefined ? [] : validIds(Array.isArray(value) ? value : [value], file, valid, problems);
}

/** The `sections` config: the sections this brand expects, or undefined for all of them. */
export function configuredSections(value: unknown, valid: readonly SectionId[], problems: Finding[]): SectionId[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    problems.push(finding('section-invalid', { path: 'sections', message: `sections must be a list of sections: ${valid.join(', ')}` }));
    return undefined;
  }
  return validIds(value, 'sections', valid, problems);
}

/**
 * One info finding for each expected section no page holds. A project that has not started to use sections (no
 * page declares one and the config lists none) is not told about all of them.
 */
export function missingSections(docs: readonly DocItem[], configured: SectionId[] | undefined, valid: readonly SectionId[]): Finding[] {
  const held = new Set(docs.flatMap((doc) => doc.sections));
  if (configured === undefined && held.size === 0) return [];
  return (configured ?? valid)
    .filter((id) => !held.has(id))
    .map((id): Finding =>
      finding('section-missing', {
        path: id,
        message: `No page holds the ${id} section. Declare it with "section: ${id}" in a page's front matter, or leave it out of sections in blazon.config.ts`,
      }),
    );
}
