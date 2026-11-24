# Using the outputs

← [Manual index](index.md)

`blazon tokens` and `blazon build` write the code outputs to `dist/tokens/`. This chapter is for the developers who use them. To build a site that follows the brand's rules too, read [chapter 19](19-building-a-website.md).

## CSS variables

A token's CSS variable is its path, kebab-cased, after `cssPrefix`: `brand.primary` is `--brand-primary`, and `color.neutral.900` is `--color-neutral-900`.

```css
@import './dist/tokens/theme.css';
@import './dist/tokens/typography.css';

.button {
  background: var(--brand-primary);
  padding: var(--spacing-3) var(--spacing-6);
}
```

A composite token writes one variable for the whole value and one for each part, with the part's name in kebab-case after the token's. A `typography` token `type.h1` writes `--type-h1` as a `font` shorthand, then `--type-h1-font-family`, `--type-h1-font-size`, `--type-h1-font-weight`, `--type-h1-letter-spacing` and `--type-h1-line-height`. A border has `color`, `width` and `style`; a shadow has `color`, `offset-x`, `offset-y`, `blur` and `spread`; a transition has `duration`, `delay` and `timing-function`.

`typography.css` has one class per text style:

```html
<h1 class="type-h1">Set in the h1 style</h1>
```

Each class sets `font` from the variable, and `letter-spacing` when the style has one.

A [context](04-contexts.md) other than the default gets its own block in `theme.css`, such as `:lang(ja) { ... }`, holding only the variables it changes.

## Tailwind

