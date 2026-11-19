# Blazon

Compiles DTCG design tokens, Markdown guidelines and brand assets into CSS, a typed module and a static brand book, and checks the brand's own rules. Version 0.1.0 is on npm as `@iksnerd/blazon`; it is 0.x. [README](README.md) is the overview, [CONTRIBUTING](CONTRIBUTING.md) has the hooks and test layout, [docs/manual](docs/manual/index.md) is for users, [docs/rfc](docs/rfc) is normative.

## Commands

- `npm run check` is typecheck, lint, Ruff and Prettier. `npm test` is the whole suite. `npm run dev:blazon` runs blazon's own brand book from source.
- The git hooks are the gate (CONTRIBUTING, "The hooks"). `pre-commit` tests the staged snapshot and only the tests the staged paths ask for. `pre-push` runs the suites for the whole push. Do not run the same suite by hand first.
- Node 24 is the floor (`engines`) and what CI runs. To see what an older Node does, run `nvm exec 22 npx vitest run`.
- `npx blazon` runs an unrelated npm package unless `@iksnerd/blazon` is installed in the folder. Run the CLI as `node bin/blazon.js` after `npm run build`, or `npm run blazon:src -- <command>` for source.

## Layers of `src/`

`test/core/layers.test.ts` holds a row for every folder: `core` imports only `types`; `plugins`, `shipped` and `viewer` import only `core` and `types`; `server` also `plugins`; `builder` also `server`; `cli` anything but the viewer. A helper two layers need goes down into `core`. `src/plugins/` is the plugin host, `src/shipped/` is the source of the plugins blazon ships, the root `plugins/` holds each one's README and `package.json`, and `npm run build:plugins` writes its program (`bin/blazon-<name>.🔌`, one CommonJS file, git-ignored) and `plugins/shipped.lock` (git-ignored) there, and `examples/plugins/` holds reference plugins.

## Docs are tested against the code

- `test/docs/manual.test.ts` fails when a command, flag, config key, directive, `dev.blazon` field or finding code is missing from `docs/manual/`. `test/docs/rfc.test.ts` does the same for RFC 0001, which must name every config key and finding code.
- An RFC's Status section is a table of what is built and where, with an "as of" date. Keep history in CHANGELOG.
- A plugin's README under `plugins/` is not a manual page: `plugins/shipped.lock` holds a digest of it, so editing one means `npm run build:plugins` (a vitest run does it when the lock is older). The programs and the lock are build output; the digest covers the bundle, so two builds must give the same bytes: no build stamp, no hashed names, no top-level `await` in a `main.ts` (the bundle is CommonJS).
- Golden files change only on a deliberate output change: `UPDATE_GOLDEN=1 npx vitest run test/core/tokens/conformance.test.ts`, then review the diff.

## Traps

- A merge made with `git merge` runs no pre-commit hook, so a failing test can land unseen: after merging, run `npm run check` and the tests the merge touched before the next commit.
- `buildSite` and `emitTokenOutputs` refuse a brand with error findings, a pin that is not met, and an `outDir` that is or holds an input or is inside one (`src/core/preflight.ts`, `outputs.ts`). A test that builds a deliberately broken brand passes `{ allowErrors: true }`; the other two refusals are never lifted.
- `projectInputs` (`src/core/inputs.ts`) is the one list of what a compile reads. The dev server watches it, `outputs.ts` protects it from `outDir` and plugin folders, and `emitTokenOutputs` neither overwrites nor deletes a file in it. A path a compile starts to read goes there.
- A resolver context is stored as its changes. Put one back together with `contextItems` (`src/core/tokens/contexts.ts`), never by hand.
- Never run `blazon build` or `blazon tokens` on an `examples/` folder in place. It writes `dist/` there, `blazon init` copies `examples/blazon` from source, and tests start to fail with "already exists". Build a copy (`starterProject()` or `exampleProject()` in `test/support/`). `template/` is git-ignored: `npm pack` makes it from `examples/blazon` (`scripts/build-starter.ts`), and the same rule holds if one exists.
- A vitest run builds the viewer into `dist/ui` only when it is older than `src/viewer`, `src/core`, `src/types` or the build config, and under a lock (`test/support/viewer-build.ts`), so runs at once wait for each other. After a mutation loop, `npm run build` again before a static site or a browser check. Two runs at once are safe unless you edited those sources between them: the second rebuilds and empties `dist/ui` under the first's tests ("No prebuilt viewer in dist/ui").
- Keep a worktree under the home folder with its own `npm ci`. A `node_modules` linked from a folder that others can write (the system temp folder, say) fails the plugin interpreter test, because the host refuses such a folder.
- Two `blazon dev` servers on a shared `node_modules` break each other's Vite cache (504 Outdated Optimize Dep). For a browser check from a worktree, build a static site and serve that.
- Adding a shipped plugin: a folder `plugins/<name>/` with `README.md` and `package.json` (`{"type":"commonjs"}`) and `src/shipped/<short>/main.ts`, then `npm run build:plugins`, then update the tests that list the shipped names (`test/plugins/roles/config.test.ts`, `test/build/cli-plugins.test.ts`) and every place the manual, README and RFC 0002 count them. Some tests read `dist/`, so a stale build hides a missing name until a clean clone builds.
- A finding code is added in `src/core/checker/catalogue.ts` (severity, summary, fix, scope, RFC section, manual page) and emitted with `finding('code', { path, message })`; `Resolver.report` takes a `CheckCode` too. A code that is not in `CHECKS` does not compile. Then run `npm run checks-docs` to rewrite the tables in the manual and RFC 0001, add a case to `test/corpus/checks/cases.ts`, and refresh `test/surface/public-surface.json` with `UPDATE_SURFACE=1`. Findings are in the total order of `compareFindings` (`src/core/order.ts`); never use `localeCompare` in `src/core`.
- A shipped plugin's `readBrand` starts with `requireBrand` (`src/shipped/shared/plugin.ts`), which refuses any brand that is not `blazon-brand` at the current version (`BRAND_VERSION`). A test fixture for a reader needs `format` and `version`.
- A check that must hold in every resolver context goes in `findingsOf` in `contextFindings` (`src/core/index.ts`), not as a separate call on the default tokens. A finding from a context names that context's file.
- `overrides` in blazon's `package.json` reach only blazon's own install, never a consumer's. A dependency whose transitive tree needs one (`pptxgenjs` and its old `image-size`) is bundled into the plugin that uses it and kept in `devDependencies`, so `npm audit` on an installed blazon stays clean. Check with `npm pack`, install the tarball under the home folder and `npm audit --omit=dev`.
- `vendor-spec-corpus.py` is the only way `test/spec/` changes; its `SOURCE.json` digest fails the tests on a hand edit.
- A third party's brand guidelines (text, slide crops, logos) are not in the repository. Keep them in `docs/personal/reference/`, which is git-ignored; the tests that need them skip when it is absent (`test/support/reference.ts`). Never add a third party's media or text to a tracked path, and a golden made from it goes in `docs/personal/reference/golden/`.

## Writing

Docs and RFCs are read by outsiders. No em-dashes, no hype words, no internal project or room names. Verify a claim against the code before writing it, and say "proposed" for anything not built.
