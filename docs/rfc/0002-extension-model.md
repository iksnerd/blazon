# RFC 0002: Blazon extension model

Status: draft 3, vocabulary, the host, its roles, the interpreter check, the check role in the dev server and plugins shipped in the package implemented · Scope: what a brand can extend in blazon without editing blazon, and how
Numbering: blazon RFCs, starting at 0001. Builds on [RFC 0001](0001-data-model.md): section numbers below that are not prefixed refer to it. The plugin protocol itself is [RFC 0005](0005-plugin-protocol.md), and this RFC defines the roles on top of it.

Draft 1 invented a plugin protocol for blazon inside this RFC. Later drafts state the protocol in [RFC 0005](0005-plugin-protocol.md), so this RFC and the manual stand on documents in this repository alone. Part 1 (vocabulary as data) is unchanged.

## Summary

Blazon is meant to be a package a company installs to build its own brand book, and its extensions should work in any app and any language. Today a brand can add any tokens, pages, asset folders and contexts, but a few lists are fixed in blazon's code, and a brand cannot add a check or an output.

This RFC proposes, in this order:

1. **Brand vocabulary as data.** A brand declares its own sections, logo lockups and usage roles in `blazon.json`, next to the standard ones. No code runs. Blazon keeps checking spellings, because the declared lists are the vocabulary.
2. **Blazon as a plugin host.** A brand adds a check or a build step as a plugin: a program in any language that blazon starts as a child process, with a JSON request on standard input and a JSON answer on standard output, found, pinned, limited and checked as RFC 0005 says. Blazon writes a profile for two roles, `check` and `build`, and gives the brand a command to check a plugin.

Things blazon draws or reads (pattern kinds, theme roles, logo corners, token tiers) stay closed. A custom page directive stays closed in this RFC and is an open question (section 3).

## Motivation

A company that adopts blazon will hit the same walls, and none of them is about its brand being unusual.

| Wall | Where it is in the code | What a brand cannot do |
|---|---|---|
| The 14 standard sections | `SECTION_IDS`, `src/types/docs.ts` | Declare "Voice and tone", "Sound" or "Packaging". `section: voice` is an error (`section-invalid`) |
| Logo lockups | `LOGO_LOCKUPS`, read by the sidecar check (`src/core/assets/sidecar.ts`) and by the viewer's lockup groups (`src/viewer/components/blazon/logo-rules.tsx`) | Use a lockup other than `horizontal`, `stacked`, `mark` or `wordmark` |
| Usage roles | `USAGE_ROLES`, read by `blazon check` (`usage-role-unknown`) | Say a color may not be used for `chart` or `shadow` |
| The checks | the list in `checkTokens`, `src/core/checker/index.ts` | Add a rule such as "headlines use the display font" |
| The outputs | `emitTokenOutputs`, `src/core/index.ts`: CSS, TypeScript and JSON files | Write Swift, Android or a design-tool format |
| The page directives | `DIRECTIVES`, `src/core/docs/directives.ts`, with one React component each in the viewer | Add a `blazon:quote` directive |

RFC 0001's open question 6 records this. The first three walls are vocabularies that blazon only compares against. The next two are work a program can do from `brand.json`: the PDF deck (first a Python script, now the shipped plugin `blazon.brand-deck`) writes a PDF deck from it, and `scripts/read-brand.py` reads it. What such a program cannot do is take part in `blazon check` and `blazon build`: its mistakes are not findings, it does not show on the Review page, and it does not run in the right order. The last wall is different in kind and is treated apart.

Blazon needs a way to run a program the brand supplies, and the contract for that is the part most likely to be got wrong: who may add a plugin, what runs, and what a failure means. Blazon states it once, in RFC 0005, and this RFC adds only the roles.

## Conventions

The key words "MUST", "MUST NOT", "SHOULD", "SHOULD NOT" and "MAY" are to be interpreted as described in BCP 14 [RFC2119] [RFC8174] when, and only when, they appear in all capitals.

A **vocabulary** is a list of names that blazon checks a value against and otherwise does not interpret. **Host**, **operator**, **plugin**, **role**, **profile**, **call**, **pin**, **manifest**, **answer** and **break** have the meanings RFC 0005 gives them. In this RFC the host is blazon, the operator is whoever owns the brand book's repository, and a plugin is a program.

## The model

### 1. Brand vocabulary

Three vocabularies become data. Each has a standard list that is always valid, and a brand adds to it.

```json
{
  "customSections": [ { "id": "voice", "title": "Voice and tone" } ],
  "vocabulary": { "lockups": [ "monogram" ], "usageRoles": [ "chart" ] }
}
```

