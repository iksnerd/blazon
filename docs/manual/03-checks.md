# Checks

← [Manual index](index.md)

`blazon check` reads the whole project and reports what breaks the brand's own rules. `blazon tokens` and `blazon build` run it first. Run it by itself while you work, and in CI.

## Severities

| Severity | Means | Effect |
|---|---|---|
| Error | The project is wrong: a bad alias, a broken rule, a missing file | `blazon check` exits 1, and `blazon tokens` and `blazon build` stop |
| Warning | An open question or a likely mistake | Printed. Exits 0, unless you pass `--strict`, which makes warnings fail too |
| Note | Information for the author, such as a theme blazon chose for you | Printed. It never fails a check, even with `--strict`, and the brand book does not show it |

In CI, use `blazon check --strict`: the job fails when the exit status is not 0.

## For scripts and agents

`blazon check --json`, `blazon build --json` and `blazon tokens --json` print one JSON document on standard output and nothing else. Standard error is empty on a run that ends normally, so `2>&1` output still parses as JSON; the banner and the findings list are not printed. The exit status is the same as without `--json`: 0 passed, 1 not passed, 2 the command was used wrongly or could not start. A check that runs and fails (status 1) prints the full document shown below, with `passed: false`, `counts` and `findings`, and no `error`. A command that cannot run, such as a wrong flag or a missing folder (status 2), or one that stops on an error, still prints one JSON object on standard output, `{ command, passed: false, error: { code, message, fix } }` (see below), and the message goes to standard error as well. `blazon approvals --json` prints `{ command, passed, approvals: [{ path, fingerprint, state }] }`, with `state` one of `recorded`, `stale` and `not recorded`. `blazon pin --json` prints `{ command, passed, commit, file }`. `blazon plugin check <program> --json` prints `{ command, passed, host, adopts, cases: [{ case, name, role, status, detail }] }` with `status` `ok`, `warn`, `skip` or `fail` (with `--core` it adds `core: true` after `adopts` and holds only cases 1 to 5); `blazon plugin pin` prints a digest and `blazon plugin profile` prints JSON already, so they take no `--json`. `blazon init --json` never asks: it prints `{ command, passed, dir, created, kept, updated }`, with `created`, `kept` and `updated` as paths in the folder (a starter file that was already there is kept, not overwritten; `updated` is `[".gitignore"]` when the folder had one and init added the build-output line to it), and the usual text goes to standard error.

```json
{
  "command": "check",
  "passed": false,
  "strict": false,
  "counts": { "errors": 1, "warnings": 0, "info": 0, "byCode": { "token-value-invalid": 1 } },
  "findings": [
    {
      "code": "token-value-invalid",
      "severity": "error",
      "path": "color.signal.orange",
      "message": "\"notacolor\" is not a color: write hex (#2563eb), rgb(), hsl(), oklch() or a CSS color name",
      "fix": "Change the value so it fits the token's $type; the message says how."
    }
  ]
}
```

`severity` is `error`, `warning` or `info` (a note). `fix` is one sentence on what to do, and is there for the codes blazon knows how to fix by editing a file; a finding that is only a question has none. A `plugin-failed` finding gives the fix for its own cause, such as a plugin to pin or a timeout to raise, and `brand.json` carries that `fix` too. The `path` of a `token-file-invalid` finding is the file, with its folder, such as `tokens/colors.json`. A finding that only occurs in one resolver context also has `context`, such as `locale=ja`. A finding about a token or an asset also has `file`, the file to open, relative to the project, such as `tokens/colors.json`. A finding about a token also has `line`, the 1-based line of that file where the token's key is written; a `token-file-invalid` finding has `line` too, taken from the parser's position, when the parser gave one. `line` is left out when it is not known. `brand.json` carries `file` and `line` the same way. `blazon check` in a terminal starts the finding's line with them, as `tokens/colors.json:17`, which a terminal or an editor opens at that line. `blazon build --json` lists the findings of the check and of the build plugins, and builds nothing when the check has errors.

`counts.byCode` gives the number of findings for each code, over every finding of every severity, so a script can see that eleven of its thirteen warnings are `review-pending` without reading the list. `--severity error`, `--severity warning` or `--severity info` (the default) keeps only the findings at that level or worse in the list. `counts` and `passed` always cover every finding, so the filter never changes whether a check passes. `--severity` without `--json` has no list to cut, so it is refused (exit 2) instead of ignored.

When the command cannot run, standard output is still JSON, so a script can always parse it: `{ "command": "check", "passed": false, "error": { "code": "no-folder", "message": "no folder \"x\"; run blazon init x to start a brand book there", "fix": "Run blazon init x to start a brand book there." } }`. `error.code` is stable: match on it, not on the message, which is for people and may be reworded. `error.fix` is the next step on its own, and is left out when blazon has none. The codes are `check-failed`, `conflicting-options`, `empty-value`, `error`, `invalid-option-value`, `invalid-port`, `missing-argument`, `no-built-site`, `no-file`, `no-folder`, `no-tokens-folder`, `not-a-token`, `plugin-failed`, `port-in-use`, `site-unreadable`, `unknown-command`, `unknown-finding-code`, `unknown-key`, `unknown-option` and `unknown-token`; `error` is an error with no kind of its own. The exit status is 2 for a command used wrongly (an unknown option, a folder that is not there) and 1 for one that failed. Standard error says the same in two lines: `blazon check: no folder "x"`, then the fix, indented, on its own line.

