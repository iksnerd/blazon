# RFC 0004: Format rules

Status: draft 1, nothing implemented · Scope: where a brand's rules for writing numbers, money, percentages, dates and times live in blazon, and how they become code and checks
Numbering: blazon RFCs, starting at 0001. Builds on [RFC 0001](0001-data-model.md) (the data model; section numbers below that are not prefixed refer to it) and [RFC 0002](0002-extension-model.md) (plugins).

## Summary

A brand writes `14 000,00 €` in one language and `14 000.00 €` in another, and says so in a page of prose. The apps that show the amounts do not read the prose. This RFC proposes that the brand states these rules once, as data, and that blazon gives them back as two things: a small module that writes the formats, and a check that finds text in the brand book that breaks them. It proposes:

1. **A shipped plugin, `blazon.formats`**, that takes the rules in its `options` (RFC 0002 section 2). No core change, no new config key, no change to `brand.json`.
2. **A `build` role** that writes `formats.json` (the resolved rules and their examples), its schema, and a dependency-free TypeScript module generated from them.
3. **A `check` role** that runs the declared examples through the generated code, and flags amounts and dates in page text and asset sidecars that follow no declared rule.
4. **A promotion path**: if a second reader needs the rules, they move to a config key and a `brand.json` field, with the plugin's option schema as the key's schema. This RFC specifies that step and does not take it.

## Motivation

A brand book for a bank, written in two languages, was the first case. Its rules were these: the decimal sign follows the language (a comma in one, a dot in the other); thousands are grouped with a no-break space in both, four digits included; two decimals; the currency after the amount, after a no-break space; a day-first date, `14.03.2026, 16:21`; Bulgarian-time dates set by zone name. They were prose in the book. The pieces around them looked like this:

| What | State |
|---|---|
| The rules | Prose in two pages, and the Guidelines they came from wrote a different decimal sign for one of the languages |
| The apps | One formats amounts with `Intl.NumberFormat(locale, ...)` and no override, read from its code and not run on a device. The platform default differs from the brand's rule in two ways: the English default puts the euro sign first (`€14,000.00`), and the Bulgarian default leaves a four-digit number ungrouped (`1234,50 €`). Both were measured with Node 22.23 (CLDR 48) |
| A helper | Written by hand for that brand, in its own repository: a table of rules, the functions that follow it, and tests that read the tables on the two pages and fail when code and page disagree. It works, and nothing in it is specific to that brand except the table |
| A check | None. A page that writes `€14,000.00` as plain text, or an asset sidecar whose description does, passes `blazon check` |

The helper is the evidence that the idea works and the reason to ask whether it should be built once. Every brand that writes an amount will meet the same differences between its rules and the platform's, and will write the same functions.

## Conventions

The key words "MUST", "MUST NOT", "SHOULD", "SHOULD NOT" and "MAY" are to be interpreted as described in BCP 14 [RFC2119] [RFC8174] when, and only when, they appear in all capitals.

A **format rule** is a statement of how one kind of value is written in one language: a decimal sign, a grouping, a currency position, a date pattern. A **language** here is a key the brand chooses (`bg`, `en`), with the locale tag it maps to. An **example** is a value, a language and the exact text the rules must produce for it.

## The model

### 1. Where the rules live

In the plugin's `options`, in `blazon.config.ts`, which is how a plugin receives anything (RFC 0001 section 14, RFC 0002 section 2):

```ts
plugins: [
  {
    name: 'blazon.formats',
    options: {
      zone: 'Europe/Sofia',
      languages: {
        bg: { locale: 'bg-BG', decimal: ',', group: 'nbsp', fractionDigits: 2,
              currency: { symbol: '€', code: 'EUR', position: 'after', space: 'nbsp' },
              percent: { space: false },
              date: { numeric: 'dd.MM.yyyy', time: 'HH:mm', joiner: ', ' } },
        en: { locale: 'en-US', decimal: '.', group: 'nbsp', fractionDigits: 2,
              currency: { symbol: '€', code: 'EUR', position: 'after', space: 'nbsp' },
              percent: { space: false },
              date: { numeric: 'dd.MM.yyyy', time: 'HH:mm', joiner: ', ' } },
      },
      examples: [
        { language: 'bg', money: 14000, text: '14 000,00 €' },
        { language: 'en', money: 14000, text: '14 000.00 €' },
        { language: 'bg', instant: '2026-03-14T14:21:00Z', dateTime: '14.03.2026, 16:21' },
      ],
    },
  },
],
```

