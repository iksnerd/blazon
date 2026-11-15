# Troubleshooting

← [Manual index](index.md)

What you see, and what it means. For a finding code, see [Checks](03-checks.md#every-finding). `blazon explain <code>` prints the same from the terminal: what the code means, the fix, and where to read more.

## blazon doctor

When something does not work and the message does not say why, run `blazon doctor` (or `blazon --cwd <dir> doctor` for a folder you are not in). It prints one line for each of five checks and, under each that is not `ok`, a `fix:` line. It runs no plugin and writes no file, and it exits 1 when a check fails, so it also fits a script (`--json` prints the same as data).

| Check | `fail` or `warn` when | Fix |
|---|---|---|
| `node` | The Node you run is older than `engines.node` in blazon's `package.json` | Install the Node version it names |
| `brand` | There is no tokens folder in the folder, or `blazon.config.ts` does not load | `blazon init`, or the config error it prints |
| `plugin-host` | The folder you run from can be written by group or others, or is owned by another user, so blazon refuses to run plugins from it. A `warn` when the config lists no plugin, a `fail` when it lists one | `chmod go-w` the folder, or work in a folder under your own home folder |
| `chrome` | A plugin in `blazon.config.ts` that draws in a browser (`blazon.brand-deck`, `blazon.favicons`, `blazon.logo-geometry`, `blazon.logo-kit`, `blazon.press-kit`, `blazon.print-book`, `blazon.social-cards`) is listed and no Google Chrome is found. Without such a plugin the check is `ok` and says Chrome is not needed | Install Google Chrome, or set `BLAZON_CHROME` to a Chrome or Chromium program |
| `lock` | `blazon.lock` exists and the blazon that runs is not the commit it names (the `pin-mismatch` rule), or the file is not valid | Check the pinned commit out and build it, or run `blazon pin` to move the pin on purpose |

## Messages

| You see | It means |
|---|---|
| `Port 3000 is in use, trying another one...` | Another process holds the port. The dev server uses the next free one and prints its address |
| `Could not load blazon.config.ts: ...` | The config file has a syntax or import error. Blazon stops, because a book built from the defaults would look fine and be wrong. Fix the file; `--debug` adds the stack |
| `blazon check: no folder "x"` or `no tokens folder (tokens) in "x"` | The folder does not exist, or has no tokens folder. Nothing was created and the exit status is 2. Run `blazon init x`, or check the path, or set `tokensDir` in `blazon.config.ts` |
| `blazon: unknown command "chek"; did you mean "check"?` and `unknown option` | A command or option was mistyped. Nothing ran and the exit status is 2 |
| `no program found: ...; did you mean "blazon.favicons"?` | A plugin in `plugins` matches no shipped plugin, no pinned one and no program in `.blazon/plugins`. The name it suggests is the nearest one. A program that exists but cannot start says why: `make it executable with: chmod +x <file>` |
| `<place> can be written by group or others, so blazon will not run a plugin from <folder>` | Blazon is installed under a folder that other users can write, such as `/tmp`, so they could swap a plugin that ships with it. Install blazon under your own home folder, as the user who runs it. Do not change the permissions of the shared folder. `--no-plugins` runs the command without plugins until then. See [Plugins that ship with blazon](12-plugins.md#plugins-that-ship-with-blazon) |
| `exited with 3; stderr: boom: cannot find thing` | A plugin failed on its own side. Blazon shows the last lines it wrote to standard error, at most 5 lines and 500 characters, with secrets taken out. Fix the plugin, or send the message to its author. A plugin that answered shows none of its standard error |
| A `plugin-failed` finding, with a `Next` line under it | A plugin did not answer: it could not start, was not pinned, broke the protocol, timed out, or exited with an error. The `Next` line (`fix` in `--json`) is the fix for that cause, not one text for all. `could not answer: ...` is a plugin that exited `2` and said why; fix what it names. Three breaks in a row stop a plugin for the rest of a `blazon check`, `tokens` or `build` run, and exit `2` counts as a break. The dev server rests a plugin for 30 seconds after a break and does not count exit `2`. See [Plugins](12-plugins.md#plugins-in-blazon-dev) |
| `"notacolor" is not a color` | A color token's value is not hex, `rgb()`, `hsl()`, `oklch()`, another CSS color function or a CSS color name. It is a `token-value-invalid` error |
| `blazon build: blazon check found N error(s)`, then `Fix them, or run blazon check for details.` | `blazon tokens` or `blazon build` stopped because the check found errors. They are printed just above this line, each with its file and line, or its path. `blazon check` prints the same list by itself |
| `outDir "." contains the project; pick a subfolder such as "dist/brand".` | `outDir` points at a folder that holds the project. Blazon empties the output folder first, so it refuses. Use a subfolder |
| A red `No token at ...` or `No asset at ...` line in the book | A directive names a path that matches nothing. The same mistake is a `directive-invalid` error in `blazon check` |
| The book is plain grey | There is no `theme` and no token with a conventional name. `blazon check` prints the `theme-missing` note. Set `theme`, or see [Theme roles](07-theme-and-config.md#theme-roles) |
| A page is missing from the index | Its front matter is not valid YAML (`page-frontmatter-invalid`). Quote values that contain `: ` |
| No logo on a dark cover | Only `onLight` is set. Add `onDark` to `logo` |
| `package "x" is not installed (looked in node_modules/x); run npm install x` | An icon set names a package that is not in the project's `node_modules`. Install it in the project folder, not a parent folder |
| `x needs dir: the folder of SVGs inside the package` | An icon set names a package blazon does not know. Give its `dir` |
| An edit does not show in the dev server | Blazon watches `tokensDir`, `docsDir`, `assetsDir`, the folders of asset categories, `blazon.config.ts`, `blazon.plugins.lock`, `blazon.lock`, the resolver document and every file it names, the logo files and an icon set's categories file. A change anywhere else needs a restart |
| `blazon check` passes locally but fails in CI | CI uses `--strict`, which fails on warnings. Run `blazon check --strict` locally |
| `docs/: 12 files are still the starter's text (...)` | A `starter-file-unchanged` note: those files are byte for byte what `blazon init` wrote. It is information, not a failure. Edit a file and its note goes. See [how findings are printed](03-checks.md#how-the-findings-are-printed) |
| `blazon init: --from needs an http(s) address, got "..."` | `--from` takes a full address that starts with `http://` or `https://`. Nothing is copied, and the exit status is 2 |
| `blazon init:` and an error after `--from`, then `The starter was copied as it is.` | The site could not be fetched or read. The starter is in place with its own text, and the exit status is 2. Running `blazon init --from` again in the same folder does not import the site: the starter files are already there, so they are kept as they are. Wait until the site is reachable, then run `blazon init --from <url>` into a separate, empty folder and copy over what you want. Leave the first folder as it is: it may hold your own work |
| `this book is pinned to blazon aaaaaaaaaaaa, but the blazon running was built from bbbbbbbbbbbb` | A `pin-mismatch` error: `blazon.lock` names another blazon commit than the one you run. Check the pinned commit out in your blazon clone and run `npm ci && npm run build` there (the message says so when the clone is already at the pin but `dist` is older). To move the pin on purpose, run `blazon pin`. See [Pin the blazon you build with](15-maintaining-a-brand-book.md#pin-the-blazon-you-build-with) |
| An `approval-stale` warning | A person approved a value, then it changed. Check the new value, then set `review.value` to the fingerprint the message gives |
| `There is no asset in this category` (`asset-config-unused`) | An `assets` key in `blazon.config.ts` matches no folder. Usually a typo. Fix the key or remove it |
| `No image of this name sits beside it` (`asset-sidecar-orphaned`) | A `.json` sidecar has no image of the same name. Rename it to match the image, or delete it |
| `Cannot measure A on B: not a color blazon can read` (`contrast-unknown`) | A contrast pair holds a gradient or `var()`. Use a plain color value, or drop the pair |
| `Aliases {x}, which is deprecated` (`alias-deprecated`) | The token points at one marked `$deprecated`. Point it at the replacement |
| `Defined in A and again in B; B wins` (`token-path-duplicate`) | Two token files define one path. Delete one, or rename it, so the winner is deliberate |
| `Same value as {x}` (`token-value-duplicate`) | Two primitives in one group hold one value, often a copy error. Remove one, or alias it to the other |
| `"Mulish" is not loaded by any entry of fonts` (`font-family-missing`) | A token names a family that no `fonts` entry loads, so the book falls back to the next family. Add the font to `fonts` |
| `... was generated by ... and nobody has confirmed it` (`asset-review-missing`) | A sidecar has `generated` and no `review`. Have a person check it, then set `review.status` to `ok` |
| `categories lists "x" under C, which pkg does not have` (`icon-unknown`) | A package upgrade may have removed the icon. Fix or remove the name in `categories` |
| A `logo-contrast-insufficient` warning | A logo variant draws the color of the surface it is shown on. Change the variant or the surface color. This is not "No logo on a dark cover", which is a missing `onDark` |
| `Marked needs-review` or a review note (`review-pending`) | A token, group or asset is flagged for a person to check. Check it, then set `review.status` to `ok` |
| `Shows N assets still marked needs-review` (`page-review-pending`) | A page draws assets that are not approved yet. Review them, or take them off the page |
| `Shares add up to X%, not 100%` (`proportion-total-mismatch`) | The shares of a proportion must total 100%. Adjust them |
| `A semantic token should alias a primitive, not hold <value>` (`alias-missing`) | A semantic or component token holds a literal. Alias a primitive instead |
| `The logo ... is still blazon's own mark` (`starter-logo-unchanged`) | The configured logo is byte for byte the starter's. Replace it, or the book shows blazon's logo under your brand's name |
| `the tokens folder holds no tokens` (`tokens-missing`) | The folder is empty, or its files hold no token. Add token files, or run `blazon init` |
| `The images are kept out of git and are not here` (`asset-local-missing`) | A local category has no images on this machine. Follow the note's steps. Until then the book leaves them out |
| `font.license ...` (`font-license-unknown`) | The licence looks like an SPDX id but is not on the list. Use a listed id, or write a plain name |
| `No page holds the motion section` (`section-missing`) | The book lists a section no page declares. Add a page with `section: motion`, or drop it from `sections` |
| A `theme-inferred` note | No `theme` is set, so blazon took roles from token names. Set `theme` to pin them |
| `<page> names N tokens in its text ... and places no token` (`page-tokens-unplaced`) | A page names tokens in prose but places none with `<!-- blazon:tokens <path> -->`. Place them, or ignore the note |
