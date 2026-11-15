import { NAME } from './request.js';
import { CORNERS, KEEP_CLEAR_ZONES, type Corner, type Finding, type KeepClear } from './checks.js';

/** What the options may name, from the brand: the format groups, the backgrounds (image assets and color or gradient tokens) and the color tokens. */
export interface Known {
  formats: ReadonlySet<string>;
  backgrounds: ReadonlySet<string>;
  colors: ReadonlySet<string>;
}

export interface Card {
  id: string;
  format: string;
  background: string;
  headline: string;
  subline?: string;
  logo: 'auto' | 'light' | 'dark';
  textColor?: string;
  align: 'left' | 'center';
  /** The edge the text hangs from; the logo goes in a corner of the other one. Absent: the opposite of the logo's own first corner */
  anchor?: 'top' | 'bottom';
  /** The logo's width: px, or a percentage of the card's shorter side such as "22%". Absent: 14% of the card's width. Never below the sidecar's `minSize` */
  logoWidth?: number | string;
  /** The corner the logo sits in. Absent: the first corner its sidecar lists (or, with an `anchor`, the first on the edge opposite the text) */
  logoCorner?: Corner;
  /** Parts of the card the text and the logo must stay out of, in percent of the card; a named zone is already resolved to its numbers */
  keepClear?: KeepClear[];
}

const OPTION_KEYS = ['cards', 'scale'];
const CARD_KEYS = ['id', 'format', 'background', 'headline', 'subline', 'logo', 'textColor', 'align', 'anchor', 'logoWidth', 'logoCorner', 'keepClear'];
/** A share of the shorter side: more than 0 and at most 100 */
export const PERCENT = /^(\d+(?:\.\d+)?)%$/;
const ID = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const RECT_KEYS = ['x', 'y', 'width', 'height'] as const;
type ZoneName = keyof typeof KEEP_CLEAR_ZONES;
const isZoneName = (value: unknown): value is ZoneName => typeof value === 'string' && Object.hasOwn(KEEP_CLEAR_ZONES, value);
const invalid = (path: string, message: string): Finding => ({ code: `${NAME}/card-option-invalid`, severity: 'error', path, message });

/** What is wrong with one `keepClear` entry: a named zone, or a rectangle in percent of the card that lies inside the card. */
function keepClearProblem(entry: unknown): string | undefined {
  const zones = Object.keys(KEEP_CLEAR_ZONES).join(', ');
  if (isZoneName(entry)) return undefined;
  if (typeof entry === 'string') return `${JSON.stringify(entry)} is not a named zone (${zones})`;
  if (!isObject(entry)) return `must be a named zone (${zones}) or { x, y, width, height }`;
  for (const key of Object.keys(entry)) if (!(RECT_KEYS as readonly string[]).includes(key)) return `has the unknown key "${key}"`;
  for (const key of RECT_KEYS) {
    const value = entry[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) return `needs ${key} as a number of percent`;
    if (value < 0 || value > 100) return `${key} is ${value}, outside 0 to 100`;
  }
  const { x, y, width, height } = entry as Record<(typeof RECT_KEYS)[number], number>;
  if (width <= 0 || height <= 0) return 'needs a width and a height above 0';
  if (x + width > 100 || y + height > 100) return `reaches past the card (x + width is ${x + width}, y + height is ${y + height}, at most 100)`;
  return undefined;
}

/** A checked `keepClear` entry as the card keeps it: a named zone becomes its numbers and keeps its name for the message */
const zoneOf = (entry: ZoneName | Record<(typeof RECT_KEYS)[number], number>): KeepClear =>
  typeof entry === 'string' ? { name: entry, ...KEEP_CLEAR_ZONES[entry] } : { x: entry.x, y: entry.y, width: entry.width, height: entry.height };

/**
 * The cards the options ask for, and a `card-option-invalid` finding for each thing wrong. A card with anything wrong in it
 * is left out; wrong options as a whole leave out every card. Nothing here throws: the options are the person's, not the request's.
 */