**Names.** Every added name MUST match `^[a-z][a-z0-9-]*$` and MUST NOT repeat a standard one or another added one. A mistake is `config-invalid` (RFC 0001 §14), and the entry is left out.

**A brand adds; it does not remove.** A standard name stays valid. Removing one would only make a valid file an error. A brand that does not want a standard section narrows the expected list with `sections` (§13), as today.

**Sections.** `customSections` entries are `{ id, title }`. A page declares one with `section: voice`, as for a standard section. The sections blazon expects are `sections` when the config sets it, in the order given and with ids that are standard or custom, and otherwise the standard list followed by the custom ones. `section-missing` follows that list. A custom section has no standard position: it is where the brand put it.

**Lockups.** `lockup` in a sidecar (§10) accepts a standard or an added name. `blazon:logo-lockups` and the viewer group logos by the resolved list instead of by a list in the viewer.

**Usage roles.** `role` and `usage.allow`/`usage.deny` (§2) accept a standard or an added name. `usage-violated` compares names as before.

**What the data carries.** `BlazonData.vocabulary` is `{ lockups: string[], usageRoles: string[] }`, each with the standard names first. `BlazonData.sections` is the list of valid sections, `{ id, title, standard }`. `brand.json` carries both under the same keys, and its schema lets `pages[].sections` be any section id the file itself lists, no longer a fixed enumeration. A consumer learns custom titles from `sections` and does not need blazon.

**Standard titles.** The standard sections have fixed titles so that `sections` is complete: Introduction, Logo, Color, Typography, Icons, Illustration, Photography, Patterns, 3D graphics, Diagrams, Motion, Layout, Social, Applications.

**Types.** `LogoLockup`, `UsageRole` and `SectionId` become `string`. The standard names remain as `STANDARD_LOGO_LOCKUPS`, `STANDARD_USAGE_ROLES` and `STANDARD_SECTION_IDS`. The cost is that TypeScript no longer proves a literal is standard; the checks do.

### 2. Blazon as a plugin host

[RFC 0005](0005-plugin-protocol.md) defines how blazon runs a plugin: names, trust, pins, calls, limits and the breaker. This RFC defines blazon's **profile**: the roles it defines and its own decisions under that core.

**What blazon takes from the core, unchanged.**

| RFC 0005 | What it gives a blazon brand |
|---|---|
| 3.1 to 3.3 | A plugin name is dotted lowercase words (`acme.house-style`) and the program is `blazon-<name>`. Only the operator allows a plugin, in `blazon.json`. Data a plugin could influence never names a plugin or a path |
| 3.4, 3.6 | A pin by digest, of one file or of a directory tree, checked on a copy before every launch. Which plugins must be pinned follows from what flows through them |
| 3.5 | A value the operator labels secret reaches only a plugin that accepts it as secret, and is scrubbed from everything the plugin hands back |
| 3.8 | A manifest, printed by `--blazon-manifest`, with `v: 2`, the plugin's roles, a timeout, and the environment names it needs |
| 4 to 6 | One process per call, an empty environment plus `PATH`, and the variables the manifest lists and the config approves, exit codes `0`, `1` and `2`, 65,536 bytes of standard output, 8 KB of standard error kept, a timeout of at most 60 seconds, and never a pass |
| 7 | A breaker: three breaks in a row stop calls for the unit of work; exit `2` counts as a break for it |
| 8 | Every request record carries its own `v`; a plugin refuses a version it does not speak, and the host refuses a manifest it does not speak |
| 9 | A check command that starts a plugin the way the host does |

Plugins are written in any language: RFC 0005 fixes JSON on standard streams, so a plugin in TypeScript, Python, Go, Swift or shell needs no SDK.

**The profile.** Blazon MUST describe its profile in a JSON document and print it with `blazon plugin profile`.

| Part | Blazon's decision |
|---|---|
| Program prefix | `blazon` |
| Roles | `check` and `build` |
| Check command | `blazon plugin check` |
| Secret environment | names that start `BLAZON_SECRET_` are labelled secret without the operator's help. `secret_fields` is empty: no request field of either role is marked as able to hold a secret |
| Request cap | 4 MiB |
| Adopts | nothing beyond RFC 0005 yet. Long-lived plugins and the page role are candidates (section 3 and the open questions) |

**The `check` role.** A check plugin judges the brand and says what is wrong with it. Blazon calls it after the brand compiles and before anything is written, in `blazon check`, `blazon tokens`, `blazon build` and `blazon dev`.

```json
{ "v": 1, "type": "check", "options": {}, "brand": { "format": "blazon-brand", "version": 2, "...": "the whole brand.json" } }
```

```json
{ "findings": [ { "code": "acme.house-style/heading-font", "severity": "error", "path": "type.heading", "message": "Headings must use font.family.display" } ] }
```

