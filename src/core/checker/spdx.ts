import { compareText } from '../order.js';
import list from './spdx-ids.json' with { type: 'json' };

const LICENSES = new Set(list.licenses);
const EXCEPTIONS = new Set(list.exceptions);
const BY_LOWER = new Map([...list.licenses, ...list.exceptions].map((id) => [id.toLowerCase(), id]));
const OPERATORS = new Set(['AND', 'OR', 'WITH']);
/** `LicenseRef-acme-font`, optionally from another document: SPDX's own form for a license that is not on the list */
const REFERENCE = /^(DocumentRef-[A-Za-z0-9.-]+:)?LicenseRef-[A-Za-z0-9.-]+$/;

/** Up to three listed ids of the same family: `OFL-1.2` suggests `OFL-1.1` and `OFL-1.0`, `Apache2` suggests the Apache ones. */
function nearby(id: string): string[] {
  const family = id.split(/[-\d]/)[0]!.toLowerCase();
  if (family === '') return [];
  const shared = (candidate: string) => [...candidate].findIndex((char, i) => char.toLowerCase() !== id[i]?.toLowerCase());
  const distance = (candidate: string) => Math.abs(candidate.length - id.length);
  return list.licenses
    .filter((candidate) => candidate.toLowerCase().startsWith(family))
    .sort((a, b) => (shared(b) === -1 ? a.length : shared(b)) - (shared(a) === -1 ? b.length : shared(a)) || distance(a) - distance(b) || compareText(a, b))
    .slice(0, 3);
}

/**
 * Why a font's `license` looks like an SPDX identifier but is not one, or undefined when it is one, or is a name.
 * The field takes either (RFC 0001 section 2), so only a value that is trying to be an identifier is judged: a single
 * word with a digit, a hyphen or a plus (`OFL-1.2`, `Apache2`), a known id in the wrong case (`mit`), or an
 * expression joined by AND, OR or WITH. `SIL Open Font License 1.1` and `Proprietary` are names and are left alone.
 */
export function spdxNote(license: string): string | undefined {
  const words = license.split(/[\s()]+/).filter(Boolean);
  const ids = words.filter((word) => !OPERATORS.has(word));
  const isExpression = ids.length < words.length;
  if (!isExpression && ids.length !== 1) return undefined;
  if (ids.some((id) => !/^[A-Za-z0-9.+:-]+$/.test(id))) return undefined;

  for (const [index, id] of words.entries()) {
    if (OPERATORS.has(id) || REFERENCE.test(id)) continue;
    const bare = id.replace(/\+$/, '');
    const known = words[index - 1] === 'WITH' ? EXCEPTIONS.has(bare) : LICENSES.has(bare);
    if (known) continue;
    const wrongCase = BY_LOWER.get(bare.toLowerCase());
    if (wrongCase) return `"${id}" is not spelled as SPDX spells it: use ${wrongCase}`;
    // One plain word that is not on the list (`Proprietary`) is a name; anything shaped like an identifier is judged
    if (!isExpression && !/[\d+-]/.test(id)) return undefined;
    const close = nearby(bare);
    return `"${id}" is not an SPDX license identifier (SPDX license list of ${list.releaseDate})${close.length > 0 ? `; did you mean ${close.length > 1 ? `${close.slice(0, -1).join(', ')} or ${close.at(-1)}` : close[0]}?` : ''}`;
  }
  return undefined;
}
