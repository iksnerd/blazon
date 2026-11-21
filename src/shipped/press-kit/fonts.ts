import { SYSTEM_FAMILIES } from '../../core/fonts.js';
import type { FontRole } from '../../types/index.js';
import { families as stackFamilies, fontOf } from '../shared/font-stack.js';
import type { BrandRead } from './brand.js';
import { finding, type Finding } from './options.js';

// The fonts the brand names, for fonts.txt: each family, what it is used for, where it comes from and under what license. A font token's
// `font` extension states the source and the license; without a source it is found where the data has one (a Google Fonts stylesheet, a font
// file the brand embeds), and a license is also read from any extension's `license` text. Failing both, the license file blazon found beside the family's font files (`theme.fontLicenses` of brand.json: a plugin is never given the project folder) gives the line that names it and its path. For the rest the file says "not stated", and a
// finding says it too: a source or license is never guessed from the family.
//
// What counts as a brand font is decided as the rest of blazon decides it (`blazon fonts`, SYSTEM_FAMILIES in core/fonts.ts): the family at
// the front of a stack is the brand's, unless it is a keyword or a font every computer has (SFMono-Regular, Arial) that no stylesheet or font
// file of the brand loads and no font token gives a source or license for. The other families of a stack are fallbacks. Fallbacks are printed
// once, on one line, as "not shipped", so a reader sees the whole stack and never reads a system font as a font the brand supplies.

interface Family {
  name: string;
  usedFor: string[];
  license?: string;
  licenseUrl?: string;
  source?: string;
  role?: FontRole;
  reason?: string;
  /** As the token states it: a family name or a font token path */
  fallbackFor?: string;
  /** From the license file beside the font files, when the token states no license */
  fileLicense?: { headline?: string; file: string };
}

type Stated = Pick<Family, 'license' | 'licenseUrl' | 'source' | 'role' | 'reason' | 'fallbackFor'>;

// What fonts.txt and the page of the kit both say about the fonts: planFonts decides it once and returns it as data, so the format of the text
// can change without the page noticing. Neither writer reads the other's output.

/** How a font's license is known: its own words (and an address), only an address, a license file beside the font files, or not at all */
export type KitLicense =
  | { kind: 'text'; text: string; url?: string }
  | { kind: 'url'; url: string }
  | { kind: 'file'; headline?: string; file: string }
  | { kind: 'unstated' }
  /** A fallback with no source or license stated: neither is printed, since a fallback is not what the brand ships */
  | { kind: 'none' };

export interface KitFont {
  name: string;
  usedFor: string[];
  role?: FontRole;
  reason?: string;
  /** For a `fallback`: the family it stands in for (a font token path in `fallbackFor` is resolved to that token's family) */
  standsInFor?: string;
  source?: string;
  license: KitLicense;
}

export interface KitFonts {
  families: KitFont[];
  /** The families of the stacks that the brand does not ship */
  fallbacks: string[];
}

export interface FontRow {
  label: string;
  value: string;
  /** The value is a license text that fonts.txt prints on lines of its own, under the label */
  block?: boolean;
}

const NOT_STATED = 'not stated';

/** What to say about one font, in order: the one list both fonts.txt and the page are written from */
export function fontRows(font: KitFont): FontRow[] {
  const rows: FontRow[] = [];
  if (font.usedFor.length > 0) rows.push({ label: 'Used for', value: font.usedFor.join(', ') });
  if (font.role) rows.push({ label: 'Role', value: font.role });
  if (font.reason) rows.push({ label: 'Why', value: font.reason });
  if (font.standsInFor) rows.push({ label: 'Stands in for', value: font.standsInFor });
  if (font.source !== undefined || font.license.kind !== 'none') rows.push({ label: 'Source', value: font.source ?? NOT_STATED });
  const license = font.license;
  if (license.kind === 'text') {
    rows.push({ label: 'License', value: license.text, block: true });
    if (license.url) rows.push({ label: 'License text', value: license.url });
  } else if (license.kind === 'url') rows.push({ label: 'License', value: `see ${license.url}` });
  else if (license.kind === 'file')
    rows.push({ label: 'License', value: license.headline ?? `see ${license.file}` }, { label: 'License file', value: `${license.file} (in the brand project, not in this kit)` });
  else if (license.kind === 'unstated') rows.push({ label: 'License', value: NOT_STATED });
  return rows;
}

