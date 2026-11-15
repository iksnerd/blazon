# RFC 0008: Print units and rules that blazon cannot yet state

Status: draft 1, nothing implemented · Scope: three things a printed brand manual states that blazon's data model cannot hold or test today: a size in a print unit, a rule that something must be present, and a rule that ties one measure to another
Numbering: blazon RFCs, starting at 0001. Builds on [RFC 0001](0001-data-model.md) (the data model; section numbers below that are not prefixed refer to it) and [RFC 0002](0002-extension-model.md) (plugins). It answers open questions 5 and 6 of [RFC 0007](0007-recommended-contents.md), whose shape it takes.

## Summary

A bank's visual identity manual (68 pages) was set against blazon for RFC 0007. Three of its statements did not fit, and each needs a decision before any code. This RFC gives, for each, the problem, the options, a recommendation and what would be tested. Two of the three recommendations are to build little or nothing.

1. **Print units.** The manual states layout grids in centimetres for billboards and posters. Blazon refuses a dimension in `cm`. **Proposed:** keep the refusal, and add an optional `print.size` beside the px `$value`, with a check that the two agree.
2. **Required presence.** "Every material carries at least one primary color and one warm secondary color." Blazon's rules allow or deny; none requires. **Proposed:** do not build a check. `brand.json` has no materials, and no check can see artwork. State it as a prompt.
3. **Relative geometry.** "The corner radius is 7.5% of the grid square side." **Proposed:** build nothing now. A `%` token and a sentence of prose cover the case. If a brand needs the tie checked, a group-level `relations` list is the shape to build, and a derived-value expression is not.

**Core or plugin.** A field belongs in the core when it states one fact about one token and needs no new mechanism: `print.ral` is stored and shown the way `print.pms` is. A rule about the whole book, such as required presence, needs a mechanism and a model of what it ranges over, so it is a plugin or prose until a second reader asks for it. `print.size` is the borderline case, which is why it is built only when something reads it.

Nothing here is built. No source file changes with this RFC.

## Motivation

The facts about blazon below were read from the code on 2026-11-04.

| What | State |
|---|---|
| A dimension in `pt`, `pc`, `in`, `cm`, `mm` or `Q` | An `token-value-invalid` error that gives the px value at 96px to the inch (`measure` in `src/core/tokens/values/units.ts`; RFC 0001 section 1, item 5). Pinned by `test/core/tokens/model.test.ts` |
| Other CSS lengths (`em`, `%`, `vw`, `ch` and the rest of `LENGTH_UNITS`) | Accepted and written to CSS as they are. The comment in `units.ts` says they are tolerated, which is wider than DTCG's `px` and `rem` |
| Layout groups (social formats, patterns) | Read in px or rem only, with 1rem as 16px (`dimensionPx` in `src/core/tokens/groups.ts`). A `%` or a print unit gives `undefined` there |
| `print` on a token | `{ cmyk?, pms?, ral? }` (`src/types/tokens.ts`). It is a color fact; the viewer and the shipped plugins read it only on colors |
| Rules | `usage.allow`, `usage.deny` and `role` (`src/core/checker/usage.ts`), `logo.deny`, `pairs` (contrast), `proportion` (shares of a whole), and asset `rules` (formats, `minPixels`, `aspectRatios`). All of them allow, deny or measure something that exists. None says that something must exist |
| Materials (a poster, a billboard, a vehicle) | Not modelled. No type, token field, `brand.json` key or finding mentions one (searched `src/`; the only hits are the word in other senses, such as an icon package name and "material kept for comparison") |
| A rule between two tokens | `pairs` ties a foreground to a background by contrast, and `proportion` ties colors to shares. Nothing ties one dimension to another. A logo sidecar measures in multiples of its own `unit` (RFC 0001 section 10), which is relative geometry, but only inside one asset |
| A check plugin | Receives `brand.json` and no files (RFC 0002 section 2), so it sees what the brand states and never an image |

The manual's statements, in the abstract:

| Statement | Gap |
|---|---|
| Grids of 400 x 300 cm and 50 x 70 cm | A size that is authored in a unit blazon refuses |
| Every material carries one primary and one warm secondary color | A requirement, about artwork |
| Radius is 7.5% of the grid square side; the logo box is 70% of the square | A measure defined by another measure |

## Conventions

The key words "MUST", "MUST NOT", "SHOULD", "SHOULD NOT" and "MAY" are to be interpreted as described in BCP 14 [RFC2119] [RFC8174] when, and only when, they appear in all capitals.

