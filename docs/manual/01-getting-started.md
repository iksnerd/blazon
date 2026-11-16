# Getting started

← [Manual index](index.md)

Blazon is at version 0.1.0 and is on npm as `@iksnerd/blazon`. It is 0.x, so a minor version may break ([chapter 18](18-stability.md)). The npm package named `blazon` is an unrelated project, so `npx blazon` in a folder where `@iksnerd/blazon` is not installed runs the wrong package. `package.json` asks for Node 24 or later (`engines`). It is tested on macOS and Linux; Windows (WSL) is untried.

## Install

In the folder that holds your brand, or in the project that builds it:

```bash
npm install @iksnerd/blazon
npx blazon --version       # prints blazon/0.1.0, then your platform and Node version
npx blazon init my-brand
npx blazon dev my-brand
```

After the install, `npx blazon` runs the installed program, and so does `./node_modules/.bin/blazon`. To run it once without installing, write `npx @iksnerd/blazon <command>`. The rest of this manual writes `blazon` for either. If port 3000 is busy, the dev server takes the next free port and prints it; `--strict-port` exits 2 instead.

## Install from a clone

To work on blazon, or to see a finished brand first, clone the repository. `npm run dev:blazon` serves blazon's own brand book from source at <http://localhost:3000>.

```bash
git clone https://github.com/iksnerd/blazon.git
cd blazon
npm install
npm run build              # compiles dist/, which bin/blazon.js runs
node bin/blazon.js init my-brand
node bin/blazon.js dev my-brand
```

`npm link` in the clone puts `blazon` on your PATH; without it, write `node bin/blazon.js` in its place, run from the clone.

## What `blazon init` creates

`blazon init` copies blazon's own brand book, `examples/blazon/`, into the folder. A new book starts as blazon's brand and becomes yours as you replace it, one file at a time.

```text
my-brand/
├── tokens/        colors.json, typography.json, spacing.json, form.json, social.json
├── docs/          twelve pages, 01-principles.md to 12-web.md: principles, logo, color, type, form, layout, icons, diagrams, social, applications, voice and tone, web
├── assets/        logos/ (blazon's mark on light and on dark, each with a sidecar), construction/ (the figure that shows how the mark is built),
│                  backgrounds/ (one background), icons/ (six icons, each with a sidecar)
├── fonts/         IBMPlexMono-Regular-latin.woff2, IBMPlexMono-SemiBold-latin.woff2 and their licence, OFL.txt: the example of a font file the brand carries
├── AGENTS.md      notes for a coding agent that edits the brand
├── CLAUDE.md      one line that points Claude Code to AGENTS.md
└── blazon.json
```

The brand book is named after the project folder: `blazon init acme-brand` titles it "Acme Brand Book": a folder name that ends in `brand`, `book`, `guide` or `guidelines` is not repeated. Its description is a plain line, not blazon's. `AGENTS.md` tells a coding agent how the folder works: the check-and-fix loop on `blazon check --json`, where the brand data lives and what is safe to change, the MCP server and its tools, what not to touch and when to ask you for a fact. It links this manual on the blazon website, where each page is also served as Markdown. It is guidance, not brand text, so `blazon check` does not note it as a starter file; keep it, edit it or delete it. Existing files are kept, so running `blazon init` in a project that has some of them is safe.

Everything in the copy that is blazon's identity is blazon's until you replace it: its logo, its type scale and fonts, its colors and the pages written about blazon. `blazon check` notes each such file as `starter-file-unchanged` while it is byte for byte what `init` wrote, so the notes are the list of what is left to replace. The config is not noted: `init` sets its title and description, and the rest is yours to edit. It enables one plugin, `blazon.copy`, which holds the pages to blazon's own word rules and needs only Node; edit its `options` to your brand's, or remove it. The example's other plugins (the deck, social cards, favicons, logo kit, press kit, platform tokens and Office template) mostly draw in Google Chrome, and a first `blazon build` should not need a browser, so they are in the config as a comment inside the `plugins` list; uncomment the ones you want once Chrome is installed ([chapter 14](14-shipped-plugins.md)).

The starter is not a second copy kept beside the example. From a clone, `blazon init` reads `examples/blazon/`. The npm package, which is what `npm install @iksnerd/blazon` gives you, carries a `template/` folder that `npm pack` makes from the example (`npm run build-starter`, run by `prepack`) and git does not track.

