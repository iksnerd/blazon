import { findingFor, isObject, type Finding } from '../shared/plugin.js';
import { AXES, TOLERANCE, type Axis } from './measure.js';
import type { Box } from './geometry.js';
import { NAME } from './request.js';

/** What is asked of one logo. A field set on the logo wins over the same field set for all. */
export interface Target {
  id: string;
  /** Named in `logos`: a logo that cannot be measured is then an error and not a warning */
  named: boolean;
  crop?: Box;
  grid?: number;
  require: Axis[];
  tolerance: number;
}

export interface Options {
  targets: Target[] | undefined;
  accent?: string;
  figures: boolean;
  report: boolean;
  /** The settings for every logo, which `targets` entries refine */
  all: { require: Axis[]; tolerance: number; grid?: number };
}

const KEYS = ['logos', 'require', 'tolerance', 'grid', 'accent', 'figures', 'report'];
const LOGO_KEYS = ['id', 'crop', 'grid', 'require', 'tolerance'];

export type { Finding };
export const finding = findingFor(NAME);
const invalid = (message: string): Finding => finding('option-invalid', 'error', 'options', message);

/** A color safe to write into an attribute of the figure: a hex, a name, or rgb(), hsl() with plain numbers. */
export const isColor = (value: string): boolean => /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]{3,30}|(?:rgb|hsl)a?\([0-9\s.,%/-]{1,60}\))$/.test(value.trim());

/**
 * The options as the plugin uses them, and an `option-invalid` finding for each thing wrong. Nothing here throws: the options are the
 * person's, not the request's. A wrong option is left at its default and the rest is measured.
 */
export function parseOptions(raw: unknown, known: ReadonlySet<string>): { options: Options; findings: Finding[] } {
  const findings: Finding[] = [];
  const options: Options = { targets: undefined, figures: true, report: true, all: { require: [], tolerance: TOLERANCE } };
  if (!isObject(raw)) return { options, findings: [invalid('options must be an object')] };
  for (const key of Object.keys(raw)) if (!KEYS.includes(key)) findings.push(invalid(`unknown option "${key}"; the options are ${KEYS.join(', ')}`));

  const axes = (value: unknown, where: string): Axis[] | undefined => {
    if (value === undefined) return undefined;
    if (!Array.isArray(value) || value.some((axis) => !AXES.includes(axis as Axis))) {
      findings.push(invalid(`${where} must be a list of ${AXES.join(', ')}`));
      return undefined;
    }
    return [...new Set(value as Axis[])];
  };
  const tolerance = (value: unknown, where: string): number | undefined => {
    if (value === undefined) return undefined;
    if (typeof value !== 'number' || !(value > 0 && value <= 1)) {
      findings.push(invalid(`${where} must be a number above 0 and at most 1`));
      return undefined;
    }
    return value;
  };
  const grid = (value: unknown, where: string): number | undefined => {
    if (value === undefined) return undefined;
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      findings.push(invalid(`${where} must be a number above 0`));
      return undefined;
    }
    return value;
  };

  options.all.require = axes(raw.require, 'require') ?? [];
  options.all.tolerance = tolerance(raw.tolerance, 'tolerance') ?? TOLERANCE;
  const all = grid(raw.grid, 'grid');
  if (all !== undefined) options.all.grid = all;

  if (raw.accent !== undefined) {
    if (typeof raw.accent === 'string' && isColor(raw.accent)) options.accent = raw.accent.trim();
    else findings.push(invalid('accent must be a color: #rrggbb, a color name, or rgb() or hsl() with numbers'));
  }
  for (const key of ['figures', 'report'] as const) {
    if (raw[key] === undefined) continue;
    if (typeof raw[key] === 'boolean') options[key] = raw[key];
    else findings.push(invalid(`${key} must be true or false`));
  }

  if (raw.logos !== undefined) {
    if (!Array.isArray(raw.logos)) findings.push(invalid('logos must be a list of asset ids, or of {id, crop?, grid?, require?, tolerance?}'));
    else {
      const targets: Target[] = [];
      raw.logos.forEach((entry, index) => {
        const where = `logos[${index}]`;
        const item = typeof entry === 'string' ? { id: entry } : entry;
        if (!isObject(item) || typeof item.id !== 'string') return void findings.push(invalid(`${where} must be an asset id or an object with an id`));
        for (const key of Object.keys(item)) if (!LOGO_KEYS.includes(key)) findings.push(invalid(`${where} has unknown field "${key}"; the fields are ${LOGO_KEYS.join(', ')}`));
        if (!known.has(item.id)) return void findings.push(invalid(`${where} names ${JSON.stringify(item.id)}, which the brand has no asset for`));
        const target: Target = {
          id: item.id,
          named: true,
          require: axes(item.require, `${where}.require`) ?? options.all.require,
          tolerance: tolerance(item.tolerance, `${where}.tolerance`) ?? options.all.tolerance,
        };
        const own = grid(item.grid, `${where}.grid`) ?? options.all.grid;
        if (own !== undefined) target.grid = own;
        if (item.crop !== undefined) {
          const crop = item.crop;
          if (!Array.isArray(crop) || crop.length !== 4 || crop.some((v) => typeof v !== 'number' || !Number.isFinite(v)) || (crop[2] as number) <= 0 || (crop[3] as number) <= 0)
            findings.push(invalid(`${where}.crop must be [x, y, width, height] with a width and height above 0`));
          else target.crop = crop as Box;
        }
        targets.push(target);
      });
      options.targets = targets;
    }
  }
  return { options, findings };
}
