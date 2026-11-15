# RFC 0006: Copy rules

Status: draft 1, sections 1 to 3 implemented · Scope: where a brand's rules for how it writes (words it avoids, heading case, sentence length) live in blazon, and how `blazon check` holds the brand book's own text to them
Numbering: blazon RFCs, starting at 0001. Builds on [RFC 0001](0001-data-model.md) (the data model; section numbers below that are not prefixed refer to it) and [RFC 0002](0002-extension-model.md) (plugins). [RFC 0004](0004-format-rules.md) is the sibling for values (amounts, dates), and this RFC takes its shape.

## Summary

A brand book usually says how the brand writes, in a page of prose, and nothing holds the rest of the book to it. This RFC proposes that the brand states the checkable part of its voice once, as data, and that `blazon check` reports the text that breaks it. It proposes:

1. **A shipped plugin, `blazon.copy`**, that takes the rules in its `options` (RFC 0002 section 2). No core change, no new config key, no change to `brand.json`, and no standard section: `voice` stays a section a brand adds (RFC 0001 section 13).
2. **A `check` role only.** It reads the pages' Markdown and the assets' sidecar text from `brand.json` and reports three kinds of finding: a term the brand avoids, a heading in the wrong case, and a sentence longer than the brand allows.
3. **A promotion path**, as in RFC 0004 section 6: if a second reader needs the rules, they move to a config key and a `brand.json` field. RFC 0004 section 6 specifies that step; this RFC does not take it.

## Motivation

Two finished brand guidelines were read for this draft: the Auth0 deck (105 slides) and the Slack guidelines (23 pages). Neither has a voice and tone section. The writing rules they do state are few and concrete:

| Source                          | What it states about writing                                                                                                     |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Auth0, slide 76 (animated type) | "Try to use short and concise sentences", and `Font style: SemiBold, Sentence case`. No number is given for "short"              |
| Auth0, slide 6                  | Purpose, Promise, and three groups of four personality words. No rule a text could break                                         |
| Slack, page 15                  | A naming block: say "integrates with Slack", do not put the name inside the name of a product, no domains or marks containing it |

Blazon's own writing rules are the third case, and they are stated in prose in `CLAUDE.md` and in the starter's voice page (`examples/blazon/docs/11-voice.md`): no em-dashes, no hype words, sentence-case headings, a number in place of an adjective. Nothing holds the brand book to them. The starter's voice page shows the gap: its "Not" column quotes the hype words the page tells the reader to avoid ("powerful", "seamlessly"), and it passes `blazon check`.

| What        | State                                                                                                                                    |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| The rules   | Prose, in a page a brand wrote or in a rules file for its authors                                                                        |
| The check   | None. A page that uses a word the brand bans, or sets a heading in title case, passes `blazon check`                                      |
| Prior tools | General prose linters exist (see Alternatives). They know nothing of the brand book's pages, its asset sidecars or its section structure |

## Conventions

The key words "MUST", "MUST NOT", "SHOULD", "SHOULD NOT" and "MAY" are to be interpreted as described in BCP 14 [RFC2119] [RFC8174] when, and only when, they appear in all capitals.

A **copy rule** is a statement about how text is written that a program can test without understanding it: a word or phrase that must not appear, a heading case, a sentence length. It is not a statement of tone, which a program cannot test.

## The model

### 1. Where the rules live

In the plugin's `options`, in `blazon.json`:

```json
{
  "plugins": [
    {
      "name": "blazon.copy",
      "options": {
        "avoid": [
          {
            "terms": [ "powerful", "seamless", "robust", "effortless" ],
            "say": "a number, or nothing"
          },
          { "terms": [ "—", "–" ], "say": "a period, a colon or parentheses" }
        ],
        "headings": "sentence",
        "sentences": { "maxWords": 25 },
        "skip": [ "11-voice.md" ]
      }
    }
  ]
}
```

- `avoid` is a list of groups. `terms` are strings, matched case-insensitively as text, as whole words when the term starts and ends with a letter or digit. A term is never a pattern: a single trailing `*` makes it a stem, which matches every word that begins with it (`решени*` finds решение, решения and решенията), and no other character is special. `say` is the advice the finding quotes. `only` and `skip` are lists of paths, a page's path from the docs folder or an asset's id, that scope the group: it applies to every page and asset, or to those in `only`, less those in `skip`. A path ending in `*` is a prefix, so `social/*` covers a category of assets and `layout/*` a folder of pages. A word that means one thing in marketing copy and another in a layout note, such as "free", is scoped to the pages where it is a claim.
- `headings` is `sentence` or `any` (the default), or an object `{ case, maxWords, only, skip }`. `sentence` flags a heading of three or more words in which every word after the first starts with a capital letter. A word the brand writes in capitals is listed in `names`, so a product name is not flagged. `maxWords` is a positive integer, the most words a heading may have, for a brand whose guidelines limit a headline. `only` and `skip` scope both heading checks to some pages, as they do an `avoid` group, because a limit on a headline is not a limit on every heading of a guideline page.
- `ignoreQuoted` is `true` or `false` (the default). When true, text inside quotation marks (straight, curly, low-high and guillemets) is not searched for avoided terms, so a page can quote what it forbids and still be read. It does not hide a long sentence or a heading.
- `sentences.maxWords` is a positive integer. A brand that sets none is not checked. Neither source gives a number for "short", so the plugin does not choose one.
- `skip` lists pages (by their path from the docs folder, as findings give it) and assets (by id) that quote counter-examples on purpose, such as a voice page with a "Not" column. A path ending in `*` is a prefix.