`group` is `nbsp`, `space`, `thin` or `none`. `position` is `before` or `after`. The date tokens are `dd`, `MM`, `yyyy`, `HH` and `mm` only, so the generated code needs no date library. A key the plugin does not know, a value of the wrong type and a language with no `locale` are each an `option-invalid` finding (section 4), and the language is left out. At least one example per language is RECOMMENDED, and a brand with none gets a warning: the examples are what the rules are held to.

### 2. What the build role writes

Into `out_dir` (`<tokensOutDir>/blazon.formats/`):

- `formats.json`: `{ "format": "blazon-formats", "version": 1, ... }` with the resolved rules for each language, the zone and the examples. Same rule as `brand.json` (section 12): a reader MUST check `format` and `version`, MUST ignore a key it does not know, and `version` changes only when a field is removed or changes meaning.
- `formats.schema.json`: the JSON Schema it follows.
- `formats.ts`: generated from the rules. It exports `money`, `percent`, `parseAmount`, `date`, `time`, `dateTime` and `machine` (an ISO 8601 instant), with the zone set by name inside each function. It imports nothing. It uses `Intl` only for the digits' placement and the zone, and writes every separator and pattern from the rules.

The same options produce the same bytes. Nothing in the output names the machine or the time of the build.

A generated function MUST throw a `RangeError` for a value that is not a finite number or not a date, and MUST NOT write `NaN` or `Invalid Date`. An amount that rounds to zero is written without a sign.

### 3. What the check role finds

The check role receives `brand.json` and no files (RFC 0002 section 2). It reads two kinds of text from it: `pages[].markdown` outside code spans and code fences, and the strings of `assets[].meta` (`description`, `traits`, `do`, `dont`). It reports:

- an **amount** that matches no declared language: a currency sign before the amount, no space before the sign, a decimal or group separator that no language declares for that pattern;
- a **date** in a numeric form that matches no declared pattern (`03/14/2026`, `2026/03/14`).

A page's language is its front matter `lang` when the page sets one (`pages[].meta`, section 12), and otherwise every declared language is accepted: a form that is valid in any of them is not flagged. The checks are warnings. They are heuristics, and they cannot tell an intended counter-example from a mistake; a counter-example written in a code span is skipped, so the usual "never" column is safe.

### 4. Findings

Each code starts with the plugin's name and a `/` (RFC 0002 section 2):

| Code | Severity | Means |
|---|---|---|
| `blazon.formats/option-invalid` | error | An unknown option, a wrong type, a language without a `locale`, a token the date patterns do not know |
| `blazon.formats/example-mismatch` | error | An example's text differs from what the generated code writes for it. The message gives both |
| `blazon.formats/no-examples` | warning | A language declares no example |
| `blazon.formats/amount-format` | warning | An amount in a page or a sidecar that no declared language writes |
| `blazon.formats/date-format` | warning | A numeric date that no declared pattern writes |

### 5. Examples are the conformance vectors

The build role runs each example through the code it just generated, under the machine's zone and again with `TZ` set to another zone, and the check role reports `example-mismatch` for any difference. The second run is what shows that the zone is set by name and not taken from the machine: a function that formats with the machine's zone passes in one zone and fails in the other.

### 6. Promotion to the core

If a second reader needs the rules (a deck that sets an amount, another plugin, a design tool), they move into the data model. Specified now so that the plugin's option schema becomes the key's schema without a second design:

- A config key `formats`, with the schema of `options` in section 1, as a row in RFC 0001 section 14. `test/docs/rfc.test.ts` already requires a row for every config key.
- A `formats` field in `brand.json` with the resolved rules. Adding a field does not change `brand.json`'s `version` (section 12).
- `blazon.formats` then reads `brand.formats` and keeps `options` as an override for one release.

Nothing in this RFC takes that step. The criterion is the one RFC 0002 gives for a rule: a rule about one brand is a plugin, and a rule every brand needs belongs in blazon. Today one plugin reads the rules.

## Conformance

A change that follows this RFC is tested at these points:

