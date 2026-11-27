import fs from 'node:fs';
import path from 'node:path';
import { SYSTEM_FAMILIES } from '../fonts.js';
import { googleFontsUrl } from './shared/google-fonts.js';
import { toHex } from './shared/hex.js';
import { cleanSvg } from './shared/svg.js';
import { estimateClearSpace, flagReview, LOGO_RULES_NOTE, readJson, setSignal, STARTER_LOGOS, STARTER_LOGO_FILES, tokenAt, withFontStylesheets, writeJson } from './vocabulary.js';

export type Parsed<T> = { value: T } | { hint: string };

// What a first-time user can say to `blazon init` without a live site: a name, a primary color, a font and a logo
// file. The same checks serve the flags and the questions. The starter is blazon's own brand book, so they write
// blazon's tokens (see vocabulary.ts).

type Json = Record<string, unknown>;

export interface Answers {
  /** The config title, as given */
  name?: string;
  /** One sentence on what the brand is: the config description */
  description?: string;
  /** The primary color, as hex */
  color?: string;
  /** A font family name */
  font?: string;
  /** A logo file, resolved */
  logo?: string;
}

const LOGO_EXTENSIONS = ['.svg', '.png', '.jpg', '.jpeg', '.webp'];

export const parseName = (text: string): Parsed<string> => (text.trim() ? { value: text.trim() } : { hint: 'A name cannot be empty.' });

export const parseDescription = (text: string): Parsed<string> =>
  text.trim().length <= 240 ? { value: text.trim() } : { hint: 'Keep the description to one sentence, 240 characters at most.' };

export function parseColor(text: string): Parsed<string> {
  const t = text.trim();
  const hex = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test(t) ? toHex(t.startsWith('#') ? t : `#${t}`) : undefined;
  return hex ? { value: hex.hex } : { hint: 'Give the color as hex, for example #2563eb or #26e.' };
}

export const parseFont = (text: string): Parsed<string> =>
  /^[A-Za-z0-9][A-Za-z0-9 -]{0,60}$/.test(text.trim()) ? { value: text.trim() } : { hint: 'Give a font family name, for example Inter or DM Sans.' };

export function parseLogo(text: string, cwd: string = process.cwd()): Parsed<string> {
  const file = path.resolve(cwd, text.trim());
  if (!LOGO_EXTENSIONS.includes(path.extname(file).toLowerCase())) return { hint: 'The logo must be an SVG or PNG file (JPG and WebP also work).' };
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return { hint: `There is no file at ${file}. Check the path, or press Enter to skip the logo.` };
  return { value: file };
}

export interface LogoInfo {
  bytes: number;
  svg: boolean;
  /** An SVG that draws in currentColor, so the page's text color decides what it looks like */
  usesCurrentColor: boolean;
}

/** What a logo file is, for the answer that says what will happen to it. */
export function inspectLogo(file: string): LogoInfo {
  const data = fs.readFileSync(file);
  const svg = path.extname(file).toLowerCase() === '.svg';
  return { bytes: data.length, svg, usesCurrentColor: svg && /currentColor/i.test(data.toString('utf8')) };
}

/** Said when a brand's logo replaces blazon's: the numbers in blazon's sidecars belong to blazon's mark. */
export const LOGO_RULES_NOT_CARRIED =
  "The clear space and minimum size of blazon's mark were not carried to your logo's sidecar: it has a stand-in clear space and no minimum size, so set both in assets/logos/";

export const isWebAddress = (text: string): boolean => /^https?:\/\/[^\s/]/i.test(text);

export interface Applied {
  /** What was set, in words */
  set: string[];
  /** What the user still has to do */
  hints: string[];
  /** Project-relative files written, changed or removed */
  files: string[];
}

/**
 * Writes the answers into the files `blazon init` has just copied. `created` holds the project-relative paths this run
 * wrote: a file it did not write is never changed.
 */