## The model

### 1. Print units

**Problem.** The manual's layout grids are physical: 400 x 300 cm for a billboard, 50 x 70 cm for a poster. A brand that encodes them has to write 15118.11px, 11338.583px, 1889.764px and 2645.669px, which are the same sizes at 96px to the inch (the error message from `units.ts` gives these numbers). Four things go wrong:

- The number in the token is not the number in the manual, so a reader checking one against the other converts by hand, and a rounded px is not exactly 400 cm.
- The book shows px. A billboard in px is not a fact anyone stated.
- The 96px to the inch is CSS's convention for a reference pixel, not a measure of anything printed. It is the right bridge for CSS and a meaningless one for a printer.
- Blazon's own rule for this was written for the opposite case: a screen token copied from print, which other DTCG tools cannot read (RFC 0001 section 1, item 5). A billboard grid is not a screen token.

DTCG 2025.10 allows `px` and `rem` for a dimension, as RFC 0001 section 1 says; RFC 0001 cites the specification and this RFC relies on that reading. It should be re-read against the specification text before anything is built, because the argument below turns on it. The ratio is not lost today: an asset category can state `aspectRatios: ["4:3"]` (RFC 0001 section 11, `src/core/assets/categories.ts`). What is lost is the absolute size.

**Options.**

| Option | Pros | Cons |
|---|---|---|
| A. Keep the error; the brand writes px, and the cm figure goes in `$description` or a page | No change. Tokens stay valid DTCG. | The authored value is not data: no check, no `brand.json` field, no display. A converted px drifts from the manual. This is the situation the manual comparison found |
| B. Allow print units in a `dimension`, converted to px for CSS | The authored value is the token. `cm` is a valid CSS length, so even no conversion is needed for CSS | A DTCG tool cannot read `tokens.json` with a `cm` in it, which is the reason for the current rule. Every reader of a dimension (`dimensionPx` and the code that calls it) must then handle two kinds. It reverses RFC 0001 section 1, item 5 for a case the item was not about |
| C. Keep the px `$value` and add `print.size` in `dev.blazon`: the size as authored, in a print unit | DTCG-clean; the unit survives into `brand.json`; it parallels `print.cmyk` beside an RGB `$value`; an old reader ignores it (RFC 0001 section 12: a reader ignores keys it does not know) | Two numbers for one fact. They can disagree, so a check is needed. `print` is typed as a color fact today, so the type widens |
| D. A new `$type`, such as `print.size` | One value, one unit | DTCG types are a closed list and an unknown `$type` is `token-type-unknown` (RFC 0001 section 4). The token is no longer portable at all, and it is new syntax for one brand's grid |

**Recommendation: option C, kept small.**

```jsonc
"billboard": {
  "$type": "dimension",
  "width":  { "$value": { "value": 15118.11, "unit": "px" },
              "$extensions": { "dev.blazon": { "print": { "size": { "value": 400, "unit": "cm" } } } } },
  "height": { "$value": { "value": 11338.583, "unit": "px" },
              "$extensions": { "dev.blazon": { "print": { "size": { "value": 300, "unit": "cm" } } } } }
}
```

- `print.size` is `{ value: number, unit: "pt" | "pc" | "in" | "cm" | "mm" | "Q" }`, on a `dimension` token only. Anything else is an `invalid-print-size` error (proposed).
- The px `$value` stays required. A `dimension` in a print unit as `$value` stays the `token-value-invalid` error, so option B is not taken.
- A check converts `print.size` to px with the constants already in `units.ts` and warns when it differs from `$value` by more than 0.1%: `print-size-mismatch` (proposed, warning). The message gives the px to write, as the current error does.
- The brand book shows the print size beside the px on the token's card, and `brand.json` carries it in `blazon.print.size` with no schema change beyond a described property. The viewer change is the only part that is not a check.

Option C is cheap because it adds a field and one comparison. It is worth building only if something reads `print.size`: the brand book display, or a plugin that lays out a poster. If nobody does, option A with the figure in prose is honest and costs nothing, and the data would be unread. That is open question 1.

**What would be tested.**