export function parseOptions(options: unknown, known: Known): { cards: Card[]; scale: 1 | 2; findings: Finding[] } {
  if (!isObject(options)) return { cards: [], scale: 1, findings: [invalid('options', 'options must be an object')] };
  const top: Finding[] = [];
  for (const key of Object.keys(options)) if (!OPTION_KEYS.includes(key)) top.push(invalid('options', `unknown option "${key}": the options are ${OPTION_KEYS.join(' and ')}`));
  const scale = options.scale === undefined ? 1 : options.scale;
  if (scale !== 1 && scale !== 2) top.push(invalid('options', 'scale must be 1 or 2'));
  if (!Array.isArray(options.cards) || options.cards.length === 0) top.push(invalid('options', 'cards must be a non-empty list'));
  if (top.length > 0 || !Array.isArray(options.cards)) return { cards: [], scale: 1, findings: top };

  const cards: Card[] = [];
  const findings: Finding[] = [];
  const seen = new Set<string>();
  options.cards.forEach((raw: unknown, index) => {
    const n = index + 1;
    if (!isObject(raw)) {
      findings.push(invalid(`cards[${n}]`, `card ${n} must be an object`));
      return;
    }
    const id = typeof raw.id === 'string' && ID.test(raw.id) ? raw.id : undefined;
    const at = id ?? `cards[${n}]`;
    const problems: string[] = [];
    for (const key of Object.keys(raw)) if (!CARD_KEYS.includes(key)) problems.push(`unknown key "${key}"`);
    if (id === undefined) problems.push('id must be letters, digits, "-" or "_" (at most 64), because it names the file');
    else if (seen.has(id)) problems.push(`id "${id}" is used twice`);
    if (raw.format === undefined) problems.push('format is required');
    else if (typeof raw.format !== 'string' || !known.formats.has(raw.format)) {
      problems.push(`format ${JSON.stringify(raw.format)} is not a group under social.format (${[...known.formats].join(', ') || 'none'})`);
    }
    if (typeof raw.background !== 'string' || !known.backgrounds.has(raw.background)) {
      problems.push(`background ${JSON.stringify(raw.background)} is not an asset or a color or gradient token`);
    }
    if (typeof raw.headline !== 'string' || raw.headline.trim() === '') problems.push('headline must be a non-empty string');
    if (raw.subline !== undefined && typeof raw.subline !== 'string') problems.push('subline must be a string');
    if (raw.logo !== undefined && raw.logo !== 'auto' && raw.logo !== 'light' && raw.logo !== 'dark') problems.push('logo must be auto, light or dark');
    if (raw.align !== undefined && raw.align !== 'left' && raw.align !== 'center') problems.push('align must be left or center');
    if (raw.anchor !== undefined && raw.anchor !== 'top' && raw.anchor !== 'bottom') problems.push('anchor must be top or bottom');
    if (raw.logoWidth !== undefined) {
      const share = typeof raw.logoWidth === 'string' ? PERCENT.exec(raw.logoWidth) : null;
      const px = typeof raw.logoWidth === 'number' && Number.isFinite(raw.logoWidth) && raw.logoWidth > 0;
      if (!px && !(share && Number(share[1]) > 0 && Number(share[1]) <= 100))
        problems.push('logoWidth must be a number of px above 0, or a percentage of the shorter side above 0% and up to 100% such as "22%"');
    }
    if (raw.logoCorner !== undefined && !CORNERS.includes(raw.logoCorner as Corner)) problems.push(`logoCorner must be ${CORNERS.join(', ')}`);
    if (raw.keepClear !== undefined) {
      if (!Array.isArray(raw.keepClear)) problems.push('keepClear must be a list of named zones and { x, y, width, height } rectangles, in percent of the card');
      else
        raw.keepClear.forEach((entry: unknown, at) => {
          const problem = keepClearProblem(entry);
          if (problem) problems.push(`keepClear[${at + 1}] ${problem}`);
        });
    }
    if (raw.textColor !== undefined && (typeof raw.textColor !== 'string' || !known.colors.has(raw.textColor))) {
      problems.push(`textColor ${JSON.stringify(raw.textColor)} is not a color token`);
    }
    // Only a duplicate is reported against its id: the first card with that id is the one that is kept
    if (problems.length > 0) {
      for (const problem of problems) findings.push(invalid(at, `card ${n}: ${problem}`));
      return;
    }
    seen.add(id!);
    cards.push({
      id: id!,
      format: raw.format as string,
      background: raw.background as string,
      headline: (raw.headline as string).trim(),
      ...(raw.subline !== undefined && raw.subline !== '' && { subline: (raw.subline as string).trim() }),
      logo: (raw.logo as Card['logo'] | undefined) ?? 'auto',
      ...(raw.textColor !== undefined && { textColor: raw.textColor as string }),
      align: (raw.align as Card['align'] | undefined) ?? 'left',
      ...(raw.anchor !== undefined && { anchor: raw.anchor as 'top' | 'bottom' }),
      ...(raw.logoWidth !== undefined && { logoWidth: raw.logoWidth as number | string }),
      ...(raw.logoCorner !== undefined && { logoCorner: raw.logoCorner as Corner }),
      ...(Array.isArray(raw.keepClear) && raw.keepClear.length > 0 && { keepClear: raw.keepClear.map(zoneOf) }),
    });
  });
  return { cards, scale: scale as 1 | 2, findings };
}
