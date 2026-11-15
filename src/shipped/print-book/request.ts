import { buildJob, Cannot, isObject, OptionError } from '../shared/plugin.js';

export { Cannot, OptionError };

/** The plugin's name, which blazon's config names it by, and the prefix of its finding codes */
export const NAME = 'blazon.print-book';

export const MANIFEST = {
  v: 2,
  roles: ['build'],
  title: 'Print book',
  description: 'Prints the built brand book to a PDF and a PowerPoint file of 16:9 slides: in full, the essentials, the token reference, or chosen pages.',
  version: '2.0.0',
  timeout_ms: 60000,
  env: ['BLAZON_CHROME', 'HOME', 'TMPDIR'],
};

/** What one build request asks: the site to print, where to write, the viewer hash to print, and the files' name. */
export interface Job {
  siteDir: string;
  outDir: string;
  hash: string;
  name: string;
}

const PRESETS: Record<string, { hash: string; name: string }> = {
  full: { hash: '#print', name: 'brand-book' },
  essentials: { hash: '#print/essentials', name: 'brand-book-essentials' },
  reference: { hash: '#print/reference', name: 'brand-book-reference' },
};

const OPTIONS = ['preset', 'pages', 'title', 'subtitle'];
/** The longest title and subtitle: the cover sets the title at 96 px and the footer has one line */
const LIMITS = { title: 120, subtitle: 200 } as const;
/** C0 and C1 controls, and the line and paragraph separators */
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;

/** A text option: absent, or a non-empty string of at most `LIMITS[key]` characters with no control character. */
function text(options: Record<string, unknown>, key: keyof typeof LIMITS): string | undefined {
  const value = options[key];
  if (value === undefined) return undefined;
  const limit = LIMITS[key];
  if (typeof value !== 'string' || value.length === 0 || [...value].length > limit || CONTROL.test(value))
    throw new OptionError(`${key} must be a non-empty string of at most ${limit} characters with no control character`);
  return value;
}

/** The page to print and the files' name, from the request's options: a preset, or chosen pages, and the cover's own words. */
function page(options: unknown): { hash: string; name: string } {
  if (!isObject(options)) throw new OptionError('options must be an object');
  for (const key of Object.keys(options)) if (!OPTIONS.includes(key)) throw new OptionError(`unknown option ${JSON.stringify(key)}; the options are ${OPTIONS.join(', ')}`);
  const chosen = choice(options);
  // After the page, as a query the viewer reads back: percent-encoded, so no character of a title can end it or open the hash
  const query = (['title', 'subtitle'] as const).flatMap((key) => {
    const value = text(options, key);
    return value === undefined ? [] : [`${key}=${encodeURIComponent(value)}`];
  });
  return query.length === 0 ? chosen : { ...chosen, hash: `${chosen.hash}?${query.join('&')}` };
}

/** The page to print and the files' name: a preset, or chosen pages. */
function choice(options: Record<string, unknown>): { hash: string; name: string } {
  const { preset, pages } = options;
  if (preset !== undefined && pages !== undefined) throw new OptionError('give a preset or pages, not both');
  if (pages !== undefined) {
    const valid = Array.isArray(pages) && pages.length > 0 && pages.every((id) => typeof id === 'string' && id.length > 0 && !id.includes(',') && !id.includes('?'));
    if (!valid) throw new OptionError('pages must be a non-empty list of chapter ids');
    return { hash: `#print/pages=${pages.join(',')}`, name: 'brand-book-pages' };
  }
  if (preset === undefined) return PRESETS.full!;
  if (typeof preset !== 'string' || !Object.hasOwn(PRESETS, preset)) throw new OptionError('preset must be full, essentials or reference');
  return PRESETS[preset]!;
}

/** The job a build request asks for, or Cannot with the reason. */
export function jobFor(text: string): Job {
  const { siteDir, outDir, options } = buildJob(text);
  return { siteDir, outDir, ...page(options) };
}