The starter tokens are blazon's own, and later chapters use these names when they say "the starter":

| File | Defines |
|---|---|
| `colors.json` | `color.*`, the raw palette (`color.base.*` surfaces, `color.ink.*` text and rules (with `color.base.carbon` and `color.ink.zinc` for the dark theme), `color.signal.*` the action colors); and the roles that alias it: `text.*`, `surface.*`, `interactive.primary` and `rule.*` |
| `typography.json` | `font.family.display`, `.body` and `.mono`, `font.weight.*` and the text styles `type.display` to `type.label` and `type.code` |
| `spacing.json` | `space.*` |
| `form.json` | `radius.*`, `border.*`, `shadow.plate`, `shadow.shim` and `shadow.recess`, and `motion.*` |
| `social.json` | `social.format.*`, three social post sizes |
| `theme/dark.json` | The dark theme: new values for `text.*`, `surface.*`, `rule.*` and the three shadows. `blazon.resolver.json` loads it as the `dark` context of the `theme` modifier ([chapter 4](04-contexts.md)), and loads the five files above as the base |

The brand has one signal color. `interactive.primary` is it, `text.onSignal` is the ink on it, and the viewer's theme reads these names without a `theme` block ([chapter 7](07-theme-and-config.md)). There is no hover color, secondary color, accent or gradient to replace.

## The first run

`blazon init acme-brand` lists what it wrote and the next steps:

```text
  ✔ Created tokens/ (6 files: colors.json, form.json, social.json, spacing.json, theme/dark.json, typography.json)
  ✔ Created assets/ (22 files in 4 folders: backgrounds, construction, icons, logos)
  ✔ Created docs/ (12 pages, 01-principles.md to 12-web.md)
  ✔ Created blazon.json
  ✔ Created blazon.resolver.json

Next steps:
  1. Edit acme-brand/tokens/colors.json with your colors
  2. Run blazon dev acme-brand to see the book
  3. Replace blazon's artwork in acme-brand/assets/ and the text in acme-brand/docs/
  4. Run blazon check acme-brand to see what is left
  5. Point a coding agent at acme-brand/AGENTS.md: it is the guide for editing this brand
```

Each step works from the folder you ran `blazon init` in. With `--color`, the first step says the primary color is set and the rest of the palette is still blazon's.

Run `blazon check acme-brand` straight away and it exits 0: it reports 0 errors, 2 warnings and 43 notes. The notes are every starter file in `docs/`, `tokens/`, `assets/` and `fonts/`, grouped by folder. `AGENTS.md` and `CLAUDE.md` get none. The warnings are `starter-logo-unchanged`: the two logos in `blazon.json` are still blazon's own mark, and the book would show it under your name until you replace them. It then repeats the first three steps under `Next:`. The list shrinks as you replace files. [Chapter 3](03-checks.md#how-the-findings-are-printed) explains the grouping.

## The smallest project

Blazon needs less than the starter. Two files make a brand book. In a new folder, write `tokens/colors.json`:

```json
{
  "color": {
    "$type": "color",
    "brand": { "$value": "#2563EB" },
    "ink": { "$value": "#0F172A" }
  }
}
```

and `docs/01-intro.md`:

```markdown
---
title: Hello
---

## Colors

The brand color is `color.brand`.

<!-- blazon:tokens color -->
```

Then run `blazon dev` in that folder. The page shows both colors as cards, and `color.brand` in the text links to its token and is drawn as a badge. `blazon check` prints one note, `theme-missing`: with no `theme` and no conventionally named tokens, the book uses blazon's neutral colors until you set one ([chapter 7](07-theme-and-config.md#theme-roles)).


## Starting from a live site

`blazon init acme-brand --from https://acme.com` copies the starter as usual, then replaces blazon's colors, fonts and logo with what the company's site shows, so the first `blazon dev` already wears the brand's colors, fonts and logo. It is a starting point: the brand owner has not confirmed any of it.

It reads the page and up to 20 of its stylesheets (5 MB and 10 s each, http and https only, the same limits as `blazon drift`), and writes:

