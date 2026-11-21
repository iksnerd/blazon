# blazon.brand-deck

The plugin blazon ships to draw the brand as a PDF deck of 16:9 slides (960 by 540 pt): a cover and contents, each logo with its clear space drawn and its rules written out, the palette with HEX, RGB, CMYK, Pantone and RAL, the gradients, the typefaces and the type scale, the brand book's pages as dividers with the asset slides and figure grids their directives list, and, when `blazon.favicons` has drawn its set, a Favicons part. It fills the `build` role and writes `brand-deck.pdf` in `out_dir`. It is TypeScript on blazon's own npm dependencies (`playwright-core`, `pdf-lib`), so it needs Node and a Chrome (`BLAZON_CHROME`, or the Google Chrome installed on the computer), and nothing else: no Python, no uv, no network.

The source is `src/shipped/brand-deck/`, and `npm run build` (`npm run build:plugins`) bundles it, with the blazon code it uses, into `bin/blazon-blazon.brand-deck.🔌`, the one file that holds the plugin's code and that `plugins/shipped.lock` pins. The program loads `playwright-core` and `pdf-lib` from `node_modules` when it runs; that is outside the pin.

## How it draws

The slide plan (`src/shipped/brand-deck/plan/`) is plain data from `brand.json`: which slides, in which order, with what on them. The drawing (`src/shipped/brand-deck/paint/`) turns each slide into HTML placed in points, and `render.ts` prints that page to PDF with Chrome, one slide to a page. Text and SVG stay vector. Every line of text is broken by the plugin and not by the browser, using the browser's own measure of each word, so an asset's text is fitted to its slide, and a long one continues on slides titled "(continued)", by the same arithmetic that draws it.

A logo with several files (`logos/mark.svg` and `logos/mark.png`) is one slide, drawn from the best format the deck can embed: SVG, then PNG, WebP, JPEG, GIF and AVIF. Images are read from `site_dir`, beside `brand.json`. A file that cannot be read is exit `2` naming it, unless its category is kept out of git (`local` in the category): then the slide shows the category's sentence in place of the picture.

## Fonts

The deck sets its titles in the brand's display family and its text in the body family when it has their files, and in the computer's Helvetica (or Arial) otherwise, naming the typeface on the slide. It never downloads a font, and ignores the web addresses in the config's `fonts`. It has fonts from two places:

- the font files in the project's `fonts` config, which blazon embeds in `brand.json` (`theme.fonts`) as `data:` stylesheets: `.ttf`, `.otf`, `.woff` and `.woff2`;
- TrueType and OpenType files in the folders `BLAZON_DECK_FONTS` names (separated as a PATH is).

A font is known by the family and weight it says it has, not by its file name. Variable fonts, italics, collections and fonts whose license forbids embedding are not used, and standard error says which and why. Text is not limited to Latin-1: any character the font has is drawn.

## Options

| `options` | |
|---|---|
| `skip` | A list of asset categories to leave out, such as `["favicons-supplied"]`. `"logos"` leaves out the logo slides. |

A name that is no category of the brand is a `warning` finding, `blazon.brand-deck/skip-unknown`, and so is an option the deck does not know (`option-unknown`) or one of the wrong shape (`option-invalid`); the deck is drawn without it. A PDF with other than the planned number of pages is the `warning` `blazon.brand-deck/page-count`.

## Favicons

The deck finds the favicon set where `blazon.favicons` leaves it, `<tokensOutDir>/blazon.favicons`, so list `blazon.favicons` before `blazon.brand-deck`. A `favicons.json` that is there and damaged is exit `2` naming the file; a set for a symbol the brand does not have is said on standard error and left out.

## Exit status and the command line

It exits `2` with the reason as the first line of standard output, and writes nothing, when the request is wrong, when a file the deck needs cannot be read, and when it finds no browser. The same input gives the same bytes on the same computer: the dates and the producer the browser writes are fixed.

Given arguments, it is a command line: `blazon-blazon.brand-deck brand.json -o deck.pdf [--favicons DIR] [--skip CATEGORY]... [--fonts DIR]...` (exit `0`; `1` for a file the deck needs; `2` for input that is not a blazon brand). The brand must be a file, not a URL.