1. **The generator.** For a fixture with two languages, `formats.ts` writes every declared example exactly, with the machine in UTC and in another zone. A value that is `NaN`, infinite or not a date throws. The generated file type-checks under `strict` and imports nothing.
2. **The rules.** Each wrong option of section 1 is an `option-invalid` finding and leaves the rest of the rules in place. Two runs with the same options write identical bytes.
3. **The check.** A fixture page and a fixture sidecar, each with a form that breaks a rule and one that does not. The breaking ones are flagged and the others are not, and a counter-example in a code span is not flagged.
4. **The protocol.** `blazon plugin check` on the plugin's launcher (`./plugins/blazon.formats/bin/blazon-blazon.formats.🔌`, once it is built; the command takes a program, not a plugin name) passes the core cases and the roles' cases (RFC 0002, Conformance item 5). A finding code without the plugin's name is a break.
5. **Every shipped plugin.** `test/plugins/shipped/conformance.test.ts` finds each `plugins/blazon.*` folder and holds it to a launcher that starts a built entry, a `package.json` and a README, an entry in the build, a pin in `plugins/shipped.lock`, a manifest that tells the truth, finding codes in one style, and the same answer to a broken request (exit 2, the reason first, nothing written). A change to the plugin folder without `npm run shipped-lock` makes blazon refuse to run the plugin.

## Drawbacks

- **One reader.** The rules are visible to this plugin only. Another tool that wants them reads `formats.json` from the output folder, not `brand.json`, until section 6 is taken.
- **A text check is a heuristic.** It will miss a wrong form it does not recognise and will flag an intended one written as plain text. It is a warning for that reason, and it is not a substitute for a Bulgarian or an English reader.
- **Generated code reaches the apps.** A file in `dist/tokens` that an app copies or imports is a supply path: the app depends on a build step it does not run. Versioning and delivery are open question 4.
- **`Intl` differs between runtimes.** The grouping and the zone come from the engine, so two engines can write different text for the same rule. The examples catch this only in the engine that runs the build.
- Another process per call, and another shipped plugin to keep. Each shipped plugin is a folder with a README, a lock entry, tests and a manual section (RFC 0002 section 2).
- **A second place for the rules.** A brand that already has a hand-written helper has two sources until it deletes one.

## Non-goals

- An internationalization framework: plural rules, message formats, locale negotiation.
- Parsing arbitrary locales. `parseAmount` reads what a person types in the languages the brand declares, and says `null` for anything else.
- A time zone database, or a date library. The zone is a name that `Intl` resolves.
- Currency conversion, and rounding rules beyond a count of fraction digits.
- Changing tokens, the resolver or `dev.blazon`, which a plugin may not do (RFC 0002, Non-goals).
- A lint rule for the apps' source. A check on code is a different tool.

## Alternatives and prior art

Options for where the rules live and what is done with them:

1. **Status quo: prose and a hand-written helper.** What exists today.
   - Pros: it works, and it needs nothing from blazon.
   - Cons: each brand writes the same functions, and nothing checks that the book agrees with them.
2. **Tokens.** A DTCG type, or a `dev.blazon` field on a group, so the rules travel with the tokens.
   - Pros: the resolver's `locale` modifier already gives a context per language (section 3).
   - Cons: DTCG defines no type for number, date or currency formats, as far as the type list was read for this draft. A `dev.blazon` field is a core change, which RFC 0002 rules out for plugins. The token outputs (`tokens.json`, CSS) would carry entries no consumer of them wants.
3. **A core config key `formats` and a `brand.json` field.** Blazon owns the rules.
   - Pros: every reader of `brand.json` gets the rules, and blazon's own checks and the deck could use them.
   - Cons: blazon takes on the rules' schema, a row in RFC 0001 section 14 and a finding for each mistake, before a reader beyond the first has asked for them.
4. **A shipped plugin with the rules in its `options`.** This RFC.
   - Pros: no change to the core or to `brand.json`; a check and a generator in one place; a path to option 3 (section 6).
   - Cons: one reader only, and the drawbacks above.
5. **`Intl` and the platform locale, with no brand rule.**
   - Pros: nothing to build or maintain.
   - Cons: the platform default is not the brand's rule: it differs in the two ways measured in the motivation.