1. Each of the six units, in a token, converts to the px that `measure` gives for it today, and a matching `$value` passes.
2. A `$value` more than 0.1% away from the converted size is `print-size-mismatch`, and the message names the px to write. A `$value` within it is silent.
3. A `print.size` with an unknown unit (`mm2`, `px`), a non-number, a missing key or an extra key is `invalid-print-size`. A `print.size` on a color is the same error.
4. A `$value` in `cm` is still `token-value-invalid`, with the existing message (the existing test in `test/core/tokens/model.test.ts` stays as it is).
5. `brand.json` carries the field and still validates against `brand.schema.json`, including the copy that forbids undescribed keys (RFC 0001 section 12).
6. `tokens.json` and the CSS outputs are byte-for-byte unchanged by adding `print.size`. This is the DTCG portability claim, and a golden file holds it.
7. RFC 0001 names the new codes (`test/docs/rfc.test.ts` fails otherwise), and the manual names them (`test/docs/manual.test.ts`).

### 2. Required presence

**Problem.** "Every material carries at least one primary color and one warm secondary color" is a requirement of the form: for each X, there exists a Y. Blazon's rules say what a token may or may not be used for. None says that something must be present.

Whether a check can test it from `brand.json` is a question about what `brand.json` holds:

- **Materials are not modelled** (see the table in Motivation). The nearest things are asset categories (RFC 0001 section 11) and social formats (section 8). A category is a folder of images, not a statement of what a material is, and no field says which colors a material carries.
- **A check never sees the artwork.** The `check` role receives `brand.json` and no file paths (RFC 0002 section 2). It cannot open a poster and count its colors, and a poster's colors are not in its sidecar unless a person typed them there.
- **"Primary" and "warm" are not fields.** `tier` is primitive, semantic or component. `role` is where a color may be used (`usage.ts`). Blazon infers theme roles from conventional token names (`src/core/tokens/theme.ts`), and a name is not a classification. "Warm" is a hue range, which a program could compute from a hex value, but the boundary is a design decision, and different manuals draw it differently.

So a check can test only a weaker statement than the manual's: the palette defines at least one color in a group the brand calls primary and one in a group it calls secondary. That tests the palette, not the materials, and it is the part nobody gets wrong.

**Options.**

| Option | Pros | Cons |
|---|---|---|
| A. A `material` model: the brand declares each material and the colors it carries, and a check requires one primary and one warm secondary in each | The rule becomes testable | The check then tests the declaration against itself. A person who declares the palette of a poster has already decided that it holds the colors. The test passes whatever the poster looks like, so it is the appearance of a check. It also adds a new noun to the model for one rule |
| B. A check on the palette alone: a primary token exists, a warm secondary exists | Needs only a hue range and a way to say which group is primary | Tests the easy part. The word "warm" needs a threshold the brand has to choose, and a wrong threshold is a silent pass |
| C. A prompt: a recommended-contents item (RFC 0007) saying the page for each material states which primary and which warm secondary color it carries | Honest about what a program can do. Costs one line in a sector profile, no model change | Reported only as `info`, and satisfied by a heading that mentions the topic, so it proves a page addresses the rule, not that artwork follows it |
| D. Leave it in the manual's prose | Nothing to build | The rule is invisible to the checks |

**Recommendation: option C, and do not build A or B.** This is a "do not build" for a check. The rule is about artwork, which blazon cannot read; a person or a pre-press review has to judge it. The right shape in blazon is the RFC 0007 prompt item, in a sector profile for a bank, for example `{ id: "color.material-presence", section: "color", ask: "Say which primary and which warm secondary color each material carries", topics: ["material", "primary"] }`. That item is data for a plugin that is itself only proposed, so this RFC adds nothing to the core and nothing to RFC 0007's mechanism.

If a future brand states the colors of each material as data, as a table in a sidecar of its own, the question reopens. At that point a check would test consistency between two statements the brand made, which is useful but is a different claim.

**What would be tested.** Nothing in this RFC, because it proposes no code. When the item is added to a profile, RFC 0007's conformance cases apply: a heading that matches a topic silences the prompt, a topic in a code span does not, a section with no page produces no prompt.

### 3. Relative geometry

**Problem.** "The corner radius is 7.5% of the grid square side" and "the logo box is 70% of the square" define one measure by another. Blazon keeps `%` as written (RFC 0001 section 1, item 5; `LENGTH_UNITS` in `units.ts`) and can write it to CSS, but no rule ties one token to another, and a `%` in CSS is a fraction of the element's own box, not of a named token.