- **Colors.** The first 40 custom properties whose name has `brand`, `primary`, `secondary`, `accent`, `background`, `foreground` or `surface` in it, when the value is an opaque hex color or `rgb()` (converted to hex). A color with alpha is an overlay and is skipped, and so is a property that holds the text on a color: a name ending in `-foreground` (but not `--foreground` itself), `-on-dark` or `-on-light`. `--brand-primary` becomes the token `color.brand.primary`. The starter's `interactive.primary` then aliases the site's primary, and keeps blazon's orange when the site names none. The site's other brand colors are kept as primitives that nothing aliases: the starter has no secondary or accent role to point at them.
- **Fonts.** The first family that is not generic in the `font-family` of `body` and of the headings, as `font.family.body` and `font.family.display` (the body family fills both when the headings name none). `font.family.mono` stays blazon's and is marked `needs-review`. A family from a short built-in list of common Google Fonts gets its stylesheet added to `fonts` in `blazon.json`. For any other family the token says in its review note that the stylesheet must be added.
- **Logo.** The SVG in the header's link to `/` (inline, or an `<img>` of an `.svg`), else the first SVG in the header, else an SVG favicon. An inline SVG that draws in `currentColor` is saved twice, `assets/logos/<name>.svg` in dark and `<name>-white.svg` in white, and `logo` gets `onLight` and `onDark`. With no SVG, a PNG, JPG, GIF, WebP or AVIF favicon or `apple-touch-icon` is saved instead, and the output says it is not a logo.
- **Title and description.** The site's own name as the config `title`: `og:site_name`, `application-name`, or the short name in its web app manifest (`<link rel="manifest">`); failing those, the page's `<title>` up to the first ` | `, ` - ` or ` : `. The page's `<meta name="description">`, if it has one, becomes the config `description`.

Each token that came from a stylesheet variable names it in `source.cssVar`, so `blazon drift https://acme.com` compares it afterwards. A color that was `rgb()` is written without a `cssVar`, because the hex form would never match, and so are fonts. Every new color group, alias, font token and logo sidecar is marked `needs-review` with the note "Read from <url> on <date>: confirm with the brand owner.", so `blazon check` lists them until someone confirms and removes the mark.

Then it tidies the starter. A starter color that no token aliases (followed through other aliases) and that no page or `blazon.json` names is deleted: with a site primary, that is blazon's orange and hazard yellow. `text.primary`, `surface.background` and `surface.canvas` move to a site color named for the role (`foreground`, `background`, `card`) and stay as they were without one. The contrast pair for `text.onSignal` follows the site's primary, and the ink on it is graphite, or bone when graphite is under AA (4.5:1) on that color and bone is not; when neither reaches it, the output says so and `blazon check` reports the pair. When a logo was written, blazon's `blazon-graphite` and `blazon-bone` files (`.svg` and `.json`) are deleted, their rules (clear space, minimum size, placement, partnership) move to the site logo's sidecar as defaults to set, and `docs/01-principles.md` is rewritten with the site's name, description, address and the date. Each removal and change is printed on its own line.

It never overwrites: it changes only the files `blazon init` created in the same run, and a logo file that already exists is kept. It sends no cookies, runs no script from the site (SVG scripts and event handlers are removed) and never makes up a logo. It prints each file it wrote and each thing it could not find. If the site cannot be fetched, the starter stays as copied, the error is printed and the exit status is 2.

## The guided start

Run `blazon init` in a terminal with no options and it copies the starter, then walks you through four short steps. Each question has a line under it saying why it is asked, and Enter accepts the default:

