import type { DocItem, Finding, TokenItem } from '../../types/index.js';
import { directivesIn } from '../docs/directives.js';
import { finding } from './catalogue.js';

// A page that names tokens in its text and places none of them shows a reader the values as words. The brand book can show a token as a
// swatch, a type specimen or a preview of what it measures (`<!-- blazon:tokens path ... -->`), and a page about color, type or form
// should. A page that names five or more tokens, by path or by a color value, and places none of them is a note. A page that places any token, or shows pictures (assets, a section, icons), is not asked: it has chosen what to show.

/** How many named tokens a page may leave unshown before it is noted. */
export const NAMED_LIMIT = 5;

const PATH = /^[a-z][\w-]*(?:\.[\w-]+)+$/;
const HEX = /#[0-9a-fA-F]{6}\b/g;

export function pageTokenFindings(docs: readonly DocItem[], items: readonly TokenItem[]): Finding[] {
  const byPath = new Map(items.map((t) => [t.path, t]));
  const byHex = new Map<string, TokenItem>();
  for (const t of items)
    if (t.type === 'color' && typeof t.value === 'string' && /^#[0-9a-fA-F]{6}$/.test(t.value)) byHex.set(t.value.toUpperCase(), byHex.get(t.value.toUpperCase()) ?? t);
  const findings: Finding[] = [];
  for (const doc of docs) {
    const prose = doc.markdown.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, '');
    const directives = directivesIn(doc.markdown);
    // A page that places tokens has chosen what to show, and one that shows pictures has its subject in them
    if (directives.some((d) => ['tokens', 'assets', 'section', 'icons'].includes(d.name))) continue;
    const named = new Map<string, string>();
    for (const [, span] of prose.matchAll(/`([^`\n]+)`/g)) if (PATH.test(span!) && byPath.has(span!)) named.set(span!, span!);
    for (const hex of prose.match(HEX) ?? []) {
      const token = byHex.get(hex.toUpperCase());
      if (token) named.set(token.path, hex.toUpperCase());
    }
    if (named.size < NAMED_LIMIT) continue;
    const unshown = [...named.keys()];
    findings.push(
      finding('tokens-not-shown', {
        path: doc.filePath,
        message: `${doc.filePath} names ${unshown.length} tokens in its text (${unshown.slice(0, 4).join(', ')}${unshown.length > 4 ? ', ...' : ''}) and places no token with <!-- blazon:tokens <path> -->, so a reader sees their values only as words`,
      }),
    );
  }
  return findings;
}
