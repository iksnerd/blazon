import path from 'node:path';
import { instanceIdTooLong, isPluginName, isTokenOutputName } from '../plugin-name.js';
import { shippedNames } from '../shipped-names.js';
import { closest } from '../suggest.js';
import { STANDARD_LOGO_LOCKUPS, STANDARD_SECTION_IDS, STANDARD_USAGE_ROLES, type Finding, type BlazonConfig } from '../../types/index.js';
import { CONVENTIONAL_ROLES } from '../tokens/theme.js';
import { isFamilyName } from '../fonts.js';
import { DEFAULT_CONFIG } from './defaults.js';
import { REMOVED_KEYS } from './removed-keys.js';
import { finding } from '../checker/catalogue.js';

// blazon.json is plain JSON written by hand, so it is checked (RFC 0001 §14): an unknown key and a
// value of the wrong type are errors, and the value is left out so the rest of the compile does not crash on it.

/** Every key of `BlazonConfig`. A test holds this list to the interface. */
export const CONFIG_KEYS = [
  'title',
  'description',
  'tokensDir',
  'docsDir',
  'assetsDir',
  'outDir',
  'tokensOutDir',
  'cssPrefix',
  'cssSelector',
  'port',
  'logo',
  'theme',
  'iconSets',
  'assets',
  'sections',
  'customSections',
  'vocabulary',
  'plugins',
  'fonts',
  'resolver',
  'contextSelectors',
  'emailSignature',
] as const satisfies readonly (keyof BlazonConfig)[];

type ConfigKey = (typeof CONFIG_KEYS)[number];