1. **Brand.** The brand name becomes the config `title` as you typed it, with no "Brand Book" added. Enter keeps the name taken from the folder. Then a one-line description, which becomes the config `description`; Enter skips it and leaves the plain line `init` wrote. The pages are not touched: they are blazon's until you write yours. Then choose where the rest comes from: type it here, or read it from your website.
2. **Colors.** The primary color, as hex. It prints a swatch and its contrast on white and on near-black, and says which ink the labels on it will be: graphite, bone where graphite is under 4.5:1 and bone is not, or a note, without stopping you, that neither reaches AA. The color is written to `color.signal.primary` (the starter's `color.signal.orange`, renamed, with every alias following), which `interactive.primary` uses. A color you typed is not marked `needs-review`. The starter's `color.signal.hazard` was not chosen to go with your primary, so blazon marks it `needs-review` until you set your own or delete it. The rest of the palette (bone, concrete, graphite, steel) is blazon's neutral set and is left as it is.
3. **Type.** A Google Fonts family name. It sets `font.family.display` and `font.family.body` and says whether the family is on blazon's short built-in list: if it is, its stylesheet is added to `fonts` in `blazon.json`; if not, only the name is written and you add the stylesheet yourself.
4. **Logo.** The path to an SVG or PNG. It checks that the file exists and is an image blazon can show, says its size and whether an SVG draws in `currentColor`, then copies it to `assets/logos/`, deletes blazon's `blazon-graphite` and `blazon-bone` files and sets the config `logo`.

Every color, font and logo question can be skipped with Enter. A value that is not valid is refused with a one-line message and asked again.

If you choose your website, leave the address empty to go back to typing the values by hand, which also works at the "Try a different address?" step after a site could not be read. Otherwise blazon shows a spinner while it reads the page, then **shows what it found before it writes anything**: the site's name and description, the fonts, where the logo would come from, every brand color as a swatch with its variable name in a list where you can untick any, and what it could not find. Nothing is written until you confirm. This is the same reading as [`--from`](#starting-from-a-live-site), so all of it is marked `needs-review`. If the site cannot be reached, blazon says so, offers another address or the manual questions, and the starter stays as copied.

At the end a box lists what was written, a second box gives three next steps, and "Start the dev server now?" (default no) runs `blazon dev` in the folder when you say yes. Press Ctrl-C at any question to stop: the starter stays as copied and the exit status is 130.

Each question has a flag, so a script can give the same answers: `--name <text>`, `--description <text>` (one sentence, 240 characters at most), `--color <hex>`, `--font <family>`, `--logo <file>` and `--dev`. `--from <url>` writes everything the site shows, as accepting every box in the review would. `--name` may be combined with `--from`, and then wins over the site's title. An invalid value exits 2 before anything is copied. A file that already existed is kept, as everywhere in `blazon init`.

`blazon init` never asks when `--yes` or `--no-input` is given (the same thing), when any of `--from`, `--name`, `--description`, `--color`, `--font` or `--logo` is given, or when stdin or stdout is not a terminal. CI and scripts therefore never wait for input, and `blazon init --yes` runs the whole flow with every default. Colors in the guided output are turned off by `NO_COLOR`, `TERM=dumb` and a non-terminal; swatches then print as `[#2563eb]`, with the same facts.

## The loop

1. Run `blazon dev` and keep it open. Edits to tokens, the resolver and the files it names, pages, assets and `blazon.json` reload the browser.
2. Run `blazon check` to see what breaks the brand's own rules.
3. Run `blazon build` to write the site and the code outputs.

## Commands

| Command | Does |
|---|---|
| `blazon init [dir]` | Copy the starter template into `dir`, and in a terminal ask for a name, colors, font and logo, see [The guided start](#the-guided-start). `--name`, `--description`, `--color`, `--font` and `--logo` answer without asking, `--dev` starts the dev server, `--yes` or `--no-input` accept every default. `--from <url>` fills it from a live site, see [Starting from a live site](#starting-from-a-live-site). Exits 2 when a value is not valid, the address is not `http` or `https`, or the site cannot be read; 130 when the questions are cut short |
| `blazon dev [dir]` | Start the dev server with live reload; it says each error in the terminal as it appears, with the file and line and what to do, and says when they are fixed. `-p, --port <port>` sets the port (default: `port` in `blazon.json`, else 3000); `--strict-port` exits 2 when that port is in use instead of taking the next free one; `--host` listens on every network interface and `--host <address>` on one address (default: this machine only, so nobody else on the network can read the brand's files or the folder paths `/__blazon/mcp-config` returns). It answers only requests whose `Host` is this machine, an IP address or the `--host` address, so a web page cannot reach it by rebinding a name, and it sends no CORS header, so a page on another origin cannot read a response. It answers 404 on Vite's `/__open-in-editor` route, which would make a running editor open a local path for any page that can reach this machine, and reads files over `/@fs/` only from the viewer's own folder, never from the brand or from a folder above blazon. It has no endpoint that writes |
| `blazon check [dir]` | Print the findings. Exits 1 on errors, and then ends with the next step for each kind of error. `--strict` also exits 1 on warnings. `--json` prints them as JSON, see [For scripts and agents](03-checks.md#for-scripts-and-agents); `--severity <level>` cuts that list. `--no-plugins` runs no plugin, and `--plugin <program>` runs one the lock does not pin, once ([chapter 12](12-plugins.md)) |
| `blazon tokens [dir]` | Check, then write `dist/tokens/`, then run the `build` plugins with no site: those that work from the brand alone write into `dist/tokens/<name>/`, and those that need the built site say so and write nothing. `--no-plugins` runs no plugin, so no browser is needed. `--plugin <program>`, `--json` and `--severity <level>` work as for `blazon check` |
| `blazon build [dir]` | Check, then write the tokens and the site. The site goes to `dist/site/`; `-o, --outDir <dir>` changes that, as a path from the folder you run blazon in (not from the book). `--no-plugins`, `--plugin <program>`, `--json` and `--severity <level>` work as for `blazon check` |
| `blazon drift <url-or-css-file>` | Compare tokens with the live site's CSS, see [Drift](03-checks.md#drift-from-the-live-site). `--json` prints JSON, `--tokens <dir>` reads the tokens from another folder. Exits 1 on drift, 2 on an error |
| `blazon approvals [dir]` | List the tokens and assets marked `review.status: ok` with the fingerprint of their value, to record in `review.value`, see [Noticing a changed value](02-tokens.md#noticing-a-changed-value). Prints only; exits 0 |
| `blazon get <path> [dir]` | Read one token: value, type, its CSS variable in `theme.css` and in `tailwind.css`, its rules and its file, see [Reading the brand from the command line](08-using-the-outputs.md#reading-the-brand-from-the-command-line). `--json` prints JSON. Prints only; exits 2 when there is no such token, or the path is a group (use `blazon list`) |
| `blazon list [group] [dir]` | List the tokens: path, type, value, and the token each aliases; with a group path, only that group. `--type <type>` keeps one `$type`. `--json` prints JSON. Prints only; exits 2 when there is no such group or type |
| `blazon rules [path] [dir]` | Read the `usage`, `pairs` and `logo` rules of a token or a group, or of the whole brand without a path. `--json` prints JSON. Prints only; exits 2 when there is no such path |
| `blazon can <fg> <bg> [dir]` | Ask whether the token `fg` may be text on the token `bg`, by the brand's `usage` and `pairs` rules. `--role ui` judges a focus ring, border or icon stroke by the 3:1 rule. `--theme <name>` judges the pair in that context of the resolver's `theme` modifier, such as `dark`; an unknown theme lists the valid ones. `--json` prints JSON and carries the theme. Exits 0 allowed, 1 denied, 2 an unknown token |
| `blazon fonts [dir]` | Read the stylesheets and font files the brand loads and the families its tokens name. `--json` prints JSON; `--css` prints the `@font-face` rules for the font files, and `--base <url-prefix>` sets where their `src` points. Prints only; exits 0 |
| `blazon brand [dir]` | Print the brand as `brand.json` holds it, compiled now and written nowhere. `--key <path>` prints one part, such as `theme.roles`. Always JSON; exits 2 for a key the document does not have |
| `blazon logo [dir]` | Read the configured logo variants and the rules of each logo's sidecar. `--json` prints JSON. Prints only; exits 0 |
| `blazon mcp --print-config` | Print the config that registers `blazon-mcp` in a client (`--client claude-code`, `claude-desktop`, `cursor` or `vscode`; `--brand <dir>`). `--json` prints JSON. Writes no file; exits 0, or 2 for an unknown client. See [chapter 20](20-blazon-for-agents.md) |
| `blazon mcp --check` | Test that `blazon-mcp` is ready: built, able to find blazon, answering a real MCP handshake on the brand (`--brand <dir>`, default the current folder), and registered in a client (`--client`). It runs no plugin, but what the brand says reaches your agent as tool results, so use a brand you trust. `--json` prints JSON. Writes no file; exits 0 when the server is ready, 1 when not, 2 for a wrong use. See [chapter 20](20-blazon-for-agents.md#check-that-it-works) |
| `blazon pin [dir]` | Write `blazon.lock`, naming the commit of the blazon that runs it, so `check`, `tokens` and `build` refuse any other blazon, see [Pin the blazon you build with](15-maintaining-a-brand-book.md#pin-the-blazon-you-build-with). Exits 1 when this blazon has uncommitted changes or cannot say its commit |
| `blazon doctor` | Check that this machine and folder are fit to run blazon, one line per check: `ok`, `warn` or `fail`, and a fix under each that is not `ok`. It checks the Node version against blazon's `engines`, that a brand folder is found (a tokens folder, and a `blazon.json` that loads), that the folder you run from is one the plugin host accepts (not writable by group or others, the rule in [chapter 12](12-plugins.md)), that Google Chrome is there when a configured plugin draws in one, and that `blazon.lock`, when there is one, names the blazon that runs. It runs no plugin and writes no file. `--json` prints `{ command, passed, checks: [{ id, status, message, fix }] }`. Exits 0 when nothing fails, 1 when a check fails. See [Troubleshooting](10-troubleshooting.md#blazon-doctor) |
| `blazon preview [dir]` | Serve the built site. `-p, --port <port>` sets the port (default: `port` in `blazon.json`, else 3000); `--strict-port` exits 2 when it is in use; `--host [address]` as for `blazon dev`. Serves only files inside the built site: a link in it that leaves the folder answers 403. Answers 404 on `/__open-in-editor`. Exits 2 and says to run `blazon build` when there is no built site |

`dir` is the project folder and defaults to the current folder.

**`--cwd <dir>`** works with every command and sets the folder blazon works from, the same as running blazon from that folder. Blazon moves into it once, before the command starts, so a command's default folder, `-o` and every path in what blazon prints are as if you had run it there. A folder argument is relative to `--cwd`: `blazon --cwd ./brands check acme` checks `./brands/acme`. A `--cwd` that is not a folder exits 2 with the usual "no folder" error and nothing runs. It can come before or after the command: `blazon --cwd ./acme check` and `blazon check --cwd ./acme` are the same. `blazon tokens` and `blazon build` run the check first and stop if it finds errors.

**`--allow-dir <folder>`** works with every command and approves a folder outside the project for an asset category's `dir` (a shared folder in a monorepo): `blazon dev --allow-dir ../shared`. Repeat it for more folders. `BLAZON_ALLOW_DIRS` does the same from the environment, folders separated as a `PATH` is. A relative folder is relative to the folder you start blazon in, before `--cwd` moves it. Without one, a `dir` that leaves the project is the `config-path-outside` error and is not read. Only you can approve a folder: `blazon.json` has no key for it. See [An extra folder](06-assets-and-icons.md#an-extra-folder).

**Exit status.** 0: the command did what it was asked. 1: the check found errors (or warnings, with `--strict`), `blazon can` denied the combination, or the command failed. 2: the command was used wrongly: an unknown command or option, a token path that is not in the brand (`get`, `rules`, `can`), a `can --theme` the resolver does not have (blazon says which one it thinks you meant), a port that is not a whole number from 1 to 65535, a busy port with `--strict-port`, an option given an empty value (`--name ""`, nearly always an unset variable in a script), a `preview` with nothing built, or a folder with no brand book in it (no folder, or no tokens folder). These do nothing, except `blazon init --from`, which copies the starter first and then exits 2 when the site cannot be read. The reason is one line on standard error. A failure shows no stack trace unless you add `--debug`.

## What gets written

| Where | What |
|---|---|
| `dist/tokens/theme.css` | One CSS custom property per token |
| `dist/tokens/typography.css` | One class per text style, such as `.type-h1` |
| `dist/tokens/tailwind.css` | A Tailwind v4 `@theme` block for the colors, font families, font sizes, font weights, radii, spacing, shadows and easings. Only written when a token maps to one of these |
| `dist/tokens/tailwind-reset.css` | A `@theme` block that removes Tailwind's defaults in the namespaces the brand fills. Import it before `tailwind.css`, see [chapter 8](08-using-the-outputs.md#closing-tailwinds-defaults). Only written when there is a namespace to reset |
| `dist/tokens/tokens.ts` | A typed module with `getToken()` and `getVar()` |
| `dist/tokens/tokens.json` | The tokens as DTCG, aliases resolved, `dev.blazon` kept |
| `dist/tokens/tokens.<modifier>.<context>.json` | The same, for one context. Only written when the project has a [resolver document](04-contexts.md), which declares values that change by locale or theme |
| `dist/site/` | The static brand book. It runs from any folder, including a subpath of a web host |
| `dist/site/brand.json` | The whole brand in one file, for tools in any language: [chapter 11](11-brand-json.md) |

[Chapter 8](08-using-the-outputs.md) shows how to use them.
