# RFC 0003: Adopting blazon from npm

Status: draft 1, sections 2 to 5 not implemented, and section 1 only names the package (nothing is published); some walls of the motivation fixed (see Status) · Scope: the commands and output a company sees from its first `npx` to a checked, built and printed brand book in its own repository
Numbering: blazon RFCs, starting at 0001. Builds on [RFC 0001](0001-data-model.md) (the data model) and [RFC 0002](0002-extension-model.md) (plugins).

## Summary

Blazon is meant to be a package a company installs to build its brand book. This RFC specifies what that company types and what blazon answers, from the first command to a printed deck. It proposes:

1. **A published name.** Blazon ships on the public npm registry as `@iksnerd/blazon`, so `npx` runs it for anyone. The command stays `blazon`.
2. **`blazon init` that reads the project it is in.** A web app already states most of its brand: CSS variables, a dark theme, fonts, an app icon. `init` imports what it finds instead of copying placeholders.
3. **`blazon sync`**, which keeps the imported tokens equal to their source, with a `--check` mode for CI.
4. **`blazon doctor`**, which says what a command needs and does not have before the command fails on it.
5. **Smaller changes to the check:** a contrast level for non-text, and one duplicate finding per value.

## Motivation

On 2026-10-27 blazon was set up in a private Next.js app built on shadcn, the way a company would: `npm pack` of `origin/main` at `e0ba4fb`, then `npx --package <tarball> blazon …` in a worktree of the app. The brand book built in under three seconds, and every contrast claim in the app's CSS held in both themes. Getting there hit these walls:

| # | What happened | Cause |
|---|---|---|
| 1 | `npx blazon` cannot run this tool | The npm name `blazon` belongs to an unrelated project; blazon is not published, and its repository is not public yet |
| 2 | `init` said it created `colors.json, typography.json, spacing.json`; it also wrote `social.json` and `pattern.json` | The message is a fixed string (`src/cli/commands/init.ts`), not the list of files written (fixed, see Status) |
| 3 | `init brand` titled the book "Brand Brand Book" | The title comes from the folder name (`brandTitle`, `src/cli/commands/init.ts`); `brand/` is the natural folder in an app (fixed, see Status) |
| 4 | "Next steps: `blazon dev`" | Fixed strings (`src/cli/commands/init.ts:70-71`), wrong for an npx user, who types `npx <package> dev brand` from the app's root |
| 5 | 9 placeholder pages and 12 placeholder images removed by hand, and the other 4 pages rewritten | The starter was a demo brand, not the app's (the starter is now blazon's own brand book, see Status) |
| 6 | The app's 43 light and 42 dark CSS variables were copied into DTCG by a script written for the occasion | Blazon reads DTCG only; a shadcn app keeps its tokens in `app/globals.css` (`:root` and `.dark`) |
| 7 | `brand/dist/` was untracked, ready for the next `git add` | `init` writes no `.gitignore` |
| 8 | 16 `duplicate-value` warnings | shadcn repeats literals by role on purpose (`--card-foreground` equals `--foreground`); the CSS has no aliases to import |
| 9 | The app's `--input` comment cites WCAG 1.4.11's 3:1 for a control's border, and it could only be checked as `AA-large` | `pairs` has text levels only |
| 10 | `plugins: [{ name: 'blazon.print-book' }]` failed: `no program found` | Blazon does not yet find the plugins it ships (in progress: shipped plugins, blazon RFC 0002) (fixed, see Status) |
| 11 | A guideline page showed light values with the dark theme chosen | A viewer bug, fixed alongside this draft (fixed, see Status) |

Items 1 to 8 are each small. Together they turn a ten-minute setup into an afternoon, and a company that meets three of them in its first five minutes does not reach the brand book. Item 6 is the largest: a book whose tokens are a copy goes stale the day after a designer changes `globals.css`.

## Conventions

The key words "MUST", "MUST NOT", "SHOULD", "SHOULD NOT" and "MAY" are to be interpreted as described in BCP 14 [RFC2119] [RFC8174] when, and only when, they appear in all capitals.

The **project** is the repository blazon runs in, such as an app. The **book folder** is the folder that holds `blazon.json`, `brand/` by default. A **source** is a file in the project that states brand values blazon can import, such as a CSS file. **`<run>`** stands for how the project runs packages: `npx @scope/blazon`, `yarn blazon`, or `pnpm blazon`.

## The model

The **project root** is the nearest folder at or above the book folder that holds a `package.json`. Every source MUST resolve, after following symlinks, to a file inside the project root, by the rule sidecars follow (`isInside`, `src/core/assets/sidecar.ts`); `init` and `sync` refuse any other source and name it.