- `brand` is the content of `brand.json` as RFC 0001 §12 and `brand.schema.json` define it. A plugin author needs nothing else from blazon. Its `findings` hold the core's findings, never another plugin's.
- `options` is the JSON object the operator wrote for this plugin in the config, default `{}`.
- A check call receives no file paths, so a check sees what `brand.json` states and cannot read the images. That keeps it cheap and repeatable.
- A plugin MUST check that `brand.format` is `"blazon-brand"` and `brand.version` is `2` before it reads anything else, and MUST exit `2` with the reason when either is not. A check that cannot judge MUST NOT answer with an empty `findings` list.
- Exit `0` is an answer, and stdout is the object above. Exit `2` is "cannot answer", with the reason as the first line. Exit `1` is not defined for this role, so it is a break.
- A finding's `code` MUST start with the plugin's name and a `/`, followed by `[a-z0-9-]+`. `severity` is `error`, `warning` or `info`. `path` and `message` are plain text. More than 500 findings, or a finding that breaks these rules, is a break.
- The role is behind the breaker. The unit of work is one run of a blazon command, and a call that exits `2` counts as a break for the breaker. The dev server has no such unit and uses a cooldown of 30 seconds instead, which a break starts and exit `2` does not.
- The profile raises the stdout limit for this role to 1 MiB, so that 500 findings fit.

**The `build` role.** A build plugin turns the brand into something else: a deck, Swift or Android constants, a design-tool file. Blazon calls it in `blazon build`, once the site and the token files exist, and in `blazon tokens`, once the token files exist and before any site does: the request then has no `site_dir`. A plugin that reads the site answers such a request with one `info` finding and writes nothing; the shipped ones that need the site do so under the code `<name>/needs-site`.

```json
{ "v": 2, "type": "build", "options": {}, "brand": { "...": "the whole brand.json" }, "site_dir": "/abs/dist/site", "tokens_dir": "/abs/dist/tokens", "out_dir": "/abs/dist/tokens/acme.deck" }
```

- `site_dir` holds the built site and `brand.json`, so the `file` paths in `brand` resolve against it. It is absent when `blazon tokens` runs the role. `tokens_dir` is `tokensOutDir`, which holds the token files that `blazon build` writes before the role runs; a plugin that works from the exported tokens reads them there. `out_dir` is `<tokensOutDir>/<id>/`, which blazon creates empty before the call. The plugin writes its files there. A plugin SHOULD write nowhere else; the shipped `blazon.favicons` is the one exception, and also writes `favicons/` in `site_dir` for the book to read at runtime (manual, chapters 12 to 14).
- Exit `0` is an answer. Its stdout is an object that MAY hold `findings`, as for `check`. Exit `2` is "cannot answer". Exit `1` is a break.
- The role is behind the breaker, with the same unit and cooldown as `check`.
- Blazon reads back nothing from `out_dir` except that it exists.

**What must be pinned.** RFC 0005 section 3.6 decides this by what flows through a plugin, and the blazon profile applies it. A `check` plugin's answer opens or closes the gate that `blazon check` is in a pipeline, so it authorizes and is pinned. A `build` plugin receives the whole brand, so it SHOULD be pinned. A one-shot blazon command MAY run an unpinned plugin that the operator names explicitly on the command line, with a warning. `blazon dev` keeps running, so it refuses an unpinned check plugin. Blazon MUST provide a command that prints a digest, `blazon plugin pin <path>`, and records it in `blazon.plugins.lock` as vouched or computed, as section 3.4 says.

**Configuration.** The config is the allowlist and holds no path and no digest.

**Environment.** A plugin starts with an empty environment, `PATH` apart. It receives a variable only when the manifest lists its name in `env` and the operator approves that name in the `env` list of the plugin's entry in the config. There is no list of names in blazon: a plugin that ships with blazon declares what it reads in its manifest and is approved like any other, so the host holds no private channel for a shipped plugin and the check of a third-party plugin exercises the same path. If the manifest lists a name that is set in blazon's environment and the entry does not approve it, blazon does not start the plugin: it reports `plugin-failed` with the name of the variable and the config key to set (`plugins[n].env`). A name the entry approves and the manifest does not list reaches nothing. `blazon plugin check` runs case 10 when the project's config has an entry for the plugin, and fails it for a listed name that no such entry approves.

```json
{
  "plugins": [
    { "name": "acme.house-style", "options": { "headingFont": "font.family.display" } },
    { "name": "acme.deck" }
  ]
}
```

