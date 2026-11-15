import { isObject } from '../shared/plugin.js';
import { finding, type AvoidGroup, type Finding, type Options } from './options.js';
import { blocksOf, sentencesOf, wordsOf, type Block } from './text.js';

// The three checks, each over text that is already clean prose. They report; they never change a page. A term is a literal: it is found by
// comparing text, never by a pattern built from the operator's words.

const isWordChar = (char: string | undefined): boolean => char !== undefined && /[\p{L}\p{N}]/u.test(char);

/**
 * How often `term` is in `text`, and the first place. A term that starts or ends with a letter or a digit matches whole words only. A single
 * trailing `*` makes the term a stem: it matches every word that begins with it (`решени*` finds решение, решения and решенията). No other
 * character has a meaning, so no pattern is built from a term.
 */
export function occurrences(text: string, term: string): { count: number; first: number } {
  const haystack = text.toLowerCase();
  const stem = term.length > 1 && term.endsWith('*');
  const needle = (stem ? term.slice(0, -1) : term).toLowerCase();
  const startsWord = isWordChar(needle[0]);
  const endsWord = !stem && isWordChar(needle[needle.length - 1]);
  let count = 0;
  let first = -1;
  for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, at + needle.length)) {
    if (startsWord && isWordChar(haystack[at - 1])) continue;
    if (endsWord && isWordChar(haystack[at + needle.length])) continue;
    count += 1;
    if (first === -1) first = at;
  }
  return { count, first };
}

const quote = (text: string, at: number, length: number): string =>
  `${at > 20 ? '...' : ''}${text
    .slice(Math.max(0, at - 20), at + length + 20)
    .replace(/\s+/g, ' ')
    .trim()}${at + length + 20 < text.length ? '...' : ''}`;

/** Whether a path is in a list of them: written in full, or covered by one ending in `*`, which is a prefix (`social/*`, a category of assets). */
export const inScope = (path: string, paths: ReadonlySet<string>): boolean =>
  [...paths].some((entry) => (entry.endsWith('*') ? path.startsWith(entry.slice(0, -1)) : entry === path));

/** Whether a group applies to a page or an asset, by its path: every one, or those in `only`, less those in `skip`. */
const applies = (group: AvoidGroup, path: string): boolean => (!group.only || inScope(path, group.only)) && !(group.skip && inScope(path, group.skip));

/** The text with whatever is inside quotation marks (straight, curly, low-high and guillemets) turned to spaces of the same length, so a place in it is still a place in the text. */
const QUOTED = /"[^"]*"|\u201C[^\u201D]*\u201D|\u201E[^\u201C\u201D]*[\u201C\u201D]|\u00AB[^\u00BB]*\u00BB/g;
const withoutQuoted = (text: string): string => text.replace(QUOTED, (quoted) => ' '.repeat(quoted.length));

/** A finding for each avoided term the blocks hold: how often, and the block of its first appearance, so a quote never runs across two blocks. */
function avoidedTerms(path: string, blocks: Block[], groups: AvoidGroup[], ignoreQuoted: boolean): Finding[] {
  const found: Finding[] = [];
  for (const group of groups.filter((candidate) => applies(candidate, path)))
    for (const term of group.terms) {
      let count = 0;
      let first: { block: Block; at: number } | undefined;
      for (const block of blocks) {
        const seen = occurrences(ignoreQuoted ? withoutQuoted(block.text) : block.text, term);
        count += seen.count;
        if (seen.count > 0 && !first) first = { block, at: seen.first };
      }
      if (!first) continue;
      const advice = group.say ? ` The brand says: ${group.say}.` : '';
      found.push(
        finding(
          'avoided-term',
          'warning',
          path,
          `"${term}" is avoided and appears ${count === 1 ? 'once' : `${count} times`}, as in "${quote(first.block.text, first.at, term.length)}".${advice}`,
        ),
      );
    }
  return found;
}

/** Whether a heading is in title case: three or more words, and each word after the first that is not a name starts with a capital. */
export function isTitleCase(heading: string, names: Set<string>): boolean {
  const words = heading.split(/\s+/).filter((word) => /^\p{L}/u.test(word));
  if (words.length < 3) return false;
  const rest = words.slice(1).filter((word) => !names.has(word.replace(/[^\p{L}\p{N}]+$/u, '')));
  return rest.length > 0 && rest.every((word) => /^\p{Lu}/u.test(word));
}

function sentenceLengths(path: string, text: string, max: number): Finding[] {
  const found: Finding[] = [];
  for (const sentence of sentencesOf(text)) {
    const count = wordsOf(sentence).length;
    if (count > max)
      found.push(
        finding('sentence-length', 'warning', path, `a sentence of ${count} words, and the brand allows ${max}: "${sentence.slice(0, 60)}${sentence.length > 60 ? '...' : ''}"`),
      );
  }
  return found;
}

/** The findings for one source of text: a page's blocks, or an asset's strings given as paragraphs. */
function checkBlocks(path: string, blocks: Block[], options: Options): Finding[] {
  const found = avoidedTerms(path, blocks, options.avoid, options.ignoreQuoted);
  const headings = (!options.headingOnly || inScope(path, options.headingOnly)) && !(options.headingSkip && inScope(path, options.headingSkip));
  for (const block of blocks) {
    if (block.kind === 'heading' && headings && options.headings === 'sentence' && isTitleCase(block.text, options.names))
      found.push(finding('heading-case', 'warning', path, `"${block.text}" is in title case, and the brand sets headings in sentence case`));
    if (block.kind === 'heading' && headings && options.headingMaxWords !== undefined) {
      const count = wordsOf(block.text).length;
      if (count > options.headingMaxWords)
        found.push(finding('heading-length', 'warning', path, `"${block.text}" is a heading of ${count} words, and the brand allows ${options.headingMaxWords}`));
    }
    if ((block.kind === 'paragraph' || block.kind === 'item') && options.maxWords !== undefined) found.push(...sentenceLengths(path, block.text, options.maxWords));
  }
  return found;
}

const text = (value: unknown): string[] => (typeof value === 'string' ? [value] : Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []);

/** The findings for a brand: every page and every asset sidecar, in the order `brand.json` lists them. */
export function copyFindings(brand: Record<string, unknown>, options: Options): Finding[] {
  const found: Finding[] = [];
  for (const page of Array.isArray(brand.pages) ? brand.pages : []) {
    if (!isObject(page) || typeof page.markdown !== 'string') continue;
    const path = typeof page.sourceFile === 'string' ? page.sourceFile : String(page.slug ?? 'page');
    if (inScope(path, options.skip)) continue;
    const meta = isObject(page.meta) ? page.meta : {};
    const front: Block[] = [...text(page.title), ...text(meta.description)].map((value) => ({ kind: 'paragraph', text: value }));
    found.push(...checkBlocks(path, [...front, ...blocksOf(page.markdown)], options));
  }
  for (const asset of Array.isArray(brand.assets) ? brand.assets : []) {
    if (!isObject(asset) || !isObject(asset.meta)) continue;
    const path = typeof asset.id === 'string' ? asset.id : 'asset';
    if (inScope(path, options.skip)) continue;
    const strings = [asset.meta.title, asset.meta.description, asset.meta.traits, asset.meta.do, asset.meta.dont].flatMap(text);
    found.push(
      ...checkBlocks(
        path,
        strings.map((value): Block => ({ kind: 'paragraph', text: value })),
        options,
      ),
    );
  }
  return found;
}
