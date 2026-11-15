<!--
Rules for editing this manual, which GitHub and a website both render:
- One H1 per file, chapters as H2, sections as H3. Renaming a heading breaks links to it.
- GitHub-flavoured Markdown only: tables and fenced code with a language tag. No raw HTML.
- Links are relative to the file. test/docs/manual.test.ts checks every link and anchor, and checks that every
  command, flag, config key, directive, dev.blazon field and finding code in the code is mentioned here.
-->

# Blazon manual

Blazon turns a folder of design tokens, Markdown guideline pages and brand assets into CSS variables, a typed TypeScript module, and a static brand book. This manual shows how to use it, in the order you meet things. Blazon is a command-line tool, so every step needs a terminal and Node.

Brand authors write the tokens, rules and pages: chapters [2](02-tokens.md) to [7](07-theme-and-config.md), with [chapter 9](09-derive-your-own.md) as a worked example. Developers use what blazon writes: [chapter 8](08-using-the-outputs.md). People who run blazon in a CI job need [chapter 1](01-getting-started.md) for the commands and [chapter 3](03-checks.md) for what fails a build.

The formal data model is [RFC 0001](../rfc/0001-data-model.md). The manual says how to do things; the RFC says what is required. The [README](../../README.md) is the short overview.

Some links in the manual leave `docs/manual/` and resolve only in the repository. A site that mirrors the manual should rewrite them to `https://github.com/iksnerd/blazon/blob/<ref>/<path>`, where `<ref>` is a tag or branch and `<path>` is the link with its leading `../` removed. The prefixes that occur are `../rfc/`, `../../README.md`, `../../SECURITY.md`, `../../examples/`, `../../scripts/` and `../../src/`. `test/docs/manual.test.ts` fails when a link starts with any other path outside the manual, so this list stays complete.

## Words blazon uses

The short list is below. [The glossary](16-glossary.md) has every word the manual uses, and [the data model](17-data-model.md) lists the fields behind them.

| Word | Means |
|---|---|
| Token | One named value in a token file, such as a color or a size. It is an object with a `$value` |
| Group | A set of tokens under one name, such as `color.primary` |
| Path | A token's address, with dots: `color.primary.indigo` |
| Alias | A token whose whole value is another token's path in braces: `{color.primary.indigo}` |
| Type | The kind of value a token holds, written `$type`: `color`, `dimension`, and so on. Blazon never guesses it |
| `dev.blazon` | The extension where a token or group states brand rules DTCG has no field for: usage, print values, review flags |
| Rule | A statement in `dev.blazon` that `blazon check` can test, such as "never use this color for text" |
| Starter | Blazon's own brand book, `examples/blazon/`, which `blazon init` copies into a new project: tokens, pages and artwork that are blazon's until you replace them |
| Finding | One result of `blazon check`: an error, a warning or a note |
| Resolver document | A JSON file, `blazon.resolver.json`, that lists the token files and the contexts. Optional: [chapter 4](04-contexts.md) |
| Context | One value of a modifier in the resolver document, such as `locale` = `ja`. It replaces some token values |
| Page | A Markdown file in `docs/`. It is a chapter of the brand book |
| Directive | An HTML comment in a page, such as `<!-- blazon:tokens color.primary -->`, that blazon replaces with live content |
| Asset | An image file in `assets/`: SVG, PNG, JPEG, GIF, WebP or AVIF |
| Sidecar | A JSON file beside an asset, with the same name, that states its rules |
| Icon set | An icon package from `node_modules` that the brand book previews by category |
| Theme role | A part of the brand book's own look (background, accent, display font) that takes its value from one of your tokens |
| Brand book | The static site blazon builds. It looks like the brand it documents |
| Review page | The page of the brand book, under Quality, that lists every error and warning `blazon check` found, and what has been approved and by whom |

## Chapters

1. [Getting started](01-getting-started.md): install, create a brand (from the starter, or from a live site with `--from`), the first run, the commands.
2. [Tokens](02-tokens.md): writing token files, aliases and the `dev.blazon` rules.
3. [Checks](03-checks.md): what `blazon check` tests, how it prints, every finding it reports, and `blazon drift`.
4. [Contexts](04-contexts.md): values that change by locale or theme.
5. [Pages](05-pages.md): writing guideline pages and placing live content.
6. [Assets and icons](06-assets-and-icons.md): images, their sidecars, and icon sets.
7. [Theme and configuration](07-theme-and-config.md): `blazon.config.ts` and how the book gets its look.
8. [Using the outputs](08-using-the-outputs.md): the CSS (including a Tailwind theme), TypeScript and JSON blazon writes.
9. [Derive your own brand](09-derive-your-own.md): a worked scenario, from a company's guidelines deck to a brand book.
10. [Troubleshooting](10-troubleshooting.md): what you see and what it means.
11. [brand.json for other tools](11-brand-json.md): the whole brand in one file, for tools in any language.
12. [Plugins](12-plugins.md): allow, pin and run a plugin, how blazon runs the ones it ships, and `blazon dev`.
13. [Writing a plugin](13-writing-a-plugin.md): the manifest, a call, the answer of each role, and how to check a plugin.
14. [Plugins that ship with blazon](14-shipped-plugins.md): what each one writes and how to set it up.
15. [Maintaining a brand book](15-maintaining-a-brand-book.md): a routine for a team: what is generated, pinning blazon, making and checking a change, approval and landing it.
16. [Glossary](16-glossary.md): every word blazon uses, in alphabetical order, with the chapter that explains it.
17. [The data model](17-data-model.md): everything blazon reads, holds and writes, field by field, and the lists a value is checked against.
18. [Stability and compatibility](18-stability.md): what a brand can rely on across pin changes, how a breaking change is made, and how to move a pin.
19. [Building a website from a brand](19-building-a-website.md): reading a brand's rules and values so a site or an app follows it, for a developer or a coding agent.
20. [Blazon for agents (MCP)](20-blazon-for-agents.md): the read commands as tools a coding agent can call, over the Model Context Protocol.
