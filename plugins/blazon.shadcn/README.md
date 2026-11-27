# blazon.shadcn

The plugin blazon ships to write which token each shadcn/ui variable takes, and those variables as CSS. It fills the `build` role and the `check` role (a warning when `destructive` is the same color as `primary`, `accent` or `ring`), and needs only Node: no browser. It reads `brand.json` through the plugin protocol and nothing else, and it reads no site, so `blazon tokens` runs it as well as `blazon build`. Blazon's core knows no UI library by name.

The source is `src/shipped/shadcn/`, and `npm run build:plugins` bundles it, with the blazon code it uses, into `bin/blazon-blazon.shadcn.🔌`, the one file that holds the plugin's code and that `plugins/shipped.lock` pins. It loads nothing from `node_modules`. The manual's plugins chapter says what to put in the config, and chapter 19 how to use the files.

## What it writes

To `<tokensOutDir>/blazon.shadcn/` (`dist/tokens/blazon.shadcn/`):

| File | Holds |
|---|---|
| `shadcn.json` | For each shadcn variable blazon supplies, the token it takes, its value in the default context and where the pick came from (`theme` or `config`); `unsupplied`, the variables nothing supplies; and, when the brand declares contrast `pairs`, `pairs`, each shadcn text-on-surface pair with whether a rule covers its two tokens |
| `shadcn.css` | A `:root` block with each supplied variable, and a block under the selector of each other context for the variables that context changes |
| `shadcn-theme.css` | Only with `themeInline`: `@custom-variant dark` and an `@theme inline` block of `--color-<name>` lines and the `--radius-*` steps, for Tailwind v4 |

A variable takes its value from the theme role it reads (`background` for `--background`, `accent` for `--primary`, and so on, the same picks the brand book's own components use), or from the token the `variables` option names for it. `destructive` and `chart-1` to `chart-5` have no role, so only the option fills them.

## Options

- `variables`: an object of shadcn variable names (without the leading dashes) to token paths. A pick wins over the role.
- `format`: `"as-authored"` (default), `"oklch"` or `"hex"`, the notation of the colors in `shadcn.css`.
- `themeInline`: `true` also writes `shadcn-theme.css`. Default `false`. Tailwind v4 needs it: with `shadcn.css` alone, `bg-primary`, `text-foreground`, `border-border`, `ring-ring` and `bg-chart-*` generate no CSS and `rounded-md` keeps Tailwind's 6px. Import both files after Tailwind:

```css
@import "tailwindcss";
@import "./dist/tokens/blazon.shadcn/shadcn.css";
@import "./dist/tokens/blazon.shadcn/shadcn-theme.css";
```
- `chart`: a token group path whose first five color tokens fill `chart-1` to `chart-5`. A `variables` pick wins.
- `allowSame`: `{ "destructive": "primary" }`, a pair the clash warning skips (`primary`, `accent` or `ring`, or a list).

## Findings

| Code | Severity | When |
|---|---|---|
| `blazon.shadcn/token-missing` | error | A pick in `variables` names a path that is not a token; the variable falls back to its role |
| `blazon.shadcn/option-invalid` | error | An option is not one of the above or has the wrong kind of value, or `variables` names a variable shadcn does not have |
| `blazon.shadcn/format-unconverted` | warning | `format` is `oklch` or `hex` and a value is not a color; the authored value is kept |
| `blazon.shadcn/chart-group-short` | warning | The `chart` group has fewer than five color tokens |
| `blazon.shadcn/destructive-duplicate` | warning | `destructive` is the same color as `primary`, `accent` or `ring` in a context (check role) |
