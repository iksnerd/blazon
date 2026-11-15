# Working in this brand folder

This folder is a brand book made with blazon. Tokens, Markdown pages and assets are the source; `blazon` compiles them into CSS, a typed module and a static site, and `blazon check` reports where they break the brand's own rules. These notes are for an agent that edits the brand or builds a site in its look.

The manual is the `docs/manual/` folder of the blazon source repository; it is not in the installed package. A chapter is named here by its title, as the `checks` chapter, which is `docs/manual/03-checks.md`.

## How an agent should use blazon

Run commands from the folder that holds this file, or pass the folder as the last argument.

1. Run `blazon check --json --severity warning`. It prints one JSON document with `passed`, `counts` and `findings`. Exit 0 means no errors; `--strict` also fails on warnings.
2. For each finding, read `code`, `message`, `path`, `file`, `line` and `fix`, and edit the file it names. The `checks` chapter describes every code; look it up, do not guess.
3. Check again until `counts.errors` is 0, then run `blazon build`.

- Never edit `dist/`. `blazon tokens` writes `dist/tokens/` (`theme.css`, `tokens.ts`, `tokens.json`) and `blazon build` also writes the site to `dist/site/`; both overwrite it, and both stop on an error. `--no-plugins` builds without Google Chrome.
- The brand lives in `tokens/` (DTCG JSON, `{ "$value": ..., "$type": ... }`, an alias is `"{color.ink.graphite}"`), `docs/` (numbered Markdown pages), `assets/` (images, each with a JSON sidecar of the same name: `mark.svg` and `mark.json`), `blazon.config.ts` (title, theme, logo, plugins) and `blazon.resolver.json` (the token files that load, and the themes; a new token file is listed in `sets` there or it is not read; dark is `tokens/theme/dark.json`).
- Safe to change: token values, pages, assets with their sidecars, and the title and theme in `blazon.config.ts`. Everything under "Do not touch" needs the person.
- `blazon dev` serves the book with live reload; `-p <port>` sets the port.

Codes you meet first:

- `starter-file` (note): a file is still blazon's own text. The notes are the list of what is left to replace; they never fail a check.
- `starter-logo` (warning): a configured logo is still blazon's mark. Only the person's own logo clears it.
- `needs-review` (warning): a value is marked `review.status: needs-review`. Only a person clears it.

## Rules that cost time

- Put a value in `tokens/` once. In a page, use a directive such as `<!-- blazon:tokens color.signal -->`, not the hex (the `pages` chapter lists them). A directive inside a code fence is not run.
- Rules live next to the values under `$extensions["dev.blazon"]` (`usage`, `pairs`, `review`). Never remove a rule or the `logo` to clear a finding; fix the value or ask. The `usage` rule on `color.signal` and the `pairs` rule on `text` are blazon's own: replace them with the new brand's.
- Replace starter files in groups and check after each: tokens, then pages, then assets, then `blazon.config.ts`. Most errors of a rebrand are a page or token still pointing at something removed.
- A passing check does not mean the rebrand is done: the starter passes too. You are done when no `starter-file` note remains except files you chose to keep, and you list those.

## The MCP server

`blazon mcp` sets up blazon-mcp, a server that answers questions about this brand as Model Context Protocol tool calls: `check_brand`, `list_tokens`, `get_token`, `get_rules`, `can_use`, `get_fonts`, `get_logo`, `get_shadcn`. It is not published yet, so it runs only from a blazon source checkout with the server built. Run `blazon mcp --check` to learn whether it is ready; each failed check names the `fix` to run. Without it, the commands above do the same work. Setup: the `blazon-for-agents` chapter.

## Building a site from this brand

Read the `building-a-website` chapter first. Build on a brand that passes `blazon check`; take every color, font and size from `dist/tokens/`, never a literal; follow the `usage`, `pairs` and logo rules; take fonts and logo paths from `dist/site/brand.json`. Where the pages do not state a decision (a button, section spacing, where the logo goes), ask the person and list the question in your report.

## Do not touch, unless asked

- The `plugins` list in `blazon.config.ts`, and `.blazon/plugins/`.
- `blazon.lock` and `blazon.plugins.lock`; a person writes them with `blazon pin` and `blazon plugin pin`.
- The `review` block of a token or sidecar, except to flag a value. Never set `status: ok`, `by` or `at` yourself.

## Ask the human

Do not invent a fact about the brand. Ask for a color, a font family or a logo file (never guess a hex from a screenshot), a font license, wording that makes a claim for the brand, and anything a source states that you could not find. To flag a value, put this on the token, group or sidecar, with your question in `note`:

```json
"$extensions": { "dev.blazon": { "review": { "status": "needs-review", "note": "Is Inter allowed under its OFL license?" } } }
```

When you finish, report what you changed, the last `blazon check` counts, and every value you left flagged for a person.