A `name` follows the core's name rule. `options` is a JSON object. A plugin MAY be listed more than once, and then each entry is an instance with an id, given as `as`: a name of the same form, at most 64 characters, that defaults to the entry's `name`, and an id taken from the `name` is held to the same limit. Ids MUST be unique across the `plugins` entries and the programs named with `--plugin`, which take the plugin's name as their id, and an id MUST NOT be the name of a different plugin. Two different `--plugin` programs for one plugin name are refused. The pin is for the plugin's name and is checked before every call of every instance. The instance's id, not the plugin's name, names its output folder `<tokensOutDir>/<id>/`, which is emptied before its call, and its breaker. Each request carries the options of its own entry, and a plugin is not told its id. A finding or a failure of a plugin that is listed more than once, or whose id is not its name, names the instance as well as the plugin. The wire does not change: the manifest and the request are as RFC 0005 defines them. A mistake is `config-invalid` on `plugins[n]`. A plugin that is not allowed here is never started.

**A host MAY read an output folder.** What a plugin wrote under `<tokensOutDir>/<id>/` is a plain file, and the wire gives it no other meaning. A host or a program that wants to know where those files are, or whether they are current, MAY list the folder and read a file in it, as any third party does; it does not need to start the plugin. Blazon's own read operation does this (`blazon outputs`, the `get_outputs` tool): it lists the files under `tokensOutDir`, compares each one's modification time with the inputs of a compile (`projectInputs`), names the configured plugins whose folder is missing, and returns one file's text on request. It writes nothing and starts nothing, and it does not compute what a plugin would. A modification time is evidence and not proof: a checkout rewrites it.

**Failures are findings, and are about the plugin.** The core says a break is an error naming the plugin and quotes nothing the plugin printed. Blazon reports each as one error finding, `plugin-failed`, with the plugin's `name` as its `path` (for an instance, its id, and the message starts with `instance of <name>:`). A plugin whose pin does not match is unavailable, and its message names both digests. A manifest of a version blazon does not speak is refused, and the message names both versions.

**Order and repeatability.** Plugins of one role run in the order of the list, one at a time. A check call gets the same bytes as `brand.json` would have, so two runs on one project give one answer unless the plugin itself varies. Findings from plugins are listed after the core's, in the same order. The dev server runs check plugins when it starts and after each recompile, one call at a time, dropping a call whose result a newer compile has made stale. The viewer gets the core's findings first and the plugins' in a second update. Build plugins do not run in `blazon dev`.

**The core uses the same shape.** The built-in checks become entries in one ordered list of functions from compiled data to findings, and a plugin is one more entry that runs a process. This is a change to `checkTokens` and is invisible to users. It keeps the built-ins and the plugins on one interface, so a gap in the interface shows in the core first.

**What it takes.** A host is a program that does eight things: allow, name and find, pin, label and scrub, call within limits, stop a plugin that keeps breaking, check a plugin, and declare its profile. Blazon's host is in `src/plugins/`, written in TypeScript. The conformance corpus is JSON files that need no code to read (`test/spec/`), so a host in another language conforms by passing the same cases.

### 3. What stays closed, and why

| Closed list | Why it is not a vocabulary |
|---|---|
| Pattern kinds (`dots`, `lines`, `diagonal`, `grid`, `checks`) | Blazon draws each one. A new name needs a drawing, which is code in the viewer |
| Theme roles (§6) | The viewer reads each role. A new role has nothing to read it |
| Logo corners (§10) | Four corners are geometry, not a brand's choice |
| Token tiers (`primitive`, `semantic`, `component`) | `alias-missing` depends on what each tier means |
| Token `$type`s | They are DTCG's |
| Page directives | Each is a React component in a viewer that is compiled when blazon is published and served from `dist/ui`. A directive from a project would need that project to build its own viewer, which adds a toolchain to every brand |

A custom page directive is the wall a plugin could cross without a viewer build. A plugin would declare a page's layout as data in its manifest, naming the kinds of brand data it may read. Blazon would check the layout when it reads the manifest and draw it, so a plugin ships no HTML, script or style. Blazon already has a layout language: the directive table. A blazon static page would be a list of directive uses, checked at load against `DIRECTIVES`, reading named parts of `brand.json`. The direction is decided and nothing is built (open question 3): it still needs the kinds a page reads, where a plugin page appears, and a `form` construct for pages that are not read-only.

## Conformance

A change that follows this RFC is tested at these points:

