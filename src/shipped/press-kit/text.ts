import type { BrandRead } from './brand.js';
import { finding, type Finding } from './options.js';

/** about.txt: the name and the description, as the boilerplate to quote. Without a description it says so in one line, and a brand with no name has no file. */
export function aboutText(brand: Pick<BrandRead, 'title' | 'named' | 'description'>): { text?: string; findings: Finding[] } {
  if (!brand.named) return { findings: [] };
  if (!brand.description)
    return {
      text: `${brand.title}\n\nNo description is set in blazon.json.\n`,
      findings: [finding('about-no-description', 'warning', 'brand.description', 'the brand has no description, so about.txt says none is set')],
    };
  return { text: `${brand.title}\n\n${brand.description}\n`, findings: [] };
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
  { match: (path) => path.endsWith('.pdf'), says: 'One page with the name, the description, the colors and a logo.' },
];

/** README.txt: what is in the kit, in plain words. It names only the parts that are there, and holds no date. */
export function readmeText(title: string, paths: string[], name: string): string {
  const lines = [`${title}: press kit`, '', 'What is in this folder', ''];
  for (const { match, says } of PARTS) {
    const hit = paths.find(match);
    if (hit) lines.push(`  ${(hit.startsWith('logos/') || hit.startsWith('colors/') ? `${hit.split('/')[0]}/` : hit).padEnd(16)}${says}`);
  }
  lines.push('', `${name}.zip holds the same files.`, '', "The logos are the brand's own files, not redrawn.");
  return `${lines.join('\n')}\n`;
}
