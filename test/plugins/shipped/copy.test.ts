import { describe, it, expect } from 'vitest';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { spawnSync } from '../../support/spawn';
import { copyFindings, isTitleCase, occurrences } from '../../../src/shipped/copy/checks.js';
import { parseOptions } from '../../../src/shipped/copy/options.js';
import { NAME } from '../../../src/shipped/copy/request.js';
import { blocksOf, sentencesOf, wordsOf } from '../../../src/shipped/copy/text.js';
import { ROOT_DIR } from '../support/spec.js';

// blazon.copy, the plugin blazon ships to hold a brand book's text to the brand's word rules (RFC 0006). Seams: the text it reads (blocks,
// sentences), the three checks, the options, and the entry run as blazon runs it. Nothing here needs a browser.

const ENTRY = path.join(ROOT_DIR, 'src/shipped/copy/main.ts');
const TSX = pathToFileURL(path.join(ROOT_DIR, 'node_modules/tsx/dist/esm/index.mjs')).href;

const run = (request: object) => {
  const ran = spawnSync(process.execPath, ['--import', TSX, ENTRY], { input: JSON.stringify(request), encoding: 'utf-8', env: { PATH: '/usr/bin:/bin' } });
  return { status: ran.status, out: ran.stdout };
};

const page = (markdown: string, over: object = {}) => ({ slug: 'a', sourceFile: 'a.md', title: 'A page', order: 1, meta: {}, sections: [], markdown, directives: [], ...over });
const brandOf = (pages: object[], assets: object[] = []) => ({ format: 'blazon-brand', version: 1, pages, assets });
const options = (raw: object) => parseOptions(raw).options;
const codes = (found: { code: string }[]) => found.map((f) => f.code);

describe('blocksOf', () => {
  it('reads headings, paragraphs, list items and table rows, and nothing from code, directives or link targets', () => {
    const markdown = [
      '## A heading',
      '',
      'One line of a paragraph',
      'and its second line with `code here` and a [link text](https://example.com/powerful).',
      '',
      '- an item',
      '1. a numbered item',
      '',
      '| Write | Not |',
      '|---|---|',
      '| a | b |',
      '',
      '```ts',
      'const powerful = 1;',
      '```',
      '',
      '<!-- blazon:tokens color -->',
    ].join('\n');
    expect(blocksOf(markdown)).toEqual([
      { kind: 'heading', text: 'A heading' },
      { kind: 'paragraph', text: 'One line of a paragraph and its second line with and a link text.' },
      { kind: 'item', text: 'an item' },
      { kind: 'item', text: 'a numbered item' },
      { kind: 'table', text: 'Write Not' },
      { kind: 'table', text: 'a b' },
    ]);
  });
});

describe('sentencesOf and wordsOf', () => {
  it('splits at a full stop, a question mark and an exclamation mark, and not at an abbreviation or a decimal', () => {
    expect(sentencesOf('One thing. Another thing? Yes! See e.g. the manual, version 3.5 of it. Last one.')).toEqual([
      'One thing.',
      'Another thing?',
      'Yes!',
      'See e.g. the manual, version 3.5 of it.',
      'Last one.',
    ]);
  });

  it('splits Bulgarian and other Cyrillic text the same way, at a capital letter that starts the next sentence', () => {
    expect(sentencesOf('Това е първо изречение. Това е второ изречение! Дали е трето? Да.')).toEqual(['Това е първо изречение.', 'Това е второ изречение!', 'Дали е трето?', 'Да.']);
    expect(sentencesOf('Цена 3.5 лева. Втора цена.')).toEqual(['Цена 3.5 лева.', 'Втора цена.']);
  });

  it('counts the stretches of text with a letter or a digit in them', () => {
    expect(wordsOf('Ship 9 plugins - fast, and well.')).toEqual(['Ship', '9', 'plugins', 'fast,', 'and', 'well.']);
  });
});