The brand book has a Review page, under Quality in its index. It lists every error and warning, so readers see the brand's open questions too, such as the values marked `needs-review`. Notes are not listed there. A finding that only occurs in one [context](04-contexts.md) is tagged with it, such as `locale=ja`. Below the findings, an Approved section lists every token, token group and asset marked `review: ok`, with who approved it and when, and the note. An approval whose value changed since (`approval-stale`) is marked `changed since` and listed first; one with no recorded `value` says so ([Noticing a changed value](02-tokens.md#noticing-a-changed-value)).

## How the findings are printed

Findings are printed in a fixed order: errors, then warnings, then notes, and within each by path, code, context, file, line and message. Text compares by character code, not by language, so the order is the same on every machine. `blazon check` prints a finding on its own line, starting with `file:line` when the finding names a file (`acme/tokens/colors.json:17  color.base.bone: ...`). The file is written from the folder you ran blazon in, so `blazon check acme` puts `acme/` in front of it. There are two exceptions that would otherwise repeat one sentence many times. The `starter-file-unchanged` notes are printed as one line for each folder, naming up to five files and counting the rest:

```
NOTE  docs/: 12 files are still the starter's text (01-principles.md, 02-logo.md, 03-color.md, 04-type.md, 05-form.md and 7 more) [starter-file-unchanged]
```

`review-pending` warnings are printed as one line with their count and up to five paths, whatever their notes say, and after the other warnings, so a real warning does not sit among them: `WARN  review-pending (11): applications/cover, applications/social-post, ... and 6 more`. When all of them have one message, it is printed at the end of the line. Each finding and its note stay in `--json`. A person's review is a deliberate act, so blazon has no option to hide them. A folder with a single starter file, and a single `review-pending`, keep a line each. `page-review-pending` warnings are printed as one line too, `WARN  page-review-pending (6 pages): 06.1-illustration.md, ... : show assets still marked needs-review`; each page's own count and asset ids stay in its finding. Only the printing is grouped. The summary line counts findings (`Found 0 error(s) and 2 warning(s) and 43 note(s)`), the exit status is the same, and the Review page, `brand.json` and `--json` still carry one finding for each file.

When at least five `starter-file-unchanged` notes are left, the project is mostly the starter, and `blazon check` ends with a short block:

```
Next:
  1. Edit tokens/colors.json with your colors
  2. Run blazon dev to see the book
  3. Replace blazon's artwork in assets/ and the text in docs/
```

Run from the folder above, as `blazon check acme`, each path and command names the folder: `Edit acme/tokens/colors.json`, `Run blazon dev acme`. A brand with fewer than five starter files left sees nothing extra, and a check that finds errors prints the next block instead.

When the check fails, it ends with the next step for each kind of error it found, up to three, and then to run `blazon check` again:

```
Next:
  1. token-value-invalid: Change the value so it fits the token's $type; the message says how.
  2. Run blazon check again
```

`blazon tokens` and `blazon build` print the findings and then stop on errors with the same two-line error shape: `blazon build: blazon check found 1 error(s)`, then `Fix them, or run blazon check for details.` indented on its own line.

## What is checked

