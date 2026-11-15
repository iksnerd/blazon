// Text for people and the message of a plugin that could not answer (RFC 0005 sections 3.8 and 5).

const CONTROL_OR_FORMAT = /[\p{Cc}\p{Cf}]/u;
const MARK = /^[\p{Mn}\p{Me}\p{Mc}]$/u;

/** Check the text a manifest holds for people: no control (Cc) or format (Cf) character, not only white space, 1 to `maximum` grapheme clusters. Throws an Error naming `field`. */
export function plainText(field: string, value: string, maximum: number): void {
  for (const ch of value) {
    if (CONTROL_OR_FORMAT.test(ch)) throw new Error(`${field} holds a control or format character (U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')})`);
  }
  if (value.trim() === '') throw new Error(`${field} is empty or only white space`);
  const n = graphemeCount(value);
  if (n > maximum) throw new Error(`${field} is ${n} characters, at most ${maximum}`);
}

const isRegional = (cp: number) => cp >= 0x1f1e6 && cp <= 0x1f1ff;
const isModifier = (cp: number) => cp >= 0x1f3fb && cp <= 0x1f3ff;

// Hangul syllable composition: a leading consonant (L) takes a vowel (V), a vowel takes a final consonant (T), and
// a precomposed syllable is an LV, or an LVT when it has a final.
const isL = (c: number) => (c >= 0x1100 && c <= 0x115f) || (c >= 0xa960 && c <= 0xa97c);
const isV = (c: number) => (c >= 0x1160 && c <= 0x11a7) || (c >= 0xd7b0 && c <= 0xd7c6);
const isT = (c: number) => (c >= 0x11a8 && c <= 0x11ff) || (c >= 0xd7cb && c <= 0xd7fb);
const isSyllable = (c: number) => c >= 0xac00 && c <= 0xd7a3;
const isLV = (c: number) => isSyllable(c) && (c - 0xac00) % 28 === 0;

function hangulJoins(previous: number, next: number): boolean {
  if (isL(previous)) return isL(next) || isV(next) || isSyllable(next);
  if (isV(previous) || isLV(previous)) return isV(next) || isT(next);
  if (isT(previous) || (isSyllable(previous) && !isLV(previous))) return isT(next);
  return false;
}

/**
 * The index, in code points, where each user-perceived character of `value` begins. A simplified UAX #29 with no
 * dependency, so that a length is the same on every platform: a combining mark, a
 * spacing mark, an emoji skin tone or a Hangul vowel or final consonant joins the character before it, and two
 * regional indicators make one flag. The few clusters it miscounts are counted as more than one character, which
 * only makes a limit stricter.
 */
function graphemeStarts(points: string[]): number[] {
  const starts: number[] = [];
  let previous = -1;
  let flagOpen = false; // an odd regional indicator is waiting for its pair
  points.forEach((ch, index) => {
    const cp = ch.codePointAt(0)!;
    let joins = false;
    if (starts.length === 0) joins = false;
    else if (MARK.test(ch)) joins = true;
    else if (isModifier(cp)) joins = true;
    else if (isRegional(cp) && isRegional(previous) && flagOpen) joins = true;
    else if (hangulJoins(previous, cp)) joins = true;
    if (!joins) starts.push(index);
    flagOpen = isRegional(cp) && !joins;
    previous = cp;
  });
  return starts;
}

export function graphemeCount(value: string): number {
  return graphemeStarts(Array.from(value)).length;
}

/** Cut `value` to at most `n` user-perceived characters, never in the middle of one. */
export function truncateGraphemes(value: string, n: number): string {
  const points = Array.from(value);
  const starts = graphemeStarts(points);
  return starts.length <= n ? value : points.slice(0, starts[n]).join('');
}

export const MAX_MESSAGE = 300;

/**
 * What a host shows for a plugin that exited 2: the first line of stdout, cleaned. Ignored when it is not valid
 * UTF-8. Every control (Cc) and format (Cf) character is removed, white space trimmed, and the rest cut to 300
 * grapheme clusters. When nothing is left, `fallback`: a message of the host's own that names the plugin.
 */
export function message(stdout: Uint8Array, fallback: string): string {
  const newline = stdout.indexOf(0x0a);
  const line = newline < 0 ? stdout : stdout.subarray(0, newline);
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(line);
  } catch {
    return fallback;
  }
  const cleaned = text.replace(/[\p{Cc}\p{Cf}]/gu, '').trim();
  return cleaned === '' ? fallback : truncateGraphemes(cleaned, MAX_MESSAGE);
}