`tailwind.css` is a Tailwind v4 `@theme` block, written by the `blazon.tailwind` plugin ([chapter 14](14-shipped-plugins.md#blazontailwind)). A project made by `blazon init` lists it; in an older project add `{ "name": "blazon.tailwind" }` to `plugins` in `blazon.json`. `blazon tokens` and `blazon build` write it, and `tailwind-reset.css`, to `dist/tokens/blazon.tailwind/`. Each token that fills a Tailwind theme namespace becomes a variable in it; the other tokens are left out and stay `var(--path)` from `theme.css`.

| Token | Tailwind namespace | Example |
|---|---|---|
| every `color` token | `--color-*` | `brand.primary` is `--color-brand-primary` |
| every `fontFamily` token | `--font-*` | `font.family.sans` is `--font-sans` |
| `dimension` tokens under a `font-size` (or `font-sizes`) group | `--text-*` | `font.size.lg` is `--text-lg` |
| every `fontWeight` token | `--font-weight-*` | `font.weight.heavy` is `--font-weight-heavy` |
| `dimension` tokens in a `radius` (or `radii`, `rounded`) group | `--radius-*` | `radius.card` is `--radius-card` |
| `dimension` tokens in a `spacing` (or `space`) group | `--spacing-*` | `spacing.3` is `--spacing-3` |
| every `shadow` token | `--shadow-*` | `shadow.plate` is `--shadow-plate` |
| every `cubicBezier` token | `--ease-*` | `motion.easing.mechanical` is `--ease-mechanical` |
| a `duration` token named `default` | `--default-transition-duration` | `motion.duration.default` |

The name is the token's path in kebab-case, without leading words that repeat the namespace: `color.neutral.900` is `--color-neutral-900`, `font.family.sans` is `--font-sans`. Two tokens that write one variable with different values are the error `blazon.tailwind/variable-duplicate`, raised by the plugin when it runs (`blazon check` runs no build plugin and reports `css-variable-duplicate` only for `theme.css` and a context's block).

These have no Tailwind namespace and stay `var(--path)` from `theme.css`: `border`, `transition` and `typography` composites (use `.type-*` from `typography.css` for the last), gradients, any other dimension, numbers, and every `duration` that is not named `default` (Tailwind sets a duration by its utility, such as `duration-300`). A shadow with several layers is one `--shadow-*` value. `--text-*` takes the size only, so `text-lg` does not set a line height; Tailwind's own `--text-*--line-height` is not written.

The values are the default context's, resolved. Tailwind reads them at build time, so a [context](04-contexts.md) such as `:lang(ja)` does not change the utilities; use the variables from `theme.css` for that.

```css
@import "tailwindcss";
@import "./dist/tokens/theme.css";
@import "./dist/tokens/blazon.tailwind/tailwind.css";
```

```html
<button class="bg-brand-primary rounded-card p-3 font-sans shadow-plate ease-mechanical">Sign up</button>
```

### Closing Tailwind's defaults

Tailwind's own theme stays live beside `tailwind.css`, so `rounded-xl`, `p-5` or `bg-blue-500` still compile and leave the brand without a warning. `tailwind-reset.css` removes them. It is a separate file, so a site opts in by importing it; no config key turns it on.

It holds one `@theme` block with `<namespace>: initial` for each namespace in the table above that the brand has at least one token in: a brand with colors and no shadows resets `--color-*` and leaves Tailwind's shadows alone. The file is only written when there is something to reset, and the header comment lists what it removes. `--color-*: initial` removes `white` and `black` as well as every default color, so `bg-white` and `text-black` stop working until the brand defines tokens named so. `--spacing-*: initial` also removes the base step, so `p-4` and `gap-6` generate nothing and only the brand's steps (`p-3`) work. That includes `p-0`, `gap-0` and `inset-0`: they generate nothing either, unless the brand has a `space.0` token (`--spacing-0`), so a brand that resets spacing should define one. shadcn/ui components use all three. Fonts are two namespaces, and the reset treats them apart. `--font-*: initial` removes the default font families (`font-sans`, `font-serif`, `font-mono`) and leaves the weights: `font-bold` and `font-semibold` still generate, with 700 and 600. `--font-weight-*: initial` removes every default weight, so `font-bold`, `font-semibold`, `font-medium` and `font-light` generate nothing, and only the brand's `fontWeight` tokens work (`font-heavy` for `font.weight.heavy`). The file holds each reset only when the brand has a token in that namespace, so a brand with font families and no `fontWeight` tokens keeps Tailwind's weights. (Checked with Tailwind 4.3.5.) The reset covers the namespace named in the table only: `--inset-shadow-*`, `--drop-shadow-*`, `--blur-*` and the rest of Tailwind's theme stay.

Import it after `tailwindcss` and before `tailwind.css`. Tailwind applies `@theme` blocks in order: the reset clears the defaults that `tailwindcss` defined, then `tailwind.css` defines the brand's values. The other way round, the reset also clears the brand's tokens and no brand utility compiles.

```css
@import "tailwindcss";
@import "./dist/tokens/theme.css";
@import "./dist/tokens/blazon.tailwind/tailwind-reset.css";
@import "./dist/tokens/blazon.tailwind/tailwind.css";
```

## TypeScript

`tokens.ts` is typed from the tokens. Copy it into a TypeScript project or import it from the folder you set as `tokensOutDir`. Values are CSS-ready strings: a dimension `{ "value": 24, "unit": "px" }` is `"24px"`.

```ts
import { tokens, getToken, getVar } from './dist/tokens/tokens';

tokens.brand.primary;          // "#2563eb"
tokens.type.heading.fontSize;  // "2.25rem"
getToken('spacing.4');         // "1rem"
getVar('brand.primary');       // "var(--brand-primary)"
```

| Export | Is |
|---|---|
| `tokens` | The tokens as a nested object, for the default context |
| `flatTokens` | The same, keyed by full path |
| `contexts` | The overrides of each other context, as `contexts.<modifier>.<name>` |
| `cssVariables` | The CSS variable name of each path |
| `getToken(path)` | The value of a token. The path is checked at compile time |
| `getVar(path)` | `var(--name)` for a token |
| `Tokens`, `FlatTokens`, `TokenPath` | Types of the above |

## JSON

`tokens.json` is DTCG with aliases resolved and `$extensions` kept, so other tools can read it. A token's `$extensions` are written as they are. A group's `$extensions` are written at the group's path too, except its `dev.blazon` key (a group's own `$description` is not written; the brand book and `brand.json` carry it). Each non-default context also gets a complete `tokens.<modifier>.<context>.json`.

