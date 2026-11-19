import type { BrandRead } from './brand.js';
import { finding, type Company, type Finding } from './options.js';

/** What the options add to the brand's own title and description */
export interface Extras {
  company?: Company;
  note?: string;
}

/**
 * about.txt: the name, then the description to quote: the company's when the `company` option gives one, else the brand's. After it come the
 * company's boilerplate, its facts as `Label: value` lines in the order given, and the note. Without any description it says so in one
 * line, and a brand with no name has no file.
 */
export function aboutText(brand: Pick<BrandRead, 'title' | 'named' | 'description'>, extras: Extras = {}): { text?: string; findings: Finding[] } {
  if (!brand.named) return { findings: [] };
  const { company, note } = extras;
  const description = company?.description ?? brand.description;
  const findings: Finding[] = [];
  const blocks = [brand.title, description ?? 'No description is set in blazon.json.'];
  if (!description) findings.push(finding('about-no-description', 'warning', 'brand.description', 'the brand has no description, so about.txt says none is set'));
  if (company?.boilerplate) blocks.push(company.boilerplate);
  if (company?.facts) blocks.push(company.facts.map((fact) => `${fact.label}: ${fact.value}`).join('\n'));
  if (note) blocks.push(`Note: ${note}`);
  return { text: `${blocks.join('\n\n')}\n`, findings };
}

/** What each part of the kit is for, in the order the README lists them; a part is listed when a file of the kit starts or ends as `match` says */
const PARTS: { match: (path: string) => boolean; says: string }[] = [
  {
    match: (path) => path.startsWith('logos/'),
    says: 'The logo files as they are. Use the ones in on-light-backgrounds/ on a light background and the ones in on-dark-backgrounds/ on a dark one. logos.txt says what the brand states about each.',
  },
  { match: (path) => path.startsWith('colors/'), says: 'The brand colors: colors.txt to read, colors.css for a web page, colors.json for a program.' },
  { match: (path) => path === 'fonts.txt', says: 'The fonts the brand uses, where each comes from, and under what license, where the brand states one.' },
  { match: (path) => path === 'about.txt', says: 'The brand name and a short description, to quote.' },
  {
    match: (path) => path.endsWith('.pdf'),
    says: "One page with the name, the description, up to ten colors (whole color groups, in the order of the brand's groups, each labelled with its group and step) and a logo.",
  },
];

/** README.txt: what is in the kit, in plain words. It names only the parts that are there, and holds no date. */
export function readmeText(title: string, paths: string[], name: string, note?: string): string {
  const lines = [`${title}: press kit`, ''];
  if (note) lines.push(`Note: ${note}`, '');
  lines.push('What is in this folder', '');
  const listed = PARTS.flatMap(({ match, says }) => {
    const hit = paths.find(match);
    return hit ? [{ shown: hit.startsWith('logos/') || hit.startsWith('colors/') ? `${hit.split('/')[0]}/` : hit, says }] : [];
  });
  // The says column starts two spaces after the longest name, and never nearer than column 16 (the width every kit had before names could be long)
  const width = Math.max(16, ...listed.map(({ shown }) => shown.length + 2));
  for (const { shown, says } of listed) lines.push(`  ${shown.padEnd(width)}${says}`);
  lines.push('', `${name}.zip holds the same files.`, '', "The logos are the brand's own files, not redrawn.");
  return `${lines.join('\n')}\n`;
}