A key the plugin does not know, a value of the wrong type and a term that is not a non-empty string are each an `option-invalid` finding, and the rule is left out.

### 2. What the check role reads

The check role receives `brand.json` and no files (RFC 0002 section 2). It reads `pages[].markdown` outside code spans and code fences (as in RFC 0004 section 3), and the strings of `assets[].meta` (`title`, `description`, `traits`, `do`, `dont`). A page's front matter title and description are read as well. Text inside a code span or fence is skipped, so a counter-example written as code is safe, which is why the usual "never" column is safe in a table of code spans.

### 3. Findings

Each code starts with the plugin's name and a `/` (RFC 0002 section 2). The checks are warnings: they are heuristics, and they cannot tell a counter-example from a mistake.

| Code                         | Severity | Means                                                                              |
| ---------------------------- | -------- | ---------------------------------------------------------------------------------- |
| `blazon.copy/option-invalid`  | error    | An unknown option, a wrong type, an empty term                                     |
| `blazon.copy/avoided-term`    | warning  | A term from `avoid`. The message gives the term, where it is and the group's `say` |
| `blazon.copy/heading-case`    | warning  | A heading in title case when `headings` is `sentence`                              |
| `blazon.copy/heading-length`  | warning  | A heading of more than `headings.maxWords` words. The message gives the count      |
| `blazon.copy/sentence-length` | warning  | A sentence of more than `maxWords` words. The message gives the count              |

The path is the page's path, or the asset's, as in other findings. More than 500 findings are a break under RFC 0002 section 2: the host rejects the whole answer with `plugin-failed` and does not cut it. The plugin bounds its own output before it prints it (the shipped plugins do so by bytes, in `src/shipped/shared/bound.ts`).

## Conformance

A change that follows this RFC is tested at these points:

1. **The rules.** Each wrong option of section 1 is an `option-invalid` finding and leaves the other rules in place.
2. **The check.** A fixture page and a fixture sidecar, each with text that breaks a rule and text that does not. The breaking ones are flagged and the others are not. A term in a code span or fence is not flagged. A page in `skip` is not read. A group with `only` applies to those pages alone, and a group with `skip` not to those pages. A heading over `headings.maxWords` is flagged and a paragraph of the same length is not.
3. **The edges.** A term ending in `*` matches the words that begin with it and no other character is special. Text in quotation marks is skipped only under `ignoreQuoted`. A scope path ending in `*` is a prefix. Sentences are split at a capital letter of any script, so a Bulgarian paragraph is several sentences and not one. A term inside a longer word (`robustness` against `robust`) is not flagged. An abbreviation such as `e.g.` does not end a sentence. A heading of two words is never flagged.
4. **The protocol.** `blazon plugin check ./plugins/blazon.copy/bin/blazon-blazon.copy.🔌`, run from a built checkout, passes the core cases and the `check` role's cases (RFC 0002, Conformance item 5).
5. **Every shipped plugin.** `test/plugins/shipped/conformance.test.ts` holds the folder to the checks RFC 0004 lists under its item 5, including a pin in `plugins/shipped.lock`.
6. **The starter.** `blazon check` on a new starter, whose config names the plugin with the voice page in `skip`, reports no copy warning; its only warnings are the two `starter-logo` ones, for the logos that are still blazon's. `test/build/first-run.test.ts` runs it.

## Drawbacks

- **A text check is a heuristic.** It misses a wrong form it does not recognise, and it flags an intended one written as plain text. A word list cannot say whether a sentence sounds like the brand.
- **Sentence and heading splitting are approximate.** Markdown, abbreviations and lists make a sentence hard to find without a parser. The first version uses simple rules and says so in each finding.
- **Another shipped plugin to keep:** a folder with a README, a lock entry, tests and a manual section.
- **One reader.** The rules are visible to this plugin only, until the promotion in RFC 0004 section 6 is taken.
- **A check no one can silence for one occurrence.** `skip` works for a whole page only (open question 3).

## Non-goals

- Judging tone, personality or clarity. Those are for a person.
- Spelling, grammar, readability scores, or translation quality.
- Rewriting text. The plugin reports and never edits a page.
- A rule that needs the meaning of a sentence, such as "write in the active voice".
- Replacing a general prose linter in a team that uses one (see Alternatives).

## Alternatives and prior art

1. **Status quo: prose in a voice page.** Cheap, and nothing holds the book to it.
2. **A general prose linter** such as Vale, whose styles are files of rules, run over the Markdown in the repository. Not read for this draft.
   - Pros: mature, with many rule types and editor support.
   - Cons: it reads text files, not the brand book. It does not know the pages it skips on purpose, the sidecar text, or which findings `blazon check` already reports. Two tools hold two lists of rules.