/** One mistake in a key's value, on the key or on a place inside it such as `iconSets[1]`. */
interface Mistake {
  path?: string;
  message: string;
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '';
const isTexts = (value: unknown): value is string[] => Array.isArray(value) && value.every((entry) => typeof entry === 'string');

const when = (ok: boolean, message: string): Mistake[] => (ok ? [] : [{ message }]);
const dir =
  (key: string) =>
  (value: unknown): Mistake[] =>
    when(isText(value), `${key} must be a path: a non-empty string`);

const LOGO_MESSAGE = 'logo must be a path, or {"onLight": path, "onDark"?: path}';
const ICON_SET_FIELDS = '{"name": string, "package": string, "dir"?: string, "categories"?: object or a JSON file path}';

function logo(value: unknown): Mistake[] {
  if (isText(value)) return [];
  const valid =
    isObject(value) && isText(value.onLight) && (value.onDark === undefined || isText(value.onDark)) && Object.keys(value).every((k) => k === 'onLight' || k === 'onDark');
  return when(valid, LOGO_MESSAGE);
}

const ROLES = Object.keys(CONVENTIONAL_ROLES);

function theme(value: unknown): Mistake[] {
  if (!isObject(value)) return [{ message: 'theme must be an object of roles to token paths' }];
  return Object.entries(value).flatMap(([role, tokenPath]): Mistake[] => {
    if (!ROLES.includes(role)) return [{ message: `theme has unknown role "${role}"; known: ${ROLES.join(', ')}` }];
    return when(isText(tokenPath), `theme.${role} must be a token path (a string)`);
  });
}

function iconSets(value: unknown): Mistake[] {
  if (!Array.isArray(value)) return [{ message: 'iconSets must be a list' }];
  return value.flatMap((entry, index): Mistake[] => {
    const valid =
      isObject(entry) &&
      isText(entry.name) &&
      isText(entry.package) &&
      (entry.dir === undefined || typeof entry.dir === 'string') &&
      (entry.categories === undefined || typeof entry.categories === 'string' || isObject(entry.categories));
    return valid ? [] : [{ path: `iconSets[${index}]`, message: `iconSets[${index}] must be ${ICON_SET_FIELDS}` }];
  });
}

/** A name a brand adds: it starts with a letter, so it is a slug a URL and a CSS class can hold. */
const NAME = /^[a-z][a-z0-9-]*$/;
const NAME_MESSAGE = 'must be a name: lowercase letters, digits and hyphens, starting with a letter';

/** The entries of `customSections` that are valid, and one mistake for each that is not. */
function customSections(value: unknown): { kept: unknown[]; mistakes: Mistake[] } {
  if (!Array.isArray(value)) return { kept: [], mistakes: [{ message: 'customSections must be a list of {"id": name, "title": text}' }] };
  const kept: unknown[] = [];
  const mistakes: Mistake[] = [];
  const seen = new Set<string>();
  value.forEach((entry, index) => {
    const where = `customSections[${index}]`;
    const wrong = (message: string) => mistakes.push({ path: where, message });
    if (!isObject(entry)) return wrong(`${where} must be {"id": name, "title": text}`);
    const unknownField = Object.keys(entry).find((field) => field !== 'id' && field !== 'title');
    if (unknownField) return wrong(`${where} has unknown field "${unknownField}"; known: id, title`);
    if (typeof entry.id !== 'string' || !NAME.test(entry.id)) return wrong(`${where}.id ${NAME_MESSAGE}`);
    if ((STANDARD_SECTION_IDS as readonly string[]).includes(entry.id)) return wrong(`${where}.id "${entry.id}" is a standard section`);
    if (seen.has(entry.id)) return wrong(`${where}.id "${entry.id}" is used twice`);
    if (!isText(entry.title)) return wrong(`${where}.title must be a non-empty string`);
    seen.add(entry.id);
    kept.push(entry);
  });
  return { kept, mistakes };
}

const PLUGIN_FIELDS = ['name', 'as', 'options', 'env'];
const ENV_NAME = /^[A-Z_][A-Z0-9_]*$/;
/** Fields that name where a plugin is. The operator's allowlist never does: a plugin is found by its name or pinned in the lock file. */
const PLUGIN_LOCATIONS = ['command', 'path', 'program', 'digest', 'pin', 'entry', 'url'];
const PLUGIN_NAME_MESSAGE = 'must be a plugin name: dotted lowercase words such as acme.house-style';

/** What a value is, for "not a string". */
const kind = (value: unknown): string => (value === null ? 'null' : Array.isArray(value) ? 'a list' : `a ${typeof value}`);

/** The mistake for a `plugins` entry that is not an object: the shape, the plugins blazon ships and, for a near-miss string, the one meant. */
function notAnObject(where: string, entry: unknown): string {
  const shape = `${where} must be an object {"name": "<plugin>"}, not ${kind(entry)}`;
  const shipped = shippedNames();
  if (shipped.length === 0) return shape;
  const meant = typeof entry === 'string' ? closest(entry, shipped) : undefined;
  return `${shape}; blazon ships: ${shipped.join(', ')}${meant ? ` (did you mean {"name": "${meant}"}?)` : ''}`;
}

/** The entries of `plugins` that are valid, and one mistake for each that is not. */
function plugins(value: unknown): { kept: unknown[]; mistakes: Mistake[] } {
  if (!Array.isArray(value)) return { kept: [], mistakes: [{ message: 'plugins must be a list of {"name": plugin name, "options"?: object, "env"?: [variable names]}' }] };
  const kept: unknown[] = [];
  const mistakes: Mistake[] = [];
  const seen = new Set<string>();
  // The names of the plugins the list uses: an instance id may not be the name of a different plugin (RFC 0014 section 3.3)
  const names = new Set(value.flatMap((entry) => (isObject(entry) && typeof entry.name === 'string' ? [entry.name] : [])));
  value.forEach((entry, index) => {
    const where = `plugins[${index}]`;
    const wrong = (message: string) => mistakes.push({ path: where, message });
    if (!isObject(entry)) return wrong(notAnObject(where, entry));
    const location = Object.keys(entry).find((field) => PLUGIN_LOCATIONS.includes(field));
    if (location)
      return wrong(
        `${where} has "${location}", which does not belong in the config: a plugin is found by its name or pinned with \`blazon plugin pin\`, and the config holds no path and no command`,
      );
    const unknownField = Object.keys(entry).find((field) => !PLUGIN_FIELDS.includes(field));
    if (unknownField) return wrong(`${where} has unknown field "${unknownField}"; known: ${PLUGIN_FIELDS.join(', ')}`);
    if (typeof entry.name !== 'string' || !isPluginName(entry.name)) return wrong(`${where}.name ${PLUGIN_NAME_MESSAGE}`);
    if (entry.as !== undefined) {
      if (typeof entry.as !== 'string' || !isPluginName(entry.as)) return wrong(`${where}.as ${PLUGIN_NAME_MESSAGE}`);
      const long = instanceIdTooLong(entry.as);
      if (long) return wrong(`${where}.as ${long}`);
      if (entry.as !== entry.name && names.has(entry.as)) return wrong(`${where}.as "${entry.as}" is the name of another plugin in the list`);
    } else {
      // With no `as` the name is the id, and every id has the same limit
      const long = instanceIdTooLong(entry.name);
      if (long) return wrong(`${where}.name ${long}, so give the entry a shorter "as"`);
    }
    const id = entry.as ?? entry.name;
    if (isTokenOutputName(id))
      return wrong(
        `${where}.${entry.as === undefined ? 'name' : 'as'} "${id}" is a file blazon writes in tokensOutDir, where the instance's output folder would go. Give it another "as"`,
      );
    if (seen.has(id)) return wrong(entry.as === undefined ? `${where}.name "${id}" is used twice` : `${where}.as "${id}" is used twice`);
    if (entry.options !== undefined && !isObject(entry.options)) return wrong(`${where}.options must be an object`);
    if (entry.env !== undefined && (!Array.isArray(entry.env) || entry.env.some((name) => typeof name !== 'string' || !ENV_NAME.test(name))))
      return wrong(`${where}.env must be a list of variable names (capital letters, digits and underscores), the ones this plugin may be given`);
    seen.add(id);
    kept.push(entry);
  });
  return { kept, mistakes };
}

const VOCABULARY_LISTS = {
  lockups: { standard: STANDARD_LOGO_LOCKUPS as readonly string[], noun: 'lockup' },
  usageRoles: { standard: STANDARD_USAGE_ROLES as readonly string[], noun: 'usage role' },
};

/** The part of `vocabulary` that is valid, and one mistake for each name or list that is not. */
function vocabulary(value: unknown): { kept: Record<string, string[]>; mistakes: Mistake[] } {
  if (!isObject(value)) return { kept: {}, mistakes: [{ message: 'vocabulary must be an object with lockups and usageRoles' }] };
  const kept: Record<string, string[]> = {};
  const mistakes: Mistake[] = [];
  for (const [list, names] of Object.entries(value)) {
    if (!Object.hasOwn(VOCABULARY_LISTS, list)) {
      mistakes.push({ path: 'vocabulary', message: `vocabulary has unknown field "${list}"; known: ${Object.keys(VOCABULARY_LISTS).join(', ')}` });
      continue;
    }
    const where = `vocabulary.${list}`;
    if (!isTexts(names)) {
      mistakes.push({ path: where, message: `${where} must be a list of names` });
      continue;
    }
    const { standard, noun } = VOCABULARY_LISTS[list as keyof typeof VOCABULARY_LISTS];
    const accepted: string[] = [];
    names.forEach((name, index) => {
      const place = `${where}[${index}]`;
      const wrong = (message: string) => mistakes.push({ path: place, message });
      if (!NAME.test(name)) wrong(`${place} ${NAME_MESSAGE}`);
      else if (standard.includes(name)) wrong(`${place} "${name}" is a standard ${noun}`);
      else if (accepted.includes(name)) wrong(`${place} "${name}" is used twice`);
      else accepted.push(name);
    });
    kept[list] = accepted;
  }
  return { kept, mistakes };
}

const FONTS_MESSAGE =
  'fonts must be a list of stylesheet URLs (strings) or font files {"family": name, "file": path, "weight"?: a number from 1 to 1000, normal, bold or a range such as "200 1000", "style"?: "normal" or "italic"}';
const FONT_FIELDS = ['family', 'file', 'weight', 'style'];
/** A CSS font-weight a font file may declare: a number, `normal`, `bold`, or a range of two numbers for a variable font. It goes into a stylesheet as written. */
const isFontWeight = (value: unknown): boolean =>
  (typeof value === 'number' && Number.isFinite(value) && value >= 1 && value <= 1000) ||
  (typeof value === 'string' && /^(normal|bold|(?:[1-9]\d{0,2}|1000)(?:\s+(?:[1-9]\d{0,2}|1000))?)$/.test(value));

function fonts(value: unknown): Mistake[] {
  if (!Array.isArray(value)) return [{ message: FONTS_MESSAGE }];
  return value.flatMap((entry, index): Mistake[] => {
    if (typeof entry === 'string') return [];
    if (!isObject(entry)) return [{ message: FONTS_MESSAGE }];
    const where = `fonts[${index}]`;
    const valid =
      Object.keys(entry).every((field) => FONT_FIELDS.includes(field)) &&
      isFamilyName(entry.family) &&
      isText(entry.file) &&
      (entry.weight === undefined || isFontWeight(entry.weight)) &&
      (entry.style === undefined || entry.style === 'normal' || entry.style === 'italic');
    return valid ? [] : [{ path: where, message: `${where} must be a font file {"family": name, "file": path, "weight"?, "style"?}` }];
  });
}

const SIGNATURE_FIELDS = ['logoUrl', 'logoSize', 'logoAlt', 'domains', 'lines'];
const DOMAIN = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const isSize = (value: unknown): boolean => Number.isInteger(value) && (value as number) > 0 && (value as number) <= 600;

/** The email signature block: a logo mail apps can load, the size it is shown at, and plain-text domains and lines. */
function emailSignature(value: unknown): Mistake[] {
  if (!isObject(value)) return [{ message: 'emailSignature must be {"logoUrl": https URL, "logoSize": {"width", "height"}, "logoAlt": text, "domains"?: list, "lines"?: list}' }];
  const mistakes: Mistake[] = [];
  const wrong = (field: string, message: string) => mistakes.push({ path: `emailSignature.${field}`, message: `emailSignature.${field} ${message}` });
  for (const field of Object.keys(value)) if (!SIGNATURE_FIELDS.includes(field)) wrong(field, `is not a field; known: ${SIGNATURE_FIELDS.join(', ')}`);
  const url = value.logoUrl;
  if (!isText(url) || !/^https:\/\/[^\s"'<>]+$/.test(url)) wrong('logoUrl', 'must be an absolute https URL: mail apps load the logo from it');
  else if (/\.svg(?:[?#]|$)/i.test(url)) wrong('logoUrl', 'is an SVG, which Gmail and Outlook do not show: give a PNG');
  const size = value.logoSize;
  if (!isObject(size) || !isSize(size.width) || !isSize(size.height) || Object.keys(size).some((k) => k !== 'width' && k !== 'height')) {
    wrong('logoSize', 'must be {"width", "height"}: whole numbers of pixels from 1 to 600');
  }
  if (!isText(value.logoAlt)) wrong('logoAlt', 'must be a non-empty string, shown when images are blocked');
  if (value.domains !== undefined && !(isTexts(value.domains) && value.domains.length > 0 && value.domains.every((d) => DOMAIN.test(d)))) {
    wrong('domains', 'must be a list of lowercase domains, such as ["example.com"]');
  }
  if (value.lines !== undefined && !(Array.isArray(value.lines) && value.lines.every(isText))) wrong('lines', 'must be a list of non-empty strings');
  return mistakes;
}

const CHECKS: Record<Exclude<ConfigKey, 'sections'>, (value: unknown) => Mistake[]> = {
  title: (v) => when(typeof v === 'string', 'title must be a string'),
  description: (v) => when(typeof v === 'string', 'description must be a string'),
  tokensDir: dir('tokensDir'),
  docsDir: dir('docsDir'),
  assetsDir: dir('assetsDir'),
  outDir: dir('outDir'),
  tokensOutDir: dir('tokensOutDir'),
  resolver: dir('resolver'),
  cssPrefix: (v) => when(typeof v === 'string', 'cssPrefix must be a string'),
  cssSelector: (v) => when(isText(v), 'cssSelector must be a non-empty string'),
  port: (v) => when(Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 65535, 'port must be a whole number from 0 to 65535'),
  logo,
  theme,
  iconSets,
  customSections: (v) => customSections(v).mistakes,
  vocabulary: (v) => vocabulary(v).mistakes,
  plugins: (v) => plugins(v).mistakes,
  assets: (v) => when(isObject(v), 'assets must be an object keyed by category'),
  fonts,
  contextSelectors: (v) =>
    when(isObject(v) && Object.values(v).every((entry) => typeof entry === 'string'), 'contextSelectors must be an object of selector strings, one per modifier'),
  emailSignature,
};

function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return row[b.length]!;
}

/** The known key a misspelled one is closest to, when it is within two edits. */
function nearest(key: string): string | undefined {
  const [best] = [...CONFIG_KEYS].map((known) => ({ known, d: distance(key.toLowerCase(), known.toLowerCase()) })).sort((x, y) => x.d - y.d);
  return best && best.d <= 2 ? best.known : undefined;
}

export interface ResolvedConfig {
  /** The config with every key that is wrong left out, so a default or nothing is used in its place */
  config: BlazonConfig;
  problems: Finding[];
}

/**
 * Checks a config's keys and the type of each value. A key set to `undefined` counts as absent. Each mistake is an
 * error finding named `config-invalid`, on the key; the wrong value is left out of the returned config.
 */
export function resolveConfig(input: Record<string, unknown>): ResolvedConfig {
  const config: Record<string, unknown> = { ...input };
  const problems: Finding[] = [];
  const report = (key: string, mistake: Mistake) => problems.push(finding('config-invalid', { path: mistake.path ?? key, message: mistake.message }));
  const fallback = (key: string) => {
    if (key in DEFAULT_CONFIG) config[key] = DEFAULT_CONFIG[key as keyof BlazonConfig];
    else delete config[key];
  };

  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) {
      fallback(key);
    } else if (key in REMOVED_KEYS) {
      report(key, { message: REMOVED_KEYS[key]! });
      delete config[key];
    } else if (!(CONFIG_KEYS as readonly string[]).includes(key)) {
      const guess = nearest(key);
      // A key with no close match is more likely a newer blazon's than a typo: say what to do about that
      const hint = guess
        ? ` (did you mean "${guess}"?)`
        : ". If it belongs to a newer blazon, move the book's blazon pin to a commit that has it before using it (manual, chapter 15)";
      report(key, { message: `unknown key "${key}"; known: ${CONFIG_KEYS.join(', ')}${hint}` });
      delete config[key];
    } else if (key !== 'sections') {
      const mistakes = CHECKS[key as Exclude<ConfigKey, 'sections'>](value);
      if (mistakes.length > 0) {
        mistakes.forEach((mistake) => report(key, mistake));
        if (key === 'theme' && isObject(value)) config.theme = Object.fromEntries(Object.entries(value).filter(([role, tokenPath]) => ROLES.includes(role) && isText(tokenPath)));
        else if (key === 'iconSets' && Array.isArray(value)) config.iconSets = value.filter((_, index) => !mistakes.some((m) => m.path === `iconSets[${index}]`));
        else if (key === 'customSections') config.customSections = customSections(value).kept;
        else if (key === 'vocabulary') config.vocabulary = vocabulary(value).kept;
        else if (key === 'plugins') config.plugins = plugins(value).kept;
        else if (key === 'fonts' && Array.isArray(value)) config.fonts = value.filter((entry) => fonts([entry]).length === 0);
        else fallback(key);
      }
    }
  }
  return { config: config as unknown as BlazonConfig, problems };
}

/** A config that stopped the run: the file's name, and every mistake in it. */
export class ConfigError extends Error {
  constructor(
    file: string,
    readonly findings: Finding[],
  ) {
    super(`${file} is invalid:\n${findings.map((f) => `  ${f.path}: ${f.message}`).join('\n')}`);
    this.name = 'ConfigError';
  }
}

/** The name of the config file in messages: its base name. */
export const configName = (file: string): string => path.basename(file);
