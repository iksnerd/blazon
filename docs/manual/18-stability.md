# Stability and compatibility

← [Manual index](index.md)

Blazon is pre-release (0.x). Not published yet: no version is on npm, and the version numbers below describe how releases will be numbered. A brand pins the blazon commit it builds with (`blazon pin` writes `blazon.lock`, and `check`, `tokens` and `build` refuse any other blazon), so a change in blazon reaches a brand only when its owner moves the pin. This chapter says what a brand can rely on when it does, how changes are made, and how to move a pin.

## What is stable

A stable surface changes only by the rule in the next section. An unstable one can change in any commit.

| Surface | Tier | What it covers | Chapter |
|---|---|---|---|
| Token files | Stable | The DTCG 2025.10 format, the fields of `$extensions["dev.blazon"]` and the resolver document | [2](02-tokens.md), [4](04-contexts.md) |
| `brand.json` | Stable | Format `blazon-brand`, version 1: its keys, and what each holds | [11](11-brand-json.md) |
| The plugin protocol | Stable | Request version 1, manifest version 2, the `check` and `build` roles, the answer and the exit codes | [13](13-writing-a-plugin.md) |
| The command line | Stable | The commands and their flags, the exit statuses, and the `--json` documents | [1](01-getting-started.md), [3](03-checks.md) |
| `blazon.json` | Stable | The file name and its plain JSON form, the keys, and the keys inside them (the `assets` block, a plugin entry, the e-mail signature) | [7](07-theme-and-config.md) |
| Finding codes | Stable | The code of every finding blazon's own checks raise, because a tool that reads `--json` keys on it | [3](03-checks.md) |
| Output files | Stable | The names of the files `blazon tokens` writes | [8](08-using-the-outputs.md) |
| Shipped plugin names | Stable | The names blazon ships, so a config that names one keeps working | [14](14-shipped-plugins.md) |
| The brand book | Unstable | Its look, layout and markup | [5](05-pages.md) |
| The programmatic API | Unstable | The functions the package exports for scripts | [README](../../README.md) |

A shipped plugin's options and findings follow the same rule, but the test below does not record them yet.

A test in the repository (`test/surface/`) records the stable surfaces as one list: the commands and flags, the config keys and the keys inside them, the fields of the token, sidecar and page formats, the finding codes and the severity of each, the keys and constants of `brand.json`, the plugin protocol's profile, the output file names and the shipped plugins. It fails when any of them changes, until the record is updated on purpose.

## Planned before 1.0

One change is planned that touches stable surfaces, and it is made before 1.0 so that it needs no alias. The Tailwind files (`tailwind.css`, `tailwind-reset.css`) and the shadcn mapping (`theme.shadcn` in `brand.json`, the `shadcn` config key and the `blazon brand --key theme.shadcn` command) are built into the core today. They are to become two shipped `build` plugins, and the core will then know no framework by name. That would move these files into the plugins' output folders, raise the `build` request to version 2 and `brand.json` to version 2, and remove the old key and command. It is proposed, not built, and blazon stays 0.x until it is decided and made.

## How a breaking change is made

- While blazon is 0.x, a change that breaks a stable surface raises the minor version, and the CHANGELOG lists it under "Breaking" with what to do about it.
- A config key, a command or a finding code is not removed outright. It stays for one minor as an alias, and using it gives a warning that names its replacement.
- That alias mechanism is not built. Nothing in `src/` reads an old name and warns, and no key, command or code has been renamed since there was something to keep. It is built with the first rename after a release.
- The exceptions are changes made before the first release, with no alias, because nothing had been published and nobody depended on the old form: the rename from folio to blazon (the command, the package, the config and lock files, the `.blazon` folder, the `BLAZON_` environment variables and the `dev.blazon` extension key), the move of the config to plain JSON in `blazon.json`, and the one naming rule for finding codes, which renamed 42 of them. The CHANGELOG lists each.
- Adding a key, a command, a field or a finding code is not a breaking change. A tool that reads `--json` treats a code it does not know as a finding, not as an error.

These names are kept: the package `@iksnerd/blazon` and the `blazon` command, the `dev.blazon` extension key, and the files `blazon.json`, `blazon.lock`, `blazon.plugins.lock` and `blazon.resolver.json`.

## The deprecation window

