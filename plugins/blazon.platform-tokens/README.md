# blazon.platform-tokens

The plugin blazon ships to write a brand's color and dimension tokens as native files for apps: Android resources, an iOS Swift file with an asset catalog, and Jetpack Compose Kotlin. It fills the `build` role and needs only Node: no browser. It reads `brand.json` through the plugin protocol and nothing else, so a new output format needed no change in blazon's core.

The source is `src/shipped/platform-tokens/`, and `npm run build` (`npm run build:plugins`) bundles it, with the blazon code it uses, into `bin/blazon-blazon.platform-tokens.🔌`, the one file that holds the plugin's code and that `plugins/shipped.lock` pins. It loads nothing from `node_modules`, so the pin covers all the code it runs, apart from Node itself. The manual's plugins chapter says what to put in the config, what the plugin writes, how to use each file and what each finding means.

## What goes where

| File | Holds |
|---|---|
| `android/values/colors.xml` | `<color name="color_brand_primary">`, `#RRGGBB` or `#AARRGGBB` |
| `android/values-night/colors.xml` | The colors the dark context changes |
| `android/values/dimens.xml` | `<dimen>` in dp: a px is 1 dp, a rem is 16 |
| `ios/BlazonTokens.swift` (`ios/<Prefix>Tokens.swift` with a `prefix`) | `public enum BlazonColors` (SwiftUI `Color`) and `BlazonDimensions` (`CGFloat`); a color the dark context changes follows the system appearance |
| `ios/Colors.xcassets` | A colorset for each color, with a dark appearance where the dark context changes it |
| `compose/Colors.kt`, `compose/Dimens.kt` | `BlazonColors`, `BlazonDarkColors` (every color, dark where the dark context sets one, so the whole object can be swapped) and `BlazonDimens` (`Dp`) |

`color` and `dimension` tokens are written, and from a `border` token its width, as a dimension named `<token path>.width` (`border.rule` is `border.rule.width`: `border_rule_width` on Android, `borderRuleWidth` in Swift and Kotlin). The border's colour is not written (it is a colour token or a hex in the composite) and its style is not carried: a style other than `solid` gets one `border-style-dropped` info finding for the token. A width that is not in px or rem is a `dimension-unreadable` warning and the token is left out. `include` and `exclude` match the border token's own path (`border.rule`), not `.width`. Any other type is named once in a `tokens-skipped` finding. That leaves out typography, fontFamily, fontWeight, shadow, gradient, duration, cubicBezier, transition and number tokens. A token's value is its resolved value, so an alias is written with the value it points at and keeps its own name. Colors are converted to sRGB with colorjs.io, with alpha kept.

## Checked with the platform tools

The Swift file type-checks with `swiftc -typecheck` for macOS 10.15 and iOS 13, and the asset catalog compiles with `actool`. Kotlin is not compiled; it is written against the Compose `Color(Long)` and `Dp` API.

## Options

| Option | Default | Does |
|---|---|---|
| `platforms` | `["android", "ios", "compose"]` | Any of those three |
| `dark` | the context named `dark` | The name of the context that is the dark appearance |
| `prefix` | none | Letters and digits, starting with a letter. See "What the prefix reaches" |
| `include` | none (every token) | A list of token path prefixes in dot form; only the tokens under one of them are written |
| `exclude` | none | A list of token path prefixes in dot form; the tokens under one of them are not written. Applied after `include` |

`include` and `exclude` take path prefixes, not patterns: no glob, no regular expression. An entry matches a token when its names, split at the dots, are the first names of the token's path, compared as plain text one by one. `["breakpoint", "component.button.website"]` matches `breakpoint.md` and every token under `component.button.website`, and does not match `breakpoints.x`. Each name is letters, digits, `_` and `-`, and a list holds 1 to 100 entries (an empty list is refused, it would write nothing); anything else is an `option-invalid` finding and the option is ignored. They apply to colors, dimensions and the dark context, in every output. An entry that matches no token of the brand is not an error: a `filter-unmatched` info finding names it, so a typo shows. A token left out by `include` or `exclude` is not counted in `tokens-skipped`.

```json
{
  "plugins": [
    { "name": "blazon.platform-tokens", "options": { "prefix": "Acme", "exclude": ["radius"] } }
  ]
}
```

Run on blazon's own example brand with this entry, `blazon tokens` writes the same 39 files as with no options except for the iOS names below, and no `radius.*` dimension in any output.

## What the prefix reaches

Checked by running the plugin on the example brand with and without `"prefix": "Acme"` and comparing the two file trees and the names in them.

| Output | Reached | With `Acme` |
|---|---|---|
| `android/values/colors.xml`, `values-night/colors.xml`, `dimens.xml` | Yes, first in each resource name | `acme_social_format_square_height` |
| `ios/` Swift file name | Yes | `AcmeTokens.swift` (`BlazonTokens.swift` with no prefix) |
| `ios/Colors.xcassets` colorset names | Yes, the prefix in lowerCamel in front of the Swift name | `acmeSignalOrange.colorset` |
| Swift types | Yes | `AcmeColors`, `AcmeDimensions` |
| Kotlin objects | Yes | `AcmeColors`, `AcmeDarkColors`, `AcmeDimens` |
| Names of the members of the Swift and Kotlin types | No, the type already says it | `AcmeColors.signalOrange` |
| Kotlin `package` line | No | `package blazon.tokens` |
| `README.txt` | Only the Swift file name it mentions | `add AcmeTokens.swift and Colors.xcassets ...` |

The Kotlin package stays `blazon.tokens` with any prefix. The Kotlin files are meant to be copied into your module and the package line set to yours (the file says so in `README.txt`), so the plugin does not guess a package name, and a second option for it is not worth the surface. With no prefix every file is byte-identical to what earlier versions wrote.

## Names

One token has a name for each output, from its dotted path. Android keeps every segment; the others drop a leading `color` segment of a color token, because the type or the catalog says it is a color. Take the color `color.brand.primary` and the dimension `space.4` with the prefix `Acme`:

| Output | Color | Dimension | Rule |
|---|---|---|---|
| Android resource | `acme_color_brand_primary` | `acme_space_4` | prefix, then every segment, lower snake case |
| Swift member | `brandPrimary` | `space4` | lowerCamel, leading `color` dropped |
| Kotlin member | `brandPrimary` | `space4` | as Swift |
| Asset catalog colorset | `acmeBrandPrimary` | none | prefix in lowerCamel, then the Swift name |

So one color is `acme_color_brand_primary` on Android and `brandPrimary` elsewhere; that is deliberate and the names are not changed. Without the prefix the Android name has no `acme_`, and the colorset is `brandPrimary`. The longer rules (digits, keywords, collisions) are in the manual.

## Not written

Typography, fontFamily, fontWeight, shadow, gradient, duration, cubicBezier, transition and number tokens are not written, and nor is the colour or style of a `border` token (its width is); the build names the skipped types in one `tokens-skipped` finding.