### 1. The package

Blazon MUST be published under a name that `npx <name>` resolves to this tool. The bin stays `blazon`. Once it is published, the README's first command SHOULD be `npx @iksnerd/blazon init`. Today it builds from a clone, as the README's quick start says.

The package is published to the public npm registry once the repository is public. `package.json` MUST carry `"name": "@iksnerd/blazon"` and `"repository"` pointing at the GitHub repository, and the publish MUST use `--access public`, because a scoped package is private by default. The scope `@iksnerd` MUST belong to the publisher (`npm whoami`). Publishing runs on a version tag, where blazon's CI already runs. `ci.yml` has no publish job yet, so this part is proposed.

Installing straight from git (`npm install github:iksnerd/blazon`) does not work today: npm runs `prepare` for a git dependency, blazon's `prepare` installs its commit hooks and does not build, and `dist/` is not committed, so `bin/blazon.js` has nothing to run. It is not a supported route; a registry package is built once, on the tag.

### 2. `blazon init [dir]`

`dir` defaults to `brand`. `init` MUST:

- **Title the book after the project**, not the folder: the `name` in the project's `package.json`, humanized ("acme-web" becomes "Acme Web Brand Book"), else the folder name. `--title` overrides.
- **Detect its sources** and import them, in this order. Each detector reads a file and writes tokens; none runs project code.

  | Detector | Recognizes | Imports |
  |---|---|---|
  | `shadcn` | `components.json` (JSON) with `tailwind.css` | Every color variable of `:root` as `color.*`, named as Tailwind names them (`--card-foreground` becomes `color.card-foreground`, which compiles back to `--color-card-foreground`); `.dark` as a `theme` context with `contextSelectors: { theme: '.{context}' }`; `--radius` as `radius.default` |
  | `css` | `--css <file>`, any CSS file | Custom properties of `:root` and of each class selector given with `--context <selector>=<name>` |
  | `next-font` | Calls of a function imported from `next/font/google` in `app/layout.*`, found by a pattern over the call sites (blazon has no TypeScript parser at run time: `typescript` is a devDependency) | One `font.family.*` per call whose options hold a literal `variable` (`--font-display` becomes `font.family.display`), and the Google Fonts stylesheet in `fonts`. It misses fonts declared in another module and re-exported, options built at run time, and `next/font/local`, and says which calls it skipped |
  | `icon` | `app/icon.svg`, `public/logo.svg` | The logo, with a sidecar holding only a title |
  | DTCG | `tokens/*.json` or a resolver document in the project | Referenced in place, not copied |

  A variable equal to an earlier one in every context MUST be imported as an alias of it, since the equality holds whatever the theme and is a relation, not a coincidence; equal in one context only, it stays a value. `--keep-apart <group>,<group>` stops aliases between groups the source keeps distinct on purpose. In the first adopting project this turned 16 duplicate warnings into 14 aliases and 2 real coincidences, with status colors kept apart from notification colors, as its CSS says they are. Each token's `source` MUST name its file and line.
- A comment directly above a declaration MUST become the token's `$description`. Comments in a source are where an app records why a value is what it is, and the brand book is where that reason should be read.
- **Write pages only for what it imported**: an intro, and a Color, Typography or Logo page when it imported tokens of that kind. Each page holds the directives for the imported tokens and no prose of blazon's own. `--starter` writes the starter instead: blazon's own brand book, as `init` copies it today.
- **Write `<dir>/.gitignore`** with `dist/`.
- **Print what it wrote**, file by file, from the list of files written, and the next commands as `<run>` would type them from the project root:

  ```text
  Imported from app/globals.css: 43 colors, 1 radius, a dark theme (42 colors)
  Imported from app/layout.tsx: 3 font families
  Imported from app/icon.svg: the logo
  Wrote brand/blazon.json, brand/blazon.resolver.json, brand/tokens/colors.json, … (11 files)

  Next:
    npx @scope/blazon dev brand       the brand book at http://localhost:3000, live
    npx @scope/blazon check brand     what breaks the brand's own rules
  ```

