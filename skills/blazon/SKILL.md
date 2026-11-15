---
name: blazon
description: Works on a blazon brand book (a folder with tokens/, docs/, assets/ and blazon.config.ts) - checks it, reads token values and rules, tests color contrast, and edits tokens, pages and assets. Use when a task touches such a folder or builds a site in its look. Not for other design-token tools or for editing blazon's own source code.
---

# Working with a blazon brand book

A brand book is a folder: `tokens/` (DTCG JSON), `docs/` (Markdown pages), `assets/` (files with JSON sidecars), `blazon.config.ts` and `blazon.resolver.json`. `blazon` compiles it and `blazon check` reports where it breaks its own rules. If the folder has an `AGENTS.md`, read it too: it is the brand's own notes. The manual is `docs/manual/index.md` in the blazon repository.

## The loop

1. `blazon check --json --severity warning` prints one JSON document: `passed`, `counts`, `findings`. Run it from the brand folder, or pass the folder last. Exit 0 means no errors; `--strict` also fails on warnings.
2. For each finding, read `code`, `message`, `path`, `file`, `line` and `fix`. Edit the file it names, then check again until `counts.errors` is 0.
3. `blazon can <fg> <bg>` before you put one color on another. It exits 0 when allowed and 1 when denied, and prints the rule behind the answer. `--role ui` judges a border or focus ring at 3:1, and `--theme dark` judges the pair in the dark context.
4. `blazon explain <code>` says what a finding code means and how to clear it. `blazon explain` with no code lists every code. The manual's table of codes is in `docs/manual/03-checks.md`.
5. `blazon build` (or `blazon tokens`) when the check passes. `--no-plugins` builds without a browser.

Read commands that answer without a build: `blazon list [group]`, `blazon get <path>`, `blazon rules [path]`, `blazon fonts`, `blazon logo`, `blazon brand --key theme.shadcn`. `blazon brand` prints JSON already; the others take `--json`.

## The MCP tools

If the client has the blazon MCP server, use its tools instead of reading token files. They are read-only. Setup: `blazon mcp --check`, then `docs/manual/20-blazon-for-agents.md`.

| Tool | Use it to |
|---|---|
| `check_brand` | start a session: findings and counts, without plugins |
| `list_tokens` | find a token path, by `group` or `type` |
| `get_token` | read one token's value, CSS variable names and rules |
| `get_rules` | learn what a token, group or the brand allows and forbids |
| `can_use` | ask whether one color may be text on another (`role: "ui"` for borders) |
| `get_fonts` | find the stylesheets and files to load |
| `get_logo` | read logo variants, clear space and forbidden backgrounds |
| `get_shadcn` | read the shadcn/ui variables the brand supplies |

A denied `can_use` is a normal answer (`allowed: false`), not an error. When a result says `brandHasErrors`, values may be wrong: run `check_brand` and fix the errors first. The server does not run plugins, so a finding only a plugin raises is not in its answer.

## Where things live

- Tokens are every `.json` file in `tokens/`; they merge into one tree, and the file name is not part of the path. A token is an object with `$value`. A bare value is an error.
- `$type` comes from the token or the nearest group above it. Blazon never infers it. A token with none is `token-type-missing`; a value that does not fit its type is `token-value-invalid`. The types are in `docs/manual/02-tokens.md`.
- An alias is the whole value, written `{color.ink.graphite}`. Text around an alias is `alias-embedded`.
- Brand rules sit under `$extensions["dev.blazon"]` next to the value: `usage`, `pairs`, `role`, `tier`, `review`. They are not DTCG fields. Do not remove one to clear a finding.
- `blazon.resolver.json` lists the token files that load and the themes. A new token file must be added to `sets` there or it is not read.
- An asset in `assets/` has a sidecar with the same name (`mark.svg` and `mark.json`). See `docs/manual/06-assets-and-icons.md`.

## Never edit

- `dist/`: `blazon tokens` and `blazon build` overwrite it. Change the source and build again. Take colors, fonts and sizes from `dist/tokens/` and logo and font paths from `dist/site/brand.json`, never a literal.
- `blazon.lock` and `blazon.plugins.lock`: a person writes them with `blazon pin` and `blazon plugin pin`.
- The `plugins` list in `blazon.config.ts`, and the `review` block of a token or sidecar. Never set `status: ok`, `by` or `at`.

## Reading a finding

`code` names the rule, `path` the token or asset, `file` and `line` where to edit, `fix` one sentence on what to do. A finding with no `fix` is a question for the person. An error stops `blazon tokens` and `blazon build`; a warning is printed and fails only with `--strict`; a note never fails. `docs/manual/03-checks.md` lists every code, and `docs/manual/10-troubleshooting.md` covers common failures. Do not guess a code's meaning.

A `starter-file-unchanged` note and a `starter-logo-unchanged` warning mean the file is still blazon's own text. `review-pending` means a person has not approved the value. Flag a value you are unsure of by setting `review.status` to `needs-review`, with your question in `note`.

## Add a token

1. Pick the file in `tokens/` that holds its group, or add a file and list it in `blazon.resolver.json`.
2. Write `{ "$value": ..., "$type": ... }` (or put `$type` on the group), using an alias where the brand has a primitive for it.
3. Add its `usage` or `pairs` rules next to it if the group has them.
4. Run `blazon check`, then `blazon get <path>` to confirm the value and CSS variable.

## Add a page

1. Add `docs/NN-name.md`. The number sets the order and the rest is the address.
2. Write the front matter (`title`, `group`, `description`, `section`) as in `docs/manual/05-pages.md`. Do not repeat the title as an H1.
3. Show a value with a directive such as `<!-- blazon:tokens color.signal -->`, not a hex. A directive in a code fence does not run.
4. Run `blazon check`, then look at the page with `blazon dev`.

## Ask the person

Do not invent a color, font family, logo file, font license or claim about the brand. Ask, list the question in your report, and finish with what you changed, the last `blazon check` counts and every value you flagged.
