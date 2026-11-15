import { BONE, contrast, GRAPHITE } from './palette.js';

// The token names `blazon init` writes: the starter is blazon's own brand book, so they are blazon's (surface.*, text.*,
// interactive.*, rule.*), the vocabulary `inferTheme` already reads. One signal color is the brand's action color:
// `interactive.primary` aliases it, and `text.onSignal` is the ink on it. There is no hover state, secondary color,
// accent or gradient in the starter, so init writes none.

type Json = Record<string, unknown>;

/** The starter's signal color, a primitive named for what blazon's was; init renames it once the brand has its own. */
export const STARTER_SIGNAL = 'color.signal.orange';
export const SIGNAL = 'color.signal.primary';
export const HAZARD = 'color.signal.hazard';

export const isToken = (node: unknown): node is Json => typeof node === 'object' && node !== null && '$value' in node;

export function tokenAt(root: Json, dotted: string): Json | undefined {
  let node: unknown = root;
  for (const part of dotted.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = (node as Json)[part];
  }
  return isToken(node) ? node : undefined;
}

/** Marks a token as needing a person's review, unless it already says so. */
export function flagReview(token: Json, note: string): void {
  const ext = (token['$extensions'] ??= {}) as Json;
  const blazon = (ext['dev.blazon'] ??= {}) as Json;
  if (blazon['review'] === undefined) blazon['review'] = { status: 'needs-review', note };
}

/**
 * Gives the brand's own color to the signal primitive: it is renamed `color.signal.primary` (its aliases follow) and holds
 * `hex`. The ink on it, `text.onSignal`, becomes bone when graphite would not reach AA on the color and bone would; its
 * contrast pair then names the primary alone, because bone on hazard yellow would fail. Returns what the user still has to know.
 */
export function setSignal(tree: Json, hex: string): { hints: string[]; label: 'graphite' | 'bone' } {
  const hints: string[] = [];
  const colors = tree['color'] as Json | undefined;
  const group = colors?.['signal'] as Json | undefined;
  const old = group?.['orange'];
  if (!group || !isToken(old)) throw new Error(`${STARTER_SIGNAL} is not in the tokens`);
  // Rename keeping the group's order, then follow every alias to it
  const renamed: Json = {};
  for (const [key, value] of Object.entries(group)) renamed[key === 'orange' ? 'primary' : key] = value;
  colors!['signal'] = renamed;
  const moved = JSON.parse(JSON.stringify(tree).split(`{${STARTER_SIGNAL}}`).join(`{${SIGNAL}}`)) as Json;
  for (const key of Object.keys(tree)) tree[key] = moved[key];
  const primary = tokenAt(tree, SIGNAL)!;
  primary['$value'] = hex;
  primary['$description'] = 'Primary signal color';
  const ink = setLabelInk(tree, hex, `{${SIGNAL}}`);
  hints.push(...ink.hints);
  const hazard = tokenAt(tree, HAZARD);
  if (hazard) {
    flagReview(hazard, "Still blazon's hazard yellow: it was not chosen to go with your primary. Set the brand's own, or remove it.");
    hints.push(`${HAZARD} is still blazon's hazard yellow and is marked needs-review: set the brand's own or remove it`);
  }
  return { hints, label: ink.label };
}

/**
 * Chooses the ink on a color: blazon's labels are graphite; bone when graphite fails AA on the brand's color and bone does
 * not. `text.onSignal` follows, and so does its contrast pair, which named every signal color (`{color.signal.*}`): it now
 * names `ref` alone (always with `pairAlways`, else only when the ink changed, because bone on hazard yellow would fail).
 */
export function setLabelInk(tree: Json, hex: string, ref: string, pairAlways = false): { hints: string[]; label: 'graphite' | 'bone' } {
  const hints: string[] = [];
  const graphite = contrast(hex, GRAPHITE);
  const bone = contrast(hex, BONE);
  const onSignal = tokenAt(tree, 'text.onSignal');
  const useBone = graphite < 4.5 && bone >= 4.5 && onSignal !== undefined;
  if (useBone) {
    onSignal['$value'] = '{color.base.bone}';
    onSignal['$description'] = 'Labels on the brand color are bone';
    hints.push(`Labels on ${hex} are bone, because graphite is ${graphite.toFixed(1)}:1 there; blazon's hazard yellow has no label pair now`);
  } else if (graphite < 4.5) {
    hints.push(
      `Neither graphite (${graphite.toFixed(1)}:1) nor bone (${bone.toFixed(1)}:1) reaches AA (4.5:1) as a label on ${hex}: blazon check will report text.onSignal, so choose a lighter or darker color`,
    );
  }
  if (useBone || pairAlways) {
    const blazon = ((tree['text'] as Json | undefined)?.['$extensions'] as Json | undefined)?.['dev.blazon'] as Json | undefined;
    for (const pair of (blazon?.['pairs'] ?? []) as Json[]) if (pair['bg'] === '{color.signal.*}') pair['bg'] = ref;
  }
  return { hints, label: useBone ? 'bone' : 'graphite' };
}

/** The config's `logo:` entry, one line or a block. */
export const LOGO_ENTRY = /^(\s*)logo: (?:\{[^}]*\}|[^{\n]*),$/m;
/** The config's `fonts:` list, one line or several. */
export const FONTS_ENTRY = /^(\s*)fonts: \[[^\]]*\],$/m;

/**
 * The config's `fonts:` list with these stylesheets, and the starter's own font files (`{ family, file }` entries) kept: a brand that sets
 * its display and body fonts has not set the mono one, and the file in `fonts/` is the font that token names.
 */
export function withFontStylesheets(config: string, urls: string[]): string {
  return config.replace(FONTS_ENTRY, (match, indent: string) => {
    const files = match.match(/\{[^}]*\}/g) ?? [];
    return `${indent}fonts: [${[...urls.map((url) => JSON.stringify(url)), ...files].join(', ')}],`;
  });
}

/** The files of blazon's own logo, which a brand's logo replaces: the sidecar of the first holds the rules the starter has. */
export const STARTER_LOGOS = ['blazon-graphite', 'blazon-bone'];

/** Every logo asset the starter has: the two above and blazon's mark. A brand's own logo replaces all of them, and none stays behind under the brand's name. */
export const STARTER_LOGO_FILES = [...STARTER_LOGOS, 'blazon-mark'];