## Reading the brand from the command line

Eight commands answer a question about the brand without opening a file. They read the brand the way `blazon check` does, write nothing, and print text, or with `--json` one JSON document on standard output, `{ "command": ..., "passed": ..., ... }`. A brand that has errors is still read; standard error says so, because a value may then be wrong. Run them from the brand folder, or give the folder as the last argument.

| Command | Answers |
|---|---|
| `blazon get <path> [dir]` | One token. `value` is CSS-ready with aliases resolved, then `type`, `description`, `aliasOf`, `tier`, `sourceFile` (the token file, from the project root) and the values of any resolver context. `--theme <name>` gives `value` as that context of the `theme` modifier resolves it, with `theme` and, when it differs, `defaultValue`; an unknown theme exits 2 and names the themes. `names.theme` is the variable in `theme.css` (a composite token also lists one variable for each part) and `names.typographyClass` the class in `typography.css` of a text style. There is no Tailwind name: `tailwind.css` is a plugin's file, so read its variable in that file or from the table above. `rules` holds the `role`, `usage`, `logo` and `review` the token has, each with `from`, the token or group that writes it, and the `pairs` that name the token as text (`as: "fg"`) or background (`as: "bg"`). A `review` on a group covers the tokens under it, and is shown on them. A group path exits 2 and names `blazon list` |
| `blazon list [group] [dir]` | The tokens of the brand, or at or under a group (`blazon list color`): `tokens`, each with `path`, `type`, `value` (CSS-ready, aliases resolved) and `aliasOf` when it aliases another token, plus `group` when one was given. `--type <type>` keeps one `$type` (`color`, `dimension`, `fontFamily` and so on) and adds `type` to the document. Each token carries its `tier` when the brand writes one, and `--tier <tier>` keeps one of `primitive`, `semantic` or `component` (an unknown tier exits 2 and names the three). `--theme <name>` lists the values as that context of the `theme` modifier resolves them, with `defaultValue` on each token the theme changes. `themes` names every theme the brand has; it is left out when the brand has no resolver `theme` modifier. Text output groups the lines under a header for each top-level group. A folder given as the only argument (`blazon list ./brand`) is read as the folder, as for `blazon rules`. An unknown group or type exits 2 |
| `blazon rules [path] [dir]` | For a token, the same `rules`. For a group, one entry for each group and each token at or under it that writes a `role`, `usage`, `logo` or `pairs`, and the groups above it that pass rules down, marked `inherited`. With no path, every such entry in the brand. A folder given as the only argument (`blazon rules ./brand`) is read as the folder when it exists and the argument has a slash or starts with a dot |
| `blazon can <fg> <bg> [dir]` | Whether the token `fg` may be text on the token `bg`. `--pair fg:bg`, repeated up to 50 times and in place of `fg` and `bg`, judges several pairs: the answer is `allowed` (true when every pair is) and `results`, one answer for each pair in order; giving both forms, or neither, exits 2. `--no-verbose` leaves out the `checks` of an allowed answer and keeps them for a denial. The answer is `role`, `allowed`, a `reason` (the first rule that denies it, or what allows it), the `checks` behind it, and the `contrast` ratio with the strictest WCAG level it meets (`AAA`, `AA`, `AA-large` or `fail`). `--role ui` judges `fg` as a non-text element instead (see below). `--alpha <0-1>` measures `fg` at that opacity (see below). Exits 0 allowed, 1 denied, 2 a token that is not there, a color blazon cannot measure (not a color, or a translucent background), a role other than `text` or `ui`, or an `--alpha` outside 0 to 1 |
| `blazon contrast <fg> <bg> [dir]` | The contrast of the token `fg` on the token `bg`, as a measurement and not a verdict: the answer has no `allowed`, the exit status is 0 whatever the ratio (2 when it cannot be measured), and `--json` has no `passed`. It is for a color no token names, such as a 12% glow over a canvas. `--with <token> --with-alpha <0-1>` blends that color token over `bg` first, at that opacity times the token's own alpha; the two come together. `--alpha <0-1>` is the foreground's own opacity, the same as for `blazon can`, and is not the opacity of `--with`. `--theme <name>` measures in a theme. The answer is `ratio` (two decimals), `level` (`AAA`, `AA`, `AA-large` or `fail`), `nonText` (true from 3:1), `seen` (`fg` and `bg` as hex after blending, so you can see what was measured), the inputs echoed, `brandPairs` (the pairs the brand lists for `fg` on the base `bg`, not on the blend; empty when none) and `note`. Only `blazon can` says whether the brand allows a pair, and a blend is never a listed pair. Refused with exit 2: a translucent `bg`, a `--with` that is not a color blazon can read (for a gradient, pass its strongest point as `--with` and its opacity as `--with-alpha`), an unknown token (the closest path is named), a token the theme removed, an opacity outside 0 to 1, and `--with` without `--with-alpha` or the reverse. The blend is the one `blazon check` uses (RFC 0001, section 4) and the ratio does no gamut mapping, so a color outside sRGB is measured as the library converts it |
| `blazon fonts [dir]` | `stylesheets` and `files` as the `fonts` config lists them, `roles` (`fontDisplay`, `fontBody`) and `families`: each family a token names first, with the tokens, the `stack`, whether it is a `system` font, whether it is `loaded` by an entry of `fonts` (null when a stylesheet blazon cannot read is listed), and the token's `webFont` and `font` fields. `--css` prints instead the `@font-face` rule of each font file (`font-family`, `src` with its `format()` from the extension, `font-weight` and `font-style` when the entry has them, `font-display: swap`) and, for each stylesheet, a comment with its address, since blazon does not fetch it. `src` is the path from the brand folder; `--base <url-prefix>` replaces the folder with a prefix, so `--base /fonts/` gives `url("/fonts/Mulish.woff2")`. With `--json` the text is `fontFace`. The `get_fonts` tool takes `css` and `base` too and returns `fontFace` only then. Quotes, parentheses, `;`, braces and white space in `base` are percent-encoded, so it cannot end the `url()` or add a rule |
| `blazon logo [dir]` | `variants`: the configured `onLight` and `onDark` files, whether blazon found them, the `logos` asset each is and its declared `ink`, and, for a file found and readable, `path` (absolute, on the machine blazon runs on) and `sha256` (hex of its bytes), so a caller outside the brand folder can fetch and verify the file. `assets`: each logo asset once, with `files`, every file of the id from the project root (an id in two formats, `mark.svg` and `mark.png`, is one asset; the first file is the one a reader with no preference takes, RFC 0001 section 12), `details`, one entry for each of `files` in the same order with `file`, `path` (absolute), `sha256`, `bytes` and `format` (a file blazon cannot read has only `file`), the variants that use one of them and `rules`, its sidecar as `brand.json` carries it (`clearSpace`, `minSize`, `maxSize`, `replacedBelow`, `lockup`, `placement`, `partnership`, `initiative`, `unit`, `ink`, `do`, `dont`). `forbidden`: the tokens and groups whose `logo` rule denies a variant |
| `blazon outputs [dir]` | Which files the last `blazon tokens` or `blazon build` wrote under `tokensOutDir`, and whether each is current. Unlike the others it does not compile the brand: it reads the config and the folder, writes nothing, starts no plugin, and `--json` has no `passed`. The answer is `outputsDir` (from the brand folder), `files` (one for each file found under it, including each plugin's folder `<id>/`: `file` from the outputs folder, `relative` from the brand folder, absolute `path`, `bytes` and `state`), `missing` (each plugin in `blazon.json` whose folder `<tokensOutDir>/<id>/` is not there, with the `fix`), `fix` (`blazon tokens`, present when anything is missing or stale or the folder is empty) and `note`. `state` is `fresh` or `stale`: stale when any input of a compile (`tokensDir`, `docsDir`, `assetsDir`, the resolver and its sources, logo and font files and the other paths a compile reads) has a modification time newer than the file. It is a timestamp comparison, so a git checkout, which rewrites timestamps, can make files look stale or fresh wrongly, and a change to `blazon.json` alone is not seen. A plugin that writes only on `blazon build`, or one with no build role, is listed as missing after `blazon tokens`. `--file <path>` (a path under the outputs folder, as `file` lists it) prints that file's text instead, and in `--json` adds `text`, cut at 40 000 characters with `truncated`. A path that leaves the outputs folder (`..`, an absolute path, a link that points outside), a folder, a missing file and a file that is not UTF-8 text are refused with exit 2. It is how a script or an agent finds the generated CSS without guessing paths |

`blazon can` decides from the brand's own rules and from nothing else. It checks, in this order:

1. The `usage` rules on the foreground for the role `text`, and on the background for the role `background`. A token that aliases another is held to the usage of everything it aliases, as `blazon check` does. Usage is read before the colors are: a token that is not a color (a gradient) that a usage rule forbids is a denial with the usage reason, and a gradient that usage allows is an error (exit 2), because blazon cannot measure it and an unknown contrast is not a denial.
2. The `pairs`. The brand's pairs are a list, as in [chapter 19](19-building-a-website.md): when the brand lists any, a combination that no pair names is denied, and a pair that names it must be met at its level. A pair written on a token the foreground or background aliases counts. When the brand lists no pairs at all, this step passes and says so.
3. The contrast, which is reported and is never a rule of its own: a brand that lists no pairs and writes no usage rule against the combination gets `allowed` with a low ratio. Read `contrast.level`.

`--role ui` asks the question for a focus ring, a border or an icon stroke, which WCAG judges at 3:1 (1.4.11 Non-text Contrast) and not at a text level. The order changes:

1. The `usage` rules on the foreground are read for the roles `border`, `icon` and `interactive`. The pair is denied only when the rules leave out all three. The background is still held to the role `background`.
2. The `pairs` do not apply. They list text on a background, and the check says so.
3. The contrast is a rule: below 3:1 the answer is `denied`. `contrast.threshold` is `3`, and `contrast.level` still names the text level the ratio meets.

The default context is used throughout, unless `--theme <name>` asks for that context of the resolver's `theme` modifier (the MCP tools `can_use`, `list_tokens` and `get_token` take `theme` too); the answer then carries `theme`.

Contrast is measured as `blazon check` measures it, by the same function: a foreground with an alpha channel is blended over the background first (source-over in sRGB), so `#3885FF80` on white is 1.82:1, not the 3.52:1 of the opaque color. A background with an alpha channel is refused with exit 2, as `contrast-unknown` refuses it in `check`: what is behind it is not known. `--alpha <0-1>` (the `alpha` property of the MCP tool, for `text` and `ui`) measures the foreground at that opacity, multiplied with the token's own alpha. The pair still names tokens, only the ratio changes, and the answer carries `alpha`. A number below 0 or above 1 exits 2.

A path is a token path (`color.brand.primary`, or `{color.brand.primary}`). An unknown path exits 2 with the closest one named when there is a near one. `blazon get` takes a token path only: a group path exits 2 and names `blazon list <group>`, which lists the tokens in the group; `blazon rules` with a group path shows its rules.

```bash
blazon list --type color
blazon get color.brand.primary
blazon can text.primary surface.canvas --json
blazon can rule.default surface.canvas --role ui
blazon contrast text.muted surface.canvas --with accent.glow --with-alpha 0.12
blazon rules color.signal
```

## The site

`dist/site/` is a static site. To publish it, copy the folder to any static web host, at the root or in a subfolder. `blazon preview` serves it locally so you can check it first.
