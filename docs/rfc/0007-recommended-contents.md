# RFC 0007: Recommended contents

Status: draft 1, nothing implemented · Scope: how `blazon check` tells a brand what a section of its book still lacks, beyond whether a page for the section exists
Numbering: blazon RFCs, starting at 0001. Builds on [RFC 0001](0001-data-model.md) (the data model; section numbers below that are not prefixed refer to it) and [RFC 0002](0002-extension-model.md) (plugins). [RFC 0006](0006-copy-rules.md) is the sibling whose shape this RFC takes.

## Summary

Blazon recommends that a brand book hold a page for each standard section, and says so with `section-missing`. It does not say that a page is thin. This RFC proposes that a list of recommended contents for each section, a profile, is data that a check reads, and that `blazon check` reports each recommended item the book does not hold. It proposes:

1. **A shipped plugin, `blazon.recommend`**, with a small generic profile built in and a way for a brand, or another plugin, to supply its own. No core change, no new config key, no change to `brand.json`, and no new standard section.
2. **A `check` role only**, reporting `info` findings. A recommendation never fails a build.
3. **Two kinds of item.** A tested item is one the plugin can see in `brand.json`, such as a brand color with no `print` values. A prompt item is a heading-level question for the author that no program can answer, such as whether the logo page says how the mark sits beside another mark.
4. **A promotion path**, as in RFC 0004 section 6: if a second reader needs the profile, it moves into the core. This RFC names the step and does not take it.

## Motivation

`section-missing` (RFC 0001 section 13, `src/core/docs/sections.ts`) reads which sections a page declares. A page that declares `section: logo` satisfies it whatever the page says.

A real bank's visual identity manual (68 pages) was set against blazon's own book (`examples/blazon`) for this draft. The manual maps onto the standard sections and the sections a brand adds, so section presence was not where the book fell short. The gaps were inside sections that were present:

| Section | What the manual states | What blazon's own page lacked |
|---|---|---|
| `logo` | Rules for use beside another brand's mark, and a badge shape that must not join the main logo | Clear space and misuse, no rule for a pair of marks |
| `color` | CMYK, Pantone and RAL for each color | At the time of this draft, `print` carried CMYK and Pantone and had no RAL; `print.ral` has since been added (open question 4) |
| `motion` | Animation of the logo and of the icons | Easing and duration only |
| `typography` | A script requirement (the Bulgarian forms of Cyrillic), and a weight-step rule | Neither |
| a section the brand adds | A positioning page (insight, promise, attributes) | No equivalent |

None of these is a failure of `blazon check`. The check cannot see them, and nothing else in the toolchain does either.

| What | State |
|---|---|
| The recommendation | Section presence only: `section-missing`, `info` |
| Content of a section | Not checked. A one-line page satisfies it |
| A new book | `section-missing` prints nothing until some page declares a section or the config lists sections (`src/core/docs/sections.ts`) |
| Prior tools | A brand-book template or a checklist in a document. Neither reads the book |

## Conventions

The key words "MUST", "MUST NOT", "SHOULD", "SHOULD NOT" and "MAY" are to be interpreted as described in BCP 14 [RFC2119] [RFC8174] when, and only when, they appear in all capitals.

A **profile** is a list of recommended items, grouped by section. An **item** has an `id`, the `section` it belongs to, a one-line `ask`, and a **test** or none. A **tested item** has a test the plugin can run on `brand.json`. A **prompt item** has none and is reported as a question when its section has a page and the page's headings do not mention the item's `topics`. A **recommendation** is a finding a profile produces.

## The model

### 1. The profile

A profile is JSON, so a plugin in any language can ship one:

