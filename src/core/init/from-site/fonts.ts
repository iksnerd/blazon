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

function splitFamilies(list: string): string[] {
  const out: string[] = [];
  let current = '';
  let quote = '';
  for (const ch of list) {
    if (quote) {
      if (ch === quote) quote = '';
      else current += ch;
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === ',') {
      out.push(current.trim());
      current = '';
    } else current += ch;
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

export function fontValue(pick: FontPick): string[] {
  const generic = pick.stack.find((f) => GENERIC_KEYWORDS.has(f.toLowerCase()));
  return [pick.family, (generic ?? 'sans-serif').toLowerCase()];
}