Prior art. **ECMA-402 (`Intl`) and Unicode CLDR** supply locale data and are the platform default; this RFC overrides them with the brand's rules and uses `Intl` only for what it is good at. **ISO 80000-1**, as quoted by public sources and not read for this draft, allows either a comma or a point as the decimal sign and asks for one sign within a document, which is what a rule per language gives. **date-fns** writes dates from token patterns and is what the brand's apps use; the date tokens in section 1 are a subset of its own, so a pattern here is a pattern there. **Style Dictionary formats** (see References) decide how tokens are written out, not how a value is written to a person, so they do not overlap. Other design-token tools were not surveyed for this draft.

Recommendation: option 4. The choice turns on whether any reader other than one plugin needs the rules. Today none does, and option 3 can follow without a redesign.

## Compatibility

Nothing breaks. `blazon.formats` is a shipped plugin that an operator names to use, so a brand that does not name it sees no change. There is no config key and no `brand.json` field, so RFC 0001 is unchanged. If section 6 is taken later, it adds a key and a field, which are additive; the plugin keeps reading `options` for one release.

## Security considerations

- **The generated module runs inside apps.** Its input is the operator's own options, never a runtime value. The generator MUST write every separator, symbol and pattern as an escaped literal (`JSON.stringify`) and MUST NOT interpolate an option into code unescaped, so a symbol such as `'` or a backtick cannot change the program.
- **The check reads `brand.json` only.** It gets no file paths (RFC 0002 section 2). Its patterns MUST run in linear time on text of any length, and a run is capped at the 500 findings the check role allows.
- **The options are not secret.** The plugin accepts no secret field.
- **The plugin runs as any shipped plugin does**: pinned by `plugins/shipped.lock`, with the permissions of the person who runs blazon.

## Status

Nothing is implemented. Shipped and relied on here: plugins, their two roles, the lock for shipped plugins and `brand.json` (RFC 0002 sections 2 and 3; RFC 0001 section 12).

Proposed: everything in sections 1 to 6.

A precursor exists outside this repository: a hand-written helper with a table of rules, the functions, and tests that read the book's tables, in the private repository of the first brand. It is the case for the model and is not part of blazon. Its table is the shape of section 1, and its tests are the shape of sections 3 and 5.

## Open questions

1. **Dates without a library.** The tokens of section 1 are five. A long date (`14 March 2026`) needs month names, which come from `Intl` and so from the engine. Should the long forms be in the first version, or only the numeric ones?
2. **Engine variance.** Hermes, V8 and JavaScriptCore may disagree on `Intl` output. Is a per-engine example run part of conformance, and who runs it?
3. **The language of a page.** Is `lang` in the front matter the right signal, or should the language come from the page's folder or section?
4. **Delivery.** Does an app import the generated `formats.ts` from the output folder, copy it, or install a package built from it? Who versions it, and does a changed rule (the decimal sign) count as a major version?
5. **Several currencies.** The rules in section 1 hold one currency symbol per language. A brand with `EUR` and `BGN` side by side needs a position and a spacing per code.
6. **The minus sign.** The rules write a hyphen-minus. Some locales write U+2212. Should it be a rule?
7. **Promotion.** What is the signal for section 6: a second plugin, the deck, or a request from a brand?
8. **DTCG.** The type list should be checked against the current specification before this RFC is accepted, since option 2 rests on it.
9. **False positives.** Is a warning with no way to silence one occurrence acceptable, or does the check need an inline marker?

## References

- [RFC 0001: Blazon data model](0001-data-model.md), section 12 `brand.json`, section 14 configuration.
- [RFC 0002: Blazon extension model](0002-extension-model.md), section 2 (the host, the `check` and `build` roles, finding codes), and its Non-goals.
- [RFC 2119] Bradner, "Key words for use in RFCs to Indicate Requirement Levels"; [RFC 8174] Leiba, "Ambiguity of Uppercase vs Lowercase in RFC 2119 Key Words".
- ECMA-402, ECMAScript Internationalization API, and the Unicode Common Locale Data Repository (CLDR): <https://cldr.unicode.org/>
- ISO 80000-1, Quantities and units, Part 1: General (read through public sources only).
- date-fns, format: <https://date-fns.org/docs/format>
- Style Dictionary, Formats: <https://styledictionary.com/reference/hooks/formats/>