describe('occurrences', () => {
  it('finds a term in any case, and a word only as a whole word', () => {
    expect(occurrences('Robust and robust, but robustness is not it.', 'robust').count).toBe(2);
    expect(occurrences('Robust and robust.', 'ROBUST').first).toBe(0);
  });

  it('finds a term that is not a word as plain text', () => {
    expect(occurrences('a — b — c', '—').count).toBe(2);
    expect(occurrences('1+1 is 2', '1+1').count).toBe(1);
  });

  it('finds a Cyrillic term in any case, as a whole word', () => {
    expect(occurrences('Безплатно е. БЕЗПЛАТНО! безплатното не.', 'безплатно').count).toBe(2);
  });

  it('matches every form of a word with a trailing * (a stem), at a word start', () => {
    expect(occurrences('Решение, решения, решенията и нерешение.', 'решени*').count).toBe(3);
    expect(occurrences('Robust and robustness, not unrobust.', 'robust*').count).toBe(2);
    expect(occurrences('Robust and robustness.', 'robust').count).toBe(1);
  });

  it('gives no other character a meaning: a * inside a term is a * in the text', () => {
    expect(occurrences('a*b and axb', 'a*b').count).toBe(1);
    expect(occurrences('a*b and axb', 'a*b*').count).toBe(1);
  });

  it('treats the term as text and never as a pattern', () => {
    expect(occurrences('a.b and axb', 'a.b').count).toBe(1);
    expect(occurrences('anything', '.*').count).toBe(0);
  });
});

describe('isTitleCase', () => {
  const none = new Set<string>();
  it.each([
    ['Tame Complexity And Build Trust', true],
    ['Our Brand Book', true],
    ['What blazon is', false],
    ['Built to spec', false],
    ['Voice and tone', false],
    ['Two Words', false],
    ['Version 2 Of The Plan', true],
  ])('%s is title case: %s', (heading, expected) => expect(isTitleCase(heading, none)).toBe(expected));

  it('leaves out a word the brand writes in capitals', () => {
    expect(isTitleCase('Using Big Shoulders', none)).toBe(true);
    expect(isTitleCase('Using Big Shoulders', new Set(['Big', 'Shoulders']))).toBe(false);
  });
});

describe('parseOptions', () => {
  it('reads every option', () => {
    const { options: parsed, findings } = parseOptions({
      avoid: [{ terms: ['powerful'], say: 'a number' }, { terms: ['seamless'] }],
      headings: 'sentence',
      names: ['Blazon'],
      sentences: { maxWords: 20 },
      skip: ['11-voice.md'],
    });
    expect(findings).toEqual([]);
    expect(parsed.avoid).toEqual([{ terms: ['powerful'], say: 'a number' }, { terms: ['seamless'] }]);
    expect(parsed).toMatchObject({ headings: 'sentence', maxWords: 20 });
    expect([...parsed.names]).toEqual(['Blazon']);
    expect([...parsed.skip]).toEqual(['11-voice.md']);
  });

  it.each([
    ['an option that is not one', { nope: 1 }, /nope is not an option/],
    ['avoid that is not a list', { avoid: 'powerful' }, /avoid must be a list/],
    ['a group without terms', { avoid: [{ say: 'x' }] }, /avoid\[0\]\.terms/],
    ['an empty term', { avoid: [{ terms: ['ok', ' '] }] }, /empty term/],
    ['a say that is not a string', { avoid: [{ terms: ['a'], say: 3 }] }, /avoid\[0\]\.say/],
    ['headings of another kind', { headings: 'title' }, /headings must be/],
    ['a maxWords of zero', { sentences: { maxWords: 0 } }, /positive integer/],
    ['a maxWords that is not a whole number', { sentences: { maxWords: 2.5 } }, /positive integer/],
    ['skip that is not a list', { skip: 'a.md' }, /skip must be a list/],
  ])('is an option-invalid error for %s, and the other options stay', (_, raw, message) => {
    const { options: parsed, findings } = parseOptions({ headings: 'sentence', ...raw });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ code: `${NAME}/option-invalid`, severity: 'error', path: 'options' });
    expect(findings[0]!.message).toMatch(message);
    if (!('headings' in raw)) expect(parsed.headings).toBe('sentence');
  });

  it('reads a page scope for a group (only, skip) and a heading limit, and the string form of headings still works', () => {
    const { options: parsed, findings } = parseOptions({
      avoid: [{ terms: ['free'], only: ['01-intro.md'], skip: ['layout.md'] }, { terms: ['cheap'] }],
      headings: { case: 'sentence', maxWords: 8 },
    });
    expect(findings).toEqual([]);
    expect(parsed.avoid[0]).toMatchObject({ terms: ['free'] });
    expect([...parsed.avoid[0]!.only!]).toEqual(['01-intro.md']);
    expect([...parsed.avoid[0]!.skip!]).toEqual(['layout.md']);
    expect(parsed.avoid[1]!.only).toBeUndefined();
    expect(parsed).toMatchObject({ headings: 'sentence', headingMaxWords: 8 });
    expect(parseOptions({ headings: 'sentence' }).options.headingMaxWords).toBeUndefined();
    expect(parseOptions({ headings: { maxWords: 6 } }).options).toMatchObject({ headings: 'any', headingMaxWords: 6 });
  });

  it.each([
    ['an only that is not a list of strings', { avoid: [{ terms: ['a'], only: 'x.md' }] }, /avoid\[0\]\.only/],
    ['a skip in a group that is not a list of strings', { avoid: [{ terms: ['a'], skip: [1] }] }, /avoid\[0\]\.skip/],
    ['an unknown key in a group', { avoid: [{ terms: ['a'], when: 'x' }] }, /avoid\[0\]\.when is not/],
    ['an unknown key in headings', { headings: { case: 'sentence', words: 3 } }, /headings\.words is not/],
    ['a headings case of another kind', { headings: { case: 'title' } }, /headings\.case must be/],
    ['a headings maxWords of zero', { headings: { maxWords: 0 } }, /headings\.maxWords must be a positive integer/],
    ['a headings value that is neither', { headings: 3 }, /headings must be/],
  ])('is an option-invalid error for %s', (_, raw, message) => {
    const { findings } = parseOptions(raw);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toMatch(message);
  });

  it('reads ignoreQuoted and a scope for headings, and refuses a term that is only a *', () => {
    const { options: parsed, findings } = parseOptions({ ignoreQuoted: true, headings: { case: 'sentence', only: ['a.md', 'social/*'], skip: ['b.md'] } });
    expect(findings).toEqual([]);
    expect(parsed.ignoreQuoted).toBe(true);
    expect([...parsed.headingOnly!]).toEqual(['a.md', 'social/*']);
    expect([...parsed.headingSkip!]).toEqual(['b.md']);
    expect(parseOptions({}).options.ignoreQuoted).toBe(false);
    expect(parseOptions({ avoid: [{ terms: ['*'] }] }).findings[0]!.message).toMatch(/empty term/);
  });

  it.each([
    ['an ignoreQuoted that is not true or false', { ignoreQuoted: 'yes' }, /ignoreQuoted must be true or false/],
    ['a headings only that is not a list of page paths', { headings: { only: 'a.md' } }, /headings\.only must be a list/],
    ['a headings skip that is not a list of page paths', { headings: { skip: [2] } }, /headings\.skip must be a list/],
  ])('is an option-invalid error for %s', (_, raw, message) => {
    const { findings } = parseOptions(raw);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toMatch(message);
  });

  it('is an error when the options are not an object', () => {
    expect(codes(parseOptions([]).findings)).toEqual([`${NAME}/option-invalid`]);
  });
});

