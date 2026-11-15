# blazon.press-kit

The plugin blazon ships to pack what an outsider needs from a brand: the logos that are ready to share, the colors, the fonts, the boilerplate and a one-page PDF, in one folder and one zip. It fills the `build` role. Everything but the PDF needs only Node; the PDF needs a Chrome (`BLAZON_CHROME` names one, else the Google Chrome installed on the computer), and without one the plugin writes the rest and says so in a finding.

The source is `src/shipped/press-kit/`, and `npm run build` (`npm run build:plugins`) bundles it, with the blazon code it uses, into `bin/blazon-blazon.press-kit.🔌`, the one file that holds the plugin's code and that `plugins/shipped.lock` pins. The program loads `playwright-core` and `pdf-lib` from `node_modules` when it runs; that is outside the pin. The zip writer is `src/shipped/shared/zip.ts`, which `blazon.office-template` uses too. The manual's plugins chapter says what to put in the config, what the plugin writes and what each finding means.

## What goes in the kit

| Part | From the brand |
|---|---|
| `logos/` | Assets that are logos (the `logos` category, or the files `logo.onLight` and `logo.onDark` name), as they are, in a folder for each background their sidecars name |
| `colors/` | The color tokens that are not aliases, as JSON, CSS and text; CMYK, Pantone and RAL only where a token states them |
| `fonts.txt` | The families of `fontDisplay`, `fontBody`, the font tokens and the font stylesheets; the source and license only where a font token states them (its `font` extension) or the data has them, else `not stated` |
| `about.txt` | `brand.title` and `brand.description`; without one, a line saying none is set |
| `press-kit.pdf` | The title, the description, up to ten colors and one logo, drawn in Chrome |

A logo marked `needs-review`, and a generated logo with no `review`, are left out, with a finding for each. A color token marked `needs-review` is left out too, unless the `unreviewed` option is `true`, which includes it labelled as unreviewed.
