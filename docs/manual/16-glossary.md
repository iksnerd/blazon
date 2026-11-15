# Glossary

← [Manual index](index.md)

Every word blazon uses for a thing, in alphabetical order, with the chapter that explains it. A word that means two things (a role, a source, a check) has an entry for each. The formal definitions are in [RFC 0001](../rfc/0001-data-model.md) and, for plugins, [RFC 0005](../rfc/0005-plugin-protocol.md). [The data model](17-data-model.md) lists the fields behind these words.

| Word | Means | Chapter |
|---|---|---|
| Alias | A token whose whole value is another token's path in braces: `{color.primary.indigo}`. It is written with the value it resolves to in the outputs | [2](02-tokens.md) |
| Answer | What a plugin prints on standard output for one call: a JSON object with its `findings`. Exit status `0` is an answer, and `2` means the plugin cannot answer, with the reason on the first line | [13](13-writing-a-plugin.md) |
| Approval | A person's confirmation that a value is right: `review.status: ok`, with who confirmed it (`by`), when (`at`) and a fingerprint of the value (`value`). `blazon approvals` lists them, and `approval-stale` says a value changed after it was approved | [2](02-tokens.md) |
| Asset | An image file in `assets/`: SVG, PNG, JPEG, GIF, WebP or AVIF. Its category is the folder it is in | [6](06-assets-and-icons.md) |
| Asset category | A folder of assets that the brand book shows as a page. The `assets` block of `blazon.config.ts` gives it a label, an order, a description and the rules its files must meet | [6](06-assets-and-icons.md) |
| Brand book | The static site blazon builds. It looks like the brand it documents | [7](07-theme-and-config.md) |
| `brand.json` | The whole brand in one versioned file, which `blazon build` writes beside the site: tokens with their rules, pages, assets, categories and findings. It is for tools in any language, and a `check` plugin receives it | [11](11-brand-json.md) |
| Breaker | The host's guard against a plugin that keeps failing: after repeated failures it stops calling that plugin for the rest of one blazon command. The dev server uses a cooldown instead | [12](12-plugins.md) |
| Build role | The plugin role that turns the brand into something else (a deck, native color files, a press kit). Blazon calls it only in `blazon build`, after the site is written | [13](13-writing-a-plugin.md) |
| Call | One run of a plugin's program for one request. A plugin starts fresh for each call | [13](13-writing-a-plugin.md) |
| Check | The test of a brand against its own rules: the command `blazon check`, which prints findings and exits `1` on an error | [3](03-checks.md) |
| Check role | The plugin role that adds findings. It receives `brand.json` and no files, and runs in `blazon check`, `blazon tokens`, `blazon build` and `blazon dev` | [13](13-writing-a-plugin.md) |
| Context | One value of a modifier in the resolver document, such as `locale` = `ja`. It replaces some token values and is compiled to its own CSS block | [4](04-contexts.md) |
| Contrast pair | A foreground and a background token with the lowest contrast the brand accepts between them (`AA`, `AA-large` or `AAA`), stated in `pairs` on a group. `blazon check` tests it | [2](02-tokens.md) |
| Custom section | A section a brand adds with `customSections` in `blazon.config.ts`, beside the standard ones: a voice and tone page, for example | [5](05-pages.md) |
| Deny | A usage rule: `usage.deny` lists the roles a color must not be used for, such as `text`. `blazon check` reports a token that breaks it | [2](02-tokens.md) |
| `dev.blazon` | The extension in `$extensions` where a token or group states brand rules DTCG has no field for: usage, tier, print values, review, logo rules, proportion | [2](02-tokens.md) |
| Directive | An HTML comment in a page, such as `<!-- blazon:tokens color.primary -->`, that blazon replaces with live content | [5](05-pages.md) |
| Drift | A difference between a token's value and the value of the live site's CSS variable it was read from (`source.cssVar`). `blazon drift` reports it | [3](03-checks.md) |
| DTCG | The Design Tokens Community Group's format. Blazon reads the 2025.10 token format and the 2025.10 resolver format | [2](02-tokens.md) |
| Experimental category | An asset category of explorations, such as logo directions that are not the identity. Its assets do not gate the book, the book labels them "Experiment", and the deliverables leave them out | [6](06-assets-and-icons.md) |
| Finding | One result of `blazon check`: a `code`, a severity, a `path` and a message. A plugin can add its own, with its name in the code | [3](03-checks.md) |
| `blazon.lock` | The file `blazon pin` writes: the commit of the blazon that builds this brand. `check`, `tokens` and `build` refuse any other blazon | [15](15-maintaining-a-brand-book.md) |
| `blazon.plugins.lock` | The file that records the digests of the plugins the operator has pinned, so a plugin that changed on disk does not run | [12](12-plugins.md) |
| Group | A set of tokens under one name, such as `color.primary`. It can carry `dev.blazon` fields that every token in it inherits | [2](02-tokens.md) |
| Host | What starts a plugin, sends it a request and judges its answer. Blazon is the host | [12](12-plugins.md) |
| Icon set | An icon package from `node_modules` that the brand book previews by category | [6](06-assets-and-icons.md) |
| Lockup | An arrangement of a logo's artwork: `horizontal`, `stacked`, `mark` or `wordmark`, or a name the brand adds to its vocabulary | [6](06-assets-and-icons.md) |
| Manifest | What a plugin prints for `--blazon-manifest`: the roles it fills, its timeout, a title, a description and a version | [13](13-writing-a-plugin.md) |
| Modifier | An axis in the resolver document, such as `locale` or `theme`. Each of its values is a context | [4](04-contexts.md) |
| Needs-review | A review status: the value is known or suspected to be unconfirmed. `blazon check` lists every one until a person marks it `ok` | [2](02-tokens.md) |
| Operator | Whoever owns the brand book's repository, and so decides which plugins may run | [12](12-plugins.md) |
| Page | A Markdown file in `docs/`. It is a chapter of the brand book | [5](05-pages.md) |
| Path | A token's address, written with dots: `color.primary.indigo`. A finding's `path` is the token or group it is about, or a file name | [2](02-tokens.md) |
| Pin | A digest recorded in a lock file, so that a plugin, or blazon itself, that changed on disk does not run. `blazon plugin pin` prints a plugin's digest and `blazon pin` records blazon's commit | [12](12-plugins.md) |
| Plugin | A program, in any language, that blazon runs for a check or a build step. It reads one JSON request on standard input and answers in JSON | [12](12-plugins.md) |
| Plugin role | The part a plugin plays: `check` or `build`. A plugin is called only for a role its manifest lists | [13](13-writing-a-plugin.md) |
| Primitive, semantic, component | The three values of a token's `tier`: `primitive` (a raw value), `semantic` (a role, aliasing a primitive) and `component`. A semantic or component token with no alias gets the warning `semantic-literal` | [2](02-tokens.md) |
| Profile | A document that states what a host does: the roles it defines, exit codes, limits and secrets. `blazon plugin profile` prints blazon's | [12](12-plugins.md) |
| Proportion | A group-level field: the documented share of a composition each color or group takes. The brand book draws it as a bar | [2](02-tokens.md) |
| Reference category | An asset category of material that follows the guidelines but is kept for comparison, or was supplied by someone else, such as card faces extracted from the guidelines or a favicon set from another team. Its assets do not gate the book, the book labels them "Reference", and the deck leaves them out | [6](06-assets-and-icons.md#reference-categories) |
| Resolver document | A JSON file, `blazon.resolver.json`, that lists the token files, the modifiers and their contexts. It is optional | [4](04-contexts.md) |
| Review | The field that records whether a person has confirmed a value: a `status` of `ok` or `needs-review`, and optionally a note, who, when and a fingerprint | [2](02-tokens.md) |
| Review page | The page of the brand book, under Quality, that lists every error and warning `blazon check` found, and what has been approved and by whom | [3](03-checks.md) |
| Rule | A statement in `dev.blazon` or in a sidecar that `blazon check` can test, such as "never use this color for text" or "at least 16 pixels wide" | [2](02-tokens.md) |
| Section | A standard part of a brand book that a page says it holds with `section:` in its front matter. There are fourteen standard sections, and `blazon check` notes each that no page holds | [5](05-pages.md) |
| Severity | How serious a finding is: `error` fails the check, `warning` does not unless `--strict` is given, and `info` is a note | [3](03-checks.md) |
| Shipped plugin | A plugin in blazon's own package. It is named in the config and needs no install and no pin from the operator | [14](14-shipped-plugins.md) |
| Sidecar | A JSON file beside an asset, with the same name, that states its title, rules, review and provenance | [6](06-assets-and-icons.md) |
| Source | Two things. On a token or an asset, `source` says where the guidelines state the value (a document and a place in it), and a token's `source.cssVar` names the live site's variable it was read from | [2](02-tokens.md) |
| Starter | Blazon's own brand book, `examples/blazon/`, which `blazon init` copies into a new project: tokens, pages and artwork that are blazon's until you replace them. `blazon check` notes each file that is still the starter's as `starter-file` | [1](01-getting-started.md) |
| Theme role | A part of the brand book's own look (background, accent, display font) that takes its value from one of your tokens | [7](07-theme-and-config.md) |
| Tier | Where a token sits: `primitive`, `semantic` or `component`. See *Primitive, semantic, component* | [2](02-tokens.md) |
| Token | One named value in a token file, such as a color or a size. It is an object with a `$value` | [2](02-tokens.md) |
| Type | The kind of value a token holds, written `$type`: `color`, `dimension`, and so on. Blazon never guesses it | [2](02-tokens.md) |
| Usage role | A purpose a color may be put to: `text`, `background`, `border`, `icon`, `illustration`, `accent` or `interactive`, or a name the brand adds to its vocabulary | [2](02-tokens.md) |
| Vocabulary | A list of names that blazon checks a value against and otherwise does not interpret: logo lockups and usage roles, each the standard ones and then the brand's own. Sections have the same two kinds | [7](07-theme-and-config.md) |