1. **Vocabulary.** `compileBlazonData` on a project with `customSections`, `vocabulary.lockups` and `vocabulary.usageRoles`: each added name is accepted where a standard one is, an unknown name is still an error, and a bad addition is `config-invalid`. `brand.json` carries `vocabulary` and `sections` and validates against the schema.
2. **The core.** Blazon's host runs the protocol's conformance corpus for the core and for the tree digest, from JSON files that need no code to read, and agrees with every one.
3. **The profile.** `blazon plugin profile` prints a document that validates against the schema of a profile (kept in `test/spec/`) and equals the one in the repository. A test per field shows the host's behaviour is the document's, and each test is shown to fail when the behaviour changes and the document does not.
4. **The roles.** A fixture plugin for each state: a clean check, a check returning findings, a build step writing into `out_dir`, and each failure of section 2, including a manifest of another version, a finding code without the plugin's name, a timeout, a pin mismatch and 501 findings.
5. **The commands.** `blazon check` exits 1 for a plugin error finding and 0 for a plugin warning. `blazon plugin check <program>` runs the core cases and the role's cases against a plugin. `blazon plugin pin` prints a digest that equals the corpus vector for the same tree.
6. **A reference plugin.** A plugin written in Python that uses only the standard library (`examples/plugins/acme.house-style/`) passes `blazon plugin check`. The first real build plugin is the PDF deck (built, item 6 above), which started in Python and is now the shipped `blazon.brand-deck`.
7. **Docs.** `test/docs/rfc.test.ts` and `test/docs/manual.test.ts` already fail for a config key or finding code the documents lack, and so cover `customSections`, `vocabulary`, `plugins` and `plugin-failed`.

## Drawbacks

- **Blazon takes on a host.** The eight obligations are real work in TypeScript: a pin on a verified copy, an interpreter check, a scrubbing step, a breaker and a check command. They are also the part of a plugin system where hosts go wrong, and the corpus exists to catch that.
- **A plugin costs a process.** Each call starts one. With several plugins and a dev server that recompiles on every save, this is noticeable. The dev server drops stale calls, and long-lived plugins (RFC 0005, open question 1) are the route if it is not enough.
- **A check plugin must be pinned.** That is a digest to compute and to refresh at every upgrade, for the brand team. `blazon plugin pin` does both, and the cost is the price of failing closed.
- **A check cannot read the images.** A rule on pixel size or color mode needs a file path, and a check gets none. The asset `rules` (§11) cover the common cases; the rest waits for a use.
- **Wider types.** `string` in place of three unions loses compile-time checks for people who use blazon's types.
- **More config surface.** Three keys are new. Each is data and each is checked, but a brand has more to get wrong.
- **Two ways to add a check.** A rule can be a plugin or a change to blazon's core. A rule about one brand is a plugin. A rule every brand needs belongs in blazon.

## Non-goals

- A sandbox. A plugin runs with the permissions of the person who runs blazon. RFC 0005 says the same of the protocol: a plugin is not contained, and a same-user attacker is outside it.
- In-process JavaScript plugins, or any API that exposes blazon's internal types.
- A registry, discovery by package name, or installing plugins. A plugin is a program; how it got onto the machine is the brand's business.
- Plugins that change the compile: new token types, new resolver behavior, new `dev.blazon` fields.
- Plugins that change how the brand book looks. That is `theme` and the viewer.
- Windows. RFC 0005 leaves it open, and so does this RFC.

## Alternatives and prior art

**A program for each call, with the contract in RFC 0005.** This is the proposal. Its alternatives and prior art are in RFC 0005, and what this RFC adds is a profile (the roles). Cost: blazon must be a host, which is the work above.

**A protocol of blazon's own.** Draft 1 of this RFC. Rejected: it would be the second of two near-identical protocols in one suite, it would have no corpus to test against, and it left out what the core already decides: pins, the scrubbing of secrets, the breaker and a check command.

