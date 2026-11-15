# blazon.platform-tokens

The plugin blazon ships to write a brand's color and dimension tokens as native files for apps: Android resources, an iOS Swift file with an asset catalog, and Jetpack Compose Kotlin. It fills the `build` role and needs only Node: no browser. It reads `brand.json` through the plugin protocol and nothing else, so a new output format needed no change in blazon's core.

The source is `src/shipped/platform-tokens/`, and `npm run build` (`npm run build:plugins`) bundles it, with the blazon code it uses, into `bin/blazon-blazon.platform-tokens.🔌`, the one file that holds the plugin's code and that `plugins/shipped.lock` pins. It loads nothing from `node_modules`, so the pin covers all the code it runs, apart from Node itself. The manual's plugins chapter says what to put in the config, what the plugin writes, how to use each file and what each finding means.

## What goes where

| File | Holds |
|---|---|
| `android/values/colors.xml` | `<color name="color_brand_primary">`, `#RRGGBB` or `#AARRGGBB` |
| `android/values-night/colors.xml` | The colors the dark context changes |
| `android/values/dimens.xml` | `<dimen>` in dp: a px is 1 dp, a rem is 16 |
| `ios/BlazonTokens.swift` | `public enum BlazonColors` (SwiftUI `Color`) and `BlazonDimensions` (`CGFloat`); a color the dark context changes follows the system appearance |
| `ios/Colors.xcassets` | A colorset for each color, with a dark appearance where the dark context changes it |
| `compose/Colors.kt`, `compose/Dimens.kt` | `BlazonColors`, `BlazonDarkColors` (every color, dark where the dark context sets one, so the whole object can be swapped) and `BlazonDimens` (`Dp`) |

Only `color` and `dimension` tokens are written; any other type is named once in a `tokens-skipped` finding. A token's value is its resolved value, so an alias is written with the value it points at and keeps its own name. Colors are converted to sRGB with colorjs.io, with alpha kept.

## Checked with the platform tools

The Swift file type-checks with `swiftc -typecheck` for macOS 10.15 and iOS 13, and the asset catalog compiles with `actool`. Kotlin is not compiled; it is written against the Compose `Color(Long)` and `Dp` API.