/** The one line that lists the fallbacks, or undefined when there are none */
export const fallbackLine = (fonts: KitFonts): string | undefined => (fonts.fallbacks.length > 0 ? `Fallback fonts, not shipped: ${fonts.fallbacks.join(', ')}` : undefined);

/** fonts.txt */
export function fontsText(fonts: KitFonts): string {
  const lines = ['Fonts', ''];
  for (const font of fonts.families) {
    lines.push(font.name);
    for (const row of fontRows(font))
      if (row.block) lines.push(`  ${row.label}:`, ...row.value.split('\n').map((line) => `    ${line}`.trimEnd()));
      else lines.push(`  ${row.label}: ${row.value}`);
    lines.push('');
  }
  const fallback = fallbackLine(fonts);
  if (fallback) lines.push(fallback);
  return `${lines.join('\n').trimEnd()}\n`;
}
const ROLES: [role: string, label: string][] = [
  ['fontDisplay', 'headings (the fontDisplay role)'],
  ['fontBody', 'running text (the fontBody role)'],
];

/** The families a stylesheet loads and where it is from: Google Fonts names them in the URL; a data: stylesheet in its @font-face rules */
function stylesheetFamilies(sheet: string): { names: string[]; source: (name: string) => string } | undefined {
  if (sheet.startsWith('data:')) {
    const body = sheet.slice(sheet.indexOf(',') + 1);
    let css: string;
    try {
      css = /;base64,/.test(sheet.slice(0, sheet.indexOf(',') + 1)) ? Buffer.from(body, 'base64').toString('utf-8') : decodeURIComponent(body);
    } catch {
      return undefined;
    }
    const names = [...css.matchAll(/font-family:\s*(?:"([^"]+)"|'([^']+)'|([^;}"']+))/g)].map((match) => (match[1] ?? match[2] ?? match[3]!).trim());
    return { names, source: () => 'a font file the brand embeds in its brand book; the file is not in this kit' };
  }
  try {
    const url = new URL(sheet);
    if (url.hostname !== 'fonts.googleapis.com') return undefined;
    return {
      names: url.searchParams.getAll('family').map((family) => family.split(':')[0]!.replace(/\+/g, ' ').trim()),
      source: (name) => `Google Fonts, https://fonts.googleapis.com/css2?family=${encodeURIComponent(name).replace(/%20/g, '+')}`,
    };
  } catch {
    return undefined;
  }
}

/**
 * What a license file's text says it is: an `SPDX-License-Identifier:` line, else the first line that is short and is not a copyright notice
 * (the OFL starts with a copyright line, often a long one, and names itself on the next). Nothing is guessed from the family or the words.
 */
export function licenseHeadline(text: string): string | undefined {
  const lines = text.split('\n').map((line) => line.trim());
  const spdx = lines.map((line) => /^(?:[#*/;\s]*)SPDX-License-Identifier:\s*(.+)$/i.exec(line)?.[1]?.trim()).find(Boolean);
  if (spdx) return spdx;
  return lines.find((line) => line !== '' && line.length <= 100 && !/^(copyright\b|\(c\)|©)/i.test(line));
}

export function planFonts(brand: Pick<BrandRead, 'roles' | 'fontTokens' | 'stylesheets'> & Partial<Pick<BrandRead, 'fontLicenses'>>): {
  text?: string;
  model?: KitFonts;
  findings: Finding[];
} {
  const families = new Map<string, Family>();
  const add = (name: string, usedFor?: string, stated?: Stated) => {
    const family = families.get(name.toLowerCase()) ?? { name, usedFor: [] };
    if (usedFor && !family.usedFor.includes(usedFor)) family.usedFor.push(usedFor);
    family.license ??= stated?.license;
    family.licenseUrl ??= stated?.licenseUrl;
    family.source ??= stated?.source;
    family.role ??= stated?.role;
    family.reason ??= stated?.reason;
    family.fallbackFor ??= stated?.fallbackFor;
    families.set(name.toLowerCase(), family);
  };
  const sheetNames = new Set<string>();
  for (const sheet of brand.stylesheets) for (const name of stylesheetFamilies(sheet)?.names ?? []) sheetNames.add(name.toLowerCase());
  const fallbacks = new Map<string, string>();
  const fallback = (name: string) => {
    if (!/[()]/.test(name) && !sheetNames.has(name.toLowerCase())) fallbacks.set(name.toLowerCase(), fallbacks.get(name.toLowerCase()) ?? name);
  };
  /** The front family of a stack is a brand font unless it is a system one nothing loads and nothing states a source or license for; the rest of the stack is fallback */
  const take = (stack: string | undefined, usedFor: string, stated?: Stated) => {
    const name = fontOf(stack);
    for (const family of stack ? stackFamilies(stack) : []) {
      const brandFont =
        family === name &&
        (!SYSTEM_FAMILIES.has(family.toLowerCase()) || sheetNames.has(family.toLowerCase()) || !!(stated?.license || stated?.licenseUrl || stated?.source || stated?.role));
      if (brandFont) add(family, usedFor, stated);
      else fallback(family);
    }
  };
  for (const [role, label] of ROLES) take(brand.roles[role], label);
  for (const token of brand.fontTokens) take(token.stack, token.path, token);
  const sources = new Map<string, string>();
  for (const sheet of brand.stylesheets) {
    const read = stylesheetFamilies(sheet);
    if (!read) continue;
    for (const name of read.names) {
      add(name);
      sources.set(name.toLowerCase(), read.source(name));
    }
  }

  // A license file found beside the font files says what the token does not: it is the last word, after the token's own license and its address
  for (const found of brand.fontLicenses ?? []) {
    const family = families.get(found.family.toLowerCase());
    if (family && !family.license && !family.licenseUrl) family.fileLicense = { headline: licenseHeadline(found.licenseText), file: found.licenseFile };
  }

  const findings: Finding[] = [];
  if (families.size === 0) {
    findings.push(
      finding(
        'font-none',
        'warning',
        'theme.roles',
        'the brand names no font it ships or loads (system fonts and generic families are fallbacks, not brand fonts), so the kit has no fonts.txt',
      ),
    );
    return { findings };
  }
  const unlicensed: string[] = [];
  const stackFront = new Map(brand.fontTokens.map((token) => [token.path, fontOf(token.stack)]));
  const kit: KitFont[] = [];
  for (const family of families.values()) {
    const license: KitLicense = family.license
      ? { kind: 'text', text: family.license, ...(family.licenseUrl && { url: family.licenseUrl }) }
      : family.licenseUrl
        ? { kind: 'url', url: family.licenseUrl }
        : family.fileLicense
          ? { kind: 'file', ...(family.fileLicense.headline && { headline: family.fileLicense.headline }), file: family.fileLicense.file }
          : family.role === 'fallback'
            ? { kind: 'none' }
            : { kind: 'unstated' };
    if (license.kind === 'unstated') unlicensed.push(family.name);
    const source = family.source ?? sources.get(family.name.toLowerCase());
    kit.push({
      name: family.name,
      usedFor: family.usedFor,
      ...(family.role && { role: family.role }),
      ...(family.reason && { reason: family.reason }),
      ...(family.fallbackFor && { standsInFor: stackFront.get(family.fallbackFor) ?? family.fallbackFor }),
      ...(source && { source }),
      license,
    });
  }
  const left = [...fallbacks].filter(([key]) => !families.has(key)).map(([, name]) => name);
  const model: KitFonts = { families: kit, fallbacks: left };
  if (unlicensed.length > 0)
    findings.push(
      finding(
        'font-license-unstated',
        'warning',
        'fonts',
        `${unlicensed.length} ${unlicensed.length === 1 ? 'font has' : 'fonts have'} no license stated: ${unlicensed.join(', ')}; fonts.txt says "license not stated" for each`,
      ),
    );
  return { text: fontsText(model), model, findings };
}

/** The families the brand embeds as font files, lower case: the only ones the PDF is certain to set text in */
export function embeddedFamilies(stylesheets: string[]): Set<string> {
  return new Set(
    stylesheets
      .filter((sheet) => sheet.startsWith('data:'))
      .flatMap((sheet) => stylesheetFamilies(sheet)?.names ?? [])
      .map((name) => name.toLowerCase()),
  );
}

/** The display and body families the brand names that the PDF cannot count on: it fetches nothing, so any not embedded falls back */
export function pdfFallbacks(brand: Pick<BrandRead, 'roles' | 'stylesheets'>): string[] {
  const embedded = embeddedFamilies(brand.stylesheets);
  const named = [fontOf(brand.roles.fontDisplay), fontOf(brand.roles.fontBody)].filter((name): name is string => name !== undefined);
  return [...new Set(named)].filter((name) => !embedded.has(name.toLowerCase()));
}