describe('copyFindings', () => {
  const rules = options({ avoid: [{ terms: ['powerful', 'seamless'], say: 'a number, or nothing' }], headings: 'sentence', sentences: { maxWords: 8 } });

  it('reports an avoided term once for each page, with how often and where, and the brand\'s advice', () => {
    const found = copyFindings(brandOf([page('A powerful tool. Powerful and simple.')]), rules);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ code: `${NAME}/avoided-term`, severity: 'warning', path: 'a.md' });
    expect(found[0]!.message).toMatch(/"powerful" is avoided and appears 2 times, as in ".*A powerful tool/);
    expect(found[0]!.message).toMatch(/The brand says: a number, or nothing\./);
  });

  it('quotes the block where a term first appears, never text from the block before it', () => {
    const found = copyFindings(brandOf([page('A powerful tool.', { title: 'The title' })]), rules);
    expect(found[0]!.message).toContain('as in "A powerful tool."');
    expect(found[0]!.message).not.toContain('The title');
  });

  it('reads the title and the description of a page, and the sidecar text of an asset', () => {
    const found = copyFindings(brandOf([page('Plain text.', { title: 'A powerful start', meta: { description: 'Seamless.' } })], [{ id: 'logos/mark', meta: { title: 'Mark', do: ['Use it seamless'], dont: [] } }]), rules);
    expect(found.map((f) => [f.path, f.message.split('"')[1]])).toEqual([
      ['a.md', 'powerful'],
      ['a.md', 'seamless'],
      ['logos/mark', 'seamless'],
    ]);
  });

  it('does not flag a term in a code span, a code fence or a link target', () => {
    const markdown = ['Write `powerful` as code.', '', '```', 'seamless', '```', '', '[plain](https://example.com/seamless)'].join('\n');
    expect(copyFindings(brandOf([page(markdown)]), rules)).toEqual([]);
  });

  it('applies a group only to the pages it names (only), and not to the pages it skips (skip)', () => {
    const brand = brandOf([page('Keep it free.', { sourceFile: 'layout.md', slug: 'l' }), page('Free of charge!', { sourceFile: 'offer.md', slug: 'o' }), page('Free again.', { sourceFile: 'other.md', slug: 'x' })]);
    const only = copyFindings(brand, options({ avoid: [{ terms: ['free'], only: ['offer.md'] }] }));
    expect(only.map((f) => f.path)).toEqual(['offer.md']);
    const skipped = copyFindings(brand, options({ avoid: [{ terms: ['free'], skip: ['layout.md'] }] }));
    expect(skipped.map((f) => f.path)).toEqual(['offer.md', 'other.md']);
    expect(copyFindings(brand, options({ avoid: [{ terms: ['free'], only: ['offer.md', 'layout.md'], skip: ['layout.md'] }] })).map((f) => f.path)).toEqual(['offer.md']);
  });

  it('scopes a group by the asset id for a sidecar', () => {
    const brand = brandOf([], [{ id: 'logos/mark', meta: { description: 'Free to use' } }, { id: 'icons/a', meta: { description: 'Free to use' } }]);
    expect(copyFindings(brand, options({ avoid: [{ terms: ['free'], only: ['icons/a'] }] })).map((f) => f.path)).toEqual(['icons/a']);
  });

  it('reports a heading with more words than headings.maxWords, and no paragraph or table row', () => {
    const markdown = '## One two three four five six seven eight nine\n\nOne two three four five six seven eight nine ten.\n\n## Six words are fine here\n';
    const found = copyFindings(brandOf([page(markdown)]), options({ headings: { maxWords: 8 } }));
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ code: `${NAME}/heading-length`, severity: 'warning', path: 'a.md' });
    expect(found[0]!.message).toMatch(/"One two three four five six seven eight nine" is a heading of 9 words, and the brand allows 8/);
  });

  it('checks heading case and heading length independently', () => {
    const found = copyFindings(brandOf([page('## Our Brand Book Has Many Words Here')]), options({ headings: { case: 'sentence', maxWords: 4 } }));
    expect(codes(found).sort()).toEqual([`${NAME}/heading-case`, `${NAME}/heading-length`]);
  });

  it('counts the words of a Bulgarian paragraph by sentence, so a limit does not flag every page', () => {
    const markdown = 'Това е първо кратко изречение. Това е второ кратко изречение. Това е трето кратко изречение.';
    expect(copyFindings(brandOf([page(markdown)]), options({ sentences: { maxWords: 6 } }))).toEqual([]);
  });

  it('finds every inflected form of a Bulgarian word with a stem', () => {
    const found = copyFindings(brandOf([page('Нашите решения са бързи. Оптимизирането на плащанията е лесно. Едно решение.')]), options({ avoid: [{ terms: ['решени*', 'оптимизиран*'] }] }));
    expect(found.map((f) => f.message.split('"')[1])).toEqual(['решени*', 'оптимизиран*']);
    expect(found[0]!.message).toMatch(/appears 2 times/);
  });

  it('leaves out text in quotation marks of every kind when ignoreQuoted is set, and reads the rest', () => {
    const markdown = ['The page says "powerful" and \u201Cpowerful\u201D and \u201Epowerful\u201C and \u00ABpowerful\u00BB.', '', 'An unquoted powerful claim.'].join('\n');
    const rules = { avoid: [{ terms: ['powerful'] }] };
    const ignoring = copyFindings(brandOf([page(markdown)]), options({ ...rules, ignoreQuoted: true }));
    expect(ignoring).toHaveLength(1);
    expect(ignoring[0]!.message).toMatch(/appears once, as in ".*An unquoted powerful claim/);
    expect(copyFindings(brandOf([page(markdown)]), options(rules))[0]!.message).toMatch(/appears 5 times/);
  });

  it('does not let ignoreQuoted hide a long sentence or a heading', () => {
    const long = '"One two three four five six seven eight nine ten."';
    expect(copyFindings(brandOf([page(long)]), options({ ignoreQuoted: true, sentences: { maxWords: 5 } }))).toHaveLength(1);
  });

  it('applies the heading checks only to the pages in headings.only, and not to those in headings.skip', () => {
    const brand = brandOf([page('## Our Brand Book Has Many Words', { sourceFile: 'a.md', slug: 'a' }), page('## Our Brand Book Has Many Words', { sourceFile: 'b.md', slug: 'b' }), page('## Our Brand Book Has Many Words', { sourceFile: 'c.md', slug: 'c' })]);
    const rules = { case: 'sentence', maxWords: 4 };
    expect(copyFindings(brand, options({ headings: { ...rules, only: ['a.md', 'b.md'], skip: ['b.md'] } })).map((f) => f.path)).toEqual(['a.md', 'a.md']);
    expect(copyFindings(brand, options({ headings: rules })).map((f) => f.path)).toEqual(['a.md', 'a.md', 'b.md', 'b.md', 'c.md', 'c.md']);
  });

  it('takes a trailing * in any scope as a prefix of the path: a category of assets, or a folder of pages', () => {
    const brand = brandOf(
      [page('Free.', { sourceFile: 'layout/a.md', slug: 'a' }), page('Free.', { sourceFile: 'offer.md', slug: 'o' })],
      [
        { id: 'social/post', meta: { description: 'Free' } },
        { id: 'social/story', meta: { description: 'Free' } },
        { id: 'logos/mark', meta: { description: 'Free' } },
      ],
    );
    expect(copyFindings(brand, options({ avoid: [{ terms: ['free'], skip: ['layout/*', 'social/*'] }] })).map((f) => f.path)).toEqual(['offer.md', 'logos/mark']);
    expect(copyFindings(brand, options({ avoid: [{ terms: ['free'], only: ['social/*'] }] })).map((f) => f.path)).toEqual(['social/post', 'social/story']);
    expect(copyFindings(brand, options({ avoid: [{ terms: ['free'] }], skip: ['layout/*', 'social/*', 'logos/*'] })).map((f) => f.path)).toEqual(['offer.md']);
  });

  it('does not read a page in skip', () => {
    expect(copyFindings(brandOf([page('A powerful tool.')]), options({ avoid: [{ terms: ['powerful'] }], skip: ['a.md'] }))).toEqual([]);
  });

  it('reports a heading in title case only when headings is sentence', () => {
    const markdown = '## Our Brand Book\n\n## Built to spec\n';
    expect(codes(copyFindings(brandOf([page(markdown)]), rules))).toEqual([`${NAME}/heading-case`]);
    expect(copyFindings(brandOf([page(markdown)]), options({ headings: 'any' }))).toEqual([]);
  });

  it('reports a sentence over maxWords, with its length, and none when no limit is set', () => {
    const long = 'This sentence has far more words than the brand would ever allow in one go.';
    const found = copyFindings(brandOf([page(`Short one. ${long}`)]), rules);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ code: `${NAME}/sentence-length`, path: 'a.md' });
    expect(found[0]!.message).toMatch(/a sentence of 15 words, and the brand allows 8: "This sentence has far more words/);
    expect(copyFindings(brandOf([page(long)]), options({ headings: 'sentence' }))).toEqual([]);
  });

  it('does not measure a heading or a table row as a sentence', () => {
    const markdown = '## A heading that has a great many more words than eight in it\n\n| one | two three four five six seven eight nine ten eleven |\n';
    expect(copyFindings(brandOf([page(markdown)]), rules)).toEqual([]);
  });

  it('finds nothing with no rules, and tolerates a brand without pages or assets', () => {
    expect(copyFindings(brandOf([page('A powerful tool.')]), options({}))).toEqual([]);
    expect(copyFindings({}, rules)).toEqual([]);
    expect(copyFindings({ pages: [null, 3, { slug: 'x' }], assets: [null, { id: 'a' }] }, rules)).toEqual([]);
  });

  it('gives the same findings for the same brand', () => {
    const brand = brandOf([page('A powerful tool, seamless. Powerful.'), page('Seamless.', { sourceFile: 'b.md', slug: 'b' })]);
    expect(copyFindings(brand, rules)).toEqual(copyFindings(brand, rules));
  });
});