- **Tokens:** types, aliases, values, usage roles and rules, contrast pairs, proportions, duplicates and review flags ([chapter 2](02-tokens.md)).
- **Contexts:** the resolver document, and every token in every context.
- **Pages:** front matter, and every [directive](05-pages.md#directives) (an HTML comment that places live content): its name, its arguments and what they name.
- **Assets:** [sidecars](06-assets-and-icons.md#sidecars), the configured logo, the `assets` block, and every file against its [category's rules](06-assets-and-icons.md#asset-categories).
- **Configuration:** theme roles that point at a missing token, and [icon sets](06-assets-and-icons.md#icon-sets) that cannot be read.

## How codes are named

A finding code is kebab-case and has the form `<area>-<problem>`. The area comes first and names what the check looks at, such as `alias`, `asset`, `asset-sidecar`, `token-value` or `theme`. The problem comes last and is one word from a fixed list, and the same trouble has the same word in every area:

| Problem | Means |
|---|---|
| `invalid` | A file, value or setting is malformed or fails its shape |
| `unknown` | A name is not in the list blazon knows |
| `unresolved` | A reference points at nothing |
| `missing` | Something required is absent |
| `duplicate` | Two things claim the same slot |
| `unreadable` | A file cannot be read |
| `unused` | A setting matches nothing |
| `stale` | An approval no longer matches its value |
| `mismatch` | Two things that must agree do not |
| `violated` | A rule is broken |
| `pending` | A person has not yet confirmed it |
| `insufficient`, `circular`, `deprecated`, `embedded`, `failed`, `inferred`, `orphaned`, `outside`, `overlap`, `unchanged`, `unplaced` | The single case the word names |

The list is `PROBLEMS` in `src/core/checker/catalogue.ts`, and a test fails for a code that does not follow the rule. Codes are part of the public surface and freeze at 1.0. Before that, 42 codes were renamed to fit the rule; blazon keeps no alias, so a script that names an old code gets the unknown-code error (`blazon explain` exits 2 with `unknown-finding-code`).

| Old code | New code |
|---|---|
| `asset-duplicate-id` | `asset-id-duplicate` |
| `asset-local-absent` | `asset-local-missing` |
| `asset-rule-violation` | `asset-rule-violated` |
| `asset-sidecar-orphan` | `asset-sidecar-orphaned` |
| `blazon-pin-invalid` | `pin-invalid` |
| `blazon-pin-mismatch` | `pin-mismatch` |
| `circular-alias` | `alias-circular` |
| `contrast` | `contrast-insufficient` |
| `css-variable-collision` | `css-variable-duplicate` |
| `deprecated-alias` | `alias-deprecated` |
| `duplicate-definition` | `token-path-duplicate` |
| `duplicate-value` | `token-value-duplicate` |
| `embedded-alias` | `alias-embedded` |
| `font-not-loaded` | `font-family-missing` |
| `generated-unreviewed` | `asset-review-missing` |
| `icon-set-unknown-icon` | `icon-unknown` |
| `invalid-font-meta` | `font-meta-invalid` |
| `invalid-frontmatter` | `page-frontmatter-invalid` |
| `invalid-json` | `token-file-invalid` |
| `invalid-logo-rule` | `logo-rule-invalid` |
| `invalid-pair` | `contrast-pair-invalid` |
| `invalid-proportion` | `proportion-invalid` |
| `invalid-review` | `review-invalid` |
| `invalid-token` | `token-invalid` |
| `invalid-value` | `token-value-invalid` |
| `logo-invisible` | `logo-contrast-insufficient` |
| `missing-type` | `token-type-missing` |
| `needs-review` | `review-pending` |
| `needs-review-in-use` | `page-review-pending` |
| `page-duplicate-slug` | `page-slug-duplicate` |
| `proportion-total` | `proportion-total-mismatch` |
| `semantic-literal` | `alias-missing` |
| `starter-file` | `starter-file-unchanged` |
| `starter-logo` | `starter-logo-unchanged` |
| `tokens-empty` | `tokens-missing` |
| `tokens-not-shown` | `page-tokens-unplaced` |
| `type-mismatch` | `alias-type-mismatch` |
| `unknown-logo-variant` | `logo-variant-unknown` |
| `unknown-role` | `usage-role-unknown` |
| `unknown-type` | `token-type-unknown` |
| `unresolved-alias` | `alias-unresolved` |
| `usage-violation` | `usage-violated` |

## Every finding

The table lists each code with its severity and a one-line summary. It is written from the check catalogue in the source (`src/core/checker/catalogue.ts`) by `npm run checks-docs`, so edit the catalogue and not the table. The list below it says more about each code: an example message and what to do.

<!-- checks:begin -->
| Code | Severity | Summary |
|---|---|---|
| `alias-circular` | Error | Aliases lead back to the token that started them. |
| `alias-deprecated` | Warning | A token aliases a token marked deprecated. |
| `alias-embedded` | Error | An alias is mixed with other text in one value. |
| `alias-missing` | Warning | A semantic or component token holds a literal value instead of an alias. |
| `alias-type-mismatch` | Error | A token has a different $type from the token it aliases. |
| `alias-unresolved` | Error | An alias names no token. |
| `approval-stale` | Warning | A token or asset was approved, and its value changed after. |
| `asset-config-invalid` | Error | An asset category in the config is not a valid object or has a bad rule. |
| `asset-config-unused` | Warning | An asset category in the config matches no asset. |
| `asset-id-duplicate` | Error | Two files in different folders have the same asset id. |
| `asset-local-missing` | Note | A category kept out of git has no images on this machine. |
| `asset-misuse-unknown` | Error | A logo misuse kind, in a sidecar or in a blazon:logo-misuse directive, is not one blazon draws. |
| `asset-review-missing` | Warning | A generated asset has no review yet. |
| `asset-rule-violated` | Error | An asset breaks the rules of its category. |
| `asset-sidecar-invalid` | Error | An asset sidecar is not valid JSON or holds a field blazon does not know. |
| `asset-sidecar-orphaned` | Warning | A sidecar has no image of the same name beside it. |
| `asset-unreadable` | Error | An asset file cannot be read, so it is left out of the book. |
| `config-invalid` | Error | A key or value in blazon.json is not valid. |
| `config-path-outside` | Error | A path in blazon.json, or a file linked from a brand folder, leads outside the project folder. |
| `context-css-unchanged` | Note | A context leaves out tokens the default has, but the CSS cannot remove a custom property, so theme.css keeps the default value for them. |
| `contrast-insufficient` | Error | A color pair, or a logo colorway, has less contrast than its level asks for. |
| `contrast-pair-invalid` | Error | A contrast pair names no color tokens or has an unknown level. |
| `contrast-unknown` | Warning | Blazon cannot read a color of a pair or of a logo colorway, or its background is translucent, so it cannot measure the contrast. |
| `css-variable-duplicate` | Error | Two tokens write the same CSS custom property. |
| `directive-deprecated` | Warning | A page has a `folio:` directive comment, the old name, which blazon ignores. |
| `directive-invalid` | Error | A page directive has wrong arguments or names something that does not exist. |
| `directive-unknown` | Error | A page uses a directive name blazon does not have. |
| `font-family-missing` | Warning | A font family a token uses is not loaded by any fonts entry. |
| `font-file-invalid` | Error | A font entry names a file that is missing or not a font. |
| `font-license-duplicate` | Warning | A font folder holds more than one license file. |
| `font-license-invalid` | Warning | A license file beside a font file was not read. |
| `font-license-unknown` | Note | A font license is not a known SPDX id. |
| `font-meta-invalid` | Error | The font fields on a token are not valid. |
| `font-role-invalid` | Warning | A font reason or fallbackFor is not valid, so it is left out. |
| `icon-set-invalid` | Error | An icon set in the config cannot be loaded. |
| `icon-unknown` | Warning | An icon set category lists an icon the package does not have. |
| `logo-contrast-insufficient` | Warning | A logo variant draws the color of the surface it is shown on. |
| `logo-missing` | Error | No logo is configured, or the configured logo is not an image file in the project. |
| `logo-rule-invalid` | Error | A logo rule on a token is not in the shape blazon reads. |
| `logo-variant-unknown` | Error | A logo rule denies a variant the logo does not have. |
| `output-dirs-overlap` | Error | An output folder is or holds an input, or is inside one. |
| `page-frontmatter-invalid` | Error | A page front matter is not valid YAML or has a field of the wrong type. |
| `page-review-pending` | Warning | A page shows assets that are still marked needs-review. |
| `page-slug-duplicate` | Error | Two pages have the same slug, so the book opens only the first. |
| `page-tokens-unplaced` | Note | A page names many tokens but places none of them. |
| `page-unreadable` | Error | A page file cannot be read, so it is left out of the book. |
| `pin-invalid` | Error | blazon.lock is not a valid pin. |
| `pin-mismatch` | Error | The blazon build in use is not the commit blazon.lock names. |
| `plugin-failed` | Error | A check plugin could not run or broke the plugin protocol. |
| `plugin-lock-invalid` | Error | The plugin lock file is not valid. |
| `print-cmyk-invalid` | Error | The print cmyk value is not four numbers from 0 to 100. |
| `print-pms-invalid` | Error | The print pms value is not a non-empty single-line string. |
| `print-ral-invalid` | Error | The print ral value is not a valid RAL code. |
| `proportion-invalid` | Error | A proportion share is out of range or names a token that does not exist. |
| `proportion-total-mismatch` | Warning | Proportion shares do not add up to 100%. |
| `resolver-invalid` | Error | The resolver file is missing or breaks the DTCG resolver rules. |
| `review-invalid` | Error | A review field has a bad status, date or fingerprint. |
| `review-pending` | Warning | A token or asset is marked needs-review. |
| `section-invalid` | Error | The sections setting names a section blazon does not have or has the wrong shape. |
| `section-missing` | Note | No page holds a section the book lists. |
| `source-css-var-invalid` | Error | source.cssVar is not a custom property name. |
| `starter-file-unchanged` | Note | A file in the docs, tokens, assets or fonts folder is still the starter text. |
| `starter-logo-unchanged` | Warning | A configured logo is still blazon's own mark, byte for byte. |
| `theme-inferred` | Note | No theme is set, so blazon took the theme roles from token names. |
| `theme-missing` | Note | No theme is set and no token has a conventional name, so blazon uses neutral colors. |
| `theme-unresolved` | Error | A theme role points at a token that does not exist. |
| `token-extension-deprecated` | Warning | A token or group has a `dev.folio` extension key, the old name, which blazon ignores. |
| `token-file-invalid` | Error | A token file is not valid JSON or its top level is not an object. |
| `token-invalid` | Error | A token is a bare value instead of an object with $value, or a name contains ".", "{" or "}". |
| `token-path-duplicate` | Warning | Two token files define the same path. |
| `token-type-missing` | Error | A token has no $type, and neither its groups nor its alias target give one. |
| `token-type-unknown` | Error | A $type is not a DTCG type. |
| `token-value-duplicate` | Warning | Two primitive tokens in one group have the same value. |
| `token-value-invalid` | Error | A token value does not fit its $type. |
| `tokens-missing` | Warning | The tokens folder holds no tokens. |
| `usage-role-unknown` | Error | A usage role is not one blazon knows. |
| `usage-violated` | Error | A token is used as a role that the token it aliases does not allow. |
<!-- checks:end -->

Findings carry a path: a token path, or a file name for page, asset and resolver problems.

### Looking up a code

`blazon explain <code>` prints what one finding code means, from the same catalogue as the table above: its severity, the summary, the fix when there is one, and the manual chapter and RFC section to read. `blazon explain` with no code lists every code with its severity and summary. `--json` prints the same as an object: `{ command, passed, code, severity, summary, fix, appliesTo, rfc, manual }`, or `{ command, passed, codes: [...] }` for the list. A code that does not exist prints the closest ones and exits 2, with the error code `unknown-finding-code`.

```sh
blazon explain contrast-insufficient
blazon explain approval-stale --json
```

### What each finding means, and what to do

- `approval-stale`: A token or asset is `review.status: ok` with a `review.value` fingerprint, and its value has changed since. An asset in several formats is one asset with one fingerprint, reported once with its files named. The message names who approved it and when, and gives the new fingerprint to set once a person has confirmed the value ([chapter 2](02-tokens.md#noticing-a-changed-value)). An approval with no `value` never warns
- `asset-config-invalid`: An entry of the `assets` block in `blazon.json` is wrong: it is not an object, has an unknown field, a `label` or `description` that is not a string, an `order` that is not a number, a `dir` that does not exist or is not a folder (or whose key is not lowercase letters, digits and hyphens), malformed `rules`, a `notSpecified` that is not a non-empty list of strings, a `source` that is not `{"doc", "locator"}`, a `local` that is not a sentence, an `experimental` or a `reference` that is not `true` or `false`, or both of them `true` (a category is one or the other). The entry is left out whole, and the message names what is wrong
- `asset-config-unused`: An `assets` key has no asset in that category: `There is no asset in this category. Check the key against the folder name`. It is usually a typo of the folder name
- `asset-id-duplicate`: Two files from different folders have one id, `category/name`, so the id would name both: `"photography/hero" names two files, photography/a/hero.png and photography/b/hero.png; rename one`. A name in two formats in one folder (`mark.svg` and `mark.png`) is one asset, not a duplicate
- `asset-local-missing`: A category marked `local` has no image here, because its images are kept out of git. The note says how to make them. Until they are there, blazon does not report the missing files, logos and directives that need them
- `asset-rule-violated`: A file breaks the `rules` of its category, such as `photography/small is 800×450px; photography needs at least 1600px wide`. Replace the file, or change the rule on purpose
- `asset-sidecar-invalid`: A sidecar is not valid JSON, has an unknown or malformed field, aliases something that is not a dimension token, or is a link out of the assets folder. Fix the sidecar. The asset keeps no rules until you do
- `asset-sidecar-orphaned`: A `.json` file in `assets/` has no image of the same name beside it, so it describes nothing. Rename it or delete it
- `alias-circular`: An alias leads back to itself: `Alias {x} leads back to y`. Break the loop
- `config-invalid`: `blazon.json` has a key blazon does not know, or a value of the wrong type: `unknown key "asset"; known: ... (did you mean "assets"?)`, `port must be a whole number from 0 to 65535`. Fix the key. See [configuration](07-theme-and-config.md#when-the-config-is-wrong)
- `contrast-insufficient`: A contrast pair is below its level, such as `{text.primary} on {color.yellow} is 3.10:1; AA needs 4.5:1`. Change a color or lower the level on purpose
- `contrast-unknown`: A pair has a value blazon cannot read as a color, such as a gradient or a `var()`: `Cannot measure A on B: not a color blazon can read`. Any CSS color is measured, in any color space
- `css-variable-duplicate`: Two tokens write one CSS custom property, so the stylesheet keeps only the last: `size.foo.bar and size.foo-bar both write the CSS variable --size-foo-bar; rename one`. It is reported at the later token. Names are what count, so a token and an alias to it collide too. It covers `theme.css` (including the parts of a typography token, such as `--type-h1-letter-spacing`), and each resolver context's block. The Tailwind names are checked by `blazon.tailwind` (`blazon.tailwind/variable-duplicate`, [chapter 14](14-shipped-plugins.md)). The same name in two blocks, such as `:root` and `:lang(ja)`, is by design
- `alias-deprecated`: A token aliases one marked `$deprecated`. Point it at the replacement
- `directive-deprecated`: A page has `<!-- folio:name -->`, the spelling blazon had before it was renamed. Blazon reads only `<!-- blazon:name -->`, so the comment is ignored and what it placed is missing from the book. The finding names the page and line. Change `folio:` to `blazon:`. A comment in a code fence or inline code is not reported
- `directive-invalid`: A directive in a page has the wrong number of arguments, a path that names nothing of the right type, an asset or category that does not exist, or needs a logo that is not configured. The message names the directive and what is wrong
- `directive-unknown`: A page uses `blazon:` followed by a name blazon does not know. The message lists the known ones
- `token-extension-deprecated`: A token or group has an `$extensions` key that starts `dev.folio`, the old name of `dev.blazon`. Blazon ignores it, so its fields (`tier`, `usage`, `pairs` and the rest) do nothing. Rename the key to `dev.blazon`
- `token-path-duplicate`: A token path is defined in two files: `Defined in A and again in B; B wins`
- `token-value-duplicate`: Two color tokens in one group have the same value: `Same value as {x} (#...)`. Often a copy error in the source
- `alias-embedded`: An alias sits inside other text. An alias must be the whole value
- `pin-invalid`: `blazon.lock` has a mistake: it is not JSON, has a key other than `v` and `commit`, or `commit` is not a full 40-digit lowercase git hash. The message names the line when it can. Write the file again with `blazon pin`
- `pin-mismatch`: The blazon running is not the commit `blazon.lock` names: it was built from another commit, its tree had uncommitted changes when it was built, or it cannot say which commit it is. See [Pin the blazon you build with](15-maintaining-a-brand-book.md#pin-the-blazon-you-build-with). No `blazon.lock`, no check
- `font-file-invalid`: A font file in `fonts` is missing, is not a file, or has an extension blazon does not embed (it takes .woff2, .woff, .ttf and .otf): `Font F for "Mulish" is not a file in the project`. The entry is left out, so the book loads no font for it
- `font-license-duplicate`: The folder of a font file in `fonts` holds more than one license file (`OFL.txt` and `LICENSE`, say). Blazon reads only the first by name and gives it to every family in that folder, so a second family can be credited with another family's license. The warning names the folder, the files and the one used. Keep one license file per family folder, each family in its own subfolder ([fonts](07-theme-and-config.md))
- `font-license-unknown`: A font's `license` looks like an SPDX identifier (`OFL-1.2`, `Apache2`, `mit`, or ids joined by `AND`, `OR` or `WITH`) and an id in it is not on the SPDX license list. The note names the closest listed ids. A license written as a name (`Proprietary`, `SIL Open Font License 1.1`) is never noted. It does not fail `--strict` ([source and license of a typeface](02-tokens.md))
- `font-family-missing`: A project that lists `fonts` has a token that names a family first which none of them loads, such as `"Mulish" is not loaded by any entry of fonts`. The book, and a PDF made from it, set that text in the next family of the stack with no sign of it. Add the font file or its stylesheet, or set `webFont` on the token when it cannot be loaded. Only families of a Google Fonts URL and of a font file are known: a stylesheet at any other URL may load anything, so the check stays quiet while one is listed. Browser and system families (`Arial`, `system-ui`, `-apple-system`, ...) are never reported
- `asset-review-missing`: An asset has a [`generated`](06-assets-and-icons.md#sidecars) field and no `review`: `logos/hero was generated by Midjourney v7 and nobody has confirmed it: set review.status to ok once a person has checked it`. Set `review: { "status": "ok" }` once a person has checked the image. An asset in several formats (`logos/mark.svg` and `logos/mark.png`) is reported once, and the message names its files. `review.status: needs-review` already gives a `review-pending` warning, so it is not reported twice. Not reported for an asset in an [experimental category](06-assets-and-icons.md#experimental-categories) or a [reference category](06-assets-and-icons.md#reference-categories)
- `icon-set-invalid`: An icon set cannot be read: a bad or repeated name, a package that is not installed, a missing or escaping `dir`, no SVGs, or an unreadable categories file. The set is left out; the others still load
- `icon-unknown`: Your `categories` map lists an icon the package does not have: `categories lists "x" under C, which pkg does not have`. A package upgrade can remove icons
- `font-meta-invalid`: A `font` on a token or group is not `{ "source": "...", "license": "...", "licenseUrl": "https://..." }` (at least one, all text, the address `http` or `https`), or it sits on a token that is not a `fontFamily` ([source and license of a typeface](02-tokens.md))
- `page-frontmatter-invalid`: A page's front matter is not valid YAML: `Front matter is not valid YAML: ... Quote values that contain ": "`. The page is left out of the book until you fix it
- `token-file-invalid`: A token file is not valid JSON, or its top level is not an object. A file named in a resolver document is reported the same way, and the other files still load. While a token file cannot be read, the findings that only say a token is missing are left out: an alias or theme role that points nowhere, a page directive with `no token at`, and a `token-type-missing` whose group was in that file. Fixing the file brings back whichever are real
- `logo-rule-invalid`: A `logo` rule on a token or group is not `{ "deny": ["onDark", ...], "reason": "..." }` ([forbidden logo backgrounds](02-tokens.md#forbidden-logo-backgrounds))
- `contrast-pair-invalid`: A contrast pair matches no color tokens, or has an unknown level
- `proportion-invalid`: A proportion needs a share between 0 and 1, or names a token that does not exist
- `review-invalid`: A token's or group's `review` is not `{ "status": "ok" or "needs-review", "note"?, "by"?, "at"?, "value"? }`: an unknown status, a `by` or `note` that is not a string, an `at` that is not a real `YYYY-MM-DD` date, a `value` that is not the 12 hex digits `blazon approvals` prints, or a `value` on a group. A sidecar's malformed `review` is an `asset-sidecar-invalid` error
- `token-invalid`: A bare value where a token object with `$value` is needed
- `token-value-invalid`: A token's value does not fit its `$type`. The message says how
- `logo-contrast-insufficient`: A color the logo paints is the color of a surface the brand book shows it on (the light-surface logo on a light surface and the dark-surface logo on a dark one; the background, the inverse surface and the accent are each judged by the text color the theme pairs with them, so a dark theme's Graphite page gets the dark-surface logo), at a contrast under 1.5:1, so that part of the logo is not there: `The light-surface logo draws #FF5A1F, which is the color of the accent color (#FF5A1F)`. The check runs in every context: a dark theme's surfaces are judged as the mode switch shows them, and a finding only that context has is tagged with it. Forbid the logo on that surface with a [`logo` rule](02-tokens.md#forbidden-logo-backgrounds), which also takes its tile off the logo usage figure, or give the brand a logo made for it. Only SVG logos are read
- `logo-missing`: The `logo` in `blazon.json` is not an image file in the project: `Logo F is not an image file in the project`
- `token-type-missing`: `No $type on the token, its groups, or the token it aliases`
- `review-pending`: A token, group or asset is marked `review.status: needs-review`. The message is its note. An asset in an [experimental category](06-assets-and-icons.md#experimental-categories) or a [reference category](06-assets-and-icons.md#reference-categories) is never reported. A flagged group reports once, at the group's path, and its tokens add none unless they set their own `review` ([reviewing a group](02-tokens.md#reviewing-a-group))
- `page-review-pending`: A page draws assets whose sidecar is still `needs-review`: `Shows 2 assets still marked needs-review: illustrations/scene, illustrations/spot`. One finding for each page, with the count and up to five asset ids. An asset in an [experimental category](06-assets-and-icons.md#experimental-categories) or a [reference category](06-assets-and-icons.md#reference-categories) is not counted. It covers the assets a folder directive or an asset id names (`assets`, `section`, `icons`, `logo-space`, `logo-lockups`, `logo-partner`, `logo-placement`). Confirm the asset and remove its flag, or take it off the page
- `config-path-outside`: A path blazon would read or write leads outside the project folder, by `../`, an absolute path or a link: `tokensDir ("../shared/tokens") is outside the project folder, or is a link that leaves it`. The keys are `tokensDir`, `docsDir`, `assetsDir`, `resolver`, `outDir`, `tokensOutDir` and the `logo` files; a token file, a page or an icon set's `categories` file that is a link to a file outside the project is named too. A folder or file that is refused is not read, so nothing in it reaches the book, `brand.json` or an agent's answer. For `outDir` and `tokensOutDir` in `blazon.json` the config does not load. `blazon build -o` is not asked. A category's `dir` (`assets.<key>.dir`) is refused the same way unless the person running blazon approved the folder with `--allow-dir` or `BLAZON_ALLOW_DIRS`; the message says so and is the same whether or not the folder exists
- `output-dirs-overlap`: An output folder is in the way of another folder. `outDir` and `tokensOutDir` are the same folder, or `tokensOutDir` holds `outDir`, so emptying one would remove the other's files. `outDir` is or holds an input (`tokensDir`, `docsDir`, `assetsDir`, a category's own folder, the resolver or a token file it names, a logo or a font file, an icon set's categories file or its package in `node_modules`, or the project itself), so `blazon build` would delete it. A build plugin's folder under `tokensOutDir` is emptied before the plugin runs, so it may not hold any of them either. `blazon check` knows the plugins in the config; a plugin named with `--plugin` is stopped with a `plugin-failed` finding just before its folder would be emptied. A symbolic link is followed: a folder reached through a link to an input is that input, and a source that is itself a link is held by the link and by its target. `outDir` or `tokensOutDir` is inside `tokensDir`, `docsDir` or `assetsDir`, so the next build would read the output as part of the brand. Give each output its own folder, such as `dist/site`. `tokensOutDir` inside `outDir` is fine
- `plugin-failed`: A [plugin](12-plugins.md) could not do its role. The message names the plugin and says which: `is not pinned, and a check plugin must be: run blazon plugin pin <path> --name acme.house-style`, `pin mismatch: pinned t1:…, found t1:…`, `no program found`, `its manifest is not one blazon loads`, `exited with 3`, `timed out after 5s`, `could not answer: <its reason>`, or `finding 2: code must start with "acme.house-style/"`. `blazon check` starts only check plugins, but it reads every configured plugin's manifest, so a build plugin whose manifest lists a variable that is set here and not approved in the plugin's `env` is reported too (`its manifest lists HOME, which is set here and not approved, so it is not started`), before the first `blazon build` would refuse it. It is never a pass: a plugin that cannot judge fails the check
- `plugin-lock-invalid`: `blazon.plugins.lock` has a mistake, or group or others can write it: `unknown key`, `acme.a: kind must be file or tree`, `is writable by group or others; run chmod go-w blazon.plugins.lock`. Every mistake is listed, and no plugin is pinned until the file is right
- `print-cmyk-invalid`: A token's `print.cmyk` is not an array of exactly four numbers from 0 to 100 (percent of each ink): `print.cmyk must be four numbers from 0 to 100 such as [100, 60, 0, 30], got [100,60,0]`. A color with no `cmyk` is never reported
- `print-pms-invalid`: A token's `print.pms` is not a non-empty single-line string: `print.pms must be a non-empty single-line string such as "2945 C", got ""`. A color with no `pms` is never reported
- `print-ral-invalid`: A token's `print.ral` is not a non-empty single-line string without the `RAL` prefix: `print.ral is written without the "RAL" prefix, which the book adds: use "5012", not "RAL 5012", got "RAL 5012"`. `RAL5012` and `RAL-5012` are refused too; `5012` and a RAL Design value such as `050 40 30` pass. A color with no `ral` is never reported
- `proportion-total-mismatch`: Proportion shares do not add up to 100%: `Shares add up to X%, not 100%`
- `resolver-invalid`: The resolver document is wrong or missing. See [Contexts](04-contexts.md#when-the-resolver-document-is-wrong)
- `section-invalid`: A page's `section:` front matter, or the `sections` config, names something that is not a section of this brand book: `"branding" is not a section; known: intro, logo, ...`. The name is left out. Fix the spelling: the [sections](05-pages.md#sections) are fixed
- `section-missing`: No page holds a standard section the brand expects: `No page holds the motion section. Declare it with "section: motion" ...`. Add a page for it, or leave the section out of `sections` in `blazon.json`. Raised only once a page declares a section or `sections` is set
- `alias-missing`: A semantic or component token holds a value instead of aliasing a primitive
- `source-css-var-invalid`: A token's `source.cssVar` is not a custom property name: `source.cssVar must be a custom property name such as "--brand-primary", got "brand-primary"`
- `starter-file-unchanged`: A file in `docs`, `tokens`, `assets` or `fonts` (a sidecar too) is still byte for byte what `blazon init` wrote: `docs/01-principles.md is still the starter's text: replace it with the brand's own.` One finding for each file, printed as one line for each folder. Edit the file and its note goes. `blazon.json` is left out, and so is the starter folder itself
- `theme-inferred`: `blazon.json` has no `theme`, so blazon took roles from conventional token names. The note lists which. See [Theme](07-theme-and-config.md#theme-roles)
- `theme-missing`: No `theme` and no token with a conventional name, so the book uses blazon's neutral colors
- `theme-unresolved`: A `theme` role points at a token that does not exist: `theme.accent points at {x}, which is not a token`
- `tokens-missing`: The tokens folder holds no tokens (it is empty, or its files hold no token), so the book has nothing to show. Add token files, or run `blazon init`
- `page-tokens-unplaced`: A page names five or more tokens in its text, by path in a code span or by a color value that a token has, and places no token with `<!-- blazon:tokens <path> -->` and shows no pictures (`blazon:assets`, `blazon:section`, `blazon:icons`), so a reader sees the values only as words: `03-color.md names 7 tokens in its text (color.base, ...)`. Place the tokens the page talks about
- `alias-type-mismatch`: A token's `$type` differs from the token it aliases: `$type T aliases {x}, which is U`
- `logo-variant-unknown`: A `logo.deny` names something that is not a logo variant: `logo.deny names "onDrak", which is not a logo variant (onLight, onDark, logos/white)`. Fix the spelling
- `usage-role-unknown`: A usage role is not one of `text`, `background`, `border`, `icon`, `illustration`, `accent`, `interactive`, or a role you added in `vocabulary.usageRoles`, or `usage.allow` or `usage.deny` is not a list. Fix the spelling, or [add the role](07-theme-and-config.md#adding-your-own-names)
- `token-type-unknown`: `$type "x" is not a DTCG 2025.10 type`
- `alias-unresolved`: `Alias {x} does not match any token`
- `usage-violated`: A token's `role` is not allowed by a token it aliases: `Used as text, but {x} is not allowed as text`. It needs two settings to fire: a `role` on the semantic token, and a `usage` on a token it aliases

## Drift from the live site

A token can say which CSS variable of the live site its value was read from, with `cssVar` in `source` ([chapter 2](02-tokens.md)). `blazon drift` then compares the two, so a site that changed after the brand book was written shows up:

```
blazon drift https://example.com
blazon drift ./public/site.css --json
```

The argument is a page or a CSS file. For an `http` or `https` address blazon fetches the page, finds each `<link rel="stylesheet" href>` in it and reads those files. A relative `href` is resolved against the page; anything that is not `http` or `https` is skipped. It reads at most 20 stylesheets of at most 5 MB each (the page too), and gives each request 10 seconds. Every request is held to the rules in [What blazon fetches](01-getting-started.md#what-blazon-fetches): public addresses only, checked again on each of at most 5 redirects, `text/html` for the page and `text/css` for a stylesheet. For a file path it reads that file.

It prints one line per token that has a `cssVar`, then a summary:

| Line | Meaning |
|---|---|
| `ok` | The token and the variable hold the same value |
| `drift` | They differ; both values are shown |
| `missing` | The page declares no such variable |

Colors compare as lowercase hex: `#F0A` is `#ff00aa`, and the alpha of an 8-digit hex is kept. Dimensions compare as number and unit, so `1.0rem` is `1rem`; `rem` and `px` are never converted into each other. Other types compare as lowercase text with spaces squeezed. A variable whose value is just `var(--other)` is followed to `--other`.

This reads the text of the CSS and does not run a browser, so it simplifies the cascade: a name declared in a `:root` or `html` rule wins over the same name anywhere else (a `.dark` theme, a media query), and the last declaration wins among those. `@import` is not followed.

`--json` prints `{ target, sources, summary, tokens }` instead. `--tokens <dir>` reads the tokens from that folder instead of the one `blazon.json` names. The exit status is 0 when every token is `ok`, 1 when any drifted or is missing, and 2 for a usage or fetch error, or when no token has a `cssVar`: a gate that compares nothing would pass for the wrong reason. Under `--json` the error is `{ "command": "drift", "passed": false, "error": { "code": ..., "message": ..., "fix": ... } }` on standard output.