What works today. A `border-radius: 7.5%` on a square box is 7.5% of that box's side, and the box is the grid square. So for the manual's two statements, `{ "value": 7.5, "unit": "%" }` and `{ "value": 70, "unit": "%" }` are already correct, accepted and written to CSS unchanged. They state the ratio. They do not state which square, and nothing tests that the radius stays 7.5% if someone later writes it in px. A `%` dimension is also not a px or rem value, so `dimensionPx` returns nothing for it, and a layout group cannot use it as a size.

What does not work: a brand that wants the numbers in px, because a tool reads them in px, and also wants the 7.5% kept true when the square changes.

**Options.**

| Option | Pros | Cons |
|---|---|---|
| A. Leave it to prose, and use a `%` token where CSS can read it | No change; the relation is visible as a sentence and as `7.5%`. | Nothing detects a px value that drifts from the ratio. The reference (the square) is only in prose |
| B. A derived-value expression, such as `calc({grid.square} * 0.075)` in `$value` | One source of truth: change the square and the radius follows | An alias must be the whole value; mixing an alias with other text is `alias-embedded` (`src/core/tokens/alias.ts`, RFC 0001 section 4). DTCG 2025.10 has no expression syntax, so blazon would invent one in `$value`, and a DTCG tool would read the token as garbage. It also needs an evaluator, an order of resolution and cycle checks. It turns the token files into a language |
| C. A `relations` list on a group, evaluated by a check | Tokens stay literal DTCG. Follows the shape of `pairs` and `proportion`, which are group-level cross-token rules in `dev.blazon`. Catches drift. | A second place where the number lives (the literal and the ratio). Both must be authored. Only px and rem resolve (`dimensionPx`), so a `%` token cannot be one side |

If C is built, its shape follows `pairs`:

```jsonc
"$extensions": { "dev.blazon": {
  "relations": [
    { "token": "{radius.card}", "of": "{grid.square}", "ratio": 0.075, "tolerance": 0.005 }
  ]
} }
```

`token` and `of` are dimension tokens that resolve to px or rem. `ratio` is a number above 0. `tolerance` is a share of the expected value and defaults to 0.5%, as `proportion` allows 0.5% (`PROPORTION_TOLERANCE` in `src/core/checker/proportion.ts`). A finding `relation-broken` (proposed, error or warning, open question 3) names both values and the value the ratio expects. A reference that is not a token, or does not resolve to px or rem, is `invalid-relation` (proposed, error).

**Recommendation: option A now. If a brand needs the tie checked, option C. Do not build B.** The manual's own two examples are served by `%`. The case for C is a brand that must keep px values in step with a ratio, and none has asked: there is one manual behind this RFC, and RFC 0007 sets the same bar for adding a field (a second reader). B is the one to refuse outright, because it breaks the DTCG alias rule that the whole model rests on (RFC 0001 section 1) in exchange for convenience.

**What would be tested, if C is built.**

1. A token at the expected ratio passes. One outside the tolerance is `relation-broken`, and the message gives both values. One inside it passes.
2. A `rem` and a `px` on the two sides compare after the 16px reading of `dimensionPx`.
3. `token` or `of` naming nothing, a color, or a `%` dimension is `invalid-relation`. A `ratio` of 0, a negative number or a string is too.
4. A relation that refers to the same token on both sides is `invalid-relation`.
5. `relations` is group-level and is not inherited by the tokens of the group (proposed; the choice is open to review).
6. `brand.json` carries `relations` under `groups`, and the schema tests pass.
7. Doc tests: the codes are named in RFC 0001 and the manual.

## Conformance

This RFC adds no code. A change that takes one of its recommendations is tested at the points listed under that section, and in addition:

1. **RFC 0001** names every new finding code (`test/docs/rfc.test.ts`) and the manual names them (`test/docs/manual.test.ts`).
2. **Golden files** for the token outputs do not change, so a brand that uses none of the new fields builds the same bytes as before.
3. **`npm run test:docs`** passes on this RFC (the doc tests read RFC 0001 and the manual, not this file, so this RFC needs a human read for claims).

## Drawbacks

- **Two numbers for one fact** (section 1, option C). The px and the print size can disagree, and the check only warns. It is the same cost `print.cmyk` has beside an RGB value, and blazon has accepted that one.
- **A field with one reader.** `print.size` may have nobody reading it. Building it before a consumer exists is the mistake RFC 0007 warns about.
- **The honest answers are small.** Two of the three sections recommend little or no code, so the manual's rules stay in prose. A brand wanting every rule checked will not get that from this RFC, and the RFC says so on purpose.
- **`print` widens.** Today it is a color fact. After this it is a print fact, and a reader that assumed colors needs a look.

