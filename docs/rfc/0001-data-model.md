# RFC 0001: Blazon data model

Status: draft, implemented · Scope: the token, metadata and context model that blazon reads, checks and compiles
Numbering: blazon RFCs, starting at 0001.

## Summary

Blazon should read [Design Tokens Format Module 2025.10][dtcg-format] (DTCG) files, contexts from the [DTCG Resolver Module][dtcg-resolver], and a small `dev.blazon` extension namespace for the brand facts DTCG doesn't cover: print specs, usage rules, provenance and tiers. Three products come out of one model: a brand book, compiled tokens, and a `blazon check` report.

The model was derived by encoding a real brand book, the Auth0 Brand Guidelines deck (June 2021, 105 slides). The encoding and the extracted source are not shipped in the repository, because the deck's text and art belong to its owner. Every requirement below cites what that deck needed.

## Motivation

The original proposal described blazon as JSON tokens plus Markdown in, CSS, TypeScript and a static site out. When the Auth0 deck was encoded against the current parser (`src/core/tokens/walk.ts`), most of the deck fit only by pushing facts into `$description` strings:

| The deck has | Example | Current blazon |
|---|---|---|
| Print specs per color | Indigo: RGB 99 93 255, CMYK 84 70 0 0, PMS 2726 C | No field. Put in `$description`. |
| Usage rules | "Do not use secondary colors for text." "Hues are for illustrations only." | Prose only. Nothing checks them. |
| Proportions | Neutrals 60%, primary 30%, secondary 10% | Prose only. |
| Tiers | Brand palette, then text/interactive roles, then button radius | One flat namespace per file |
| Two palettes with the same names | Brand `blue` `#3885FF` and product `blue.base` `#1071F2` | Works, but nothing says which to use where |
| Composite styles | "Inter Semibold 64/72px" is one style | Split across four unrelated scales |
| Gradients | "Indigo / Aqua" | A string; the angle had to be invented |
| Locale variants | Japanese uses Kinto and a smaller scale; DE/FR H1 drops 64/72 to 56/64 | No contexts |
| Source errors | Yellow ramp lists `#f3df8c` twice; product indigo darkest equals pink darkest | No way to flag for review |
| Raster logos | 213 images, no SVG | Scanner reads `.svg` only (`src/core/assets/scanner.ts`) |

The parser also diverges from DTCG on rules a DTCG file depends on:

- It infers `$type` from the file name (`inferTypeFromFilename`). DTCG says tools "MUST NOT attempt to guess the type of a token by inspecting the contents of its value." File-name guessing is worse: `fontSize` in `typography.json` is typed `typography`, not a dimension.
- The file name becomes the first path segment, so `brand.accent` in `colors.json` is `colors.brand.accent`. The resolver (`resolveTargetPath`) accepts an alias as written, then with the source file's group added, then with it removed. So `{brand.accent}` and `{colors.brand.accent}` both work inside `colors.json`, but the meaning of `{brand.accent}` depends on which file it is in. Until 2026-10-25 only the first lookup existed, and the template's own `{brand.accent}` failed to compile.
- `$extensions` are dropped (`TokenItem` has no field for them), so a DTCG file exported from Figma or Tokens Studio loses its metadata.

A brand book exists to state rules, and blazon today can only hold values. That gap is the reason for this RFC.

## Conventions

The key words "MUST", "MUST NOT", "SHOULD", "SHOULD NOT" and "MAY" are to be interpreted as described in BCP 14 [RFC2119] [RFC8174] when, and only when, they appear in all capitals.

**Token**, **group**, **alias**, **`$type`** and **`$extensions`** have their DTCG meanings. A **context** is one value of a DTCG resolver modifier (for example `locale: ja`). A **rule** is a `dev.blazon` usage constraint that `blazon check` can test.

## The model

### 1. Token files are DTCG

1. Blazon MUST accept DTCG 2025.10 token files, including composite types (`typography`, `gradient`, `shadow`, `border`, `transition`) and `$deprecated`.
2. `$type` MUST come from the token or an ancestor group. Blazon MUST NOT infer it from the file name or the value. A token with no resolvable `$type` is an error in `blazon check`.
3. All files in `tokensDir` merge into one tree. **The file name is not part of the token path.** Aliases are full paths from the root (`{color.brand.indigo}`).
4. Blazon MUST keep `$extensions` it doesn't understand, on a token or on a group, and pass them through to `tokens.json` at the path where they were written. A group's `dev.blazon` key is not written back: blazon reads it and applies it to the group's tokens.
5. A `dimension` in a print unit (`pt`, `pc`, `in`, `cm`, `mm` or `Q`) is a `token-value-invalid` error whose message gives the px value at CSS's 96px to the inch (1pt = 4/3 px). DTCG allows `px` and `rem`; a screen token in a print unit was copied from print, and other DTCG tools cannot read it. A relative unit such as `em` or `%` is kept and written to CSS as it is.

Decision 3 is the load-bearing one. It makes blazon files portable to Style Dictionary, Tokens Studio and any DTCG tool, and it removes the file-dependent alias lookup above. Its cost is in [Compatibility](#compatibility).

### 2. The `dev.blazon` extension

Brand facts that DTCG has no slot for live under `$extensions["dev.blazon"]`, the reverse-domain key the DTCG format recommends. Every field is optional. A group's fields are inherited by its tokens, and a token can override them.

```jsonc
{
  "color": {
    "secondary": {
      "$type": "color",
      "$extensions": {
        "dev.blazon": {
          "tier": "primitive",
          "usage": { "deny": ["text"] },
          "source": { "doc": "auth0-brand-guidelines", "locator": "slide 36" }
        }
      },
      "pink": {
        "$value": "#FF44DD",
        "$extensions": {
          "dev.blazon": { "print": { "cmyk": [18, 88, 0, 0], "pms": "239 C" } }
        }
      }
    }
  }
}
```

| Field | Type | Meaning | Auth0 case |
|---|---|---|---|
| `role` | one usage role | The role this token plays. `blazon check` tests it against the `usage` of every token it aliases. | `text.*` has role `text` |
| `tier` | `"primitive" \| "semantic" \| "component"` | Where the token sits. A semantic or component token SHOULD alias a token from a lower tier. | Brand palette → `text.brand` → `radius.button` |
| `usage.allow`, `usage.deny` | arrays of roles from a standard vocabulary: `text`, `background`, `border`, `icon`, `illustration`, `accent`, `interactive`, plus any name the brand adds in `vocabulary.usageRoles` (section 14) | Where the value may appear | Secondary palette denies `text`; hues allow only `illustration` |
| `print` | `{ cmyk?: [c,m,y,k], pms?: string, ral?: string }` | Print equivalents. RGB is derived from `$value` and not stored. `cmyk` MUST be an array of exactly four numbers, each from 0 to 100 inclusive, the percent of cyan, magenta, yellow and black (`print-cmyk-invalid` otherwise). `pms` MUST be a non-empty single-line string such as `2945 C` (`print-pms-invalid` otherwise). `ral` is a RAL number such as `5012`, written without the `RAL` that a renderer puts before it; it MUST be a non-empty single-line string that does not start with `RAL` followed by anything but a letter, so `RAL 5012`, `RAL-5012` and `RAL5012` are refused and `5012` and the RAL Design value `050 40 30` are not (`print-ral-invalid` otherwise). | Every brand color; a signage brand adds `ral` |
| `source` | `{ doc: string, locator: string, cssVar?: string }` | Where the value came from. `cssVar` names the custom property of the live site it was read from, and starts with `--` (`source-css-var-invalid` otherwise); `blazon drift` compares the two | `slide 35` |
| `review` | `{ status: "ok" \| "needs-review", note?: string, by?: string, at?: string, value?: string }` | Whether a person has confirmed the value. `needs-review` marks a value that is known or suspected to be wrong, or that nobody has confirmed yet. `ok` records that someone confirmed it: `by` says who (free text) and `at` when (a real date, `YYYY-MM-DD`); `note` stays free text and blazon does not check it. `value` is the fingerprint of the value that was confirmed, that `blazon approvals` prints: 12 hex digits, the sha-256 of the token's `$type` and resolved value (aliases replaced) in the default context, truncated, specified exactly in "The review fingerprint" below. On an asset it is one fingerprint for the asset id, which covers every file the id has. When `status` is `ok` and `value` is a fingerprint that no longer matches, `blazon check` warns `approval-stale`; an `ok` with no `value` is never stale, and a resolver context is not checked. A `review` of the wrong shape, or a `value` on a group (a group has no value of its own), is a `review-invalid` error On a group it flags the group once (`needs-review` at the group's path) and is not inherited: its tokens report nothing unless they set their own `review`; `ok` on a token or nearer group clears it | `hue.yellow.400` duplicates `hue.yellow.300` |
| `logo` | `{ deny: string[], reason?: string }` | Logo variants (`onLight`, `onDark`, or a logo asset id) the brand forbids on this background whatever their contrast; `blazon:logo-contrast` marks them forbidden with the reason | Magenta forbids the white logo |
| `angle` | number of degrees | Gradient direction, which DTCG gradients don't carry | Not in the deck; set as a decision |
| `preview` | `radius`, `square`, `stroke`, `tracking`, `fontSize`, `frame`, `opacity`, `border` or `bar` | How the brand book previews a token, when its `$type` and name do not say it | Not set; the viewer infers every Auth0 preview from type and name |
| `webFont` | `false`, or a sentence | On a `fontFamily` token: the brand book cannot load this typeface, as a commercial font with no web stylesheet, and the sentence says why or what to use. The Typography page then says the brand book does not load it, and that a specimen uses the first font of its stack the reader's computer has | Not set; Auth0's fonts load from Google Fonts. Slack sets `false` on its three commercial typefaces |
| `font` | `{ source?: string, license?: string, licenseUrl?: string, role?: string, reason?: string, fallbackFor?: string }` | On a `fontFamily` token or a group of them: where the typeface comes from (a name or an http(s) address), its license (an SPDX identifier or a name), the address of the license text, its `role` in the brand (one of `primary`, `secondary`, `display`, `monospace`, `fallback`), a `reason` (one line, up to 160 characters: why it has that role, or why a fallback was chosen) and, for a `fallback` only, `fallbackFor` (up to 80 characters: the family name or the font token path it stands in for). At least one field; no other field. An unknown `role` is `font-meta-invalid`; a `reason` that has a line break, is over 160 characters or is not text, and a `fallbackFor` on another role, over 80 characters or with a line break, is a `font-role-invalid` warning, and that value is left out of what blazon prints. The new fields are additive (section 12: adding a field does not change `version`, and a reader MUST ignore keys it does not know), so `brand.json` carries them on the token's `blazon.font` and `version` stays 2. A malformed value, or `font` on a token that is not a `fontFamily`, is `font-meta-invalid`. The Typography page shows what is stated, `blazon fonts` prints the role and reason, and `blazon.press-kit` prints the source and license in `fonts.txt` in place of `not stated`, with a `Role:` line, a `Why:` line and, for a fallback, `Stands in for:`. The facts are the brand's word: blazon does not infer a license from a family name. A `license` that looks like an SPDX identifier but is not one on the list (`OFL-1.2`, `Apache2`, `mit`) is a `font-license-unknown` note, never an error; a name in words is left alone | Not set |

#### The review fingerprint

A `review.value` records which value a person confirmed. This subsection is normative: a second implementation MUST compute the same digits, or its `approval-stale` answers are wrong about every approval.

**One algorithm.** A `review.value` is exactly 12 lowercase hex digits, computed as below. Anything else is `review-invalid`. There is no algorithm id: a change to anything below that could change a digest changes every recorded fingerprint, and a project then runs `blazon approvals` and records the new ones, as it would to approve the values again.

**A token.** The input is a UTF-8 text, the JSON serialization of the two-element array `[T, V]`, where `T` is the token's `$type` string, or `null` when it has none, and `V` is its resolved value: the DTCG value with every alias replaced, in the default context. The text has no whitespace outside strings, no byte order mark and no trailing newline, and is written like this:

- an object is `{`, its members as `"key":value` in ascending order of key, compared as strings of UTF-16 code units (the order of JavaScript's `<`), separated by `,`, then `}`; a member whose value is undefined (absent) is left out, so `{"a":1,"b":undefined}` is written `{"a":1}`; an empty object is `{}`;
- an array is `[`, its elements in their order separated by `,`, then `]`; an element that is undefined is written `null`;
- a string, and every key, is written as a JSON string (ECMA-404 and ECMA-262 `JSON.stringify`): enclosed in `"`, with `"` as `\"`, `\` as `\\`, the control characters U+0008, U+0009, U+000A, U+000C and U+000D as `\b`, `\t`, `\n`, `\f` and `\r`, every other control character below U+0020 as `\u` and four lowercase hex digits, and a lone surrogate as `\u` and four lowercase hex digits; every other character, including `/`, U+007F and anything non-ASCII, is written as itself;
- a number is written in the shortest form that reads back as the same IEEE 754 double (ECMA-262 `Number::toString`): `24`, `1.5`, `-0.01`, `1e+21`, `1e-7`; an integral value has no fraction or exponent below 1e21, and `-0` is written `0`; a number that is not finite is written `null`;
- `true`, `false` and `null` are written as those words.

The bytes hashed are the UTF-8 encoding of that text. The fingerprint is the SHA-256 of those bytes, as lowercase hex, truncated to its first 12 digits (48 bits).

**An asset.** The approval belongs to the asset id, not to a file: an id with several files (`logos/mark.svg` and `logos/mark.png`, one sidecar, section 7) is one asset, and its sidecar has one `review.value`.

- An id with one file: the bytes of the image file as stored on disk, hashed directly: no serialization, no `$type`, no normalization of line endings or of SVG markup. The same SHA-256 and the same truncation. The value is the same as it was before an id could have a second file, so an approval recorded then still holds.
- An id with several files: the input is a UTF-8 text with one line for each file, the lines in ascending byte order of the file names (the UTF-8 bytes of the name with its extension, such as `mark.png`). A line is the file name, one NUL byte (U+0000), the full 64 lowercase hex digits of the SHA-256 of that file's bytes as stored on disk, and one line feed (U+000A), the last line included. The fingerprint is the SHA-256 of the text, truncated to 12 digits as above. Adding, removing or changing any file changes it; renaming a file changes it because the name is part of the text.

The files of an id are the files of that name in one folder. Two folders that give one id are an error (`asset-id-duplicate`) and have no defined fingerprint.

**Not part of it, on purpose.** The `review` itself and the rest of `dev.blazon` (`usage`, `role`, `tier`, `print`, `source`, and so on); the token's `$description`, `$deprecated`, name and path; its alias form (only the resolved value counts, so re-pointing an alias at a token with the same value keeps the approval); the order in which a composite's members were authored; every context other than the default; for an asset, its sidecar (the sidecar is where the approval is written, so editing it MUST NOT void it) and its folder. An item that has no readable value (an alias that does not resolve, an unreadable file) has no fingerprint and is not compared.

Test vectors. Each input text is the exact text hashed; `blazon` computes the fingerprints, and a test (`test/docs/rfc.test.ts`) fails when the code and this table disagree. The asset rows give the file's bytes in hex; the asset id rows give each file's name and bytes, and their input text with the NUL and the line feed written as words.

| Vector | `$type` | Resolved value | Input text | Fingerprint |
|---|---|---|---|---|
| color | `color` | `"#635DFF"` | `["color","#635DFF"]` | `bfdf8462e5d4` |
| dimension | `dimension` | `{"value":24,"unit":"px"}` | `["dimension",{"unit":"px","value":24}]` | `77c494afa6c5` |
| shadow | `shadow` | `{"offsetY":{"value":4,"unit":"px"},"offsetX":{"value":0,"unit":"px"},"blur":{"value":12,"unit":"px"},"spread":{"value":0,"unit":"px"},"color":"#00000040"}` | `["shadow",{"blur":{"unit":"px","value":12},"color":"#00000040","offsetX":{"unit":"px","value":0},"offsetY":{"unit":"px","value":4},"spread":{"unit":"px","value":0}}]` | `1fd704174b04` |
| typography | `typography` | `{"fontFamily":["Inter","sans-serif"],"fontSize":{"value":1.5,"unit":"rem"},"fontWeight":600,"lineHeight":1.25,"letterSpacing":{"value":-0.01,"unit":"em"}}` | `["typography",{"fontFamily":["Inter","sans-serif"],"fontSize":{"unit":"rem","value":1.5},"fontWeight":600,"letterSpacing":{"unit":"em","value":-0.01},"lineHeight":1.25}]` | `44e2c0e44421` |
| no type, non-ASCII | none | `"Café \"Ünï\""` | `[null,"Café \"Ünï\""]` | `d0de73d86d87` |
| asset, 6 bytes | n/a | `3c7376672f3e` | the 6 bytes of `<svg/>` | `d4dc56669143` |
| asset id, two files | n/a | `mark.png`: `89504e47`; `mark.svg`: `3c7376672f3e` | `mark.png`, NUL, `0f4636c78f65d3639ece5a064b5ae753e3408614a14fb18ab4d7540d2c248543`, LF, `mark.svg`, NUL, `d4dc56669143034f31aa309635d4113d9ad76a02b1739da22c965ed2049be9e6`, LF | `cf70a5790b77` |
| asset id, three files | n/a | `mark.png`: `89504e47`; `mark.svg`: `3c7376672f3e`; `mark.webp`: `52494646` | the two lines above, then `mark.webp`, NUL, `a40ff3d5900fb7698b8c865041347cb49eccedc8f93945f89629ad104aaecce4`, LF | `05de102365e8` |
| asset, 4 bytes | n/a | `000102ff` | the 4 bytes 0x00 0x01 0x02 0xFF | `3d1f57c98497` |

Proportions ("60/30/10") and contrast pairings are group-level rules:

```jsonc
"$extensions": { "dev.blazon": {
  "proportion": { "color.neutral": 0.6, "color.primary": 0.3, "color.secondary": 0.1 },
  "pairs": [ { "fg": "{color.text.primary}", "bg": "{color.secondary.*}", "min": "AA" } ]
}}
```

`proportion` keys are group paths with a share (as above), or labels with the tokens they cover when a brand's buckets do not match its groups: `"White": { "share": 0.5, "tokens": ["{color.neutral.white}"] }` (Auth0's web color usage, slide 84). Blazon checks the token references and that the shares add up to 100% (within 0.5%), but not the composition itself. `pairs` is checked (see 4).

### 3. Contexts use the DTCG resolver

A `blazon.resolver.json` (DTCG Resolver Module) MAY sit beside the token files. Without one, blazon behaves as if every file is in one set with no modifiers.

The Auth0 locale case:

```json
{
  "version": "2025.10",
  "sets": { "base": { "sources": [{ "$ref": "tokens/base.json" }] } },
  "modifiers": {
    "locale": {
      "contexts": {
        "en": [],
        "ja": [{ "$ref": "tokens/locale/ja.json" }],
        "de": [{ "$ref": "tokens/locale/de.json" }]
      },
      "default": "en"
    }
  },
  "resolutionOrder": [{ "$ref": "#/sets/base" }, { "$ref": "#/modifiers/locale" }]
}
```

Output per context:

- **CSS:** the default context goes under `cssSelector`. Each other context emits only the tokens that differ, under a selector set per modifier in `blazon.json` (for example `locale` → `:lang({context})`, `theme` → `[data-theme="{context}"]`).
- **TypeScript:** `tokens` holds the default context, and `contexts.<modifier>.<name>` holds the overrides.
- **Brand book:** a context switcher.

The brand and product palettes are not contexts. Both are always present, and they are told apart by `usage` and `tier`. A context is only for values that replace each other.

As implemented (`src/core/tokens/resolver/`):

- The resolver document is `blazon.resolver.json` in the project root, or `resolver` in `blazon.json`. With one, blazon loads only the files it names; without one, every file in `tokensDir`.
- Sources merge as DTCG documents: groups key by key, tokens replaced whole, so an override with no `$type` inherits its group's type from an earlier source. Aliases resolve after the merge (Resolver §6.3).
- Every modifier MUST have a `default`. The defaults are blazon's main output; each other context is compiled with one modifier changed at a time. Combinations (Japanese and dark at once) are not compiled; their CSS blocks cascade.
- A context lists the tokens whose resolved value differs from the default context, aliases included (switching the body family to Kinto changes every `type.*` style that uses it), and the tokens it leaves out: a token the default has and the context does not (a context that replaces the default's set instead of adding to it) is in the context's `removed` list. It is not in that context's `tokens.<modifier>.<context>.json`, and a reader that puts the context together from the default and its changes drops it. Group changes follow the same rule: a group whose `$description` or `dev.blazon` rules differ in a context is listed in full (`groupChanges`), and a default group that carries none in the context is in `removedGroups`.
- CSS cannot take a token away. A token a context removes has no declaration in that context's CSS block and none in `contexts` in `tokens.ts`, so under that selector it keeps the default's value. This is a known limit of the CSS and TypeScript outputs, and the shipped plugins that read contexts (`blazon.shadcn`, `blazon.platform-tokens`) emit nothing for a removed token for the same reason. The DTCG file, `brand.json` and the read commands (`blazon get`, `list` and `can` with `--theme`) honor the removal: a token the theme removed is not in it. The check `context-css-unchanged` (info) tells the author, once for each context that removes tokens, that the CSS keeps the default's value for them; it names the context, the count and the first five paths.
- Outputs: a CSS block per context under its selector (`contextSelectors` in config overrides the defaults), `contexts` in `tokens.ts`, and a complete `tokens.<modifier>.<context>.json` per context.
- Checks run in every context; a finding that only occurs in one is tagged with it (`locale=ja`).
- Spec violations are `resolver-invalid` errors, not exceptions: wrong `version`, missing `resolutionOrder`, a modifier with no contexts or a `default` that is not one of them, a modifier, context or inline item name that is not letters, digits, `_` and `-` (the names become file names, selectors and CSS comments, and the DTCG module does not restrict them), an inline name that repeats a declared set or modifier, a pointer to nothing, a circular set reference, a source referencing a modifier, a file reference with a JSON pointer fragment (not supported), or a file outside the project.

### 4. `blazon check`

A new command, which also runs at the start of `blazon build`:

| Check | Severity | Auth0 example it would catch |
|---|---|---|
| Unresolvable or circular alias, or an alias mixed into other text | error | Template `{brand.accent}` |
| Missing or unknown `$type`, a bare value with no `$value`, a value that does not fit its `$type`, an alias to a token of another type | error | none in the fixture |
| A token whose `role` the usage of a token it aliases does not allow (a semantic `text.*` aliasing a `deny: ["text"]` token) | error | `text.brand` → `color.secondary.pink` |
| `theme` or `logo` in `blazon.json` points at a token or file that does not exist, or `logo` is not set | error | none in the fixture |
| A guideline page whose front matter is not valid YAML (the page is left out) | error | an unquoted description containing ": " |
| A proportion bucket naming a token that does not exist | error | none in the fixture |
| Proportion shares that do not add up to 100% | warning | none in the fixture |
| `pairs` contrast below WCAG 2.2 level | error | Neutral text on yellow |
| Two primitives in one group with the same value | warning | `hue.yellow.400` = `hue.yellow.300` |
| `review.status: needs-review` | warning, listed in the brand book | Product ramp copy errors |
| Semantic or component token with no alias anywhere in its value (a composite whose parts alias primitives counts as aliased) | warning | none in the fixture |
| A page directive that is unknown, has the wrong argument count, names a token of the wrong type or an asset that does not exist, or draws a logo that is not configured (`src/core/docs/directives.ts` is the table) | error | a typo in `blazon:spots illustration.stroke.onGray` |
| No `theme` in `blazon.json` | info | none in the fixture: blazon infers roles from conventional token names (`src/core/tokens/theme.ts`) and says which (`theme-inferred`), or that none matched (`theme-missing`) |
| A path defined in two files (the later file wins), an alias to a `$deprecated` token | warning | none in the fixture |

**Code names.** A code MUST be kebab-case and have the form `<area>-<problem>`: the area first, naming what the check looks at, and the problem last, one word from the list `PROBLEMS` in the catalogue (`invalid`, `unknown`, `unresolved`, `missing`, `duplicate`, `unreadable`, `unused`, `stale`, `mismatch`, `violated`, `pending` and a few single-case words). The same trouble takes the same word in every area. Codes are public surface and freeze at 1.0; a reader MUST treat a code it does not know as unknown, and blazon keeps no alias for a name it dropped. A test fails for a code that breaks the rule ([manual, Checks](../manual/03-checks.md#how-codes-are-named)).

**Finding codes.** Each finding has a `code`, a `severity` and a `path`. The check catalogue, `src/core/checker/catalogue.ts`, is the machine-readable form of the list below: for each code it holds the severity, a one-sentence summary, the RFC section that names the code and the manual page that explains it. The table is written from the catalogue by `npm run checks-docs` and a test fails when it differs. The text after the table says what each code means, and it is normative: where the two differ, this text decides. Codes that plugins report (`name/code`) are not in the catalogue. The manual's chapter on checks says what to do about each code.

<!-- checks:begin -->
| Code | Severity | Summary |
|---|---|---|
| `alias-circular` | error | Aliases lead back to the token that started them. |
| `alias-deprecated` | warning | A token aliases a token marked deprecated. |
| `alias-embedded` | error | An alias is mixed with other text in one value. |
| `alias-missing` | warning | A semantic or component token holds a literal value instead of an alias. |
| `alias-type-mismatch` | error | A token has a different $type from the token it aliases. |
| `alias-unresolved` | error | An alias names no token. |
| `approval-stale` | warning | A token or asset was approved, and its value changed after. |
| `asset-config-invalid` | error | An asset category in the config is not a valid object or has a bad rule. |
| `asset-config-unused` | warning | An asset category in the config matches no asset. |
| `asset-id-duplicate` | error | Two files in different folders have the same asset id. |
| `asset-local-missing` | info | A category kept out of git has no images on this machine. |
| `asset-misuse-unknown` | error | A logo misuse kind, in a sidecar or in a blazon:logo-misuse directive, is not one blazon draws. |
| `asset-review-missing` | warning | A generated asset has no review yet. |
| `asset-rule-violated` | error | An asset breaks the rules of its category. |
| `asset-sidecar-invalid` | error | An asset sidecar is not valid JSON or holds a field blazon does not know. |
| `asset-sidecar-orphaned` | warning | A sidecar has no image of the same name beside it. |
| `asset-unreadable` | error | An asset file cannot be read, so it is left out of the book. |
| `config-invalid` | error | A key or value in blazon.json is not valid. |
| `config-path-outside` | error | A path in blazon.json, or a file linked from a brand folder, leads outside the project folder. |
| `context-css-unchanged` | info | A context leaves out tokens the default has, but the CSS cannot remove a custom property, so theme.css keeps the default value for them. |
| `contrast-insufficient` | error | A color pair, or a logo colorway, has less contrast than its level asks for. |
| `contrast-pair-invalid` | error | A contrast pair names no color tokens or has an unknown level. |
| `contrast-unknown` | warning | Blazon cannot read a color of a pair or of a logo colorway, or its background is translucent, so it cannot measure the contrast. |
| `css-variable-duplicate` | error | Two tokens write the same CSS custom property. |
| `directive-deprecated` | warning | A page has a `folio:` directive comment, the old name, which blazon ignores. |
| `directive-invalid` | error | A page directive has wrong arguments or names something that does not exist. |
| `directive-unknown` | error | A page uses a directive name blazon does not have. |
| `font-family-missing` | warning | A font family a token uses is not loaded by any fonts entry. |
| `font-file-invalid` | error | A font entry names a file that is missing or not a font. |
| `font-license-invalid` | warning | A license file beside a font file was not read. |
| `font-license-unknown` | info | A font license is not a known SPDX id. |
| `font-meta-invalid` | error | The font fields on a token are not valid. |
| `font-role-invalid` | warning | A font reason or fallbackFor is not valid, so it is left out. |
| `icon-set-invalid` | error | An icon set in the config cannot be loaded. |
| `icon-unknown` | warning | An icon set category lists an icon the package does not have. |
| `logo-contrast-insufficient` | warning | A logo variant draws the color of the surface it is shown on. |
| `logo-missing` | error | No logo is configured, or the configured logo is not an image file in the project. |
| `logo-rule-invalid` | error | A logo rule on a token is not in the shape blazon reads. |
| `logo-variant-unknown` | error | A logo rule denies a variant the logo does not have. |
| `output-dirs-overlap` | error | An output folder is or holds an input, or is inside one. |
| `page-frontmatter-invalid` | error | A page front matter is not valid YAML or has a field of the wrong type. |
| `page-review-pending` | warning | A page shows assets that are still marked needs-review. |
| `page-slug-duplicate` | error | Two pages have the same slug, so the book opens only the first. |
| `page-tokens-unplaced` | info | A page names many tokens but places none of them. |
| `page-unreadable` | error | A page file cannot be read, so it is left out of the book. |
| `pin-invalid` | error | blazon.lock is not a valid pin. |
| `pin-mismatch` | error | The blazon build in use is not the commit blazon.lock names. |
| `plugin-failed` | error | A check plugin could not run or broke the plugin protocol. |
| `plugin-lock-invalid` | error | The plugin lock file is not valid. |
| `print-cmyk-invalid` | error | The print cmyk value is not four numbers from 0 to 100. |
| `print-pms-invalid` | error | The print pms value is not a non-empty single-line string. |
| `print-ral-invalid` | error | The print ral value is not a valid RAL code. |
| `proportion-invalid` | error | A proportion share is out of range or names a token that does not exist. |
| `proportion-total-mismatch` | warning | Proportion shares do not add up to 100%. |
| `resolver-invalid` | error | The resolver file is missing or breaks the DTCG resolver rules. |
| `review-invalid` | error | A review field has a bad status, date or fingerprint. |
| `review-pending` | warning | A token or asset is marked needs-review. |
| `section-invalid` | error | The sections setting names a section blazon does not have or has the wrong shape. |
| `section-missing` | info | No page holds a section the book lists. |
| `source-css-var-invalid` | error | source.cssVar is not a custom property name. |
| `starter-file-unchanged` | info | A file in the docs, tokens, assets or fonts folder is still the starter text. |
| `starter-logo-unchanged` | warning | A configured logo is still blazon's own mark, byte for byte. |
| `theme-inferred` | info | No theme is set, so blazon took the theme roles from token names. |
| `theme-missing` | info | No theme is set and no token has a conventional name, so blazon uses neutral colors. |
| `theme-unresolved` | error | A theme role points at a token that does not exist. |
| `token-extension-deprecated` | warning | A token or group has a `dev.folio` extension key, the old name, which blazon ignores. |
| `token-file-invalid` | error | A token file is not valid JSON or its top level is not an object. |
| `token-invalid` | error | A token is a bare value instead of an object with $value, or a name contains ".", "{" or "}". |
| `token-path-duplicate` | warning | Two token files define the same path. |
| `token-type-missing` | error | A token has no $type, and neither its groups nor its alias target give one. |
| `token-type-unknown` | error | A $type is not a DTCG type. |
| `token-value-duplicate` | warning | Two primitive tokens in one group have the same value. |
| `token-value-invalid` | error | A token value does not fit its $type. |
| `tokens-missing` | warning | The tokens folder holds no tokens. |
| `usage-role-unknown` | error | A usage role is not one blazon knows. |
| `usage-violated` | error | A token is used as a role that the token it aliases does not allow. |
<!-- checks:end -->

**Order.** An implementation MUST report findings in one total order: by severity (`error`, then `warning`, then `info`), then `path`, `code`, `context`, `file`, `line` and `message`, each in turn when the ones before it are equal. Strings compare by UTF-16 code unit, never by locale, so the order is the same on every host. A finding without `context`, `file` or `line` sorts before one that has it. Two runs over the same input report the same findings in the same order.

What each code means:

- `approval-stale`: A token or asset has `review.status: ok` and a `review.value` fingerprint, and its value no longer matches it; the message gives the fingerprint to set once a person has confirmed the new value (section 2)
- `asset-config-invalid`: An entry of the `assets` config block has an unknown field or a value of the wrong type (section 11); the entry is left out whole
- `asset-config-unused`: An `assets` key names a category with no assets, usually a typo of the folder name
- `asset-id-duplicate`: Two files from different folders have one asset id
- `asset-local-missing`: A local category (section 11) has no image in this checkout; the findings that follow from it are not reported
- `asset-rule-violated`: A file breaks the `rules` of its category: format, pixel size or aspect ratio
- `asset-sidecar-invalid`: A sidecar is not valid JSON, has an unknown or malformed field, or leaves the assets folder (section 7)
- `asset-sidecar-orphaned`: A sidecar has no image of its name beside it
- `alias-circular`: An alias leads back to itself
- `config-invalid`: `blazon.json` has an unknown key or a value of the wrong type (section 14)
- `contrast-insufficient`: A `pairs` contrast pair is below its WCAG level
- `contrast-unknown`: A pair has a value that is not a CSS color (a gradient, a `var()`), so it cannot be measured
- `css-variable-duplicate`: Two tokens write one CSS custom property in the same output block (`theme.css` or a resolver context's block); reported at the later token, the first keeps the variable
- `alias-deprecated`: A token aliases one marked `$deprecated`
- `directive-deprecated`: A page has `<!-- folio:name -->`, the old spelling, which blazon does not read; reported at its page and line
- `directive-invalid`: A page directive has the wrong arguments, or names a token, asset, category or icon set that does not exist
- `directive-unknown`: A page uses `blazon:` with a name that is not in the directive table
- `token-extension-deprecated`: A token or group has an `$extensions` key that starts `dev.folio`, the old name of `dev.blazon`, which blazon ignores
- `token-path-duplicate`: A token path is defined in two files; the later file wins
- `token-value-duplicate`: Two color primitives in one group have the same value
- `alias-embedded`: An alias is mixed into other text instead of being the whole value
- `pin-invalid`: `blazon.lock`, the file that pins the blazon a book builds with, is not valid JSON, has a key other than `v` and `commit`, or its `commit` is not a full 40-digit lowercase git hash. The lock is never read as a pin in that case; reported with the file and, where it can be placed, the line
- `pin-mismatch`: `blazon.lock` pins a blazon commit and the blazon running is not it: it was built from, or is at, another commit; the tree it was built from had uncommitted changes; or it cannot say which commit it is (no git checkout, no build stamp). A pin that cannot be checked is not met. A book with no `blazon.lock` is not checked
- `font-file-invalid`: A font file in `fonts` is missing or is not a format blazon embeds
- `font-license-unknown`: A font's `license` is shaped like an SPDX identifier or expression (one word with a digit, a hyphen or a plus, a known id in the wrong case, or ids joined by `AND`, `OR` or `WITH`) and an id in it is not on the SPDX license list. The note names the closest listed ids. `blazon` carries a dated snapshot of the list (`src/core/checker/spdx-ids.json`, rewritten by `scripts/update-spdx-ids.mjs`) and never goes to the network
- `font-role-invalid`: A font's `reason` has a line break, is over 160 characters or is not text, or its `fallbackFor` is on a role that is not `fallback`, is over 80 characters or has a line break. A warning, not an error: the typeface is fine, and the value is left out of `blazon fonts`, `fonts.txt` and the press kit page. An unknown `role` is `font-meta-invalid`, an error
- `font-family-missing`: A project that lists `fonts` has a token whose first family none of them loads
- `asset-review-missing`: An asset has `generated` in its sidecar and no `review` (section 7), once for each id; not reported for an asset in an experimental or reference category (section 11)
- `icon-set-invalid`: An icon set cannot be read: its name, package, folder or categories file is wrong (section 9)
- `icon-unknown`: A categories map names an icon the package does not have
- `font-meta-invalid`: A `font` on a token or group is not `{ source?, license?, licenseUrl? }` of non-empty single-line strings (at least one), has an address that is not http(s), or sits on a token that is not a `fontFamily`
- `page-frontmatter-invalid`: A page's front matter is not valid YAML; the page is left out
- `token-file-invalid`: A token file is not valid JSON, or its top level is not an object
- `logo-rule-invalid`: A `logo` rule on a token or group is not `{ deny: string[], reason?: string }`
- `contrast-pair-invalid`: A contrast pair matches no color tokens, or has an unknown level
- `proportion-invalid`: A proportion share is outside 0 to 1, or names a token that does not exist
- `review-invalid`: A token's or group's `review` is not `{ status, note?, by?, at?, value? }`: an unknown status, a `by` or `note` that is not a string, an `at` that is not a real `YYYY-MM-DD` date, a `value` that is not 12 lowercase hex digits, or a `value` on a group (section 2)
- `token-invalid`: A bare value where a token object with `$value` is needed
- `token-value-invalid`: A token's value does not fit its `$type`, or a dimension is in a print unit (section 1)
- `logo-contrast-insufficient`: A color an SVG logo paints is within 1.5:1 contrast of a theme surface the brand book shows that logo on, in any context, and no `logo` rule forbids the logo there. The light-surface logo is shown on a light surface and the dark-surface logo on a dark one, judged by the text color the theme pairs with the surface
- `logo-missing`: The configured `logo` is not an image file in the project
- `token-type-missing`: A token has no `$type`, and neither do its groups or the token it aliases
- `needs-review`: A token, group or asset is marked `review.status: needs-review`; not reported for an asset in an experimental or reference category (section 11)
- `page-review-pending`: A page draws an asset whose sidecar is `review.status: needs-review`; an asset in an experimental or reference category (section 11) is not counted
- `output-dirs-overlap`: `outDir` and `tokensOutDir` are the same folder, or `tokensOutDir` holds `outDir`; `outDir` is or holds an input the build reads; `outDir` or `tokensOutDir` is inside an input folder (sections 12 and 14)
- `plugin-failed`: A plugin could not do its role: it is not pinned when it must be, its pin no longer matches, it could not be found, its manifest is not one blazon loads, a call broke (a timeout, an exit that is not an answer, too much output), it could not answer, or its answer breaks the rules for findings (RFC 0002 of blazon, section 2)
- `plugin-lock-invalid`: `blazon.plugins.lock` is not valid, or can be written by group or others; no plugin is pinned until it is fixed
- `print-cmyk-invalid`: A token's `print.cmyk` is not an array of exactly four numbers, each from 0 to 100
- `print-pms-invalid`: A token's `print.pms` is not a non-empty single-line string
- `print-ral-invalid`: A token's `print.ral` is not a non-empty single-line string, or starts with `RAL`
- `proportion-total-mismatch`: Proportion shares do not add up to 100%
- `resolver-invalid`: The resolver document is missing or wrong (section 3)
- `section-invalid`: A page's `section` or the `sections` config names something that is not a section of this brand book (section 13)
- `section-missing`: No page holds a standard section the brand expects (section 13)
- `alias-missing`: A semantic or component token holds a value instead of aliasing a primitive
- `source-css-var-invalid`: A token's `source.cssVar` is not a custom property name
- `starter-file-unchanged`: A file in the docs, tokens, assets or `fonts/` folder is byte for byte the file `blazon init` copied there
- `theme-inferred`: No `theme` in the config, so roles were taken from conventional token names
- `theme-missing`: No `theme`, and no token has a conventional name
- `theme-unresolved`: A `theme` role points at a token that does not exist
- `tokens-missing`: The tokens folder holds no tokens, so the book has nothing to show
- `page-tokens-unplaced`: A page names five or more tokens in its text and places no token (`blazon:tokens`) and shows no picture (`blazon:assets`, `blazon:section`, `blazon:icons`)
- `alias-type-mismatch`: A token's `$type` differs from the type of the token it aliases
- `logo-variant-unknown`: A `logo.deny` entry is neither `onLight`, `onDark` nor a logo asset id
- `usage-role-unknown`: A `role` or usage entry is not a usage role: a standard one, or one added in `vocabulary.usageRoles` (section 14)
- `token-type-unknown`: A `$type` is not a DTCG 2025.10 type
- `alias-unresolved`: An alias matches no token
- `usage-violated`: A token's `role` is not allowed by the usage of a token it aliases

`--strict` turns warnings into errors for CI. An `info` finding is a note for the author: it never fails a check, even with `--strict`, and the brand book does not show it.

### 5. Outputs

- **CSS variable names** are the token path, kebab-cased, after `cssPrefix`. With no file-name segment, `color.brand.indigo` becomes `--color-brand-indigo` whichever file declares it.
- **`typography` composites** emit one variable per property (`--type-h1-font-size` and so on), plus a `.type-h1` class in `typography.css`, which is written whenever typography tokens exist.
- **`gradient` composites** emit `linear-gradient(<angle>deg, <stops>)`, with `angle` from `dev.blazon`, default 180.
- **`tokens.json`** is DTCG with aliases resolved and `$extensions` kept, on tokens and on groups, so other tools can read it. A group's `$description`, `$type` and `$deprecated` are not written: a token carries its own resolved `$type` and `$deprecated`, and a group's description lives in the brand book and `brand.json`.
- **`tokens.ts`** keeps today's typed `getToken` / `getVar` helpers (`src/core/tokens/formatters/ts.ts`).

### 6. The brand book wears the brand

A brand book that looks like the tool and not the brand fails its main job. Auth0 made this concrete: the deck's identity is its typefaces, its indigo and black section openers, and its logo rules. A generic dark dashboard showed none of it. So the viewer takes its presentation from the brand's own data:

- `theme` in `blazon.json` maps viewer roles (`background`, `canvas`, `text`, `muted`, `border`, `accent`, `accentText`, `inverse`, `inverseText`, `fontDisplay`, `fontBody`, `radius`) to token paths. The compiler resolves them into `BlazonData.theme`.
- `fonts` lists what the viewer loads: stylesheet URLs (Auth0: Google Fonts, per slide 27) and font files of the project, which blazon embeds as an `@font-face`.
- A font's license text is not in the config, and a plugin is never given the project folder (RFC 0002). So blazon reads it, as `fontLicenses` of `brand.json` (section 12). For each family with a font file in `fonts`, the compile looks in that file's own folder, and in no other, for the first of `OFL`, `LICENSE`, `LICENCE` or `COPYING` by name (case does not matter; `.txt` or `.md` allowed; the lowest name in code point order among equals), and keeps its text and its project path. The file MUST be inside the project (a link that leaves it is refused), at most 64 KiB and UTF-8 text with no NUL byte; otherwise it is not read and `font-license-invalid` (a warning) says why. The token's own `font.license` is not consulted here: a reader prefers it, and uses the file when the token states no license or license address. Only files of the folders of listed font files are read, and nothing is inferred from the text.
- `logo` is one file or `{ onLight, onDark }`, inlined as data URIs. The viewer follows the primary usage rule: the `onDark` artwork on inverse and accent backgrounds, and on the canvas in dark mode; `onLight` elsewhere.
- Doc frontmatter `group` names the section (the deck's "Brand foundations", "System elements"), and `cover: accent | inverse | canvas` picks the section opener.
- Guideline pages place live content with directive comments (`<!-- blazon:tokens color.primary -->`, `blazon:assets`, `blazon:logo-usage`, `blazon:logo-on`, `blazon:icons`, `blazon:cards`, `blazon:strokes`, `blazon:spots`, `blazon:logo-contrast`, `blazon:logo-space`, `blazon:formats`, `blazon:patterns`, `blazon:icon-set`; the README lists them). A path that matches nothing renders a visible "No token at …" line instead of failing silently.
- `BlazonData.findings` carries the `blazon check` results, so open questions from the source show in the brand book.
- Group `$description` and `dev.blazon` fields are kept (`ParsedTokens.groupMeta`), so a palette's rule ("Never text") sits next to its swatches.

### 7. Assets

The catalog MUST accept raster images (`png`, `jpg`, `webp`) as well as SVG.

**One id, several files.** An asset id is its category and its name without the extension (`logos/mark`). One name in several formats in one folder (`logos/mark.svg` and `logos/mark.png`) is one asset whose files are its *representations*. The catalog keeps one record for each file, all with that id, and the brand.json shape is the same (section 12). The sidecar, the review and the approval belong to the id; the review fingerprint covers all of its files (section 2).

A sidecar `<name>.json` beside an image (`logos/mark.json` for `logos/mark.svg` and `logos/mark.png`, one sidecar for both) states what the brand says about the artwork:

```json
{
  "description": "Primary usage: the white logo goes on dark backgrounds.",
  "background": "dark",
  "clearSpace": "{spacing.4}",
  "minSize": { "width": { "value": 80, "unit": "px" } },
  "source": { "doc": "brand-guidelines", "locator": "slide 17" },
  "review": { "status": "needs-review", "note": "Slide shows a different black" }
}
```

| Field | Meaning |
|---|---|
| `title` | A name where the file name will not do. A non-empty string |
| `description` | One line, shown on the asset's card |
| `traits`, `do`, `dont` | Each a non-empty list of non-empty plain strings: the qualities the brand asks of this kind of asset, and what to do and not do. Plain text, so a tool in any language reads them without rendering Markdown |
| `background` | `light` or `dark`: the background the artwork is made for |
| `ink` | The artwork's main color, a hex string or an alias to a color token (resolved when read). A logo that states one is a candidate when a viewer picks a logo for a background: it is used in place of the `onLight` or `onDark` logo where its ink reaches 3:1 contrast on that background |
| `clearSpace` | Space to keep free around it: a dimension, or a multiple of the artwork's `unit` (section 10) |
| `minSize` | `width`, `height` or both: the smallest it may be shown |
| `maxSize` | `width`, `height` or both: the largest it should be shown, as for artwork drawn only for small sizes |
| `replacedBelow` | `{ width or height, by }`: below that size, use the asset `by` names (`category/name`) instead, as a small version of a mark |
| `source`, `review` | As on a token (section 2) |
| `generated` | `{ by: string, prompt?: string, licence?: string }`: where an AI-generated image came from. `by` is the model or tool and is required; unknown keys are errors. Exported in `brand.json` under the asset's `meta` |

`clearSpace`, `minSize`, `maxSize` and `replacedBelow` sizes are a DTCG dimension (`{"value": 20, "unit": "px"}`, units `px` and `rem`) or an alias to a dimension token, which is how a brand says its clear space is a spacing step. Unknown fields are errors, so a typo shows. A `replacedBelow.by` that names no asset is an `asset-sidecar-invalid` error, unless it is in a local category whose images are not in the checkout (section 11). The files are plain JSON with no `$extensions` wrapper: a sidecar describes one asset and has nothing to inherit.

`blazon check` reports a sidecar that is not valid JSON, has an unknown or malformed field, aliases something that is not a dimension token (or an `ink` that is not a color or a color token), or is a symlink out of the assets folder (`asset-sidecar-invalid`, error; the asset keeps no metadata). A sidecar with no image of its name is `asset-sidecar-orphaned` (warning). `review` takes the same fields as on a token (section 2); a malformed one (a `by` that is not a string, an `at` that is not a real date, a `value` that is not 12 lowercase hex digits) is an `asset-sidecar-invalid` error. An asset's fingerprint is the sha-256 of its image file's bytes, truncated, and for an id with several files the sha-256 of the list of its files and their digests (section 2), so editing the sidecar does not void an approval and replacing, adding or removing any file of the id does (`approval-stale`, warning, once for each id; its message names the files). `review.status: needs-review` is a `review-pending` warning on the asset. `review-pending` and `asset-review-missing` are reported once for each id, not once for each file. An asset with `generated` and no `review` is an `asset-review-missing` warning on the asset id (its message names the files of an id that has several); `review.status: ok` clears it, and `needs-review` is reported only as `review-pending`. Sidecars are not copied by `blazon build`, and the dev server does not serve them: their content reaches the brand book as `Asset.meta`.

### 8. Layout groups: social formats and patterns

Two brand facts are a group of tokens, not one token. Both are plain DTCG (no new `$type`), and blazon reads them by shape.

**A social format** is a group with `width` and `height` dimension tokens, and optionally `margin` (a dimension, the safe area) and `columns` (a `number`, a whole number of at least 1). A path names one format group or a group of them:

```jsonc
"social": { "format": { "$type": "dimension",
  "story": {
    "width":   { "$value": { "value": 1080, "unit": "px" } },
    "height":  { "$value": { "value": 1920, "unit": "px" } },
    "margin":  { "$value": { "value": 80, "unit": "px" } },
    "columns": { "$type": "number", "$value": 4 }
  } } }
```

**A pattern** is a group marked `$extensions["dev.blazon"].pattern` with a kind (`dots`, `lines`, `diagonal`, `grid` or `checks`). It holds `size` (a dimension, the repeat: one tile is this many px square) and optionally `stroke` (a dimension, the dot diameter or line weight; an eighth of `size` when absent), `ink` and `ground` (each a color or gradient). `pattern` is group-level and is not inherited by the tokens in the group. The ink is drawn as a paint through a mask of the repeat, so a gradient ink works.

A `rem` in either is read as 16px. Dimensions are read from the token's CSS value, so aliases to dimension tokens work.

The brand book draws them with `blazon:formats <path> ...` and `blazon:patterns <path> ...`. `blazon check` validates a page's directive against the same rules: a path that names no format or pattern, a format without both `width` and `height`, a `columns` that is not a whole number, a pattern with an unknown kind or no `size`, an `ink` or `ground` that is not a color or gradient.

These tokens are not in the Auth0 fixture. The deck states no pixel sizes for its formats and no scale, spacing or density for its patterns (its patterns are artwork), and blazon does not invent them. The starter, `examples/blazon/` (which `blazon init` copies), has formats in `social.json` and a spacing scale in `spacing.json` as editable starting points; it has no pattern tokens.

### 9. Icon sets

An icon package is previewed by naming it in `blazon.json`, not by copying its files into `assets/`:

```json
{
  "iconSets": [
    {
      "name": "lucide",
      "package": "lucide-static",
      "categories": { "Navigation": [ "arrow-left", "house" ] }
    },
    { "name": "tabler", "package": "@tabler/icons" }
  ]
}
```

`name` is lowercase letters, digits and hyphens (it is a URL segment). Blazon reads `node_modules/<package>/<dir>/*.svg`; `dir` defaults for `lucide-static` (`icons`), `@tabler/icons` (`icons/outline`), `@mdi/svg` (`svg`) and `@material-symbols/svg-*` (`outlined`), and is required for any other package. An icon is a file name without `.svg`. A link that leaves the package is not an icon of the set, and `dir` MUST stay inside the package.

Categories come from `categories` (a map of category to icon names, inline or the path of a JSON file inside the project), which replaces any package metadata. Without one, `@tabler/icons` supplies `icons.json`'s `category` and `@mdi/svg` the first tag of `meta.json`; every other package has none, and uncategorized icons form "Other". Lucide's `tags.json` and the Material packages carry no categories (as of lucide-static 1.61.0, @material-symbols/svg-400 0.48.1), so those need a map. A name in `categories` the package lacks is a warning (`icon-unknown`): an upgrade may remove icons.

`BlazonData.iconSets` holds each set's name, package, version, license, count and categories (icon names only; no local path). `blazon:icon-set <name> [category ...]` draws it, each category collapsed and its icons rendered only while open. The dev server serves `/brand-assets/icon-sets/<name>/<icon>.svg` from the package with the same sandbox headers as asset SVGs, only for a `.svg` directly in the set's folder; `blazon build` copies every icon of a set to the same path.

`blazon check` reports a set it cannot read (`icon-set-invalid`, error: invalid name, duplicate name, package not installed, no `dir`, `dir` outside the package or missing, no SVGs, unreadable categories file) and leaves the set out; the others still load. The `icon-set` directive is checked against the sets that loaded.

### 10. Logo rules

A brand writes its logo rules in terms of a unit: "clear space equals the height of the star", "the divider is as tall as the shield". A pixel value is right at one size only. So a sidecar (section 7) can state the unit once and write the rules as multiples of it.

| Field | Meaning |
|---|---|
| `unit` | The length the brand measures this artwork in, a dimension in the artwork's own pixels: the star, say. For an SVG that is its own coordinates, so it holds at any size. For a raster file it holds only at the size the file was exported at |
| `clearSpace` | A measure (below) |
| `lockup` | The shape this artwork is: one of `horizontal`, `stacked`, `mark`, `wordmark`, or a name the brand added in `vocabulary.lockups` (section 14) |
| `misuse` | A list of the misuse kinds `blazon:logo-misuse` draws when the directive names none, from `stretch`, `squash`, `rotate`, `outline`, `recolor`, `shadow`, `crop`, `low-contrast`, `busy-background`; the default is `stretch`, `rotate`, `outline`, `recolor`, `shadow`, `low-contrast`. A name outside the set is `asset-misuse-unknown` |
| `colorways` | A list of at least one `{ name, on, variant?, min? }`: a logo variant on a color token, with the contrast it MUST reach. `name` is unique in the list. `on` is an alias to a color token. `variant` is an asset id written `category/name` (the logo itself when absent); an id that names no asset is an `asset-sidecar-invalid` error. `min` is `AA`, `AA-large` or `AAA` as for a `pairs` entry, and `AA-large` (3:1, the level for a logo as a graphical object) when absent. The artwork is measured as the `ink` of the file drawn, else black on a `light` background and white on a `dark` one. A colorway below its level is `contrast-insufficient`; one that cannot be measured is `contrast-unknown` |
| `placement` | A list of the corners the logo may sit in: `top-left`, `top-right`, `bottom-left`, `bottom-right` |
| `partnership` | How the logo sits beside a partner's: `gap` (the space on each side of the divider), and optionally `dividerHeight` and `partnerHeight`, all measures. Without `dividerHeight` there is no divider, and `gap` is the space between the two logos |
| `initiative` | A program the brand runs, drawn with the logo as the program lockup: `name` (a non-empty string, the lockup's label), `mark` (the program's artwork, an asset id written `category/name`) and `gap` (a measure), all required; optionally `position`, `beside` (the default: right of the logo, one baseline) or `below` (under it, left edges aligned), and `markHeight`, a measure (the logo's own height when absent). The mark is an asset and not text, so the lockup is drawn from artwork and needs no font |

A **measure** is a dimension (`{"value": 20, "unit": "px"}`, or an alias to a dimension token), or a multiple of the unit: `{"units": 1}`. A multiple needs a `unit` in the same sidecar, and `units` must be above 0. `minSize`, `maxSize` and `replacedBelow` stay dimensions, because a size to show artwork at is an absolute size on a screen.

`blazon check` reports, as `asset-sidecar-invalid` errors: a multiple with no `unit`; `units` that is not a number above 0 or a multiple with another key; a `unit` taller than the artwork, which is a unit measured in the wrong size; a `lockup` not in the list; a `placement` that is not a non-empty list of distinct known corners; a `partnership` that is not an object, lacks a `gap`, or has an unknown field; an `initiative` that is not an object, lacks a `name`, a `mark` or a `gap`, has a `mark` that is not an asset id or names no asset, a `position` other than `beside` or `below`, or an unknown field.

Five directives draw them, in the same table as the others (`src/core/docs/directives.ts`), where `needsMeta` now lists the sidecar fields a directive needs, any one of them:

- `blazon:logo-lockups <folder> [name ...]` groups the logos by `lockup`, each with its clear space.
- `blazon:logo-partner <logo> <partner>` lays the logo, a divider and the partner on one baseline. The gap and the divider's height come from the logo's `partnership`; a partnership with no `dividerHeight` is drawn with no divider and one gap.
- `blazon:logo-initiative <logo>` lays the logo and the `mark` of its `initiative` on one baseline, or the mark under the logo. The gap, the position and the mark's height come from the rule; with no `markHeight` the mark is as tall as the logo.
- `blazon:logo-placement <logo> [url]` draws a sample frame for each corner in `placement`.
- `blazon:logo-misuse <logo> [kind ...]` draws the logo's own image misused in each named way, captioned "Do not ..." and marked as not allowed without relying on color. The kinds are the arguments, else `misuse`, else the default six. The sidecar's `dont` list is shown under the figures. An unknown kind, in the argument list or in `misuse`, is an `asset-misuse-unknown` error.
- `blazon:logo-colorways <logo>` draws each of the logo's `colorways`: the logo, or the variant the colorway names, on its background token, the name as the caption, the measured ratio and whether it reaches the level, in words and a mark and not by color alone. A reader that needs one file for a variant id uses the choosing rule of section 7.

A directive that names a logo that states none of the fields it draws is a `directive-invalid` error.

Blazon assumes what the guidelines rarely state, and the manual says so: the partner is drawn as tall as `partnerHeight`, or as tall as the logo; the divider is 1% of the logo's height thick, 1px at least, and centered on the row; the placement frame, the logo's size in it and the margin are blazon's own; a URL sits on the opposite side of the same edge as the logo. The deck of the Auth0 reference shows the URL in several positions, so blazon draws one reading.

### 11. Asset categories

A category is a folder of `assets/` (section 7). An optional `assets` block in `blazon.json` adds what a folder cannot say, as plain data:

```ts
assets?: Record<string, {
  label?: string;        // sidebar and page title; the humanized key by default
  order?: number;        // ordered categories first, ascending; ties by name
  description?: string;  // one line under the page title
  dir?: string;          // an extra folder scanned as this category
  rules?: { formats?, minPixels?: { width?, height? }, aspectRatios? };
  notSpecified?: string[];  // what the guidelines leave open: a non-empty list of plain strings
  source?: { doc: string; locator: string };  // where they say so, as on a sidecar
  local?: string;        // the images are kept out of git; how to make them
  experimental?: boolean; // the files are explorations, not the identity
  reference?: boolean;    // the files follow the guidelines but are kept for comparison, or were supplied by someone else
}>
```

**Keys.** A key with a `dir` becomes a URL segment, so it MUST be lowercase letters, digits and hyphens. A key that only labels a folder MUST equal the folder's name. A key with no assets is a warning (`asset-config-unused`). An entry with any error is left out whole (`asset-config-invalid`), so nothing is half applied.

**Local images.** A brand may keep a category's images out of git, because their licence forbids sharing them or because they are made from a source that is not committed. `local` says so, as a sentence saying how to make the files. When a local category has no image at all, `blazon check` reports one `asset-local-missing` note on the key and none of the findings its absence causes: `asset-sidecar-orphaned` in the folder, `asset-config-unused` for the key, `logo-missing` for a config logo in the folder, and `directive-invalid` for a directive whose folder or asset id is in the category, or that needs a logo kept there. Once one image is there, every finding is reported as usual, so images made only in part still show. A directive naming a category that does not exist is still an error. `local` is carried into `brand.json` (`categories[].local`), so a tool that reads it knows not to pass those images on.

**Experimental categories.** `experimental: true` says a category holds explorations, such as logo directions nobody has chosen, which are not the brand's identity and which the brand's owner will never approve. `experimental` MUST be a boolean; anything else is an `asset-config-invalid` error. For an asset in such a category blazon does not report `review-pending`, `asset-review-missing` or `page-review-pending` (section 4): its `review` stays valid data on the asset and in `brand.json`, and it simply does not gate the book. A page that draws both experimental and ordinary assets still reports `page-review-pending` for the ordinary ones. Nothing else about the category changes: its rules, `approval-stale` for an asset marked `ok`, and every other finding apply as to any category. `experimental` is carried into `BlazonData.assetCategories` and `brand.json` (`categories[].experimental`, present only when `true`). The brand book labels the category "Experiment" on its page and on every asset a directive draws from it (`blazon:assets`, `blazon:section`, `blazon:logo-space`, `blazon:logo-lockups`, `blazon:logo-partner`, `blazon:logo-initiative`, `blazon:logo-placement`; `blazon:icons` once for the folder; a pair of logos, or a logo and its mark, when either is in the category), and lists it, with its file count and apart from the findings, in an Experiments section of the Review page. A reader of `brand.json` that produces a deliverable MUST leave an experimental category out of it by default; the shipped plugins do (the press kit and the logo kit draw only the `logos` and `partners` categories, and the brand deck skips every experimental category).

**Reference categories.** `reference: true` says a category holds material that follows the guidelines but is kept for comparison, or was supplied by someone else: card faces extracted unedited from the guidelines, or a favicon set that a third party supplied. It is neither a live asset nor an exploration. `reference` MUST be a boolean, and a category MUST NOT set `experimental` and `reference` to `true` together; either mistake is an `asset-config-invalid` error. For an asset in such a category blazon does not report `review-pending`, `asset-review-missing` or `page-review-pending` (section 4), exactly as for an experimental one, and nothing else about the category changes. `reference` is carried into `BlazonData.assetCategories` and `brand.json` (`categories[].reference`, present only when `true`). The brand book labels the category "Reference" on its page and on every asset a directive draws from it, in every place it labels an experimental one, and lists it, with its file count and apart from the findings, in a Reference section of the Review page. The brand deck skips every reference category. Another deliverable decides for itself; the press kit and the logo kit draw only the `logos` and `partners` categories.

**Extra folders.** `dir` is relative to the project or absolute. It MAY point outside the project only when the operator, the person running blazon, approved that folder: `--allow-dir <folder>` (repeatable, on every command) or `BLAZON_ALLOW_DIRS` (a list separated by the platform's path delimiter). A relative approval is relative to the folder blazon was started in. Approved folders are compared by where they really are, links followed: a `dir` is allowed when it is inside the project or inside an approved folder, so a link or a `..` out of an approved folder is refused. A `dir` that is not allowed is a `config-path-outside` error on `assets.<key>.dir`, whose message names `--allow-dir` and `BLAZON_ALLOW_DIRS` and is the same whether or not the folder exists; the category is left out. The config cannot approve a folder: a key for it would be written by the brand being distrusted, so a blazon.json that names one has an unknown field. Plugins are never given `BLAZON_ALLOW_DIRS`. Only image files inside the folder are read. Every image under it joins the category, with sidecars beside them, and gets the id `key/name` and the address `brand-assets/<key>/<path inside dir>`, as a file in `assets/<key>/` does. Both are scanned when both exist. The dev server serves, and `blazon build` copies, only image files inside the folder, never through a link that leaves it. The roots are resolved from the config where they are used and are not part of `BlazonData`, so no local path reaches the page.

**Ids.** Two files with one id from different directories are an error (`asset-id-duplicate`): the id would name both. This also catches the case where a file in a subfolder takes its first folder's category and loses the subfolder from its id. One name in two formats in one directory is one asset with one sidecar, and is allowed (section 7, "One id, several files"); its findings name the id, and the finding's `file` is the first of its files in byte order of the file names. Sub-groups for subfolders are left for later; they will need ids to stay stable, which this rule protects.

**Order.** Files are read in name order, so a scan is the same on every machine. `BlazonData.assetCategories` lists every category that has assets, as `{ category, label, order?, description?, rules?, notSpecified?, source?, local?, experimental? }`: categories with an `order` first (ascending, ties by name), then `logos`, then `icons`, then the rest by name.

**Rules.** `rules` states what every file in the category must follow, and `blazon check` tests each file (`asset-rule-violated`, error, on the file's id):

- `formats`: a non-empty list from `svg`, `png`, `jpg`, `gif`, `webp`, `avif`.
- `minPixels`: `width`, `height` or both, numbers above 0. A raster image smaller than either is a violation. A vector file is not measured, and neither is a raster file whose header gives no size.
- `aspectRatios`: a non-empty list of `W:H` with both sides above 0. A file matches one when its ratio is within 1% of it. Vector files are measured by their `viewBox`.

Blazon tests only what it can read cheaply: the format, the pixel size from the header and the ratio. What a photo shows, and its color treatment, stay in the guidelines' prose.

The Auth0 fixture states no `assets` block: the deck gives no sizes, ratios or formats for its photography. Chapter 6 of the manual shows the block.

### 12. brand.json

`blazon build` writes `brand.json` into the site folder, and the dev server answers `/brand.json`. It holds the whole brand in one file, for a tool that is not written in TypeScript: a script that draws a deck, a linter, another site generator. `tokens.json` (section 5) holds the tokens as DTCG and nothing else; the logo rules in a sidecar, the pages, the assets and the findings are not in it.

`brand.json` is a projection, not the data the viewer receives. That data carries HTML, SVG markup and the tokens four times over, and changes with every viewer refactor; a contract other tools depend on must not.

| Key | Holds |
|---|---|
| `$schema` | `"brand.schema.json"`: the JSON Schema the file follows, as a path beside it |
| `format`, `version` | `"blazon-brand"`, and an integer. `version` changes only when a field is removed or changes meaning; adding a field does not change it. A reader MUST check both and MUST ignore keys it does not know |
| `generator` | Which blazon wrote the file: `{ name: "blazon", commit?, dirty? }`. `commit` is the 40-hex commit of the running blazon (the one `blazon pin` compares, from the build stamp or, when run from source, the checkout's HEAD) and `dirty` says its tree had uncommitted changes; both are left out when blazon cannot say its commit, never guessed. There is deliberately no timestamp and no host, so the file stays the same for the same inputs and the same blazon. A reader MUST NOT depend on what it says |
| `brand` | `title`, `description` |
| `theme` | `roles` (each viewer role's value), `tokens` (the token each came from), `fonts`, and `fontLicenses` (when present: the license file found beside the font files the config embeds, one `{ family, licenseFile, licenseText }` per family; section 6). Version 1 also held `theme.shadcn`, the shadcn/ui mapping; version 2 does not, and a reader of version 2 MUST NOT look for it (`blazon.shadcn` derives the mapping from this file) |
| `logo` | `onLight`, `onDark`: a path beside brand.json, or the file as a data URI when it is not an asset |
| `vocabulary`, `sections` | The lockups and usage roles a value may name, and every section a page may declare with its title, each standard entry first and then the brand's own (sections 13 and 14). A reader learns a custom section's title from here |
| `tokens` | Each token once: `path`, `type`, `value` (CSS-ready), `resolvedValue` (DTCG, aliases replaced), `rawValue`, `parts`, `aliasOf`, `description`, `deprecated`, `cssVariable`, `sourceFile`, `extensions` and `blazon` (its `dev.blazon`: print values, usage, source, review with its `by`, `at` and `value`) |
| `groups` | Groups that carry a description or rules: proportions, contrast pairs, patterns |
| `modifiers`, `contexts` | The resolver's modifiers, and each non-default context with only what it changes: the tokens with another value (`tokens`), the tokens that keep the default's value but have another description, deprecation, type, extension or alias (`metadataChanges`, absent when there are none), the paths of the default's tokens it leaves out (`removed`, sorted, absent when there are none), the groups whose description or rules differ from the default's or that only it has, each as its whole `groups` record (`groupChanges`, absent when there are none), the default's groups that carry no description or rules in it (`removedGroups`, sorted, absent when there are none), and its CSS selector. A reader puts a context together from `tokens` and `metadataChanges` over the default's `tokens`, drops the `removed` paths, and applies `groupChanges` and `removedGroups` to `groups`. These three keys are additive: `version` stays 2, and an older reader that ignores them, as it MUST, sees the context as before. For a context that only edits values the file is unchanged. CSS has no way to remove a custom property, so a reader that writes CSS from a context writes nothing for a removed token and the default's value applies there (section 3) |
| `pages` | `slug`, `sourceFile`, `title`, `order`, `meta` (the front matter), `sections` (section 13: ids that the file's own `sections` lists), `markdown`, and `directives`: the `{ name, args }` of every directive in order, skipping code |
| `assets` | `id`, `name`, `category`, `file` (a path beside brand.json), `format`, `mediaType`, `bytes`, the pixel size when known as numbers, and `meta`, what its sidecar states. One entry for each file: an id with several files (section 7) has several entries with the same `id` and the same `meta`. See "Choosing a representation" below |
| `categories` | Each asset category as the brand book shows it: label, order, description, rules, `notSpecified`, `source`, `local`, and `experimental` or `reference` (only when `true`) |
| `iconSets` | Each set as in section 9, and `dir`, the folder of `<icon>.svg` files beside brand.json |
| `findings` | What `blazon check` found |

**Choosing a representation.** A reader that needs one file for an id MUST choose it by this rule and not by the position of the entries. If it can use only some formats, it takes the first of its own preference list that the id has, and when the id has none of them it reports that, naming the formats the id has. If it has no preference, it takes the first in this order: `svg`; then `png`; `webp`; `jpg` (`.jpg` and `.jpeg` alike); `gif`; then any other format in ascending order of the format name. Entries of one format are ordered by file name, in ascending byte order. There is no `primary` field: brand.json does not say which file is preferred, and a new reading of the same file never changes which one a reader takes. A reader that draws one entry for each asset, such as a list, takes one entry for each id. A setting that names a file, such as `logo.onLight` and `logo.onDark` (a `file` in brand.json), means exactly that file, whatever other files its id has and in whatever order they are listed: a reader finds it among every entry and does not apply this rule to it. Only a setting that names an id, such as an `id` in a plugin's options, takes the rule.

Every `file` and `dir` is relative to brand.json, so a tool reads the files from the same folder or the same URL. `sourceFile` on a token or a page is different: it names the project file the entry was authored in, which is not shipped. A length stated in units of a logo (section 10) stays `{ "units": n }`: the reader multiplies by the asset's `meta.unit`.

The file follows a JSON Schema (draft 2020-12), `src/core/brand/brand.schema.json`, which `blazon build` writes beside `brand.json` as `brand.schema.json` and the dev server serves at `/brand.schema.json`. The schema is hand-written and allows keys it does not know, as the reader rule requires. It refuses what the contract forbids: a `format` or `version` other than `"blazon-brand"` and 2, a missing required key, a `file` or `dir` that is absolute, has a scheme or has a `..` segment, a `file` key on a token or a page (that name means a path beside brand.json; those entries use `sourceFile`), and a section that is not standard. The tests validate every real export against the schema, and against a copy that forbids undescribed keys, so a field added to the export without the schema fails.

The file has no timestamp and no local path (`generator` names a blazon commit, not a time or a machine), and its keys and arrays are in a fixed order, so a build of the same project writes the same bytes. `scripts/read-brand.py` reads it with Python's standard library alone and prints a summary; the tests run it, so the contract is known to be usable from outside.

Not in it, on purpose: the pages' HTML, SVG markup (the files are beside it), the tokens' grouped and nested copies, and any path that names the machine.

#### From BlazonData to brand.json

`BlazonData` (`src/types/data.ts`) is what the compile returns and the viewer receives; `buildBrandExport` (`src/core/brand/export.ts`) builds `brand.json` from it. The table says what becomes of each member of `BlazonData` and of the types inside it that the export reads. "As is" means the same name and value; a member in the second column is the key it is written under. A member that is left out has a reason in the third column, and "not carried" is used only where the export has no key for it at all.

| Member | In brand.json | Note |
|---|---|---|
| `BlazonData.title`, `BlazonData.description` | `brand.title`, `brand.description` | `description` is left out when empty |
| `BlazonData.version` | not carried | the compile never sets it; `version` in brand.json is the format's (above) |
| `BlazonData.tokens` | `tokens`, `groups`, `contexts`, `modifiers` | the members of `ParsedTokens` below |
| `BlazonData.findings` | `findings` | as is; the token load problems are already in it |
| `BlazonData.theme`, `BlazonData.themeTokens` | `theme.roles`, `theme.tokens` | `themeTokens` is `{}` when absent |
| `BlazonData.fonts` | `theme.fonts` | as is |
| `BlazonData.fontLicenses` | `theme.fontLicenses` | as is; absent when no embedded font has a license file beside it |
| `BlazonData.emailSignature` | left out | the settings of the `blazon:email-signature` generator (logo URL, domains, fixed lines); they are for the viewer's form and say nothing about the brand |
| `BlazonData.logo` | `logo` | the members of `LogoSet` below; `{}` when there is no logo |
| `BlazonData.docs` | `pages` | renamed; the members of `DocItem` below |
| `BlazonData.assets` | `assets` | only `AssetCatalog.all`, once each; `logos`, `icons` and `custom` are the same assets grouped, and are left out. The members of `Asset` below |
| `BlazonData.assetCategories` | `categories` | renamed; each `AssetCategoryInfo` as is, with its `label`; `[]` when absent |
| `BlazonData.iconSets` | `iconSets` | each set as is, with `dir` added |
| `BlazonData.vocabulary`, `BlazonData.sections` | `vocabulary`, `sections` | as is |
| `ParsedTokens.items` | `tokens` | each token projected: the members of `TokenItem` below |
| `ParsedTokens.groupMeta` | `groups` | renamed |
| `ParsedTokens.contexts`, `ParsedTokens.modifiers` | `contexts`, `modifiers` | the tokens of a context are projected like `tokens`; `modifiers` is `[]` when absent |
| `ParsedTokens.byPath`, `ParsedTokens.groups`, `ParsedTokens.nested` | left out | three more copies of the tokens: a lookup `Map` that is `{}` as JSON, the tokens by first path segment, and the resolved values in their hierarchy |
| `ParsedTokens.problems` | `findings` | not a key of its own: the check puts them in `findings` |
| `TokenItem.path`, `TokenItem.type`, `TokenItem.value`, `TokenItem.resolvedValue`, `TokenItem.rawValue`, `TokenItem.parts`, `TokenItem.aliasOf`, `TokenItem.description`, `TokenItem.deprecated`, `TokenItem.cssVariable`, `TokenItem.extensions`, `TokenItem.blazon` | the same names | as is; left out when empty or absent: `type`, `parts`, `aliasOf`, `description`, `deprecated`, `extensions` and `blazon` |
| `TokenItem.file` | `sourceFile` | renamed, because `file` means a path beside brand.json |
| `TokenItem.group`, `TokenItem.name` | left out | both are in `path` |
| `LogoSet.onLight`, `LogoSet.onDark` | `logo.onLight`, `logo.onDark` | the file as a path beside brand.json when it is a cataloged asset, else the data URI |
| `LogoSet.onLightAsset`, `LogoSet.onDarkAsset` | left out | the path names the asset |
| `LogoSet.onLightInk`, `LogoSet.onDarkInk` | `logo.onLightInk`, `logo.onDarkInk` | as is |
| `DocItem.slug`, `DocItem.title`, `DocItem.order`, `DocItem.meta`, `DocItem.sections`, `DocItem.markdown` | the same names | as is |
| `DocItem.filePath` | `sourceFile` | renamed; the file's name in the docs folder, which is not shipped |
| `DocItem.html` | left out | the viewer's rendering of `markdown`; `directives` are read from `markdown` |
| `Asset.id`, `Asset.name`, `Asset.category`, `Asset.format`, `Asset.mediaType`, `Asset.bytes`, `Asset.meta` | the same names | as is; `meta` is left out when there is no sidecar |
| `Asset.filePath` | `file` | the path under `brand-assets/`, beside brand.json, not percent-encoded |
| `Asset.url` | left out | the viewer's address for `file`, percent-encoded; a reader of brand.json has `file` |
| `Asset.width`, `Asset.height`, `Asset.viewBox` | `width`, `height` | numbers, written only when both are known; an SVG without `width` and `height` gets them from its `viewBox`, which is not written |
| `Asset.svg` | left out | markup for copy and inline display; the file is beside brand.json |

Everything the viewer adds to the data for its own use is in the "left out" rows: HTML, markup, the dev server's URLs and the copies of the tokens. No row carries a path that names the machine: `sourceFile` is a name in the tokens or docs folder, and `file` and `dir` are beside brand.json.

### 13. Sections

A brand book has standard parts, and a brand may add parts of its own. The standard sections are, in this order: `intro`, `logo`, `color`, `typography`, `icons`, `illustration`, `photography`, `patterns`, `3d`, `diagrams`, `motion`, `layout`, `social`, `applications`.

A page declares the sections it holds with `section` in its front matter, one id or a list (`section: [patterns, 3d]`). `DocItem.sections` is that list: always an array, empty when the page declares none, each id once, in the order written. An id that is not a section of this brand book (a standard one, or one added in `customSections`) is an error on the page (`section-invalid`) and is left out. `meta.section` stays as authored.

`blazon check` reports each expected section that no page holds as one `section-missing` finding, severity `info`, with the section as its path. It reports them only once the project uses sections: when at least one page declares a section, or the config sets `sections`. A project that has not started is not told about fourteen sections at once. `sections?: SectionId[]` in `blazon.json` narrows the list a brand expects, so a brand with no motion is not reminded of it; an id in it that is not a section of this brand book is `section-invalid` on `sections`. Without `sections`, the sections expected are the standard ones followed by the custom ones. A section a page holds that the config did not list is not an error.

The directive `blazon:section <category> [asset ...]` takes the arguments of `blazon:assets` and draws the category as a section: each asset with its title, description, traits, dos and don'ts, image and source, in order, then the category's file rules and its `notSpecified` list. `blazon:assets` stays the bare gallery. The prose a section needs lives in sidecars and the category config, so two brands' sections are built the same way and the page's Markdown holds only its own words.

A brand adds sections of its own with `customSections: [{ id, title }]` (section 14). An `id` is a name (`^[a-z][a-z0-9-]*$`) that is not standard and not repeated, and a `title` is a non-empty string. `BlazonData.sections` lists every section a page may declare, `{ id, title, standard }`: the standard ones with the fixed titles Introduction, Logo, Color, Typography, Icons, Illustration, Photography, Patterns, 3D graphics, Diagrams, Motion, Layout, Social and Applications, then the custom ones in the order written. A brand cannot remove a standard section; `sections` narrows what is expected.

Not in it, on purpose: a section id is not a page address (the slug is), and a section held by two pages is not an error.

### 14. Configuration

`blazon.json` is optional. It is plain JSON, so a person can read it and a tool can write it: data that blazon reads and never runs, with no comments. Blazon checks it: every key below is allowed, and no other. It is the only form. A folder with `blazon.config.ts`, `blazon.config.js`, `blazon.config.mjs`, `brandbook.config.ts` or `brandbook.config.js` is refused with a `config-invalid` error on that file, which names it and says to move its values into `blazon.json` and delete it; the refusal holds even when a `blazon.json` is there too.

| Key | Type | Default | Meaning |
|---|---|---|---|
| `title` | string | `"Blazon Brand Book"`, or the package name with "Brand Book" | The brand book's title |
| `description` | string | `"Design tokens and brand guidelines"` | The line under the title |
| `tokensDir` | path | `./tokens` | Where the DTCG token files are (section 1) |
| `docsDir` | path | `./docs` | Where the guideline pages are (section 6) |
| `assetsDir` | path | `./assets` | Where the assets and their sidecars are (section 7) |
| `outDir` | path | `./dist/site` | Where `blazon build` writes the site and `brand.json` (section 12) |
| `tokensOutDir` | path | `./dist/tokens` | Where `blazon tokens` and `blazon build` write `theme.css`, `typography.css`, `tokens.ts`, `tokens.json` and one `tokens.<modifier>.<context>.json` for each context; a build plugin writes into its own folder under it (section 5) |
| `cssPrefix` | string | `--` | The prefix of every CSS variable |
| `cssSelector` | string | `:root` | The selector the default context's variables are written under |
| `port` | whole number, 0 to 65535 | `3000` | The dev server and preview port |
| `logo` | path, or `{ onLight, onDark? }` | none | The brand's logo files (section 6) |
| `theme` | object of role to token path | inferred from token names | Which tokens the brand book wears (section 6) |
| `iconSets` | list | none | Icon packages to preview (section 9) |
| `assets` | object keyed by category | none | Settings for asset categories (section 11) |
| `sections` | list of section ids, standard or custom | all of them | The sections this brand expects a page for (section 13) |
| `customSections` | list of `{ id, title }` | none | Sections of the brand's own, next to the standard ones (section 13) |
| `plugins` | list of `{ name, as?, options? }` | none | The plugins that may run, by name: the operator's allowlist (RFC 0002 section 2). A name is dotted lowercase words (`acme.house-style`). A plugin may be listed more than once, each entry with an `as`, an instance id of the same form that defaults to the name and is unique in the list (RFC 0002 section 2). The config holds no path and no command: a plugin is found by its name or pinned in `blazon.plugins.lock` |
| `vocabulary` | `{ lockups?: string[], usageRoles?: string[] }` | none | Names the brand adds to the standard logo lockups (section 10) and usage roles (section 2). Each name is a name as above, not standard and not repeated |
| `fonts` | list of URLs or `{family, file, weight?, style?}` | none | Font stylesheets and font files the brand book loads (section 6) |
| `resolver` | path | `blazon.resolver.json` when present | The DTCG resolver document (section 3) |
| `contextSelectors` | object of modifier to selector | `:lang({context})` for `locale`, `[data-<modifier>="{context}"]` otherwise | The CSS selector of each resolver modifier (section 3) |
| `emailSignature` | `{ logoUrl, logoSize, logoAlt, domains?, lines? }` | none | What the `blazon:email-signature` directive puts in every signature. `logoUrl` is an absolute https URL that is not an SVG; `logoSize` is whole pixels from 1 to 600; `domains` are lowercase domains |

**Mistakes.** An unknown key, and a value of the wrong type, are each an error (`config-invalid`) on the key, and the message names the key blazon is closest to when one is within two edits (`unknown key "asset"; ... (did you mean "assets"?)`). A key set to `undefined` counts as absent. `loadConfig` stops on any such error with every mistake listed, so the run does not go on with a config it only half understood. `compileBlazonData` reports the same mistakes as findings for a caller that builds the config itself, leaves the wrong value out and uses the default in its place.

**A config that cannot be loaded** (a syntax error, an import that fails, or no default export) also stops the run, with the file's name and the cause. It does not fall back to the defaults: a brand book built from them looks fine and carries the wrong title and no theme or logo. In the dev server, a config that is wrong half-way through an edit is reported and the last good config stays in force.

The rest of a key's rules (a theme role, an `assets` entry, an icon set) are checked where the key is used, in the section named in the table.

**`blazon.lock`.** A brand book may name the blazon it builds with in `blazon.lock`, next to `blazon.json`. Every commit of the blazon repository says `0.1.0` in `package.json`, so the commit, not the version number, says which blazon it is; a published release is built from one commit. The file is JSON, written by `blazon pin` and committed with the book:

```json
{ "v": 1, "commit": "0123456789abcdef0123456789abcdef01234567" }
```

`pin-invalid` is raised, and the file is not read as a pin, when the file is not valid JSON, is not an object, has a key other than `v` and `commit`, has a `v` other than the number `1`, or has a `commit` that is not 40 lowercase hexadecimal digits (an abbreviated hash, a branch name and an uppercase hash are each refused). `blazon pin` replaces such a file, which is how a broken pin is mended. A book with no `blazon.lock` is not checked, and nothing else in the book depends on the file.

When the file is valid, `blazon check`, `blazon tokens` and `blazon build` (and the dev server, which reads the file again when it changes) compare the commit with the blazon that is running. That commit is the one the running blazon was built from (for an installed package, the commit its release was built from), read from the stamp `npm run build` compiles into `dist` along with whether the tree had uncommitted changes; run from source, where there is no build, it is the `HEAD` of the blazon clone, read when blazon starts. The comparison is exact, and any failure is `pin-mismatch`: the commit differs, the tree had uncommitted changes (a dirty tree never matches, even at the pinned commit, because it is not that commit), or the blazon cannot say its commit (no checkout and no stamp), which fails closed because a pin that cannot be checked is not met. `blazon pin` itself refuses to write the pin of a dirty or unknown blazon.

A match shows that the running blazon was built from the pinned commit. It does not show that `dist/` was left alone after the build, that `node_modules` matches the lockfile, or that nobody edited the stamp. The pin catches the mistake that happens, building a book with another checkout; it is not a defence against someone who means to get round it, and it is not a supply-chain control.

## Conformance

`examples/conformance/` is the fictional conformance fixture in the repository. The encoding of the third-party deck this model was derived from is a second fixture, which the maintainers keep locally and which is not shipped in the repository; items 1, 2 and 4 describe it, and the tests for them skip when it is absent. An implementation conforms when:

1. `blazon check` on the third-party fixture reports exactly the 15 findings in its recorded `check.json`, all warnings and no errors: one `token-value-duplicate` (`color.hue.yellow.400`), eleven `review-pending` in the default context, one `font-family-missing` (`font.family.japanese`, the Kinto family that no listed stylesheet loads), one `review-pending` in `locale=ja` (the deck gives no Japanese sizes), and one `page-review-pending` for `02-logo.md`, which shows the flagged logotype. Seven of the eleven are swatches whose label names a different color than the one drawn (`scripts/extract-deck.py` finds them); two are `illustration.color.lightGray` and `type.h5`; the last two are the logotype sidecars, whose `unit` (the star) and divider height are measured from the PNG because the deck states the rules in units, not pixels.
2. `blazon tokens` on the third-party fixture matches its recorded outputs (`theme.css` with its `:lang(ja)`, `:lang(de)` and `:lang(fr)` blocks, `typography.css`, `tokens.ts`, `tokens.json`, `tokens.locale.ja.json`).
3. Each check in section 4 has a case in the check corpus (`test/corpus/checks/cases.ts`, run by `test/core/checker/corpus.test.ts`): a small project that yields the code at the catalogue's severity, and a near-miss that differs in the one thing that matters and does not yield it. Findings are compared by code and severity, not by order. A code added to the catalogue without a case fails that test.

4. `brand.json` for the third-party fixture is its recorded `brand.json`, and validates against `brand.schema.json` (section 12). The comparison removes the top-level `generator` key first, because it names the blazon build that wrote the file (its commit and whether the tree was dirty) and so differs between builds; everything else is compared, so a change to the shape of `brand.json` shows as a golden diff. It also masks the date of the SPDX license list in a finding's message, which moves when the list is refreshed.
5. `blazon check examples/conformance` reports exactly the findings in `test/examples/golden/conformance/check.json`: one `approval-stale` warning (`color.accent`, whose `review.value` is not the fingerprint of its value) and one `font-license-unknown` note (`font.family.body`, whose license `OFL-1.2` looks like an SPDX id and is not one). It reports nothing for the approvals that hold: `color.ink` (`by`, `at` and a `value` that matches) and `color.surface` (`status: ok` with no `value`, which is never stale), nor for `font.family.display` (a listed SPDX id with `source` and `licenseUrl`), nor for the logo sidecar `logos/example-ink`, whose `initiative` names the mark `logos/example-lab-mark`, an asset that exists. Its token outputs and `brand.json` match the goldens in `test/examples/golden/conformance/`, and `brand.json` carries the `review`, `font` and `initiative` fields. The approver is the invented "Example Approver": the fixture records no approval anyone gave. It is a separate example because `examples/blazon` is blazon's own brand book, and approving its tokens in a fixture would claim approvals nobody made.
6. `blazon.lock` (section 14) is tested without a golden, because it holds a commit of blazon itself, which no golden can name: `test/core/tokens/conformance.test.ts` writes a lock into a temporary copy of `examples/conformance` for a blazon identity it supplies, and checks that the pin is met by that commit alone, that another commit, a dirty tree and a blazon that cannot say its commit each give `pin-mismatch`, and that a lock with an uppercase hash or an unknown key gives `pin-invalid`. The example has no `blazon.lock` of its own, so a book with no lock is not checked.
7. `examples/conformance` has an experimental asset category (`experiments`, section 11) holding `experiments/example-sketch`, whose sidecar says `review.status: needs-review`, and a page that draws it with `blazon:assets experiments`. `blazon check` reports no `review-pending`, `page-review-pending` or `asset-review-missing` for them, so the findings of item 5 are the whole of `check.json`. Its `brand.json` golden carries the asset with its `review` unchanged and the category with `experimental: true`.

`test/core/tokens/conformance.test.ts` runs 1, 2 and 4 to 7; 3 is run by the tests it names. The golden files were generated by the implementation and reviewed by hand, so they pin behaviour; they do not prove it independently. The goldens of `examples/conformance` pin the fingerprint, the font license note and the stale check as they behave today, and the `brand.json` goldens pin the shape and content of the export, not that it is the right export.

## Drawbacks

- **Breaking path change.** Every alias and every CSS variable in an existing blazon project changes name. Blazon had no published release when this was decided, so that was the cheapest time for it.
- **More to type.** Explicit `$type` and nested `$extensions` are verbose next to `"primary": "#2563eb"`. Group-level `$type` and inherited `dev.blazon` fields keep most files short. The starter, blazon's own brand book, shows this.
- **A private vocabulary.** The `usage` roles and `tier` names are blazon's. A Tokens Studio user won't see them enforced in their editor.
- **The resolver adds a second file to learn.** It is optional, and most brand books without locale or theme variants won't need it.

## Non-goals

- Editing tokens. Blazon reads files. Figma, Tokens Studio or a text editor writes them.
- Importing decks. Turning a `.pptx` into tokens stays a manual, reviewed step. `scripts/extract-deck.py` shows the extraction used for the Auth0 deck, but a generic importer would invent structure the source doesn't have. That is the failure this RFC exists to make visible.
- Checking proportions. "60% neutrals" describes a composition, not a value.
- Platform outputs beyond CSS, TS and JSON (Android XML, Swift). DTCG JSON output lets Style Dictionary cover them.

## Alternatives and prior art

- **Keep file-as-group, fix the resolver.** This is the smallest change; the resolver fallback added on 2026-10-25 already does it. It leaves blazon files unreadable by DTCG tools, and every other gap in the Motivation table remains. Rejected.
- **Use Style Dictionary as the engine.** It reads DTCG and has transforms for every platform. Blazon's difference is the brand book and `blazon check`, and Style Dictionary has neither usage rules nor docs. Blazon SHOULD stay compatible (via DTCG output) rather than wrap it. Worth revisiting if platform outputs become a goal.
- **Tokens Studio themes** instead of the DTCG resolver. Tokens Studio's theme format predates the resolver module, and blazon should read the standard. A converter could come later.
- **Docs platforms (zeroheight, Supernova).** They are hosted and editor-first. Blazon is a local, deterministic build from files in the repo (original proposal, §5).

## Compatibility

The model was settled before the first release (0.1.0), so there were no external users to migrate. Inside the repo:

- `examples/blazon/` (the starter) and the encoding of the third-party deck are rewritten to the new format (done).
- A `blazon migrate` command is not proposed. Given no users, it would be code with no audience.

## Security considerations

A brand is data that blazon reads, and `blazon.json` names paths. The paths stay inside the project folder (`config-path-outside`, section 4): `tokensDir`, `docsDir`, `assetsDir`, `resolver`, the `logo` files, and `outDir` and `tokensOutDir` in the config file are refused when they, or a link on the way, leave it, and a token file, a page or an icon set's categories file that is a link out is not read. An asset category's `dir` is the one path that may sit outside, and only when the operator approved the folder (`--allow-dir`, `BLAZON_ALLOW_DIRS`, section 11); only image files inside it are read. The command line is the operator's: `blazon build -o` may name any folder. Three points still apply:

- Resolver `$ref`s and asset sidecars MUST resolve inside the project root. A `$ref` to `../../` or an absolute path is an error.
- `blazon.json` is read as JSON and never executed. What can run a program is the `plugins` allowlist it holds (RFC 0002 section 2).
- `fonts` URLs are loaded by every viewer of the brand book; they are as trusted as the config that lists them.

Asset files come from anyone who can add to the assets folder. The viewer shows every asset, SVG included, through `<img src="Asset.url">`, so an SVG cannot run script, load resources into the page, or restyle it with its own `<style>`. Copy SVG, Copy JSX and Download pass the markup through DOMPurify's SVG profile, which removes scripts, event handlers, `javascript:` URLs and `foreignObject` (`src/viewer/lib/markup/sanitize.ts`). `<style>` survives the copy: it is not executable, but pasted inline into another page it applies to that page. The dev server's `/brand-assets/` route sends SVG with a sandbox Content-Security-Policy; the static build has no headers of its own, which is the host's job. Guideline pages still inline their Markdown as HTML, unsanitized, so raw HTML in `docs/` is trusted like the config.

## Status

Implemented on `main` as of 2026-11-21. The sections of this RFC are all built; the table says where, and the Conformance section says what pins each one.

| Section | Where |
|---|---|
| 1. Token files are DTCG | `src/core/tokens/` (`walk.ts`, `merge.ts`, `alias.ts`, `resolve.ts`, `values/`). The `$path` alias form was dropped; DTCG has only `{path}`. Composite outputs: typography, gradient, shadow, border, transition |
| 2. The `dev.blazon` extension | `src/core/tokens/`, `src/core/checker/`. Usage, contrast, tier, duplicate and review checks; `review` with `by`, `at` and `value`; `font` facts, including `role`, `reason` and `fallbackFor` (built as of 2026-11-21: `src/core/checker/font-meta.ts`, `src/core/font-roles.ts`; printed by `blazon fonts`, the Typography page and `blazon.press-kit`); `source.cssVar` |
| 3. Contexts | Resolver contexts, with locale variants in the third-party fixture (Japanese: Kinto; German and French: H1 56/64). A context records the tokens and groups it leaves out or changes beyond value (`removed`, `groupChanges`, `removedGroups`; `src/core/tokens/contexts.ts`), so `contextItems` and `contextGroups` rebuild it as the checker saw it. CSS and `tokens.ts` cannot express a removal: the known limit, reported by `context-css-unchanged` (`src/core/index.ts`, `removalFallback`) |
| 4. `blazon check` | `src/core/checker/`, run before `blazon tokens` and `blazon build`. The finding codes, with severity and summary, are in the catalogue, `src/core/checker/catalogue.ts`; the code table in this section is written from it. Findings are sorted by `compareFindings` (`src/core/order.ts`), the order the section states |
| 5. Outputs | `theme.css`, `typography.css`, `tokens.ts`, `tokens.json`. `blazon.tailwind` writes `tailwind.css` and `tailwind-reset.css` into its own folder (RFC 0002). `blazon drift` (`src/core/drift/`, `src/cli/commands/drift.ts`) compares `source.cssVar` with a live site |
| 6. The brand book wears the brand | `theme`, `fonts`, `logo`, `group` and `cover` frontmatter, findings in the viewer. Page directives are validated against one table, `src/core/docs/directives.ts`, which the viewer also renders from |
| 7. Assets | One id with several files is one asset: `src/core/assets/representations.ts` picks a file, and the approval and its findings are for the id (`src/core/checker/approvals.ts`, `review.ts`). `src/core/assets/` catalogs SVG and raster files (PNG, JPEG, GIF, WebP, AVIF) and reads their size from the file header. The dev server streams them (`src/server/assets.ts`); `blazon build` copies them to `brand-assets/` |
| 8. Layout groups | Social formats and patterns, drawn by `blazon:formats` and `blazon:patterns` |
| 9. Icon sets | Read from installed packages, with categories |
| 10. Logo rules | `unit`, `lockup`, `placement`, `partnership`, `initiative`, `misuse` (as of 2026-11-21), `colorways` (as of 2026-11-21) and `ink` in sidecars, drawn by the `blazon:logo-*` directives |
| 11. Asset categories | The operator's approval of a `dir` outside the project (`--allow-dir`, `BLAZON_ALLOW_DIRS`; `src/core/confine.ts`, `src/core/assets/categories.ts`). The `assets` block, including `experimental: true`, which shows an asset labelled "Experiment", and `reference: true`, which shows it labelled "Reference"; both exempt it from the review-gating findings |
| 12. `brand.json` | The rule for choosing one file of an id (`src/core/assets/representations.ts`) is used by every reader in `src/core/`, the viewer and the shipped plugins. `src/core/brand/` (`theme.fontLicenses`, read by `src/core/fonts.ts`; additive, so `version` stays 2), with a JSON Schema beside it, the per-context `removed`, `groupChanges` and `removedGroups` (additive, `version` stays 2) and a `generator` that records the blazon commit. Read by `scripts/read-brand.py` and drawn by `blazon.brand-deck` |
| 13. Sections | `customSections`, `section-invalid`, `section-missing`, the `blazon:section` directive |
| 14. Configuration | `blazon.json`, plain JSON, is the one form (`src/core/config/index.ts`); the older code spellings are refused by name with `config-invalid`. Unknown keys and wrong types are `config-invalid`; a config that cannot load stops the run. `customSections` and `vocabulary` are vocabulary as data (RFC 0002 section 1). `blazon pin` writes `blazon.lock`. As of 2026-11-16 the `shadcn` key is refused with `config-invalid`, naming the plugin `blazon.shadcn` and its `variables` option, because the mapping is written by that plugin |

The brand book starter belongs to [RFC 0003](0003-adopting-blazon.md): `blazon init` copies `examples/blazon/`, and `template/` is built from it by `npm run build-starter` and not committed.

Proposed next: compiling combinations of contexts across modifiers, if a brand needs values that only apply to one combination.

## Open questions

1. ~~Is `dev.blazon` the right namespace? It needs a domain blazon controls.~~ Decided on 2026-10-31: keep `dev.blazon`. It is written in every brand's token files, so a rename would touch all of them for no gain, and only blazon reads it. The reverse-domain convention is for a consumer's own keys (section 7, `extensions`), which cannot collide with it. A rename, if one ever comes, follows the compatibility rule in the manual's [stability chapter](../manual/18-stability.md): the old key stays for one minor, with a warning.
2. ~~Should `usage` roles be a closed list (checkable) or open strings (flexible)?~~ Decided: a standard list plus the names a brand declares in `vocabulary.usageRoles`, so a spelling is still checked (section 14).
3. ~~Default gradient angle~~ Decided: 180, the CSS default. `dev.blazon.angle` overrides it.
4. ~~Asset metadata (clear space, minimum size, logo variants): this RFC or the next?~~ Decided: this RFC, sections 7 and 10.
5. ~~Should `blazon check` read contrast pairs from `dev.blazon` only, or also infer them from semantic `text.*` × `surface.*` tokens?~~ Decided on 2026-10-31: `dev.blazon` only (section 2, `pairs`). A check that guessed which text sits on which surface would report findings the brand never wrote. Revisit when a second brand book asks for it.
6. ~~Which parts of the model should a brand be able to extend, and how?~~ Decided in [RFC 0002](0002-extension-model.md). Sections, logo lockups and usage roles are vocabularies a brand extends as data (section 14). Checks and outputs are plugins. The logo corners, pattern kinds, theme roles and tiers stay closed because blazon draws or reads them. A custom page directive is still closed (RFC 0002 section 3).
7. ~~Should the config also be allowed as plain data (`blazon.config.json`), so a tool can generate it and a schema can check it?~~ Decided on 2026-11-15, and stronger: the config is plain JSON only, in `blazon.json` (section 14). The code spellings are removed, not kept beside it, because two forms would mean a tool could not know which one the book reads.

## References

Normative:

- [dtcg-format]: Design Tokens Format Module 2025.10. https://www.designtokens.org/TR/2025.10/format/
- [dtcg-resolver]: Design Tokens Resolver Module 2025.10. https://www.designtokens.org/TR/2025.10/resolver/
- [RFC2119], [RFC8174]: BCP 14 key words.
- WCAG 2.2, contrast (minimum), success criterion 1.4.3.

Informative:

- Style Dictionary, Tokens Studio: prior art above.