3. **A core config key `copy`, and a new standard section.** Blazon owns the rules.
   - Pros: every reader of `brand.json` gets them.
   - Cons: a change to RFC 0001 sections 13 and 14 for a feature no reference brand shows a structure for, before a second reader asks.
4. **A rule block in `blazon.formats` (RFC 0004).** One plugin for values and words.
   - Pros: one plugin to keep.
   - Cons: `blazon.formats` has a build role that writes code. This one has none. A brand that wants amounts without word rules, or the other way, would take both.
5. **A shipped plugin with the rules in its `options`, check role only.** This RFC.
   - Pros: no change to the core; the rules sit in the one config file; the same shape as RFC 0004 and a path to option 3.
   - Cons: the drawbacks above.

Recommendation: option 5. The choice turns on whether the rules are worth enforcing inside the brand book, and on whether a second reader needs them. Blazon's own book is the first case, and no second reader exists.

## Compatibility

Nothing breaks. `blazon.copy` is a shipped plugin an operator names to use. There is no config key and no `brand.json` field, so RFC 0001 is unchanged. The starter's config names it, with blazon's own rules, because it needs only Node. A brand that does not want it removes the entry.

## Security considerations

- **No pattern from the operator.** A term is text. A single trailing `*` makes it a stem, which is compared as a prefix of a word, and no other character is special, so no regular expression is built from a term and a term cannot cause a runaway match. A path in a scope is compared the same way. The splitting of sentences and headings MUST run in linear time on text of any length.
- **The check reads `brand.json` only.** It gets no file paths (RFC 0002 section 2). The check role allows at most 500 findings; the plugin keeps its answer under that.
- **The options are not secret.** The plugin accepts no secret field.
- **The plugin runs as any shipped plugin does**: pinned by `plugins/shipped.lock`, with the permissions of the person who runs blazon.

## Status

| Part                                                                  | State                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plugins, the `check` role, the lock for shipped plugins, `brand.json` | Built (RFC 0002 sections 2 and 3, RFC 0005, RFC 0001 section 12)                                                                                                                                                                                                                                                                                                                             |
| The custom section `voice` and the starter's voice page               | Built (`examples/blazon/docs/11-voice.md`)                                                                                                                                                                                                                                                                                                                                                    |
| `blazon.copy` and sections 1 to 3                                      | Built, with what two books' trials asked for: the scope of a group (`only`, `skip`), `headings.maxWords` and `headings.only` and `skip`, stem terms, `ignoreQuoted`, prefix paths in every scope, and Cyrillic sentence splitting: `src/shipped/copy/`, `plugins/blazon.copy/`, `test/plugins/shipped/copy.test.ts`, and the shipped-plugin conformance test. Documented in manual chapter 14 |
| Conformance item 6, the starter                                       | Built and tested: the starter's config names `blazon.copy` with blazon's rules and the voice page in `skip`, and `test/build/first-run.test.ts` checks that a new starter has no warning but the two `starter-logo` ones. Two long sentences on the logo page were split to meet the 25-word rule. Without `skip`, the voice page is flagged                                                                                       |
| Promotion to a config key                                             | Proposed, not specified further here                                                                                                                                                                                                                                                                                                                                                         |

As of 2026-10-31.

## Open questions

1. **Heading case.** Is "three or more words, every word after the first capitalized" the right test for title case, and how does a brand list proper nouns without listing every product?
2. **Sentences.** Is a regular-expression split good enough for the first version, or should the plugin read the Markdown into blocks first?
3. **One occurrence.** Is `skip` for a whole page enough, or does the check need an inline marker (a comment) for one line? Decided in part: `ignoreQuoted` exempts text in quotation marks, which is how a page quotes what it forbids. An inline marker is not built.
4. **Terms with a replacement.** Should a group carry a `use` that the check quotes, or is `say` enough advice?
5. ~~**Page kinds.** Should a rule apply to some pages only, such as the pages of one section, so a brand's legal page is not held to its marketing rules?~~ Decided: a group takes `only` and `skip`, lists of page paths (section 1). A scope by section is not built.
6. **Languages.** Sentences end at a capital letter of any script, so Cyrillic text is split, and a stem (`решени*`) finds the inflected forms of a word, which a whole-word match misses in a language like Bulgarian. The rules are still one set for every page: different words to avoid in each language mean `only` by path, as RFC 0004 does per language.
7. **Promotion.** What is the signal for moving the rules into the core: a second plugin, the deck, or a request from a brand?

## References

- [RFC 0001: Blazon data model](0001-data-model.md), section 12 `brand.json`, section 13 sections, section 14 configuration.
- [RFC 0002: Extension model](0002-extension-model.md), section 2 plugins and roles.
- [RFC 0004: Format rules](0004-format-rules.md), the sibling for values.
- [RFC 0005: Plugin protocol](0005-plugin-protocol.md).
