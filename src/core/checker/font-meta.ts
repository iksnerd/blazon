import type { Finding, GroupMeta, TokenItem } from '../../types/index.js';
import { spdxNote } from './spdx.js';
import { finding } from './catalogue.js';

const FIELDS = ['source', 'license', 'licenseUrl'];
const MESSAGE = 'font must be {"source"?: a name or an http(s) address, "license"?: an SPDX id or a name, "licenseUrl"?: an http(s) address}, with at least one of them';

const isWeb = (value: string): boolean => {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
};
const isText = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '' && !/[\r\n]/.test(value);

/** Why a `font` value is not usable, or undefined when it is. */
function problemWith(rule: unknown, type: string | undefined, onToken: boolean): string | undefined {
  if (typeof rule !== 'object' || rule === null || Array.isArray(rule)) return MESSAGE;
  const font = rule as Record<string, unknown>;
  const keys = Object.keys(font);
  if (keys.length === 0 || keys.some((key) => !FIELDS.includes(key)) || keys.some((key) => !isText(font[key]))) return MESSAGE;
  // A source that looks like an address must be a usable one: "https//example.com" would be printed as the place to get the font
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(font.source as string) && !isWeb(font.source as string)) return 'font.source is an address, so it must be http or https';
  if (font.licenseUrl !== undefined && !isWeb(font.licenseUrl as string)) return 'font.licenseUrl must be an http or https address';
  if (onToken && type !== undefined && type !== 'fontFamily') return `font describes a typeface, so it belongs on a fontFamily token, not a ${type} token`;
  return undefined;
}

/**
 * The `font` extension on tokens and groups: a source or license that is not text, an address that is not http(s), a field blazon does not know,
 * or a `font` on a token that is not a typeface. Printed into a press kit as the brand's word, so a malformed one is an error, not skipped.
 * Read from the token's own extension, as `logo` is: a group reports once, not each token under it.
 */
export function fontMetaFindings(items: readonly TokenItem[], groups: readonly GroupMeta[]): Finding[] {
  const own = (item: TokenItem) => (item.extensions?.['dev.blazon'] as { font?: unknown } | undefined)?.font;
  const rules: { path: string; rule: unknown; type?: string; onToken: boolean }[] = [
    ...groups.filter((g) => g.blazon.font !== undefined).map((g) => ({ path: g.path, rule: g.blazon.font, onToken: false })),
    ...items.filter((t) => own(t) !== undefined).map((t) => ({ path: t.path, rule: own(t), type: t.type, onToken: true })),
  ];
  return rules.flatMap(({ path, rule, type, onToken }): Finding[] => {
    const why = problemWith(rule, type, onToken);
    if (why) return [finding('invalid-font-meta', { path, message: why })];
    // The license is either an SPDX identifier or a name, so a value that is neither is a note, never an error
    const note = spdxNote((rule as { license?: string }).license ?? '');
    return note
      ? [finding('font-license-unknown', { path, message: `font.license ${note}${note.endsWith('?') ? '' : '.'} A plain name is fine; an SPDX id is what a tool can read` })]
      : [];
  });
}
