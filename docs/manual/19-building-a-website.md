# Building a website from a brand

← [Manual index](index.md)

This chapter is for a developer, or a coding agent, who builds a website or an app in a brand's look. Blazon does not write the site. It writes the values and the rules, and this chapter says how to read them so the site follows the brand. The outputs themselves are in [chapter 8](08-using-the-outputs.md).

## Read the rules before you write code

1. Run `blazon check` in the brand folder. Build on a brand that passes. A site built on a failing brand copies its errors.
2. Read the brand's `AGENTS.md` if it has one, then its pages in `docs/`. The pages state the brand's decisions in words.
3. Find the token paths with `blazon list`, which lists every token with its type and value, `blazon list <group>` for one group, and `blazon list --type color` for one `$type`. Read the rules that are data with the read commands, not by opening the token files: `blazon rules` lists every rule in the brand, `blazon rules <group>` the rules of one group, and `blazon get <token>` the rules of one token with the group that writes each ([chapter 8](08-using-the-outputs.md#reading-the-brand-from-the-command-line)). Add `--json` to parse the answer. The rules sit under `$extensions["dev.blazon"]` in the token files, and the same data is in `dist/tokens/tokens.json` and `dist/site/brand.json` ([chapter 11](11-brand-json.md)), for a tool that needs the whole brand at once. The three that matter for a site:

| Rule | Says | What you do with it |
|---|---|---|
| `usage` | The roles a token may or may not fill, such as `deny: ["text"]` | Never use the token in a denied role, even when the contrast is enough |
| `pairs` | The foreground and background tokens that may sit together | Use only these pairs for text on a surface |
| `logo` | The logo variants a surface forbids | Do not draw a denied logo on that surface |

A rule on a group applies to every token in it ([chapter 2](02-tokens.md)); `blazon get` shows it on the token and names the group.

## Take every value from the tokens

Write no hex color, font name or pixel size in the site's code or CSS. A value that is not in the tokens is a question for the brand owner, not something to invent.

Pick the output by what you are styling:

| You are setting | Use |
|---|---|
| Color, spacing, radius, font family in a Tailwind project | The Tailwind utilities that `tailwind.css` (written by `blazon.tailwind`) gives: `bg-surface-canvas`, `p-4`, `rounded-hairline` |
| Text | The `.type-*` classes of `typography.css`, one per text style |
| A value with no Tailwind namespace, such as a border or a transition composite | `var(--path)` from `theme.css` |
| Logic in code, such as a chart color | `tokens.ts`: `getToken('color.signal.orange')` |

The two CSS files name the same token differently, so do not mix the names. `theme.css` uses the token's path: `--text-primary`, `--space-4`, `--font-family-display`. `tailwind.css` uses a Tailwind namespace: `--color-text-primary`, `--spacing-4`, `--font-display`. The names above are from blazon's own brand; the rule for yours is in [chapter 8](08-using-the-outputs.md#tailwind).

`blazon get <path>` gives the `theme.css` name (`names.theme.variable`); the Tailwind name is the rule in chapter 8's table, and `tailwind.css` itself lists every variable it writes.

### The utilities blazon generates

Do not write a utility by hand from `var(--...)` when `tailwind.css` has one. Shadows, easings, font weights, font sizes and radii are in it, so a plate is `shadow-plate`, an easing is `ease-mechanical`, a weight is `font-heavy` and a card corner is `rounded-card`. The list of what maps is the table in [chapter 8](08-using-the-outputs.md#tailwind); `tailwind.css` lists every token that has one.

To make the brand the only theme, import `tailwind-reset.css` before `tailwind.css`, both from `dist/tokens/blazon.tailwind/`, as [chapter 8](08-using-the-outputs.md#closing-tailwinds-defaults) shows. After that `rounded-xl`, `p-5` and `bg-blue-500` generate nothing, so a utility that compiles is one the brand defines. Font weights follow the same rule: once the brand has `fontWeight` tokens, `font-bold` generates nothing unless the brand defines a `bold` weight, while `--font-*: initial` alone does not remove it.

To check that nothing is hard-coded, search the site's source for `#`, for `px` and for the font names in `tokens/typography.json`.

### Getting a value where CSS variables do not reach

A theme color meta tag, a generated image and an email cannot read a CSS variable. Take the value from the data instead. `blazon get <path> --json` prints the token with its `value` in `token.value` (`"120ms"` for `motion.duration.snap`, a hex string for a color). `dist/tokens/blazon.shadcn/shadcn.json` has the shadcn picks with their values (see the next section). `dist/tokens/tokens.json` has every token, for a script that needs many. Copy the value at build time, from one of these, so it follows the brand.

## Type classes beat utilities

`typography.css` writes plain `.type-*` classes, outside any CSS layer, and Tailwind puts its utilities in a layer. Unlayered CSS wins over layered CSS whatever the specificity, so `class="type-body font-semibold"` stays at weight 400: the `font:` shorthand of `.type-body` sets the weight and the utility loses. Do not stack a utility on a `.type-*` class to change what the class sets. Write the combination once, as a utility that sets the whole shorthand and then the weight:

```css
@utility body-strong {
  font: var(--type-body);
  font-weight: var(--font-weight-semibold);
}
```

A second trap is in `tailwind-merge`, which shadcn/ui's `cn()` runs. It reads any `text-*` class as a color or a size, so a custom `text-strong` next to `text-primary-foreground` in one `cn()` call is dropped. The same holds for `border-*` and `font-*`. Name custom utilities so they do not start with a Tailwind prefix (`body-strong`, `rule-box`). (Checked with tailwind-merge 3.7.0.)

## Fonts

The fonts a brand loads are in the `fonts` key of `blazon.json` ([chapter 7](07-theme-and-config.md#logo-and-fonts)), and `brand.json` carries them as `theme.fonts`. Run `blazon fonts` (or `blazon fonts --json`) for the stylesheet addresses and font files to load, and for each family the tokens name, whether the brand loads it. Load the same stylesheets or files. Do not type a font URL again by hand: it would drift from the brand.

For a font file the site serves itself, do not write the `@font-face` by hand either. Copy the brand's font files to the site's public folder (here `public/fonts/`) and print the rules:

```sh
blazon fonts --css --base /fonts/ > app/brand-fonts.css
```

Each file gets a rule with the brand's `family`, `weight` and `style`, the `format()` taken from the extension and `font-display: swap`, and each stylesheet in `fonts` is a comment with its address, to load as a `<link>`. Without `--base` the `src` is the path from the brand folder. Run it again when the brand's `fonts` change.

Blazon embeds the font files that `fonts` lists, and `.woff2`, `.woff`, `.ttf` and `.otf` all work. A tool that needs a TTF or OTF and not the web font, such as `next/og` (Satori), a PDF library or a native app, reads a file of its own: keep it in the brand's `fonts/` folder beside the woff2 and do not list it in `fonts`. Blazon ignores a file there that `fonts` does not name: `blazon check` reports nothing about it, `blazon fonts` does not print it and a build does not copy it. The site then reads it from the brand folder (for Satori, `fs.readFile` of that path, passed as `fonts: [{ name, data, weight }]`) and takes the same family name and weight from `blazon fonts`.

In a Next.js app, `next/font/local` can load the files instead. Copy the files that `blazon fonts --json` (or `get_fonts`) lists under `files` into the app, and give one `localFont` call the entries of one family. `weight` and `style` come from each entry, and `weight` is a string there:

```ts
// app/fonts.ts
import localFont from 'next/font/local';

export const acmeSans = localFont({
  src: [
    { path: './fonts/AcmeSans-Regular.woff2', weight: '400', style: 'normal' },
    { path: './fonts/AcmeSans-Bold.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-acme-sans',
});
```

`src` paths are relative to the file that calls `localFont`, and `next/font/local` has no `subsets` option (only `next/font/google` does). Set `variable` and point the Tailwind family at it, or keep the family name the brand gives. Blazon does not subset, convert or rename font files: a changed file is a licence matter and the brand's decision.

## Widths written once in a Tailwind v4 site

A brand's Web page may state layout widths that have no token, such as a 640px breakpoint and a 1200px content column, and say the site writes each once. Blazon writes neither, and `tailwind.css` does not define them. This is one way to do it in a Tailwind v4 stylesheet, not blazon output:

```css
@theme {
  --container-content: 1200px;
}

@custom-variant narrow (@media (width < 640px));
```

`max-w-content` then gives the column width, and `narrow:` applies a class below 640px. Each number appears in this one place.

## Using shadcn/ui

A shadcn/ui project reads its colors from semantic CSS variables: `--background`, `--primary`, `--ring`, `--chart-1` and so on. The `blazon.shadcn` plugin says which token each variable should take, and writes the variables as CSS. A project made by `blazon init` lists it already; in an older project add it to `plugins` in `blazon.json`. `blazon tokens` and `blazon build` write two files to `dist/tokens/blazon.shadcn/`:

```json
{
  "plugins": [{ "name": "blazon.shadcn", "options": { "variables": { "ring": "text.primary" } } }]
}
```

- `shadcn.css`: a `:root` block with each variable blazon supplies, in the default context's values, and a block under each other context's selector for the variables that context changes (a dark theme, say). Import it after the project's own `globals.css`.
- `shadcn.json`: the mapping behind it, for a person or a tool that wants the reasons.

```json
{
  "variables": {
    "primary": { "token": "interactive.primary", "value": "#FF5A1F", "from": "theme", "role": "accent" },
    "primary-foreground": { "token": "text.onSignal", "value": "#1E1F21", "from": "theme", "role": "accentText" },
    "ring": { "token": "text.primary", "value": "#1E1F21", "from": "config" }
  },
  "unsupplied": [],
  "pairs": [{ "background": "primary", "foreground": "primary-foreground", "backgroundToken": "interactive.primary", "foregroundToken": "text.onSignal", "declared": true }]
}
```

(Shortened: a real file lists every variable blazon supplies. `unsupplied` lists the variables nothing supplies: it is empty here because the starter maps `destructive` and `chart-1` to `chart-5` itself, and a brand that does not would list them.) Variable names have no leading dashes. `value` is the token's value in the default context. `from` says where the pick came from: `theme` for a [theme role](07-theme-and-config.md#theme-roles) (named in `role`), `config` for the `variables` option of the plugin. A pick that names no token is the error `blazon.shadcn/token-missing` and the variable falls back to its role. The plugin reads `brand.json` and nothing else, so `blazon tokens` runs it; a coding agent reads `shadcn.json` from the output folder, as it reads the other generated files.

What blazon supplies from the theme roles, with no setup beyond `theme`:

| shadcn variable | Theme role |
|---|---|
| `background`, `card`, `popover`, `sidebar` | `background` |
| `foreground`, `card-foreground`, `popover-foreground`, `secondary-foreground`, `accent-foreground`, `sidebar-foreground`, `sidebar-accent-foreground` | `text` |
| `primary`, `ring`, `sidebar-primary`, `sidebar-ring` | `accent` |
| `primary-foreground`, `sidebar-primary-foreground` | `accentText` |
| `secondary`, `muted`, `accent`, `sidebar-accent` | `canvas` |
| `muted-foreground` | `muted` |
| `border`, `input`, `sidebar-border` | `border` |
| `radius` | `radius` |

These are the same picks the brand book's own components use. A role the theme does not set leaves its variables out. A brand can override a pick: blazon's own starter sets `ring` and `sidebar-ring` to `text.primary` in that option, because the role pick for `ring` is the primary action color, which is 2.74:1 on the page background, below the 3:1 a focus outline needs.

What the brand has to map itself: `destructive` and `chart-1` to `chart-5` have no role. The starter maps them in that option: `destructive` to `text.primary` (it has no red) and `chart-1` to `chart-5` to `text.primary`, `text.muted`, `surface.canvas`, `rule.default` and `rule.quiet`, in that order. A brand that wants them, or wants a different token for any variable above, says so in the `variables` option of `blazon.shadcn`:

```json
{
  "plugins": [
    { "name": "blazon.shadcn", "options": { "variables": { "destructive": "color.signal.hazard", "chart-1": "color.signal.orange", "ring": "text.primary" } } }
  ]
}
```

A path that is not a token is the `blazon.shadcn/token-missing` error, and the variable falls back to its role. A `shadcn` key of its own in `blazon.json` is refused with `config-invalid`. Every variable in `unsupplied` is a question for the brand owner: do not pick a color for it. A shadcn project falls back to its own default for a variable you leave out, which is not the brand's.

When `pairs` is present, the brand declares contrast `pairs`, and each entry says whether one of them covers that shadcn pair (`declared`). A pair with `declared: false` is not an allowed pair: do not use it for text on a surface until the brand owner adds a rule or maps another token. This is a note in the data, not a finding, and the build does not fail on it. Where `pairs` is absent, the brand declares no pairs and there is nothing to compare.

Then write the CSS yourself, from the tokens: set each shadcn variable to `var(--path)` from `theme.css`, or to the `value` for a project that does not load it. Dark mode is yours too: `value` is the default context only. The tokens a context changes are in `contexts` of `brand.json` and in the CSS ([chapter 4](04-contexts.md)).

### shadcn v4: OKLCH, `.dark`, `@theme inline`, charts

A project made with shadcn/ui v4 writes its colors as `oklch(...)`, switches dark mode with a `.dark` class and hands the variables to Tailwind in an `@theme inline` block. Blazon's defaults differ on each point, and three options of `blazon.shadcn` close the gap. None changes the default output: a brand that sets none of them gets the same files as before.

**Tailwind v4 needs `themeInline`.** `shadcn.css` alone gives CSS variables and nothing else. Tailwind v4 makes a utility such as `bg-primary`, `text-foreground`, `border-border`, `ring-ring` or `bg-chart-1` only for a color named in an `@theme` block, so without `shadcn-theme.css` those classes generate no CSS (the background stays transparent) and `rounded-md` keeps Tailwind's own 6px (`0.375rem`) instead of the brand's radius. Set `"themeInline": true` and import both files after Tailwind, in this order:

```css
@import "tailwindcss";
@import "./dist/tokens/blazon.shadcn/shadcn.css";
@import "./dist/tokens/blazon.shadcn/shadcn-theme.css";
```

Checked with Tailwind 4.3.5 on a page of `<button class="bg-primary text-primary-foreground rounded-md border-border">Acme</button>`: with both files the compiled CSS has `.bg-primary { background-color: var(--primary); }` and `.rounded-md { border-radius: calc(var(--radius) * 0.8); }`; with `shadcn.css` alone it has no `.bg-primary` rule at all and `.rounded-md` reads Tailwind's `--radius-md: 0.375rem`. The default is still `false`, so a brand that does not use Tailwind v4 gets no extra file.

```json
{
  "contextSelectors": { "theme": ".{context}" },
  "plugins": [
    {
      "name": "blazon.shadcn",
      "options": { "format": "oklch", "themeInline": true, "chart": "color.chart", "variables": { "destructive": "color.signal.danger" } }
    }
  ]
}
```

- **OKLCH.** The plugin writes each token's value as authored, with no conversion, so a brand written in hex gives hex. `"format": "oklch"` writes `oklch(0.6 0.2 30)` for every color in `shadcn.css`, in `:root` and in each context block; `"hex"` writes `#rrggbb`. A color that sRGB cannot show is brought into sRGB for hex. A value that is not a color, such as a `var()`, stays as authored and is the warning `blazon.shadcn/format-unconverted`. `shadcn.json` keeps the authored value either way.
- **`.dark`.** The plugin has no selector option of its own: a context block uses the selector blazon gives the context, and the default for a `theme` modifier with a `dark` context is `[data-theme="dark"]`. The `contextSelectors` key in `blazon.json` above changes it to `.dark`, and then `shadcn.css` and `theme.css` both write `.dark { ... }` ([chapter 4](04-contexts.md#what-blazon-writes)). This is a key in the config, not an option of the plugin, so every output follows it.
- **`@theme inline`.** Required for Tailwind v4 (above). `"themeInline": true` also writes `shadcn-theme.css`: `@custom-variant dark (&:is(.dark *));`, then an `@theme inline` block with `--color-<name>: var(--<name>);` for each color variable `shadcn.css` supplies, and `--radius-sm`, `--radius-md`, `--radius-lg` and `--radius-xl` derived from `--radius` (`calc(var(--radius) * 0.6)`, `* 0.8`, `var(--radius)` and `* 1.4`), the lines shadcn v4's own scaffold writes. Import it beside `shadcn.css`, and delete the same lines from the project's `globals.css`. When the brand has no `radius` role token, `--radius` is shadcn's own. The `--radius-*` steps here come from the one `--radius`; a brand with its own `radius` group still takes the advice under "Weights, sizes and radius" below.
- **Charts.** `"chart": "color.chart"` fills `chart-1` to `chart-5` from the first five color tokens of that group, in the order the source lists them, so the brand's palette order is the chart order. A group with fewer than five is the warning `blazon.shadcn/chart-group-short`, and the variables it cannot fill stay in `unsupplied`. A `variables` entry for a chart variable wins over the group.

#### The clash warning

`destructive` has no theme role, so the brand picks its token, and a brand with one strong color often picks the same one it uses for `primary`. Then a delete button looks like the main action. The plugin's check role compares colors, not text (`#E00`, `#ee0000` and the same OKLCH are one color), in every context, and warns `blazon.shadcn/destructive-duplicate` when `destructive` equals `primary`, `accent` or `ring`:

```text
`destructive` ({color.signal.primary}, #2563eb) is the same color as `primary` ({interactive.primary}) in the default context: an error looks like a main action. Point `variables.destructive` at a color that differs from primary, or list the pair in `allowSame`.
```

The warning shows in `blazon check`, `blazon tokens`, `blazon build` and `blazon dev`. A brand that means it, such as a monochrome one with no red, silences exactly that pair: `"allowSame": { "destructive": "ring" }` (a list names several partners). A later change that makes `destructive` equal `primary` still warns.

### Weights, sizes and radius in shadcn's components

shadcn/ui's registry components hard-code Tailwind classes such as `font-medium` on a button. After the reset in `tailwind-reset.css` ([chapter 8](08-using-the-outputs.md#tailwind)), `font-medium` generates nothing unless the brand has a `fontWeight` token named `medium`: the reset removes every default weight when the brand has one. Do not keep the class and do not add a token for it. Set each component's weight and size from the brand's type role instead: use the brand's `.type-*` class from `typography.css`, or the variables of its `typography` token, such as `--type-button-font-weight` and `--type-button-font-size` (a token `type.button` writes `--type-button-font-*`, one per part). A brand's own weight token is the variable `--font-weight-<name>` (`--font-weight-heavy` for `font.weight.heavy`) in `theme.css`, and the utility `font-<name>` in `tailwind.css`. The same holds for `text-sm`, `rounded-md` and other size and radius classes: check each against what the brand defines.

For radius, `blazon.shadcn` writes `--radius` when the brand has a `radius` role token (`radius.default`, `radius.base` or `radius.md`, [chapter 7](07-theme-and-config.md)) and writes nothing else for it. The `--radius-sm`, `--radius-md` and `--radius-lg` lines that shadcn's own `globals.css` derives from `--radius` are shadcn's (the `themeInline` option writes the same lines, [above](#shadcn-v4-oklch-dark-theme-inline-charts)). When the brand has a `radius` group, `blazon.tailwind` writes the brand's steps as `--radius-<token name>` (`radius.card` is `--radius-card`), and the brand's scale is the one to use: delete shadcn's derived `--radius-*` lines, or keep one only for a step the brand does not define.

### Motion and easing

Blazon reads the DTCG `duration` and `cubicBezier` types, and `blazon.tailwind` writes each `cubicBezier` token as `--ease-*` (`motion.easing.mechanical` is `--ease-mechanical`). A brand that has durations and no `cubicBezier` token has not stated its easing. That is a question for the brand owner, not a curve to invent: shadcn's `ease-in-out` is not the brand's. The starter's `motion` tokens in `examples/blazon/tokens/form.json` state both, and its `transition` token joins a duration and an easing.

## The logo

Run `blazon logo` for the configured variants, the file of each and the rules of every logo asset, and `blazon rules` for the backgrounds that forbid a variant. `brand.json` has the same in `logo.onLight` and `logo.onDark`, paths beside the file. Use the `onLight` variant on a light surface and the `onDark` variant on a dark one. The logo's rules (clear space, minimum size, lockups) are in its sidecar, and a `minSize` there is the smallest size to show the file at (blazon cannot measure the size on your page, so keep to it yourself), shown in `assets[].meta` in `brand.json` ([chapter 6](06-assets-and-icons.md#sidecars)). A dimension there is in pixels of the artwork, and a rule written as `{ "units": 1 }` is a multiple of the sidecar's `unit`.

The colors inside a logo file are part of the file. Changing a color token does not recolor the logo.

## Check the result

`blazon check` checks the brand, not your site. Check the site yourself:

- For every text color and background in the site, ask `blazon can <text token> <background token>`. It exits 0 when the combination is allowed and 1 when it is not, and says which rule decided. When the brand lists pairs, a pair that is not listed is not allowed, even if it looks fine.
- For a focus ring, a border or an icon stroke, ask `blazon can <token> <background token> --role ui`. Those are not text, so the brand's text pairs do not apply and the bar is the 3:1 contrast of WCAG 1.4.11. Without `--role ui` such a check reports a text pair and can deny a combination that is fine.
- For a site with a dark theme, ask in each theme: `blazon can text.primary surface.canvas --theme dark`. Without `--theme` the answer is for the default tokens, whatever the page paints under `[data-theme="dark"]`.
- Look for a denied color in a text role, and a denied logo on a surface.
- Open the site at a phone width and at a desktop width, and compare it with the brand's own pages.

## When a token changes

Run `blazon tokens` in the brand folder and rebuild the site. `blazon tokens` writes the CSS, TypeScript and JSON outputs but not `dist/site/brand.json`, which only `blazon build` writes; for the other data in it, run `blazon brand` (or `blazon brand --key theme.roles`), which compiles the brand again each time. The plugins' folders under `dist/tokens/` are rewritten by `blazon tokens` as well. If the site follows the tokens and nothing is hard-coded, no site file needs an edit.

## What the brand has to say, and you must not invent

Some decisions belong to the brand, not to the code. If the brand's pages do not state one, ask the brand owner. Do not copy it from another brand.

- Which text style each part of a page uses, and the spacing between sections and the widest line.
- What a button and a card look like, and what they do on a dark surface.
- Which surface goes with which kind of section, and whether there is a dark mode.
- Where the logo goes and the smallest size it may be shown.
- What images to use, and the voice of the copy.
- What the brand never does on the web.

When the brand has a Web page, two of its rules matter for text. The longest line the page allows (the starter's is 64 characters) is a measure for the container that holds the text, not a text style, so no `.type-*` class sets it. `type.label` in the starter is for labels, navigation and token paths and numbers, not for running text or buttons. Commands and file excerpts take `type.code`, not `type.small` with the mono family.

A brand can write these in a page of its `docs/`, for example one called Web, so the next person does not have to ask. When the brand has a Web page, read it first and follow it: blazon's own starter has one, `docs/12-web.md`, which answers each of the questions above.

## Ask blazon as tools

A coding agent can call the read commands above as MCP tools instead of running them: `list_tokens`, `get_token`, `get_rules`, `can_use`, `get_fonts`, `get_logo` and `check_brand`. `list_tokens` is `blazon list`: it finds a token path. [Chapter 20](20-blazon-for-agents.md) says how to start the server.