A name that is to go stays as an alias for one minor release. The release that renames it is minor N, the alias works in N and warns, and minor N+1 may remove it. No length in months is promised: blazon has no release schedule, and a pin means a brand decides when to move. This is the plan; the alias and its warning are not built (see above).

## What a release may contain

While blazon is 0.x, the middle number carries the weight that the first number carries after 1.0.

| Release | May contain | May not contain |
|---|---|---|
| Patch (0.x.Y) | Fixes to wrong output or a wrong finding, and corrections to the manual | A new command, key or finding code, and any change to a stable surface |
| Minor (0.X.0) | Everything a patch may, plus new commands, flags, config keys and finding codes, and a breaking change to a stable surface, listed under "Breaking" | A removal with no alias, once the alias mechanism exists |
| Major (1.0.0 and later) | The same as a minor, and the removal of an alias that has had its minor | Not decided yet: see the plan below |

A fix can still change a brand's output: a check that was wrong now reports, or stops reporting, a finding. Such a fix is listed under "Fixed", and moving a pin with `scripts/pin-compare.ts` shows it.

Unstable surfaces (the brand book and the programmatic API) can change in any release, and a change to one is not listed as "Breaking".

## Reading the CHANGELOG

Each release in `CHANGELOG.md` at the repository root has up to four lists. Until the first release, one heading, "Unreleased", holds everything since the project began.

| Heading | What is in it | What to do |
|---|---|---|
| Breaking | A change to a stable surface that can make a brand that built before fail, or build differently. Each entry says what to do | Read it first when moving a pin |
| Added | A new command, flag, key, field or finding code. A brand does not need to change | Read it to see what is new |
| Changed | A change that is not breaking: wording, defaults for new projects, the unstable surfaces | Skim |
| Fixed | A bug fix, including a check that was wrong | Skim; it can change a finding |

## What 1.0 will mean

This is the plan. None of it is a promise yet, and the table says what is met today.

| Criterion | How a reader checks it | Met today |
|---|---|---|
| Each stable surface above is recorded by a test | `test/surface/public-surface.json` and its test list every stable surface | Partly: shipped plugin options and findings are not recorded |
| No open "Breaking" items | The newest CHANGELOG release has no entry under "Breaking" that is a known mistake still to fix | No: the CHANGELOG still has a pre-release "Breaking" list |
| The alias mechanism is built | An old config key, command or finding code works and warns with the new name | No |
| The deprecation window is stated | This chapter gives the length | In minors, yes; in months, no |
| Published | A version of `@iksnerd/blazon` is on npm and `npx @iksnerd/blazon` runs it | No |

At 1.0 a breaking change to a stable surface would need a major version, and the one-minor alias would apply to every rename. Until all five rows are met, blazon stays 0.x.

## Moving a pin

1. Read the CHANGELOG between the two commits, and the entries under "Breaking" first.
2. Build both blazons, each in its own checkout (two `git worktree`s do): `npm ci && npm run build`.
3. Compare them on your brand:

   ```bash
   npx tsx scripts/pin-compare.ts <brand> <blazon-a> <blazon-b> --ignore '*.pdf'
   ```

   The script builds a copy of the brand with each blazon, leaves your files alone, and prints what differs: the findings each reports, every file under `dist/tokens/` and `dist/site/`, and the keys of `brand.json` (without the commit that wrote it). The exit status is 0 when nothing differs and 1 when something does. A file a plugin writes with a time in it, such as a PDF or a zip, differs on every build, so name it with `--ignore`, which takes a path with `*` in it. `--no-plugins` skips the plugins, and `--json` prints the comparison as data.
4. Run `blazon pin` with the new blazon.

## Platforms

Blazon runs on macOS and Linux. The plugin host starts programs the POSIX way, so native Windows is not supported. WSL should work but has not been tried. `engines` asks for Node 24 or later; CI runs the suite on Node 24 for every version tag and by hand. Only the plugins that draw or print need Google Chrome (the manual says which), and the rest of blazon does not.

## What is not promised

Only the latest commit on `main` gets fixes until there is a release, and the latest minor after ([SECURITY.md](../../SECURITY.md)). No other company is asked to depend on blazon yet. Windows, an older Node than `engines` asks for, and the unstable surfaces above are not promised.