```json
{
  "v": 1,
  "name": "blazon.generic",
  "items": [
    { "id": "color.print", "section": "color", "ask": "State print values (CMYK, Pantone) for each brand color", "test": "color-has-print" },
    { "id": "logo.misuse", "section": "logo", "ask": "Show how the mark must not be used", "topics": ["misuse", "do not", "don't"] },
    { "id": "logo.pair", "section": "logo", "ask": "Say how the mark sits beside another brand's mark", "topics": ["partner", "co-brand", "beside"] },
    { "id": "motion.mark", "section": "motion", "ask": "Say how the mark and icons animate, or that they do not", "topics": ["animat"] }
  ]
}
```

- `test` names one of a closed list of tests the plugin implements (section 3). A profile cannot carry code, and a test name the plugin does not know is an `option-invalid` finding for that item.
- `topics` are strings, matched case-insensitively as text against a page's headings, with the stem rule of RFC 0006 section 1 (a single trailing `*` makes a stem; no other character is special, so no pattern is built from a topic).
- `section` is a standard section or one the brand added (RFC 0001 section 13). An item for a section that is not in the book's `sections` list is not reported, because the brand has said it does not expect that section.

### 2. Where the profile comes from

In the plugin's `options`, in `blazon.json`:

```json
{
  "plugins": [
    {
      "name": "blazon.recommend",
      "options": {
        "profile": "generic",
        "add": [
          {
            "id": "color.ral",
            "section": "color",
            "ask": "State RAL values for signage colors",
            "topics": [ "ral" ]
          }
        ],
        "skip": [ "logo.pair" ]
      }
    }
  ]
}
```

- `profile` names a profile the plugin ships, or is a path to a profile file in the project. The default is `generic`.
- `add` is a list of items in the profile's shape, for a brand's own asks.
- `skip` is a list of item ids the brand has decided against. A skipped item is not reported and is not counted.
- A sector profile, such as one for a bank or a mobile app, is a profile file in a plugin's package, or a path. The core carries neither (section 6).

### 3. What the check reads

The check role receives `brand.json` and no files (RFC 0002 section 2). It reads `sections` and `pages[].sections` to know which sections have a page, `pages[].markdown` outside code spans and fences for headings, and `tokens` and `assets[].meta` for the tested items.

| Test | Passes when |
|---|---|
| `color-has-print` | Every color token that is not an alias and is not marked `deprecated` has `print.cmyk` or `print.pms` |
| `logo-has-deny` | A `logo` rule (`logo.deny`) exists on some color token or group |
| `logo-has-clearspace` | A logo asset's sidecar states a clear space |
| `font-has-license` | Every font family token has a `font.license` |
| `contrast-has-pairs` | The `pairs` config lists at least one contrast pair |

These five are the first list. Each is implementable from `brand.json` alone; the exact field names are checked against `brand.schema.json` when the plugin is built. The list is closed so that an operator cannot make the plugin run a pattern or a program.

A prompt item is reported only when its section has a page and no heading of that section's pages matches a topic. A section with no page is already reported by `section-missing`, and the plugin does not repeat it.

### 4. Findings

Each code starts with the plugin's name and a `/` (RFC 0002 section 2). All recommendations are `info`: they are suggestions, and a brand may have good reason to skip one.

| Code | Severity | Means |
|---|---|---|
| `blazon.recommend/option-invalid` | error | An unknown option, a wrong type, an unreadable profile, an unknown test name |
| `blazon.recommend/missing` | info | A tested item the book does not hold. The message gives the item's `ask` and what was looked for |
| `blazon.recommend/prompt` | info | A prompt item no heading answers. The message gives the `ask` and the section |

The path is the section, as `section-missing` gives it. More than 500 findings are a break under RFC 0002 section 2: the host rejects the whole answer with `plugin-failed` and does not cut it. The plugin bounds its own output before it prints it (the shipped plugins do so by bytes, in `src/shipped/shared/bound.ts`). `blazon check` prints the recommendations after its other findings, grouped by section.

### 5. A summary for a new book

A project that has declared no section gets no `section-missing` finding today. With the plugin named in the config, `blazon.recommend` treats a project with no declared section as expecting all of them and reports the sections as `section-missing` does, so a new book gets one list of what to write. The plugin MUST NOT change the core's own behaviour.

