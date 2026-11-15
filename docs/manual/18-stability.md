# Stability and compatibility

← [Manual index](index.md)

Blazon is pre-release (0.x) and not published. A brand pins the blazon commit it builds with (`blazon pin` writes `blazon.lock`, and `check`, `tokens` and `build` refuse any other blazon), so a change in blazon reaches a brand only when its owner moves the pin. This chapter says what a brand can rely on when it does, how changes are made, and how to move a pin.

## What is stable

A stable surface changes only by the rule in the next section. An unstable one can change in any commit.

| Surface | Tier | What it covers | Chapter |
|---|---|---|---|
| Token files | Stable | The DTCG 2025.10 format, the fields of `$extensions["dev.blazon"]` and the resolver document | [2](02-tokens.md), [4](04-contexts.md) |
| `brand.json` | Stable | Format `blazon-brand`, version 1: its keys, and what each holds | [11](11-brand-json.md) |
| The plugin protocol | Stable | Request version 1, manifest version 2, the `check` and `build` roles, the answer and the exit codes | [13](13-writing-a-plugin.md) |
| The command line | Stable | The commands and their flags, the exit statuses, and the `--json` documents | [1](01-getting-started.md), [3](03-checks.md) |
| `blazon.config.ts` | Stable | The keys, and the keys inside them (the `assets` block, a plugin entry, the e-mail signature) | [7](07-theme-and-config.md) |
| Finding codes | Stable | The code of every finding blazon's own checks raise, because a tool that reads `--json` keys on it | [3](03-checks.md) |
| Output files | Stable | The names of the files `blazon tokens` writes | [8](08-using-the-outputs.md) |
| Shipped plugin names | Stable | The names blazon ships, so a config that names one keeps working | [14](14-shipped-plugins.md) |
| The brand book | Unstable | Its look, layout and markup | [5](05-pages.md) |
| The programmatic API | Unstable | The functions the package exports for scripts | [README](../../README.md) |
| The TypeScript config types | Unstable | `defineConfig` and its types. The keys it accepts are stable | [7](07-theme-and-config.md) |

A shipped plugin's options and findings follow the same rule, but the test below does not record them yet.

A test in the repository (`test/surface/`) records the stable surfaces as one list: the commands and flags, the config keys and the keys inside them, the fields of the token, sidecar and page formats, the finding codes and the severity of each, the keys and constants of `brand.json`, the plugin protocol's profile, the output file names and the shipped plugins. It fails when any of them changes, until the record is updated on purpose.

## How a breaking change is made

- While blazon is 0.x, a change that breaks a stable surface raises the minor version, and the CHANGELOG lists it under "Breaking" with what to do about it.
- A config key, a command or a finding code is not removed outright. It stays for one minor as an alias, and using it gives a warning that names its replacement. No key has been renamed yet, so this warning does not exist; it is built with the first rename.
- Adding a key, a command, a field or a finding code is not a breaking change. A tool that reads `--json` treats a code it does not know as a finding, not as an error.

These names are kept: the package `@iksnerd/blazon` and the `blazon` command, the `dev.blazon` extension key, and the files `blazon.config.ts`, `blazon.lock`, `blazon.plugins.lock` and `blazon.resolver.json`.

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

Only the latest commit on `main` gets fixes ([SECURITY.md](../../SECURITY.md)). Nothing is published to a registry, so there is no version to install, and no other company is asked to depend on blazon yet.