**In-process plugins.** This is how ESLint and Style Dictionary work. ESLint: "A plugin is a JavaScript object that exposes certain properties to ESLint", among them `rules`, `processors` and `configs` (<https://eslint.org/docs/latest/extend/plugins>). Style Dictionary: "You can create custom formats using the registerFormat function" or "by directly including them in your configuration", and "A format has a name and a format function, which takes an object as the argument" (<https://styledictionary.com/reference/hooks/formats/>). This is the easiest model to write a plugin for, if you write JavaScript. It couples every plugin to the host's types and version, a plugin crash is a host crash, and a brand team with a Python deck tool or a Swift generator cannot use it. Blazon already has such tools, and `brand.json` exists so that they need not be JavaScript. RFC 0005 states the same rule in its first non-goal: blazon never loads a plugin's code into its own process.

**Do nothing: run a script after `blazon build`.** This works for outputs today. It gives no findings in the Review page, no exit status from `blazon check`, no order against other steps, no pin and no error when the script and blazon disagree about the version. The protocol adds those.

**All names are free text.** It removes the walls and also the check that catches `lockup: horizontl`. A declared vocabulary keeps that check.

**A rule language in the config.** Asset `rules` (§11) are declarative checks for one case, and the idea generalizes. A language is a larger promise than a process, and the cases are not known yet. A plugin finds them, and the common ones can move into the core.

**WebAssembly plugins.** They would give a sandbox and a language-neutral binary. They also give authors a build step and a host API to learn. Not proposed.

## Compatibility

Blazon is 0.x, and nothing below has a shim.

- `SectionId`, `LogoLockup` and `UsageRole` widen to `string`. Code that relied on the narrow unions needs `STANDARD_*` or a check.
- `brand.json` gains `sections` and `vocabulary`, and `pages[].sections` stops being a fixed enumeration in the schema. The format stays `blazon-brand` at the version it has, because a reader already ignores keys it does not know. `brand.schema.json` gains the two keys and drops the enumeration. A reader that still holds the old schema rejects a brand that uses a custom section and reads every other brand as before.
- `DIRECTIVES`, the built-in checks and the outputs are unchanged. A project with none of the new config keys behaves exactly as now.
- The plugin messages carry their own `v`, as RFC 0005 section 8 says. A change that a plugin could notice is a new `v`. A schema for a version is frozen once any host has released with it.

## Security considerations

The threat model is RFC 0005 section 10, and it applies to blazon as it does to any host. In short: pinning defends against another local user or a changed file, and does not defend against a same-user attacker or a malicious plugin. What blazon adds:

1. **The trust is the config's.** `blazon.json` is data that blazon reads and never runs (RFC 0001 Security considerations), and the allowlist is in that file, so a plugin adds no new party the config did not already trust. A config copied from another brand now also names programs, and the pin file decides whether they run.
2. **Blazon holds no secret of its own.** A value the operator labels secret (`BLAZON_SECRET_*`, for a plugin that pushes tokens to another service, say) is passed only to a plugin that lists it in `secret_env`, and is scrubbed from the plugin's message, answer and standard error before blazon shows or stores it.
3. **Plugin text is shown as text.** The viewer and the terminal show a finding's `message` and `path` as text and never as HTML.
4. **Names.** A plugin's findings carry its name as a prefix, so a plugin cannot report under a core code and a user can tell which plugin said what.
5. **Supply chain.** A plugin that comes from a package is as safe as that package. Blazon installs nothing.

## Status

Implemented on `main` as of 2026-11-20, except what the last paragraph names.

| Part | Where | Tests |
|---|---|---|
| The config is plain JSON (section 2, Configuration): `blazon.json` only, read as data; the code spellings are refused by name | `src/core/config/index.ts` | `test/core/config/` |
| Vocabulary as data (section 1): `customSections` and `vocabulary`, the resolved lists in `BlazonData` and `brand.json`, the viewer's lockup groups | `src/core/config/` (`validate.ts`, `vocabulary.ts`); RFC 0001 section 14 | `test/core/tokens/vocabulary.test.ts`, `test/viewer/vocabulary-viewer.test.tsx` |
| The host core (section 2): names, the manifest, one call (clean environment, private request file, process group, limits, exit codes, never a pass), the breaker, scrubbing, admission, pins with a verified private copy, `blazon plugin check` and `blazon plugin pin` | `src/plugins/`; RFC 0005 | `test/plugins/`, and the protocol's conformance corpus in `test/spec/` |
| The roles: the `plugins` config key as the allowlist, `blazon.plugins.lock`, the `check` role in `blazon check`, `blazon tokens` and `blazon build`, the `build` role in `blazon build`, `plugin-failed`, `plugin-lock-invalid`, `BLAZON_SECRET_` scrubbing, `blazon check --plugin <program>`, `blazon plugin profile` | `src/plugins/roles/`, `src/plugins/pins/lock.ts`. The profile document is valid under the draft profile schema and a CUE check of it, both in `test/spec/` | `test/plugins/roles/`, `test/plugins/host/profile.test.ts` |
| The interpreter of a pinned script (RFC 0005 sections 3.4 and 4): the `#!` line, the interpreter found only in `BLAZON_PLUGIN_PATH` and the system directories, owner and mode checked before every launch. Pinned plugins only | `src/plugins/pins/interpreter.ts`, `src/plugins/host/call.ts` | `test/plugins/host/interpreter.test.ts` |
| The check role in `blazon dev`: checks run after each compile, one call at a time, stale results dropped, a 30-second cooldown for the dev server (a break starts it, exit `2` does not), the lock watched. `/brand.json` of the dev server has no plugin findings | `src/plugins/roles/dev.ts`, `gate.ts`, `src/server/plugin.ts` | `test/plugins/roles/dev-checks.test.ts`, `dev-server.test.ts` |
| Plugins that ship in the package (RFC 0005 section 3.6): a folder `plugins/<name>/` with `bin/blazon-<name>.🔌`, pinned by `plugins/shipped.lock`, which `npm run build:plugins` writes after it bundles each program into its folder (`npm run build` and `prepack` run it). The plugin runs in place after blazon checks the lock entry, the owner and mode of the folder and the tree digest | `src/plugins/pins/shipped.ts`, `package-root.ts`, `scripts/build-plugins.mjs`, `scripts/shipped-lock.mjs` | `test/plugins/shipped/shipped.test.ts`, `conformance-*.test.ts` (find the plugins from the folder, so a new one is held to it), `test/scripts/shipped-lock.test.ts` |
| The brand refusal (section 2, check role): a shipped plugin reads `brand.json` through `requireBrand` and exits 2 with the reason unless `format` is `blazon-brand` and `version` is 2. Built in every shipped reader, `blazon.copy` and `blazon.favicons` included | `src/shipped/shared/plugin.ts` and each `src/shipped/<name>/` reader | `test/plugins/shipped/` |
| Plugin instances (section 2, Configuration): `as` on a `plugins` entry, an id for each use, one pin for each name, an output folder and a breaker for each id, the instance named in a finding | `src/core/config/validate.ts`, `src/plugins/roles/roles.ts`, `src/core/outputs.ts` | `test/plugins/roles/config.test.ts`, `test/plugins/roles/roles.test.ts`, `test/build/output-dirs.test.ts` |
| The environment of a plugin (section 2, Environment): empty but for `PATH`; a variable reaches a plugin only when its manifest lists it and `plugins[n].env` approves it; a listed, set, unapproved name stops the plugin with a `plugin-failed` that names the variable and the key; `blazon plugin check` case 10. The shipped plugins that draw in a browser list `BLAZON_CHROME`, `HOME` and `TMPDIR` in their manifests | `src/plugins/wire/environment.ts`, `src/plugins/roles/roles.ts`, `src/plugins/host/check.ts`, `src/core/config/validate.ts` | `test/plugins/roles/env-approval.test.ts`, `test/plugins/host/call.test.ts`, `test/plugins/host/check.test.ts` |
| Reference plugins: `acme.house-style` (Python, no dependency) and `blazon.cue-rules` (rules in CUE over `brand.json`, passed as `options.rules`; needs `cue` 0.17.1) | `examples/plugins/` | `test/plugins/examples/cue-rules.test.ts`, skipped with a notice when `cue` is missing |

Twelve plugins ship, one entry each in `plugins/shipped.lock`. Eleven fill the `build` role, and `blazon.favicons` fills `check` too. `blazon.copy` fills `check` only. Each is TypeScript under `src/shipped/<name>/`, built into the one file `plugins/blazon.<name>/bin/blazon-blazon.<name>.🔌`, which holds the plugin's code. Each bounds its findings to the 64 KB answer limit (`src/shipped/shared/bound.ts`). The options and the files each writes are in the manual's chapter 14.

| Plugin | Does | Notes |
|---|---|---|
| `blazon.brand-deck` | A PDF deck of 16:9 slides from `brand.json` and the built site | Needs Node and Chrome (`BLAZON_CHROME`; `BLAZON_DECK_FONTS` names font folders). Writes `<tokensOutDir>/blazon.brand-deck/brand-deck.pdf`. Began as a Python program that needed `uv` and the network |
| `blazon.print-book` | The brand book as a PDF and a PowerPoint of pictures | Needs Chrome |
| `blazon.favicons` | The favicon and app-icon set, with a head snippet, a manifest and preview views | Needs Chrome. Also a `check` plugin |
| `blazon.social-cards` | Marketing images from tokens, logo and a background | Needs Chrome |
| `blazon.press-kit` | A folder and a zip for outsiders: logos, colors, `fonts.txt`, `about.txt`, a one-page PDF | A `needs-review` logo is always left out; a `needs-review` color is left out unless `unreviewed` is set. PDF needs Chrome |
| `blazon.logo-geometry` | Each logo's symmetry, balance and grid as a report, errors for required axes, and a construction figure per SVG | Reads SVG, PNG and WebP; the SVG reader does arcs and transforms and names what it does not read (strokes, `<style>`, text). On the example logos it gives the numbers and figure bytes of the Python script it replaced. PNG and WebP need Chrome |
| `blazon.logo-kit` | Partner and program lockups and a clear-space sheet, as SVG and PNG | Layout is `src/core/logo/lockup.ts`, shared with the brand book. PNG needs Chrome |
| `blazon.office-template` | An editable PowerPoint template: theme, master and five layouts | PowerPoint has not opened the file; Keynote renders it and python-pptx parses it |
| `blazon.copy` | Findings for pages and sidecar text that break the brand's word rules (RFC 0006) | Needs Node only. Heuristics, so warnings |
| `blazon.platform-tokens` | Color and dimension tokens as Android XML, Swift with an asset catalog, and Kotlin for Compose | Swift and the catalog are compiled in tests (`swiftc`, `actool`); Kotlin is not |
| `blazon.tailwind` | `tailwind.css` and `tailwind-reset.css`, a Tailwind v4 theme from the tokens | Needs Node only. Runs in `blazon tokens` as well as `blazon build`. As of 2026-11-16 the core writes no Tailwind file |
| `blazon.shadcn` | `shadcn.json`, the token each shadcn/ui variable takes, and `shadcn.css`, the variables as CSS with a block for each context that changes one | Needs Node only. Runs in `blazon tokens` as well as `blazon build`. Its `variables` option replaces the `shadcn` config key |

Not built, and named so that nobody assumes them: long-lived plugins, the page role, the owner check of the lock and of `.blazon/plugins/`, and any platform but POSIX. The protocol is stated in RFC 0005, and blazon's host is tested against its conformance corpus in `test/spec/`. The profile is a draft that can change, and so can the blazon profile that follows it.

## Open questions

1. ~~Where the protocol is stated.~~ Decided: RFC 0005 states it in this repository.
2. **Does blazon's `check` role authorize?** Section 2 says it does, because `blazon check` gates a pipeline, and so a check plugin must be pinned. If a brand team finds that too heavy, the profile could define the role as advisory, which the core allows a host to decide, at the cost that a check plugin could no longer fail a build.
3. **The page role.** Decided in direction, not built: yes, as static pages. A plugin declares a few pages in its manifest, each a layout written as data in blazon's own layout language, the directive table, together with the kinds of brand data it may read (named parts of `brand.json`). Blazon checks the layout when it reads the manifest and draws it with the viewer it has, so a plugin ships no HTML. A layout has no code, markup, script, style, event handler or URL; a link names a page and never an address; a construct blazon does not know is left out and noted, and the rest loads; every string is scrubbed of the plugin's secret values. A page that is not read-only needs one new construct in the table, a `form` (named fields, a template, a copy or download action), because a layout cannot carry code. The email signature (`<!-- blazon:email-signature -->`, in core today) would be its first user. It stays in core until a second page feature wants the role: one user does not pay for a protocol change. Still open: the kinds a page may read, where a plugin page appears in the index, and the limits (pages for each plugin, nodes for each layout). The specification belongs in this repository, as RFC 0005 does for the protocol, and the role is a change to blazon's profile, so the `Adopts` row changes when it is built.
4. **Long-lived plugins.** Should the dev server keep one process per plugin? It is the route if one process per call is too slow. RFC 0005 open question 1 states what a pin would bind to.
5. ~~Should a check see the files?~~ Decided: no. A `build` plugin already runs after the site is written, receives `site_dir`, and fails `blazon build` with an error, so a rule that needs the built site, the fonts or the images is a build plugin. It runs under `blazon build`, not under `check` or `dev`. A third role would repeat it. Two answers go with this one. A plugin's output stays in its `out_dir`, and a book that shows generated files builds twice: build plugins run after the book's data is read, and a phase before it was weighed and not built, because `blazon dev` would start plugin processes on every save. A build plugin that works from the exported tokens reads `tokens_dir`, a field of the build request that holds the token files before the role runs. Blazon is not public, so a change to the protocol costs no compatibility, but each one adds surface to keep: the rule is to build what a second book needs and to document the rest.
6. **Declarative rules.** Which of the first plugins' checks are common enough to become config rules, and what would the smallest form be?
7. **Localized titles.** `customSections` has one `title`. A brand in several locales may want one per context.
8. ~~**A plain-data config.**~~ Decided on 2026-11-15: the whole config is plain JSON in `blazon.json`, and `plugins`, `vocabulary` and `customSections` are in it (RFC 0001 open question 7).

## References

- [RFC 0001: Blazon data model](0001-data-model.md), in particular §12 `brand.json`, §13 sections and §14 configuration.
- [RFC 0005: Plugin protocol](0005-plugin-protocol.md), the core this RFC's roles sit on.
- [RFC 2119] Bradner, "Key words for use in RFCs to Indicate Requirement Levels"; [RFC 8174] Leiba, "Ambiguity of Uppercase vs Lowercase in RFC 2119 Key Words".
- ESLint, Create Plugins: <https://eslint.org/docs/latest/extend/plugins>
- Style Dictionary, Formats: <https://styledictionary.com/reference/hooks/formats/>