### 6. What the core carries, and what a plugin carries

| Part | Where |
|---|---|
| The mechanism: read a profile, run the tests, report | `blazon.recommend` |
| A small generic profile, items true of any brand book | `blazon.recommend` |
| A sector profile (bank, mobile app, retail) | A plugin or a file the brand names |
| The standard sections | The core, unchanged (RFC 0001 section 13) |

A bank's profile, for example, would add items about print values for signage, a script and language requirement, and the voice rules a regulated brand states. Those are one sector's asks, and the generic profile does not claim them.

## Conformance

A change that follows this RFC is tested at these points:

1. **The options.** Each wrong option of section 2 is an `option-invalid` finding and leaves the other items in place.
2. **The tests.** For each test of section 3, a fixture that passes and one that does not. A color that is an alias is not required to have `print`. A deprecated token is not either.
3. **The prompts.** A page whose heading matches a topic does not produce `prompt`. A topic inside a code span or fence does not count. A section with no page produces no `prompt`. A stem topic matches the words that begin with it and no other character is special.
4. **The scope.** An item for a section outside `sections` is not reported. A skipped item is not reported.
5. **A new book.** A project that declares no section gets the full list once, and the core's own findings are unchanged with and without the plugin.
6. **The protocol.** `blazon plugin check` on the plugin's launcher (`./plugins/blazon.recommend/bin/blazon-blazon.recommend.🔌`, once it is built; the command takes a program, not a plugin name) passes the core cases and the `check` role's cases (RFC 0002, Conformance item 5).
7. **Every shipped plugin.** `test/plugins/shipped/conformance-*.test.ts` hold the folder to its checks, including a pin in `plugins/shipped.lock`.
8. **Blazon's own book.** `blazon check` on `examples/blazon` reports no `missing` and no `prompt`, or each remaining one is skipped in the config with a reason.

## Drawbacks

- **A heading match is a weak test.** A page can mention "partner" in a heading and say nothing useful. The plugin tests that a topic is addressed, not that it is addressed well.
- **A profile is an opinion.** The generic profile says what any brand book should hold, and some brands should not hold it. `skip` is the answer, and it is a cost for every brand that disagrees.
- **Another shipped plugin to keep:** a folder with a README, a lock entry, tests and a manual section.
- **One reader.** The profile is visible to this plugin only, until the promotion in the Summary is taken.
- **Noise on a finished book.** A mature book that skips nothing sees a list. It is `info`, and it can be switched off by removing the plugin.

## Non-goals

- Judging whether a section is good, complete or on brand. That is for a person.
- Failing a build over a missing item.
- Generating the missing text. The plugin reports and never edits a page.
- Running a pattern or a program named by a profile.
- Replacing `section-missing`, or changing the standard sections.
- A profile format other brands must adopt. A brand may ignore the generic one.

## Alternatives and prior art

1. **Status quo: `section-missing` only.** Cheap, and blind to what a section holds.
2. **A checklist in the manual.** The manual's chapter on maintaining a brand book could list what each section holds.
   - Pros: no code, readable now.
   - Cons: nothing reads the book against it, and it goes stale without a test.
3. **A core config key and a `brand.json` field.** Blazon owns the profile.
   - Pros: every reader of `brand.json` gets it.
   - Cons: a change to RFC 0001 sections 13 and 14, and an opinion about every brand book in the core, before a second reader has asked.
4. **More standard sections, finer grained.** Split `logo` into `logo`, `logo-pairing` and so on.
   - Pros: `section-missing` would catch it with no new mechanism.
   - Cons: the standard list grows without a limit, and a brand has to declare a page for each. It moves the problem and does not remove it.
5. **A shipped plugin with a profile in its `options`, check role only.** This RFC.
   - Pros: no core change; the same shape as RFC 0004 and RFC 0006; the sector lists are data a brand or another plugin can supply; a path to option 3.
   - Cons: the drawbacks above.

