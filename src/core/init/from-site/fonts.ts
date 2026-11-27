// The fonts of a site: the family a rule names, the Google Fonts stylesheet blazon knows for it.

const GENERIC_FAMILIES = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-sans-serif',
  'ui-serif',
  'ui-monospace',
  'ui-rounded',
  'emoji',
  'math',
  'fangsong',
  'inherit',
  'initial',
  'unset',
  '-apple-system',
  'blinkmacsystemfont',
  'segoe ui',
]);
const GENERIC_KEYWORDS = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy']);

const HEX = /[0-9a-fA-F]/;
const NEWLINE = /[\n\r\f]/;

/** The text of the CSS escape whose first character after the backslash is `list[at]`, and the index after it. */
function readEscape(list: string, at: number): { text: string; next: number } {
  if (!HEX.test(list[at]!)) return { text: list[at]!, next: at + 1 };
  let digits = '';
  let next = at;
  while (digits.length < 6 && next < list.length && HEX.test(list[next]!)) digits += list[next++];
  // one whitespace ends a hex escape, and CRLF counts as one
  if (list.startsWith('\r\n', next)) next += 2;
  else if (next < list.length && /\s/.test(list[next]!)) next += 1;
  const code = parseInt(digits, 16);
  const valid = code !== 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff);
  return { text: valid ? String.fromCodePoint(code) : '�', next };
}

/**
 * The entries of a `font-family` list, split on the commas CSS Syntax Level 3 sees as separators, and unquoted.
 *
 * Three states, one per kind of text:
 * - `bare`: a name or a keyword. A quote opens a string, `(` opens a call, a comma ends the entry, a backslash escapes.
 * - `string`: up to its own quote. A backslash escapes the next character, or is a line continuation before a newline.
 *   An unescaped newline ends it (a bad string); so does the end of the list, and what was read stays.
 * - `call`: a function such as `var(--x, "A, B")`, kept as written. Its commas do not split, and a string inside it
 *   may hold a `)`.
 */
function splitFamilies(list: string): string[] {
  const out: string[] = [];
  let current = '';
  let state: 'bare' | 'string' | 'call' = 'bare';
  let quote = ''; // the open string's quote, in `string` and in `call`
  let depth = 0; // open parentheses in `call`
  let i = 0;
  while (i < list.length) {
    const ch = list[i]!;
    if (state === 'string') {
      if (ch === quote) {
        state = 'bare';
        i++;
      } else if (NEWLINE.test(ch))
        state = 'bare'; // not consumed: the list goes on from here
      else if (ch === '\\') {
        if (i + 1 >= list.length) i++;
        else if (list.startsWith('\r\n', i + 1)) i += 3;
        else if (NEWLINE.test(list[i + 1]!)) i += 2;
        else {
          const escape = readEscape(list, i + 1);
          current += escape.text;
          i = escape.next;
        }
      } else {
        current += ch;
        i++;
      }
    } else if (state === 'call') {
      current += ch;
      i++;
      if (quote) {
        if (ch === '\\' && i < list.length) current += list[i++];
        else if (ch === quote) quote = '';
      } else if (ch === '"' || ch === "'") quote = ch;
      else if (ch === '(') depth++;
      else if (ch === ')' && --depth === 0) state = 'bare';
    } else if (ch === '"' || ch === "'") {
      state = 'string';
      quote = ch;
      i++;
    } else if (ch === '(') {
      state = 'call';
      quote = '';
      depth = 1;
      current += ch;
      i++;
    } else if (ch === ',') {
      out.push(current.trim());
      current = '';
      i++;
    } else if (ch === '\\' && i + 1 < list.length && !NEWLINE.test(list[i + 1]!)) {
      const escape = readEscape(list, i + 1);
      current += escape.text;
      i = escape.next;
    } else {
      current += ch;
      i++;
    }
  }
  out.push(current.trim());
  return out.filter(Boolean);
}

export interface FontPick {
  family: string;
  stack: string[];
  locator: string;
  cssVar?: string;
}

/** The family of the last `font-family` in a rule whose selector list holds one of `selectors`. */
export function fontOf(css: string, vars: Map<string, string>, selectors: RegExp): FontPick | undefined {
  let found: FontPick | undefined;
  for (const rule of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
    const parts = rule[1]!.split(',').map((s) => s.trim().toLowerCase());
    const match = parts.find((s) => selectors.test(s));
    if (!match) continue;
    const decl = rule[2]!.match(/(?:^|;)\s*font-family\s*:\s*([^;]+)/i);
    if (!decl) continue;
    let value = decl[1]!.replace(/!important/i, '').trim();
    let cssVar: string | undefined;
    const ref = value.match(/^var\(\s*(--[A-Za-z0-9_-]+)\s*(?:,\s*(.+))?\)$/);
    if (ref) {
      const resolved = vars.get(ref[1]!);
      value = resolved ?? ref[2] ?? '';
      if (resolved !== undefined) cssVar = ref[1];
    }
    const stack = splitFamilies(value);
    const family = stack.find((f) => !GENERIC_FAMILIES.has(f.toLowerCase()) && !f.startsWith('var('));
    if (family) found = { family, stack, locator: `${match} { font-family }`, ...(cssVar && { cssVar }) };
  }
  return found;
}

export interface WeightPick {
  weight: number;
  locator: string;
}

const WEIGHT_WORDS: Record<string, number> = { normal: 400, bold: 700 };

/**
 * The `font-weight` of a rule whose selector list holds one of `selectors`: the first rule that names `prefer` (`h1` for the headings), else
 * the last that matches. A weight is 1 to 1000, `normal` (400) or `bold` (700); `bolder`, `lighter` and a `var()` that is neither are not read.
 */
export function weightOf(css: string, vars: Map<string, string>, selectors: RegExp, prefer?: string): WeightPick | undefined {
  let last: WeightPick | undefined;
  for (const rule of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
    const parts = rule[1]!.split(',').map((s) => s.trim().toLowerCase());
    const match = parts.find((s) => selectors.test(s));
    if (!match) continue;
    const decl = rule[2]!.match(/(?:^|;)\s*font-weight\s*:\s*([^;]+)/i);
    if (!decl) continue;
    let value = decl[1]!
      .replace(/!important/i, '')
      .trim()
      .toLowerCase();
    const ref = value.match(/^var\(\s*(--[A-Za-z0-9_-]+)\s*(?:,\s*(.+))?\)$/);
    if (ref) value = (vars.get(ref[1]!) ?? ref[2] ?? '').trim().toLowerCase();
    const weight = WEIGHT_WORDS[value] ?? (/^\d+(\.\d+)?$/.test(value) ? Number(value) : NaN);
    if (!(weight >= 1 && weight <= 1000)) continue;
    const named = prefer !== undefined && parts.includes(prefer);
    const pick = { weight, locator: `${named ? prefer : match} { font-weight }` };
    if (named) return pick;
    last = pick;
  }
  return last;
}

export function fontValue(pick: FontPick): string[] {
  const generic = pick.stack.find((f) => GENERIC_KEYWORDS.has(f.toLowerCase()));
  return [pick.family, (generic ?? 'sans-serif').toLowerCase()];
}
