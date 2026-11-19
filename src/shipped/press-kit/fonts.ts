import { SYSTEM_FAMILIES } from '../../core/fonts.js';
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
  /** From the license file beside the font files, when the token states no license */
  fileLicense?: { headline?: string; file: string };
}

const NOT_STATED = 'not stated';
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

export function planFonts(brand: Pick<BrandRead, 'roles' | 'fontTokens' | 'stylesheets'> & Partial<Pick<BrandRead, 'fontLicenses'>>): { text?: string; findings: Finding[] } {
  const families = new Map<string, Family>();
  const add = (name: string, usedFor?: string, stated?: Pick<Family, 'license' | 'licenseUrl' | 'source'>) => {
    const family = families.get(name.toLowerCase()) ?? { name, usedFor: [] };
    if (usedFor && !family.usedFor.includes(usedFor)) family.usedFor.push(usedFor);
    family.license ??= stated?.license;
    family.licenseUrl ??= stated?.licenseUrl;
    family.source ??= stated?.source;
    families.set(name.toLowerCase(), family);
  };
  const sheetNames = new Set<string>();
  for (const sheet of brand.stylesheets) for (const name of stylesheetFamilies(sheet)?.names ?? []) sheetNames.add(name.toLowerCase());
  const fallbacks = new Map<string, string>();
  const fallback = (name: string) => {
    if (!/[()]/.test(name) && !sheetNames.has(name.toLowerCase())) fallbacks.set(name.toLowerCase(), fallbacks.get(name.toLowerCase()) ?? name);
  };
  /** The front family of a stack is a brand font unless it is a system one nothing loads and nothing states a source or license for; the rest of the stack is fallback */
  const take = (stack: string | undefined, usedFor: string, stated?: Pick<Family, 'license' | 'licenseUrl' | 'source'>) => {
    const name = fontOf(stack);
    for (const family of stack ? stackFamilies(stack) : []) {
      const brandFont =
        family === name && (!SYSTEM_FAMILIES.has(family.toLowerCase()) || sheetNames.has(family.toLowerCase()) || !!(stated?.license || stated?.licenseUrl || stated?.source));
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
  const lines = ['Fonts', ''];
  const unlicensed: string[] = [];
  for (const family of families.values()) {
    lines.push(family.name);
    if (family.usedFor.length > 0) lines.push(`  Used for: ${family.usedFor.join(', ')}`);
    lines.push(`  Source: ${family.source ?? sources.get(family.name.toLowerCase()) ?? NOT_STATED}`);
    if (family.license) {
      lines.push('  License:', ...family.license.split('\n').map((line) => `    ${line}`.trimEnd()));
      if (family.licenseUrl) lines.push(`  License text: ${family.licenseUrl}`);
    } else if (family.licenseUrl) lines.push(`  License: see ${family.licenseUrl}`);
    else if (family.fileLicense) {
      const { headline, file } = family.fileLicense;
      lines.push(`  License: ${headline ?? `see ${file}`}`, `  License file: ${file} (in the brand project, not in this kit)`);
    } else {
      lines.push(`  License: ${NOT_STATED}`);
      unlicensed.push(family.name);
    }
    lines.push('');
  }
  const left = [...fallbacks].filter(([key]) => !families.has(key)).map(([, name]) => name);
  if (left.length > 0) lines.push(`Fallback fonts, not shipped: ${left.join(', ')}`);
  if (unlicensed.length > 0)
    findings.push(
      finding(
        'font-license-unstated',
        'warning',
        'fonts',
        `${unlicensed.length} ${unlicensed.length === 1 ? 'font has' : 'fonts have'} no license stated: ${unlicensed.join(', ')}; fonts.txt says "license not stated" for each`,
      ),
    );
  return { text: `${lines.join('\n').trimEnd()}\n`, findings };
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