Recommendation: option 5. The choice turns on whether the core should hold an opinion about what a brand book contains, and the core's stated direction is a small core with specifics as plugins.

## Compatibility

Nothing breaks. `blazon.recommend` is a shipped plugin an operator names. There is no config key and no `brand.json` field, so RFC 0001 is unchanged. Whether the starter's config names it is open question 1.

## Security considerations

- **No pattern or program from a profile.** A test is a name from a closed list, and a topic is text with the one trailing-`*` rule, so a profile cannot cause a runaway match or run code.
- **A profile file is read from the project only.** A `profile` path MUST resolve inside the project folder. A path that leaves it is an `option-invalid` finding, as for other path options.
- **The check reads `brand.json` only.** It gets no file paths (RFC 0002 section 2). The check role allows at most 500 findings; the plugin keeps its answer under that.
- **The options are not secret.** The plugin accepts no secret field.
- **The plugin runs as any shipped plugin does**: pinned by `plugins/shipped.lock`, with the permissions of the person who runs blazon.

## Status

| Part | State |
|---|---|
| Plugins, the `check` role, the lock for shipped plugins, `brand.json` | Built (RFC 0002 sections 2 and 3, RFC 0005, RFC 0001 section 12) |
| `section-missing` | Built (`src/core/docs/sections.ts`) |
| `blazon.recommend`, sections 1 to 6 | Proposed, not built |
| A sector profile | Proposed, not built |
| Promotion to the core | Proposed, not specified further here |

As of 2026-11-03.

## Open questions

1. **The starter.** Does the starter's config name `blazon.recommend`, so a new book sees its list from the first `blazon check`? It would also print on blazon's own book.
2. **Prompt items.** Is a heading match a fair test for a prompt item, or should a prompt item be a note in the manual and never a finding?
3. **Which tests.** Are the five of section 3 the right first list? Print values for each color is the clearest; the others depend on what `brand.json` states.
4. **RAL.** ~~The `print` field holds `cmyk` and `pms` (RFC 0001 section 2). A signage brand wants RAL. Is that an addition to `print` in the core, or a sector profile's business?~~ Decided on 2026-11-04: an addition to `print` in the core, `ral?: string` (RFC 0001 section 2). The `color-has-print` test is unchanged and does not ask for it.
5. **Dimensions in print units.** ~~A dimension in `cm` or `mm` is a `token-value-invalid` error (RFC 0001 section 1). A recommendation cannot help a brand whose formats are in print units. This is a separate question for RFC 0001.~~ Decided on 2026-11-04 in [RFC 0008](0008-print-units-and-brand-rules.md) section 1: the refusal stays, and an optional `print.size` is built only when something reads it.
6. **Required presence and relative geometry.** ~~Rules such as "every material carries one primary color" or "the radius is 7.5% of the grid square" are neither a recommendation nor a usage rule. They need their own RFC.~~ Decided on 2026-11-04 in [RFC 0008](0008-print-units-and-brand-rules.md) sections 2 and 3: no check for required presence, which belongs to a prompt item in a sector profile (this RFC), and no change for relative geometry.
7. **Languages.** Should an item be scoped to a script, such as a requirement for Cyrillic that applies only when the book has a Cyrillic page?
8. **Promotion.** What is the signal for moving the profile into the core: a second plugin, the deck, or a request from a brand?

## References

- [RFC 0001: Blazon data model](0001-data-model.md), section 12 `brand.json`, section 13 sections, section 14 configuration.
- [RFC 0002: Extension model](0002-extension-model.md), section 2 plugins and roles.
- [RFC 0004: Format rules](0004-format-rules.md) and [RFC 0006: Copy rules](0006-copy-rules.md), the siblings whose shape this takes.
- [RFC 0005: Plugin protocol](0005-plugin-protocol.md).