## Non-goals

- Judging artwork: counting the colors on a poster, or measuring a printed object.
- Accepting a print unit as a token's `$value`, or a new `$type`.
- An expression language, in `$value` or elsewhere.
- A model of materials, media or formats beyond what RFC 0001 section 8 has.
- Choosing what "warm" means for a brand.

## Alternatives and prior art

The options are in each section. Prior art:

- **DTCG** has `px` and `rem` for a dimension and no expressions. Its aliases are references to a whole value.
- **Style Dictionary and Tokens Studio** can compute values with transforms or math in the tool's own syntax. That is a property of the tool and not of the token file, so a file written for one is not portable to another. This RFC does not take that route.
- **CSS** has `cm`, `mm`, `in`, `pt` and `calc()`. They are real in a browser and meaningless for a poster, which is the point of section 1.
- **`pairs` and `proportion`** in this repository are the precedent for a rule between tokens that stays out of `$value`.

## Compatibility

Nothing breaks. Every recommendation is additive: an optional field in `dev.blazon`, new finding codes, and no change to an existing code or to the outputs of a brand that does not use them. A reader of `brand.json` ignores keys it does not know (RFC 0001 section 12), so no `version` change is needed. Option B of section 1, if it were taken, would break this and is not recommended.

## Security considerations

- **A print size is a number and a unit from a closed list.** There is no path, command or pattern in it. The check does arithmetic only.
- **`relations` refer to tokens by path.** The check resolves references inside the project's own token tree and reads nothing else. A reference that resolves to nothing is a finding, not a lookup elsewhere.
- **No expression is evaluated.** That is the reason option B of section 3 is refused: an evaluator for `$value` would be a parser for input that arrives in a token file.

## Status

| Part | State |
|---|---|
| Print unit in a dimension is `token-value-invalid` | Built (`src/core/tokens/values/units.ts`; `test/core/tokens/model.test.ts`) |
| `%` and other CSS lengths kept as written | Built (`src/core/tokens/values/units.ts`) |
| `pairs`, `proportion`, `usage`, asset `rules` | Built (`src/core/checker/`, `src/core/assets/categories.ts`) |
| `print.ral`, the model for what a print fact in the core looks like | Built (`src/core/checker/print.ts`; RFC 0001 section 2) |
| `print.size` and `print-size-mismatch` (section 1) | Proposed, not built. Decided on 2026-11-04: build only if something reads it (question 1) |
| A check for required presence (section 2) | Decided on 2026-11-04 not to be built; a prompt item in a sector profile is proposed under RFC 0007, not built |
| `relations` (section 3) | Decided on 2026-11-04: no change now; `relations` stays a fallback if a brand asks, not built |

As of 2026-11-04.

## Open questions

1. **Is there a reader for `print.size`?** The brand book display, a poster plugin, or a brand that wants the figure checked. If not, section 1 stays option A (the figure in prose) and the field is not added.
2. **The tolerance for `print-size-mismatch`.** 0.1% is chosen so that a px value rounded to three places passes. Is that the right bar, or should the px be derived and the field required to match exactly?
3. **Severity of `relation-broken`.** An error fails a build and a warning does not. A ratio that a manual states as a rule suggests error; a brand migrating may want warning.
4. **A `%` as one side of a relation.** A `%` token has no px without a reference box. The proposal excludes it. Should a relation be able to say what the `%` is of?
5. **Required presence as data.** If a brand wants to state the colors each material carries, is that a table in a page, a sidecar field, or a new model? This RFC says not to decide until one does.
6. **The DTCG reading.** The statement that DTCG 2025.10 allows `px` and `rem` only comes from RFC 0001. Re-check it against the specification text before section 1 is built.

## References

- [RFC 0001: Blazon data model](0001-data-model.md), section 1 (units), section 2 (`print`, `pairs`, `proportion`), section 4 (finding codes), section 8 (layout groups), section 10 (logo units), section 11 (asset rules), section 12 (`brand.json`).
- [RFC 0002: Extension model](0002-extension-model.md), section 2 (the `check` role).
- [RFC 0007: Recommended contents](0007-recommended-contents.md), open questions 5 and 6, and the prompt item.
- Design Tokens Format Module 2025.10. https://www.designtokens.org/TR/2025.10/format/
- [RFC2119], [RFC8174]: BCP 14 key words.
