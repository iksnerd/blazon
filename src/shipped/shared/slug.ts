import { DEFAULT_CONFIG } from '../../core/config/defaults.js';

/** A name as a file name: lowercase letters, digits, dots, hyphens and underscores, so it cannot leave out_dir. `fallback` when nothing is left. */
export const slug = (text: string, fallback = 'brand'): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9._]+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 80) || fallback;

/** The longest the brand's part of a file name gets, so `<it>-press-kit` stays inside the 64 characters a `name` option may be */
const STEM_MAX = 40;

/**
 * The name of a file a plugin writes for the brand: `<brand>-<what>`, such as `acme-press-kit`, and plain `<what>` when the brand has no
 * title of its own: none, nothing left of it as a slug, or the title blazon gives a new book. `<name> Brand Book` is the title a new
 * project gets, so the book is not part of the name (`acme-press-kit`, not `acme-brand-book-press-kit`). The same rule as
 * `mcpServerName` in core, which names an MCP server.
 */
export function brandedName(title: string | undefined, what: string): string {
  if (title === undefined || title === DEFAULT_CONFIG.title) return what;
  const stem = slug(title.normalize('NFKD').replace(/[̀-ͯ]/g, ''), '')
    .slice(0, STEM_MAX)
    .replace(/[-.]+$/, '')
    .replace(/-?brand-book$/, '');
  return stem === '' || stem === 'brand' ? what : `${stem}-${what}`;
}
