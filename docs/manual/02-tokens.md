# Tokens

← [Manual index](index.md)

Tokens are JSON files in `tokens/`. They follow the [Design Tokens Format Module 2025.10](https://www.designtokens.org/TR/2025.10/format/) (DTCG). Blazon adds one extension, `dev.blazon`, for brand rules DTCG has no field for. The examples in this chapter use the token names of a real company's brand guidelines, not the starter's. The starter's tokens are named differently: see [Getting started](01-getting-started.md#what-blazon-init-creates).

## Writing a token

```json
{
  "color": {
    "$type": "color",
    "primary": {
      "indigo": { "$value": "#635DFF" }
    }
  },
  "radius": {
    "card": { "$type": "dimension", "$value": { "value": 24, "unit": "px" } }
  }
}
```

- **Every `.json` file in `tokens/` merges into one tree.** The file name is not part of a token's path: `color.primary.indigo` is the same path in any file. A path defined in two files is a warning (`token-path-duplicate`), and the later file wins.
- **A token is an object with `$value`.** A bare value such as `"indigo": "#635DFF"` is an error (`token-invalid`). A file whose top level is not an object, or that is not valid JSON, is an error (`token-file-invalid`).
- **`$type` comes from the token or the nearest group above it.** Blazon never infers it from a file name or a value, but a token whose whole value is an alias takes the type of the token it points at. A token with none of these is an error (`token-type-missing`), and a `$type` that is not a DTCG type is an error (`token-type-unknown`).
- **A value must fit its type**, or the check reports `token-value-invalid`.

### Types

| `$type` | Value |
|---|---|
| `color` | A CSS color string such as `#635DFF` or `rgb(99 93 255)`, or a DTCG color object with a `colorSpace` and three `components` (and an optional `alpha`) |
| `dimension` | `{ "value": 24, "unit": "px" }`. DTCG allows `px` and `rem`. Blazon also keeps a relative unit such as `em` or `%` and writes it to CSS as it is. A print unit (`pt`, `pc`, `in`, `cm`, `mm`, `Q`) is an error (`token-value-invalid`) whose message gives the px value, at 1pt = 4/3 px. Only `px` and `rem` are understood where blazon measures something itself: previews, asset sidecars, social formats and patterns |
| `fontFamily` | A name or a list of names |
| `fontWeight` | A number from 1 to 1000 such as `600`, or a DTCG weight name such as `bold` |
| `duration`, `cubicBezier`, `number`, `strokeStyle` | As DTCG defines them |
| `border`, `transition`, `typography` | Composite values: an object of parts, each a value of its own type |
| `shadow` | An object of parts (`offsetX`, `offsetY`, `blur`, `spread`, `color`, optional `inset`), or an array of such objects for a layered shadow |
| `gradient` | An array of at least two stops, each `{ "color": ..., "position": 0 to 1 }`. An object, or fewer than two stops, is a `token-value-invalid` error |

Without an `angle` in `dev.blazon`, a gradient runs at 180 degrees, which is to the bottom: the CSS default.

A text style is a `typography` token. Its value is an object of parts, and each part may be an alias:

```json
"type": { "heading": { "$type": "typography", "$value": {
  "fontFamily": "{font.family.sans}",
  "fontSize": "{font.size.4xl}",
  "fontWeight": "{font.weight.bold}",
  "letterSpacing": { "value": -0.02, "unit": "em" },
  "lineHeight": "{font.lineHeight.tight}"
} } }
```

### Naming tokens

Blazon does not impose names, and any name is an ordinary one: a group called `constructor`, `prototype` or `__proto__` is read like any other and writes nothing outside the token tree. Two habits pay off. Keep the raw palette (`color.*`) apart from the roles that alias it (`text.primary`, `interactive.primary`), so a rebrand changes one file. And use the conventional role names listed under [Theme roles](07-theme-and-config.md#when-there-is-no-theme): the brand book then dresses itself in your colors with no configuration.

## Aliases

An alias is a token's whole value, written as the full path in braces: `{color.primary.indigo}`. Aliases are full paths from the root, in any file.

- An alias that matches no token is an error (`alias-unresolved`).
- An alias that leads back to itself is an error (`alias-circular`).
- An alias mixed into other text, such as `"1px solid {color.black}"`, is an error (`alias-embedded`). Use a composite type and alias each part.
- A token whose `$type` differs from its target's is an error (`alias-type-mismatch`).
- An alias to a token marked `$deprecated` is a warning (`alias-deprecated`).

## The `dev.blazon` extension

Put brand facts under `$extensions["dev.blazon"]`, on a token or on a group. Every field is optional. A group's fields apply to every token in it, and a token can override them. Three fields describe a group as a whole, so write them on the group only: `proportion`, `pairs` and `pattern`. `review` is reported on the group too, but a token can still set its own.

```json
{
  "color": {
    "secondary": {
      "$type": "color",
      "$extensions": {
        "dev.blazon": {
          "tier": "primitive",
          "usage": { "deny": ["text"] },
          "source": { "doc": "brand-guidelines", "locator": "slide 36" }
        }
      },
      "pink": {
        "$value": "#FF44DD",
        "$extensions": { "dev.blazon": { "print": { "cmyk": [18, 88, 0, 0], "pms": "239 C" } } }
      }
    }
  }
}
```

| Field | Meaning |
|---|---|
| `tier` | Where the token sits: `primitive` (a raw value), `semantic` (a role, aliasing a primitive) or `component`. A semantic or component token with no alias gets a warning (`alias-missing`) |
| `role` | The role this token plays: `text`, `background`, `border`, `icon`, `illustration`, `accent` or `interactive`. The check follows the aliases from this token, and if any token on the way does not allow this role, that is an `usage-violated` |
| `usage` | `{ "allow": [...], "deny": [...] }` with the same seven roles. Where the value may appear: `deny: ["text"]` forbids it as text, and `allow` forbids every role it leaves out. Naming something that is not one of the seven roles, or a role you added under `vocabulary.usageRoles` in the config, is an error (`usage-role-unknown`) |
| `print` | `{ "cmyk": [c, m, y, k], "pms": "...", "ral": "5012" }`. Print equivalents. RGB comes from `$value` and is not stored. `cmyk` is exactly four numbers from 0 to 100 (percent), or it is a `print-cmyk-invalid` error. `pms` is a non-empty single-line string, or it is a `print-pms-invalid` error. `ral` is a RAL number written without the `RAL`, which the book adds (`RAL 5012`); a `ral` that is empty, spans lines, is not a string or starts with `RAL` (`RAL 5012`, `RAL-5012` and `RAL5012` alike) is a `print-ral-invalid` error |
| `source` | `{ "doc": "...", "locator": "...", "cssVar": "--brand-primary" }`. Where the value came from, such as a slide. `cssVar` is optional: the custom property of the live site the value was read from, which `blazon drift` compares |
| `review` | `{ "status": "ok" or "needs-review", "note": "...", "by": "...", "at": "2026-10-29", "value": "..." }`; only `status` is required. Whether a person has confirmed the value: `needs-review` marks a value that is known or suspected to be wrong, or not yet confirmed; `ok` records that someone confirmed it. `by` says who and `at` when (a real date, `YYYY-MM-DD`); `note` is free text, and blazon does not check it. `value` is the fingerprint of the value that was confirmed (see [Noticing a changed value](#noticing-a-changed-value)). A `review` of the wrong shape is a `review-invalid` error. `needs-review` is a warning (`review-pending`) and is listed on the Review page of the brand book. On a group it flags the whole group: one warning at the group's path, and its tokens add none (see [Reviewing a group](#reviewing-a-group)) |
| `logo` | `{ "deny": [...], "reason": "..." }`. Logo variants the brand forbids on this background, whatever their contrast: `onLight`, `onDark`, or a logo asset id such as `logos/white`. See [Forbidden logo backgrounds](#forbidden-logo-backgrounds) |
| `angle` | A gradient's direction in degrees |
| `preview` | Forces how the brand book previews the token. Without it, blazon picks one from the token's type and name. The kinds: `radius` (a box with that corner), `square` (a square of that size on a grid), `stroke` (a line at that weight), `tracking` (text at that letter spacing), `fontSize` (a specimen), `frame` (a canvas frame), `opacity` (a swatch at that opacity), `border` (a shape with that border) and `bar` (a bar as long as the value) |
| `webFont` | On a `fontFamily` token: `false` when the brand book cannot load the typeface, such as a commercial font with no web stylesheet, or a sentence saying why or what to use instead. The Typography page then says the brand book does not load it and that the specimen uses the first font in its stack the reader's computer has, so a fallback is not taken for the brand's font |
| `font` | On a `fontFamily` token, or a group of them: `{ "source": "...", "license": "...", "licenseUrl": "https://..." }`, each optional but at least one. `source` is where the typeface comes from, a name (`Kinto Type Foundry`) or an `http(s)` address. `license` is an SPDX identifier (`OFL-1.1`) or the license's name in words. A value that looks like an identifier but is not on the SPDX list (`OFL-1.2`, `Apache2`, `mit`) gets a `font-license-unknown` note naming the closest ids; a name in words is never noted. `licenseUrl` is the address of the license text. The Typography page prints what is stated under the typeface, and `blazon.press-kit` writes it into `fonts.txt` in place of `not stated`. blazon takes your word for it and does not look the license up. A field that is not text, an address that is not `http(s)`, an unknown field, or `font` on a token that is not a `fontFamily` is an error (`font-meta-invalid`) |
| `proportion` | Group only. The documented share of a composition. The brand book draws it as a bar on the Tokens page under Colors |
| `pairs` | Group only. Contrast rules: every foreground on every background must reach a level |
| `pattern` | Group only. Marks the group as a pattern; see [Patterns](#patterns-and-social-formats) |

### Reviewing a group

A brand that proposes a whole ramp should not get a warning per step. Write `review` on the group:

```json
"brand": { "$extensions": { "dev.blazon": { "review": { "status": "needs-review", "note": "Proposed ramp, not in the source" } } },
  "100": { "$value": "#eef0ff" }, "200": { "$value": "#d9ddff" } }
```

This is one `review-pending` warning, at `color.brand`, and none for the tokens in it. A token with its own `review` still reports on its own, and `"status": "ok"` on a token or on a nearer group takes it out. When flagged groups are nested, each reports once, and the nearest one covers its tokens. The Review page lists the group once, and the tokens keep their flag in the brand book. brand.json carries the group's `review` on the group only.

### Noticing a changed value

An approval says a person confirmed the value as it was. To have `blazon check` notice when the value moves afterwards, record its fingerprint in `review.value`:

```json
"review": { "status": "ok", "by": "Dana Whitfield", "at": "2026-10-29", "value": "9f2c41d07ab3" }
```

`blazon approvals` prints the fingerprint of every token and asset marked `ok`, and whether the one recorded still matches ("recorded", "stale" or "not recorded"). Copy it in once the person has confirmed the value; blazon never writes a review itself. The fingerprint covers the token's `$type` and its resolved value, with aliases replaced, so an alias is stale when the token it points at changes to another value, and is not when it is re-pointed at a token with the same value. It is taken in the default context: a resolver context that changes the value does not make the approval stale. When the value no longer matches, `blazon check` gives an `approval-stale` warning that names who approved it and when, and prints the new fingerprint. Confirm the new value, then replace `value`. An `ok` with no `value` is never stale. A group has no value to fingerprint: `value` on a group is a `review-invalid` error, so put it on the tokens.

The 12 hex digits are the first 12 digits of the SHA-256 of a text made of the token's `$type` and resolved value (keys sorted, no spaces), or, for an asset, of the image file's bytes. The sidecar, the description and every other `dev.blazon` field are not part of it, so editing them keeps the approval. [RFC 0001, section 2](../rfc/0001-data-model.md) gives the exact text and test vectors, for a tool that needs to compute the same digits. If the way the fingerprint is computed ever changes, every recorded one is stale: run `blazon approvals` and record the new fingerprints once a person has confirmed the values.

### Proportions

Write it on a group, and key each share by the full path of the group it describes:

```json
"color": { "$extensions": { "dev.blazon": { "proportion": {
  "color.neutral": 0.6, "color.primary": 0.3, "color.secondary": 0.1
} } } }
```

A number is the share of a group, and its key is that group's path. When the brand's buckets do not match its groups, give an object instead, and its key is a label: `"White": { "share": 0.5, "tokens": ["{color.neutral.white}"] }`. Each share must be between 0 and 1 (`proportion-invalid` otherwise), and every token an object lists must exist. Shares that do not add up to 100% (within 0.5%) are a warning (`proportion-total-mismatch`).

Blazon checks the numbers and the token names. It does not check whether real designs follow the proportions: that is a judgment about a layout, not a value.

### Contrast pairs

Write `pairs` on a group, and name the tokens by path:

```json
"color": { "$extensions": { "dev.blazon": {
  "pairs": [ { "fg": "{text.primary}", "bg": "{color.secondary.*}", "min": "AA" } ]
} } }
```

`min` is `AA` (4.5:1), `AA-large` (3:1) or `AAA` (7:1). A pair below its level is an error (`contrast-insufficient`). `fg` and `bg` take a token or `{group.*}` for every color under a group. A pair that matches no color tokens, or names an unknown level, is an error (`contrast-pair-invalid`). Any CSS color is measured: hex, `rgb()`, `hsl()`, `lab()`, `oklch()`, `color()` or a name. A value that is not a color, such as a gradient or a `var()`, is a warning (`contrast-unknown`).

### Forbidden logo backgrounds

Contrast says whether a logo reads on a background, not whether the brand allows it: white on Magenta can pass 3:1 and still be against the rules. State it on the background token, or on a group of them, as `logo`:

```json
"magenta": { "$value": "#E6007E", "$extensions": { "dev.blazon": {
  "logo": { "deny": ["onDark"], "reason": "The white logo is never used on Magenta; use the black one." }
} } }
```

`deny` takes `onLight` and `onDark` (the `logo` files in `blazon.json`) and the id of a logo asset, such as `logos/white`. A configured file that is a logo asset answers to both names, so `onLight` and `logos/blue` forbid the same row. The grid measures a configured file as the `ink` its sidecar declares, and as black (`onLight`) or white (`onDark`) when it declares none. `reason` is shown with it and is optional. `<!-- blazon:logo-contrast -->` then marks that variant `forbidden` on that background even when its ratio passes, and prints the reason under it. The rule is read from the token itself or its group, then from the tokens it aliases, so a semantic token that aliases Magenta is covered. Why on the token and not in `pairs`: `pairs` relate two tokens, and the logo is not a token, so the rule belongs to the background, as `usage` does. A name that is no logo variant is an error (`logo-variant-unknown`), and a `logo` that is not `{ "deny": [strings] }` is `logo-rule-invalid`, because a rule that names nothing would forbid nothing and say nothing. The rule is shown only in the contrast grid: `blazon:logo-on` and the page covers still pick a logo by contrast.

A rule on the theme's background, inverse or accent token also decides what the book's own [logo usage](05-pages.md#directives) figure shows: a surface the brand forbids the logo on gets no tile, and [`logo-contrast-insufficient`](03-checks.md) is not raised for it. That is how a brand says that its mark, drawn in the accent color, is not placed on the accent.

## Patterns and social formats

Two brand facts are a group of tokens, not one token. Both use ordinary token types.

**A social format** is a group with `width` and `height` dimensions, and optionally `margin` (a dimension, the safe area) and `columns` (a `number`, a whole number of at least 1):

```json
"social": { "format": { "$type": "dimension",
  "story": {
    "width":   { "$value": { "value": 1080, "unit": "px" } },
    "height":  { "$value": { "value": 1920, "unit": "px" } },
    "margin":  { "$value": { "value": 80, "unit": "px" } },
    "columns": { "$type": "number", "$value": 4 }
  } } }
```

**A pattern** is a group whose `$extensions["dev.blazon"]` sets `pattern` to `dots`, `lines`, `diagonal`, `grid` or `checks`. It holds `size` (the repeat, one tile this many px square), and optionally `stroke` (the dot diameter or line weight, an eighth of `size` when absent), `ink` and `ground`. `ink` and `ground` are color or gradient tokens, written as a value or as an alias.

A `rem` in either is read as 16px. Show them in a page with [`blazon:formats` and `blazon:patterns`](05-pages.md#directives).
