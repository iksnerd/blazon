import { fontOf } from '../shared/font-stack.js';
import type { BrandRead } from './brand.js';
import { finding, type Finding } from './options.js';

// The fonts the brand names, for fonts.txt: each family, what it is used for, where it comes from and under what license. A font token's
// `font` extension states the source and the license; without a source it is found where the data has one (a Google Fonts stylesheet, a font
// file the brand embeds), and a license is also read from any extension's `license` text. For the rest the file says "not stated", and a
// finding says it too: a source or license is never guessed from the family.

interface Family {
  name: string;
  usedFor: string[];
  license?: string;
  licenseUrl?: string;
  source?: string;
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

export function planFonts(brand: Pick<BrandRead, 'roles' | 'fontTokens' | 'stylesheets'>): { text?: string; findings: Finding[] } {
  const families = new Map<string, Family>();
  const add = (name: string, usedFor?: string, stated?: Pick<Family, 'license' | 'licenseUrl' | 'source'>) => {
    const family = families.get(name.toLowerCase()) ?? { name, usedFor: [] };
    if (usedFor && !family.usedFor.includes(usedFor)) family.usedFor.push(usedFor);
    family.license ??= stated?.license;
    family.licenseUrl ??= stated?.licenseUrl;
    family.source ??= stated?.source;
    families.set(name.toLowerCase(), family);
  };
  for (const [role, label] of ROLES) {
    const name = fontOf(brand.roles[role]);
    if (name) add(name, label);
  }
  for (const token of brand.fontTokens) {
    const name = fontOf(token.stack);
    if (name) add(name, token.path, token);
  }
  const sources = new Map<string, string>();
  for (const sheet of brand.stylesheets) {
    const read = stylesheetFamilies(sheet);
    if (!read) continue;
    for (const name of read.names) {
      add(name);
      sources.set(name.toLowerCase(), read.source(name));
    }
  }

  const findings: Finding[] = [];
  if (families.size === 0) {
    findings.push(finding('font-none', 'warning', 'theme.roles', 'the brand names no font, so the kit has no fonts.txt'));
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
    else {
      lines.push(`  License: ${NOT_STATED}`);
      unlicensed.push(family.name);
    }
    lines.push('');
  }
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