export function applyAnswers(destDir: string, answers: Answers, created: Set<string>): Applied {
  const applied: Applied = { set: [], hints: [], files: [] };
  const kept = (file: string) => applied.hints.push(`${file} already existed, so it was kept as it was`);
  const configPath = path.join(destDir, 'blazon.json');
  const config: Json | undefined = created.has('blazon.json') ? readJson(configPath) : undefined;
  const original = config === undefined ? undefined : JSON.stringify(config);
  const needsConfig = (what: string): boolean => {
    if (config === undefined) kept(`blazon.json (${what} not set)`);
    return config !== undefined;
  };

  if (answers.name !== undefined && needsConfig('name')) {
    config!['title'] = answers.name;
    applied.set.push(`name "${answers.name}"`);
  }

  if (answers.description) {
    if (needsConfig('description')) {
      config!['description'] = answers.description;
      applied.set.push('description');
    }
  }

  if (answers.color !== undefined) {
    const file = path.join(destDir, 'tokens', 'colors.json');
    if (!created.has('tokens/colors.json')) kept('tokens/colors.json');
    else {
      const tree = JSON.parse(fs.readFileSync(file, 'utf-8')) as Json;
      if (tokenAt(tree, 'color.signal.orange')) {
        // The brand's color is the signal color: interactive.primary aliases it, and the ink on it follows
        const signal = setSignal(tree, answers.color);
        fs.writeFileSync(file, `${JSON.stringify(tree, null, 2)}\n`);
        applied.files.push('tokens/colors.json');
        applied.set.push(`primary color ${answers.color} (color.signal.primary, which interactive.primary uses)`);
        applied.hints.push(...signal.hints);
      } else applied.hints.push('color.signal.orange was not found in tokens/colors.json, so the color was not set');
    }
  }

  if (answers.font !== undefined) {
    const file = path.join(destDir, 'tokens', 'typography.json');
    if (!created.has('tokens/typography.json')) kept('tokens/typography.json');
    else {
      const tree = JSON.parse(fs.readFileSync(file, 'utf-8')) as Json;
      const display = tokenAt(tree, 'font.family.display');
      const body = tokenAt(tree, 'font.family.body');
      if (display && body) {
        // One family answers both: the display face and the body face. The mono face is still blazon's.
        display['$value'] = [answers.font, 'sans-serif'];
        body['$value'] = [answers.font, 'sans-serif'];
        const url = googleFontsUrl(answers.font);
        if (url && needsConfig('font stylesheet')) {
          config!['fonts'] = withFontStylesheets(config!['fonts'], [url]);
          applied.set.push(`font ${answers.font} (font.family.display and font.family.body)`);
        } else if (!url) {
          applied.set.push(`font ${answers.font} (font.family.display and font.family.body)`);
          applied.hints.push(`${answers.font} is not a font blazon knows a stylesheet for: add its stylesheet to fonts in blazon.json`);
        }
        const mono = tokenAt(tree, 'font.family.mono');
        if (mono) {
          // The starter names its own mono family and carries the file in `fonts`. A minimal book copies no font files, so once `fonts` lists a stylesheet
          // that does not load that family, naming it is a `font-family-missing` the brand did not cause: the stack keeps only the system's mono faces.
          const stack = Array.isArray(mono['$value']) ? (mono['$value'] as unknown[]) : [];
          const family = typeof stack[0] === 'string' ? stack[0] : undefined;
          const fonts = config?.['fonts'];
          const loaded =
            Array.isArray(fonts) && fonts.some((entry) => typeof entry === 'object' && entry !== null && String((entry as Json)['family']).toLowerCase() === family?.toLowerCase());
          if (family && Array.isArray(fonts) && fonts.length > 0 && !loaded && !SYSTEM_FAMILIES.has(family.toLowerCase())) {
            mono['$value'] = stack.slice(1);
            const blazon = (mono['$extensions'] as Json | undefined)?.['dev.blazon'] as Json | undefined;
            if (blazon) delete blazon['font'];
            flagReview(mono, `Blazon's mono font ${family} was not copied into this book, so the stack is the system's. Set the brand's own.`);
          } else flagReview(mono, "Still blazon's mono font: it was not chosen to go with your font. Set the brand's own.");
        }
        fs.writeFileSync(file, `${JSON.stringify(tree, null, 2)}\n`);
        applied.files.push('tokens/typography.json');
        applied.hints.push("font.family.mono and the type scale are still blazon's: set the brand's own");
      } else applied.hints.push('font.family.display and font.family.body were not found in tokens/typography.json, so the font was not set');
    }
  }

  if (answers.logo !== undefined && needsConfig('logo')) {
    const base = path.basename(answers.logo).replace(/[^A-Za-z0-9._-]/g, '-');
    const stem = base.replace(/\.[^.]+$/, '');
    const logos = path.join(destDir, 'assets', 'logos');
    // A logo or sidecar this run did not write is the user's: keep both and leave the config's logo alone.
    const taken = [base, `${stem}.json`].filter((f) => !created.has(`assets/logos/${f}`) && fs.existsSync(path.join(logos, f)));
    if (taken.length) {
      for (const f of taken) kept(`assets/logos/${f}`);
      applied.hints.push(`the logo ${answers.logo} was not copied: pick another file name, or remove the existing file`);
    } else {
      const replacedStarterRules = created.has(`assets/logos/${STARTER_LOGOS[0]}.json`);
      for (const name of STARTER_LOGO_FILES) {
        for (const ext of ['svg', 'json']) {
          if (created.has(`assets/logos/${name}.${ext}`)) fs.rmSync(path.join(logos, `${name}.${ext}`), { force: true });
        }
      }
      fs.mkdirSync(logos, { recursive: true });
      const bytes = fs.readFileSync(answers.logo);
      fs.writeFileSync(path.join(logos, base), base.toLowerCase().endsWith('.svg') ? cleanSvg(bytes.toString('utf8')) : bytes);
      fs.writeFileSync(
        path.join(logos, `${stem}.json`),
        `${JSON.stringify({ title: 'Logo', description: `The brand's logo. ${LOGO_RULES_NOTE}`, clearSpace: estimateClearSpace({ svg: base.toLowerCase().endsWith('.svg'), text: bytes.toString('utf8') }) }, null, 2)}\n`,
      );
      config!['logo'] = `./assets/logos/${base}`;
      applied.files.push(`assets/logos/${base}`, `assets/logos/${stem}.json`);
      applied.set.push(`logo ${base}`);
      if (replacedStarterRules) applied.hints.push(LOGO_RULES_NOT_CARRIED);
    }
  }

  if (config !== undefined && JSON.stringify(config) !== original) {
    writeJson(configPath, config);
    applied.files.push('blazon.json');
  }
  return applied;
}
