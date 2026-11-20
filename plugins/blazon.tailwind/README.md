# blazon.tailwind

The plugin blazon ships to write a brand's tokens as a Tailwind v4 theme. It fills the `build` role and needs only Node: no browser. It reads `brand.json` through the plugin protocol and nothing else, and it reads no site, so `blazon tokens` runs it as well as `blazon build`. Blazon's core knows no CSS framework by name.

The source is `src/shipped/tailwind/`, and `npm run build:plugins` bundles it, with the blazon code it uses, into `bin/blazon-blazon.tailwind.🔌`, the one file that holds the plugin's code and that `plugins/shipped.lock` pins. It loads nothing from `node_modules`. The manual's plugins chapter says what to put in the config, and chapter 8 how to use the files.

## What it writes

To `<tokensOutDir>/blazon.tailwind/` (`dist/tokens/blazon.tailwind/`):

| File | Holds |
|---|---|
| `tailwind.css` | An `@theme` block with a variable for each token that fills a Tailwind namespace: colors, font families, font sizes, font weights, radii, spacing, shadows, easings and the default transition duration |
| `tailwind-reset.css` | An `@theme` block that sets `initial` on each namespace the brand fills, so only the brand's values remain |

A brand with no token in any namespace gets neither file. The plugin takes no option.

## Findings

| Code | Severity | When |
|---|---|---|
| `blazon.tailwind/variable-duplicate` | error | Two tokens with different values write one Tailwind variable (`color.brand` and `colors.brand` are both `--color-brand`); `tailwind.css` keeps the first |
| `blazon.tailwind/option-invalid` | error | The entry gives an option, or `options` is not an object |
