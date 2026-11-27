import { customProperties } from '../../drift/compare.js';
import { toHex } from '../shared/hex.js';

// What a site's CSS shows, counted: every color, radius and font weight its rules use, with where each came from. It is evidence for the
// person who reviews the brand, written to extract.json. Nothing here chooses a token: the most frequent color is usually a gray or the link
// color, so a count never picks a role.

export interface Sheet {
  /** Where the CSS came from: its URL, or its path in a saved folder */
  source: string;
  css: string;
}

export interface Use {
  source: string;
  selector: string;
  property: string;
  /** The value as written */
  value: string;
}

export interface Counted {
  value: string;
  count: number;
  /** The first uses, at most five */
  uses: Use[];
}

const COMMENT = /\/\*[\s\S]*?\*\//g;
const RULE = /([^{}]*)\{([^{}]*)\}/g;
const DECLARATION = /(--[A-Za-z0-9_-]+|[A-Za-z-]+)\s*:\s*([^;]+?)\s*(?:;|$)/g;
const COLOR_PROPERTY =
  /^(color|background|background-color|border|border-(?:top|right|bottom|left|block|inline)(?:-color)?|border-color|outline|outline-color|fill|stroke|text-decoration-color|caret-color|accent-color)$/i;
const COLOR_FUNCTION = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([^()]*\)|#[0-9a-f]{3,8}\b/gi;
const NAMED = /^[a-z]+$/i;
const KEYWORD = /^(inherit|initial|unset|revert|none|currentcolor|transparent|auto)$/i;
const VAR = /var\(\s*(--[A-Za-z0-9_-]+)\s*(?:,[^()]*)?\)/g;
const DIMENSION = /^(-?(?:\d+\.?\d*|\.\d+))(px|rem|em|%)$|^0$/i;

/** Every declaration of every rule, with its selector, in the order written. */
function declarations(sheet: Sheet): Use[] {
  const out: Use[] = [];
  for (const rule of sheet.css.replace(COMMENT, '').matchAll(RULE)) {
    // The text before `{` may start with statements such as `@import ...;`: the selector is what follows the last one
    const selector = rule[1]!.split(';').pop()!.trim().replace(/\s+/g, ' ');
    for (const d of rule[2]!.matchAll(DECLARATION)) out.push({ source: sheet.source, selector, property: d[1]!.toLowerCase(), value: d[2]!.replace(/!important/i, '').trim() });
  }
  return out;
}

function counter() {
  const map = new Map<string, Counted>();
  return {
    add(value: string, use: Use) {
      const entry = map.get(value) ?? { value, count: 0, uses: [] };
      entry.count++;
      if (entry.uses.length < 5) entry.uses.push(use);
      map.set(value, entry);
    },
    /** Most used first; a tie in the order the value was first seen */
    ranked: (): Counted[] => [...map.values()].sort((a, b) => b.count - a.count),
  };
}

export interface Evidence {
  /** Every color a rule uses, as hex, most used first */
  colors: Counted[];
  /** Every `border-radius` value, most used first */
  radii: Counted[];
  /** Every `font-weight` value, most used first */
  weights: Counted[];
  /** The first family of every `font-family`, most used first */
  families: Counted[];
  /** Where each custom property was declared: the last sheet and rule that declares it */
  declaredIn: Map<string, Use>;
}

/** Counts the colors, radii, weights and families the sheets' rules use. A `var()` is read through the custom properties of all the sheets. */
export function evidenceOf(sheets: Sheet[]): Evidence {
  const vars = customProperties(sheets.map((s) => s.css).join('\n'));
  const colors = counter();
  const radii = counter();
  const weights = counter();
  const families = counter();
  const declaredIn = new Map<string, Use>();
  for (const sheet of sheets) {
    for (const use of declarations(sheet)) {
      if (use.property.startsWith('--')) {
        declaredIn.set(use.property, use);
        continue;
      }
      const value = use.value.replace(VAR, (whole, name: string) => vars.get(name) ?? whole);
      if (COLOR_PROPERTY.test(use.property)) {
        const found = [...value.matchAll(COLOR_FUNCTION)].map((m) => m[0]);
        // A named color only when it is the whole value of a color property (`color: white`), not a word inside `border: 1px solid`
        if (found.length === 0 && NAMED.test(value) && !KEYWORD.test(value)) found.push(value);
        for (const text of found) {
          const hex = toHex(text);
          if (hex) colors.add(hex.hex, use);
        }
      } else if (use.property === 'border-radius' && DIMENSION.test(value)) radii.add(value.toLowerCase(), use);
      else if (use.property === 'font-weight') weights.add(value.toLowerCase(), use);
      else if (use.property === 'font-family') {
        const first = value
          .split(',')[0]!
          .trim()
          .replace(/^["']|["']$/g, '');
        if (first) families.add(first, use);
      }
    }
  }
  return { colors: colors.ranked(), radii: radii.ranked(), weights: weights.ranked(), families: families.ranked(), declaredIn };
}