describe('the entry, run as blazon runs it', () => {
  it('answers a check request with findings under the plugin\'s name', () => {
    const ran = run({ v: 1, type: 'check', options: { avoid: [{ terms: ['powerful'] }], headings: 'sentence' }, brand: brandOf([page('A powerful tool.\n\n## Our Brand Book')]) });
    expect(ran.status).toBe(0);
    const answer = JSON.parse(ran.out);
    expect(answer.findings.map((f: { code: string }) => f.code)).toEqual([`${NAME}/avoided-term`, `${NAME}/heading-case`]);
  });

  it('answers wrong options with an error finding and exit 0', () => {
    const ran = run({ v: 1, type: 'check', options: { nope: true }, brand: brandOf([]) });
    expect(ran.status).toBe(0);
    expect(JSON.parse(ran.out).findings).toMatchObject([{ code: `${NAME}/option-invalid`, severity: 'error' }]);
  });

  it('answers a request for the build role with exit 2 and the reason first', () => {
    const ran = run({ v: 1, type: 'build', brand: brandOf([]), options: {} });
    expect(ran.status).toBe(2);
    expect(ran.out.split('\n')[0]).toMatch(/build role; this plugin is a check plugin/);
  });

  it('answers a request with no brand with exit 2', () => {
    expect(run({ v: 1, type: 'check', options: {} }).status).toBe(2);
  });
});