`init` MUST NOT overwrite an existing file (today's rule), and MUST say which files it kept.

### 3. `blazon sync [dir]`

Re-runs the detectors that `init` recorded in `blazon.json` (`"sources": [{ "from": "shadcn", "file": "../app/globals.css" }]`) and rewrites the token files they own.

Each detector owns its files (`tokens/imported/<detector>.json`, and `tokens/imported/<detector>.<context>.json` per context) and is the only writer of them through blazon. Facts added by hand to an imported token (a description, `dev.blazon` rules, a review note) go into the same file, on the token. They cannot go into a second file: blazon replaces a token whole when a later file defines the same path (`src/core/tokens/merge.ts`), so a token cannot be split across files without changing RFC 0001. Instead, a sync reads the file it owns before rewriting it, and MUST keep every key of a token except `$value` (and `$value` of an alias the detector did not write) for each path that still exists. It adds new tokens, and lists removed ones without deleting their hand facts silently: a removed token is reported, and dropped only with `--prune`.

`blazon sync --check` MUST exit 1, writing nothing, when a sync would change a value, and print each change (`color.primary: #af450e in app/globals.css, #b2410b in brand/tokens/colors.json`). Run in a pre-commit hook or a CI line, it keeps the book from drifting from the app.

### 4. `blazon doctor [dir]`

Prints one line per requirement and exits 1 if any command in the config cannot run:

```text
✓ Node 24.11.0
✓ blazon.json loads; 4 pages, 85 tokens, 1 context (theme: light, dark)
✓ sources: app/globals.css, in sync
✗ blazon.print-book: no browser. Install Google Chrome, or set BLAZON_CHROME
```

Each plugin MAY state its own requirements in its manifest for `doctor` to check (an open question). Until then, `doctor` reports each plugin as found or not, and calls a plugin's manifest only through the admission `check` uses (RFC 0002): a plugin that is neither pinned nor shipped is not started, and `doctor` says why.

### 5. Check changes

- **A non-text contrast level.** `min: "UI"`, 3:1, for WCAG 1.4.11 (component boundaries and graphics). `AA-large` stays for large text. The levels are the same number, and the finding names the right criterion.
- **One duplicate finding per value.** `#293133 is the value of 5 tokens: color.foreground, color.card-foreground, …` instead of one finding per token. A group MAY say `"duplicates": "allow"` in `dev.blazon` when it repeats values by role on purpose, which the `shadcn` detector writes on the color group it imports.

### 6. Plugins the package ships

A company names a shipped plugin and nothing else: `plugins: [{ name: 'blazon.print-book' }]`. When the plugin cannot run, the finding MUST say how to make it run, from the plugin's own reason (`could not answer: no browser to print with: install Google Chrome, or set BLAZON_CHROME`), not only that it failed. The mechanism is blazon RFC 0002 and the shipped-plugins work.

## Conformance

Each MUST above is to be tested against a fixture project in `test/fixtures/adopt/`, which does not exist yet: a shadcn app with `components.json`, `app/globals.css` (light and dark), `app/layout.tsx` with `next/font/google` and `app/icon.svg`. The tests are to run `npm pack`, install the tarball into a temporary project with `npm install --offline`, which fails rather than reaching the network when a dependency is missing from the cache, and run its `blazon` as a company would. They are to compare the written files with golden copies, and test `sync --check` by changing one value in the fixture's CSS.

## Drawbacks

- **Detectors are code that follows other projects' conventions.** shadcn's variable names can change between its versions, and a detector breaks when they do. Mitigation: detectors only read files; a detector that finds nothing it knows says so and imports nothing.
- **`init` grows from a copy into a program.** It is the first thing a company runs, so its mistakes are the most visible.
- **Two ways in.** Hand-written DTCG stays first class; imported tokens are a second path the manual must explain.

## Non-goals

- **Making the app read blazon's output.** An app may keep `globals.css` as its source. Blazon documents it and checks it; it does not take it over.
- **Importing from design tools** (Figma variables, Tokens Studio). A detector can be added later on the same shape.
- **A config wizard.** `init` asks no questions; flags override what it detects.
- **Running project code** to find values (a Tailwind config, a theme provider). Detectors read files.

## Alternatives and prior art

- **shadcn's own CLI** (`npx shadcn init`) detects the framework and writes `components.json`; the detection shape here follows it.
- **Style Dictionary and Terrazzo** read DTCG and write CSS. Blazon does the same today; reading an app's CSS back into DTCG is the gap this RFC fills.
- **Keeping placeholders, with a better message.** Rejected: the walkthrough spent most of its time removing them, and a placeholder that survives into a published book is wrong content.

## Compatibility

A project made by today's `init` keeps working: it has no `sources`, so `sync` has nothing to do and says so. `--starter` gives today's output: blazon's own brand book.

New keys and where each is specified:

| Key | Specified in |
|---|---|
| `sources` in `blazon.json` | RFC 0001 §14 (the config table), `src/core/config/validate.ts`, manual chapter 7. `brand.schema.json` is not affected |
| `dev.blazon.duplicates` | `brand.schema.json` (`$defs/blazon`), manual chapter 2's field table |
| `UI` in `pairs[].min` | manual chapter 2 (the levels list), the contrast check, `brand.schema.json` |

The `duplicate-value` code stays. Its message, count and `path` change: one finding per value, whose `path` is the first token with that value in declaration order, naming the others in its message. The golden check files (`test/examples/golden/*/check.json`) change with it, and are regenerated and reviewed in the same change.

## Security considerations

Detectors read files inside the project root only, after following symlinks (the model, above), and never run them. `init` and `sync` write inside the book folder only. `doctor` starts no plugin that `check` would not start.

## Status

Sections 2 to 5 are not implemented. Section 1 is done as far as the name goes: the package is called `@iksnerd/blazon` and configs import from it, but nothing is published to npm and `ci.yml` has no publish job, while the repository is not public. This RFC stays a draft: it describes what a company would do once blazon is published. The walls of the motivation that were fixed since the run, each by its commit:

| # | Fixed by |
|---|---|
| 2 | `adb7afd feat(cli): group repeated check findings and guide the first run`: `init` now lists the files it wrote, by folder, from what it copied |
| 3 | `0a420b3 fix(init): do not say "brand" twice in a new book's title`: `init brand` gives "Brand Book", and `init auth0-brand` gives "Auth0 Brand Book" |
| 10 | `f85f0de feat(plugins): run the plugins that ship with blazon in place, once their folder and install are verified`. Not re-run from a packed tarball for this note |
| 11 | `4afc592 fix(viewer): show a guideline page in the contexts the reader chose` |

Partly addressed, and still open: wall 5, by `46616d2 feat(template): ship original demo artwork in place of dashed placeholder boxes` and `553867b feat(check): note files that are still the starter's text` (the demo artwork was flagged `needs-review` and each unedited starter file gets a `starter-file` note). Since then the starter is no longer a demo brand with placeholder values: `init` copies blazon's own brand book, `examples/blazon/`, as the one source, so the starter and the example cannot drift apart, and the placeholder artwork and its `needs-review` flags are gone. That does not fix wall 5. A company still gets a brand that is not its own: eleven pages and eight files that describe blazon, which `blazon check` lists as 24 `starter-file` notes (checked on a fresh `blazon init`: 0 errors, 0 warnings) and which the company still has to rewrite or delete by hand. Only section 2's import of the project's own tokens and pages closes it. Walls 1, 4, 6, 7, 8 and 9 are unchanged: the next steps are still fixed strings, and the title still comes from the folder name, not from the project's `package.json` (section 2). A guided run in a terminal asks for a name and `--name` gives one, but a bare `blazon init dir` still derives the title from the folder.

`blazon init --from <url>` (`3a8b2e3 feat(init): add --from to start a brand book from a live site`, then `8d90a43` and `89654c7`) is a different route from section 2. It reads a live site's page and stylesheets, not a project's files, writes everything `needs-review`, and names the tokens' `source.cssVar` for `blazon drift`. Section 2 first named its explicit CSS form `--from css <file>`, which would have collided with it. That is settled: `--from <url>` keeps its name, because it ships and the manual describes it in chapter 1, and section 2's flag is `--css <file>` (repeatable; it takes the same `--context <selector>=<name>` option). The two never share a flag. `--from` takes an http(s) address only, and `blazon init` exits 2 for anything else, so a file path cannot be mistaken for a site. The `from: 'css'` key of a `sources` entry in `blazon.json` is a config field, not a flag, and is unchanged.

Blazon is dogfooded before it is published: its first adopters are the owner's own projects, starting with a private Next.js app, each set up as a company would from a packed tarball (`npx --package <tarball> blazon …`). Each run adds its walls to the motivation's table, and a section is implemented once a dogfood run needs it. Publishing (section 1) comes after.

## Open questions

1. **The scope.** Whether a public release keeps `@iksnerd/blazon` or moves to an organization scope is open. Every README command follows the current name.
2. **Where detectors live.** In core, or as plugins of a new `import` role (the plugin protocol, RFC 0005, would need the role). Core is simpler for the first three.
3. **Whether `init` adds blazon to the project's `devDependencies`** and a `brand` script, so the version is pinned.
4. **Plugin requirements in the manifest**, for `doctor`: a question for blazon's profile (RFC 0002 section 2).
