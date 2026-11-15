import { sameColor, readColor, type Rgba } from './colors.js';
import type { BrandRead, ContextRead, TokenRead } from './brand.js';
import { readDimension } from './dimensions.js';
import { nameTokens, type Kind, type Style } from './names.js';
import { finding, type Finding, type Options } from './options.js';

// What the plugin writes, decided once for every platform: the color and dimension tokens in path order, each with its name on each platform,
// the dark value of a color that differs in the dark context, and the findings for everything left out or changed on the way.

export interface PlannedColor {
  path: string;
  light: Rgba;
  /** Present only when the dark context gives this color another value */
  dark?: Rgba;
  android: string;
  swift: string;
  kotlin: string;
}

export interface PlannedDimension {
  path: string;
  dp: number;
  android: string;
  swift: string;
  kotlin: string;
}

export interface Plan {
  colors: PlannedColor[];
  dimensions: PlannedDimension[];
  /** The context used as the dark appearance, when there is one */
  dark?: string;
  prefix: string;
  findings: Finding[];
}

const STYLES: [Style, string][] = [
  ['android', 'Android'],
  ['swift', 'Swift'],
  ['kotlin', 'Kotlin'],
];
const PLATFORM_OF: Record<Style, Options['platforms'][number]> = { android: 'android', swift: 'ios', kotlin: 'compose' };

const byPath = (a: { path: string }, b: { path: string }): number => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
const count = (n: number, what: string): string => `${n} ${what}${n === 1 ? '' : 's'}`;

/** The context that is the dark appearance: the one the option names, else the one named `dark`; none, or a finding when two modifiers have one */
function darkContext(contexts: ContextRead[], options: Options, findings: Finding[]): ContextRead | undefined {
  const name = options.dark ?? 'dark';
  const matches = contexts.filter((item) => item.context === name);
  if (matches.length > 1) {
    const modifiers = matches.map((item) => item.modifier).sort();
    findings.push(
      finding('dark-ambiguous', 'warning', 'contexts', `${modifiers.join(' and ')} each have a context named ${name}, so no dark values were written; rename one of them`),
    );
    return undefined;
  }
  return matches[0];
}

/** The tokens to write, their names, and what was said about each. */
export function planTokens(brand: BrandRead, options: Options): Plan {
  const findings: Finding[] = [];
  const tokens = [...brand.tokens].sort(byPath);

  const skipped = new Map<string, number>();
  for (const token of tokens) if (token.type !== 'color' && token.type !== 'dimension') skipped.set(token.type || 'untyped', (skipped.get(token.type || 'untyped') ?? 0) + 1);
  if (skipped.size) {
    const total = [...skipped.values()].reduce((sum, n) => sum + n, 0);
    const list = [...skipped].sort(([a], [b]) => (a < b ? -1 : 1)).map(([type, n]) => `${type} (${n})`);
    findings.push(
      finding('tokens-skipped', 'info', 'tokens', `${count(total, 'token')} not written: this plugin writes color and dimension tokens only. Skipped types: ${list.join(', ')}`),
    );
  }

  const colors = new Map<string, Rgba>();
  const dimensions = new Map<string, number>();
  const readColorToken = (token: TokenRead, where = ''): Rgba | undefined => {
    const read = readColor(typeof token.resolved === 'string' ? token.resolved : token.value);
    if (!read) {
      findings.push(
        finding('color-unreadable', 'warning', token.path, `${token.path}${where} is not a color the plugin can read (${JSON.stringify(token.value)}), so it was left out`),
      );
      return undefined;
    }
    if (read.clamped)
      findings.push(finding('color-out-of-gamut', 'warning', token.path, `${token.path}${where} is outside sRGB (${JSON.stringify(token.value)}), so each channel was clamped`));
    return read.color;
  };
  for (const token of tokens) {
    if (token.type === 'color') {
      const color = readColorToken(token);
      if (color) colors.set(token.path, color);
    } else if (token.type === 'dimension') {
      const amount = readDimension(token.resolved, token.value);
      if (amount === undefined)
        findings.push(finding('dimension-unreadable', 'warning', token.path, `${token.path} is not a px or rem dimension (${JSON.stringify(token.value)}), so it was left out`));
      else dimensions.set(token.path, amount);
    }
  }

  const context = darkContext(brand.contexts, options, findings);
  const darks = new Map<string, Rgba>();
  if (context) {
    const unmatched: string[] = [];
    let dimensionsChanged = 0;
    for (const token of [...context.tokens].sort(byPath)) {
      if (token.type === 'color') {
        const light = colors.get(token.path);
        if (!light) {
          unmatched.push(token.path);
          continue;
        }
        const dark = readColorToken(token, ` in ${context.context}`);
        if (dark && !sameColor(light, dark)) darks.set(token.path, dark);
      } else if (token.type === 'dimension') {
        const light = dimensions.get(token.path);
        if (light !== undefined && readDimension(token.resolved, token.value) !== light) dimensionsChanged++;
      }
    }
    if (unmatched.length)
      findings.push(
        finding(
          'dark-unmatched',
          'warning',
          'contexts',
          `${context.context} sets ${count(unmatched.length, 'color')} that the main tokens do not have, so ${unmatched.length === 1 ? 'it was' : 'they were'} left out: ${unmatched.join(', ')}`,
        ),
      );
    if (dimensionsChanged)
      findings.push(
        finding(
          'dark-dimensions-ignored',
          'info',
          'contexts',
          `${context.context} changes ${count(dimensionsChanged, 'dimension token')}; dimensions are written once, with the main values`,
        ),
      );
    if (!darks.size) findings.push(finding('dark-empty', 'info', 'contexts', `${context.context} changes no color token, so no dark values were written`));
  }

  if (!colors.size && !dimensions.size) findings.push(finding('no-tokens', 'warning', 'tokens', 'the brand has no color or dimension token to write'));

  // Names per platform; a note is a finding only for a platform that is written
  const named = (kind: Kind, paths: string[]) => {
    const result = new Map<string, Record<Style, string>>(paths.map((path) => [path, { android: '', swift: '', kotlin: '' }]));
    for (const [style, label] of STYLES) {
      for (const item of nameTokens(paths, style, kind, options.prefix)) {
        result.get(item.path)![style] = item.name;
        if (!item.note || !options.platforms.includes(PLATFORM_OF[style])) continue;
        findings.push(
          item.note.why === 'reserved'
            ? finding(
                'name-reserved',
                'warning',
                item.path,
                `${label} cannot use ${JSON.stringify(item.name.replace(/(_token|Token)$/, ''))} as a name, so ${item.path} is ${item.name} there`,
              )
            : finding('name-collision', 'warning', item.path, `${label} name for ${item.path} is the same as ${item.note.with}'s, so it is ${item.name} there`),
        );
      }
    }
    return result;
  };
  const colorNames = named('color', [...colors.keys()]);
  const dimensionNames = named('dimension', [...dimensions.keys()]);

  return {
    colors: [...colors]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([path, light]) => ({ path, light, ...(darks.has(path) && { dark: darks.get(path)! }), ...colorNames.get(path)! })),
    dimensions: [...dimensions].sort(([a], [b]) => (a < b ? -1 : 1)).map(([path, amount]) => ({ path, dp: amount, ...dimensionNames.get(path)! })),
    ...(context && { dark: context.context }),
    prefix: options.prefix,
    findings,
  };
}
