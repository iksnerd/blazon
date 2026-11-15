import fs from 'node:fs';
import path from 'node:path';
import type { Ctx } from '../context.js';

/** "colors" and "fonts" are plural, "logo" is not: only a list that is just the logo takes a singular verb. */
const single = (items: string[]): boolean => items.length === 1 && items[0] === 'logo';
const list = (items: string[]): string => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);

/** What the page says about where the values came from: only what was read, and what is still the starter's. */
function provenance(ctx: Ctx): string {
  const { url, date, result } = ctx;
  const found = {
    colors: result.written.includes('tokens/colors.json'),
    fonts: result.written.includes('tokens/typography.json'),
    logo: result.written.some((file) => file.startsWith('assets/logos/')),
  };
  const read = Object.entries(found)
    .filter(([, ok]) => ok)
    .map(([name]) => name);
  const left = Object.entries(found)
    .filter(([, ok]) => !ok)
    .map(([name]) => name);
  if (read.length === 0)
    return `Nothing could be read from ${url} on ${date}: it gave no brand colors, no fonts and no logo. This brand book is still blazon's own starter, so replace its colors, fonts and logo with the brand's.`;
  const first = `The ${list(read)} in this brand book ${single(read) ? 'was' : 'were'} read from ${url} on ${date}. They are what the site shows today, so the brand owner needs to confirm them before anyone relies on them.`;
  return left.length === 0
    ? first
    : `${first} The ${list(left)} ${single(left) ? 'was' : 'were'} not found, so ${single(left) ? 'it is' : 'they are'} still blazon's own starter: replace ${single(left) ? 'it' : 'them'}.`;
}

/** The intro page says where the values came from, in place of blazon's principles. */
export function writeIntro(ctx: Ctx, title: string | undefined, description: string | undefined) {
  const { destDir, url, created, result } = ctx;
  const introFile = 'docs/01-principles.md';
  if (created.has(introFile) && fs.existsSync(path.join(destDir, introFile))) {
    const brand = title ?? new URL(url).hostname.replace(/^www\./, '');
    const lines = [
      '---',
      'title: Introduction',
      'section: intro',
      'order: 1',
      'group: Foundations',
      `description: ${JSON.stringify(description ?? `Where the values in this brand book came from.`)}`,
      '---',
      '',
      `# ${brand}`,
      '',
      ...(description ? [description, ''] : []),
      provenance(ctx),
      '',
    ];
    fs.writeFileSync(path.join(destDir, introFile), lines.join('\n'));
    result.written.push(introFile);
  }
}
