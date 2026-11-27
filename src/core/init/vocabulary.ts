import fs from 'node:fs';
import { contrast, GRAPHITE, labelOn, NEAR_BLACK, type LabelInk } from './palette.js';

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
export function setSignal(tree: Json, hex: string): { hints: string[]; label: LabelInk } {
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

/** The base token an extra ink is written as. White and black are not in the starter: they are added when a brand needs them. */
const EXTRA_INKS = {
  white: { hex: '#FFFFFF', note: 'White: the label on the brand color, because graphite and bone are under AA there' },
  black: { hex: NEAR_BLACK, note: 'Near-black: the label on the brand color, because graphite, bone and white are under AA there' },
} as const;

/** Adds `color.base.white` or `color.base.black` to the tree when the brand needs it as a label ink, and returns its alias. */
function baseInk(tree: Json, ink: 'white' | 'black'): string | undefined {
  const base = (tree['color'] as Json | undefined)?.['base'] as Json | undefined;
  if (!base) return undefined;
  if (!isToken(base[ink])) base[ink] = { $value: EXTRA_INKS[ink].hex, $description: EXTRA_INKS[ink].note };
  return `{color.base.${ink}}`;
}

/**
 * Chooses the ink on a color: blazon's labels are graphite; bone when graphite fails AA on the brand's color and bone does
 * not; white or black, added as base tokens, when neither starter ink reaches AA and one of them does. `text.onSignal`
 * follows, and so does its contrast pair, which named every signal color (`{color.signal.*}`): it now names `ref` alone
 * (always with `pairAlways`, else only when the ink changed, because the new ink on hazard yellow would fail).
 */
export function setLabelInk(tree: Json, hex: string, ref: string, pairAlways = false): { hints: string[]; label: LabelInk } {
  const hints: string[] = [];
  const pick = labelOn(hex);
  const onSignal = tokenAt(tree, 'text.onSignal');
  let label: LabelInk = 'graphite';
  if (pick.aa && pick.ink !== 'graphite' && onSignal !== undefined) {
    const alias = pick.ink === 'bone' ? '{color.base.bone}' : baseInk(tree, pick.ink);
    if (alias) {
      label = pick.ink;
      onSignal['$value'] = alias;
      onSignal['$description'] = `Labels on the brand color are ${pick.ink}`;
      hints.push(`Labels on ${hex} are ${pick.ink}, because graphite is ${contrast(hex, GRAPHITE).toFixed(1)}:1 there; blazon's hazard yellow has no label pair now`);
    }
  }
  if (!pick.aa) {
    hints.push(
      `None of graphite, bone, white or black reaches AA (4.5:1) as a label on ${hex} (best is ${pick.ink} at ${pick.ratio.toFixed(1)}:1): blazon check will report text.onSignal, so choose a lighter or darker color`,
    );
  }
  if (label !== 'graphite' || pairAlways) {
    const blazon = ((tree['text'] as Json | undefined)?.['$extensions'] as Json | undefined)?.['dev.blazon'] as Json | undefined;
    for (const pair of (blazon?.['pairs'] ?? []) as Json[]) if (pair['bg'] === '{color.signal.*}') pair['bg'] = ref;
  }
  return { hints, label };
}

/** Reads a JSON file as an object. */
export const readJson = (file: string): Json => JSON.parse(fs.readFileSync(file, 'utf-8')) as Json;
/** Writes an object as JSON the way every file blazon writes is: two-space indent, a final newline. */
export const writeJson = (file: string, value: unknown): void => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);

/**
 * The config's `fonts` list with these stylesheets first, and the starter's own font files (`{ family, file }` entries) kept: a brand that sets
 * its display and body fonts has not set the mono one, and the file in `fonts/` is the font that token names.
 */
export function withFontStylesheets(fonts: unknown, urls: string[]): unknown[] {
  return [...urls, ...(Array.isArray(fonts) ? fonts.filter((entry) => typeof entry === 'object' && entry !== null) : [])];
}

/** The files of blazon's own logo, which a brand's logo replaces: the sidecar of the first holds the rules the starter has. */
export const STARTER_LOGOS = ['blazon-graphite', 'blazon-bone'];

/** Every logo asset the starter has: the two above and blazon's mark. A brand's own logo replaces all of them, and none stays behind under the brand's name. */
export const STARTER_LOGO_FILES = [...STARTER_LOGOS, 'blazon-mark'];

/**
 * A clear space for a logo that replaces blazon's mark: 0.3 of the artwork's height in px (the share blazon's own mark uses, measured on the
 * brand's file), or 16px when the file has no readable height (a raster). It is a stand-in, not a rule: the sidecar says so. Blazon's own
 * numbers are never carried, and the starter's logo page needs some clear space or minimum size in a sidecar to draw.
 */
export function estimateClearSpace(file: { svg: boolean; text?: string }): { value: number; unit: 'px' } {
  const art = file.svg ? ((file.text ?? '').match(/<svg\b[^>]*>/i)?.[0] ?? '') : '';
  const box = art.match(/viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+[\d.]+[\s,]+([\d.]+)/i)?.[1] ?? art.match(/\sheight\s*=\s*["']?([\d.]+)/i)?.[1];
  return { value: box && Number(box) > 0 ? Math.max(1, Math.round(Number(box) * 0.3 * 100) / 100) : 16, unit: 'px' };
}

/** What a sidecar says of the clear space and minimum size it holds in place of blazon's. */
export const LOGO_RULES_NOTE = 'Clear space is a stand-in: 0.3 of the artwork height, or 16px for a raster. Minimum size is not set. Set both.';
