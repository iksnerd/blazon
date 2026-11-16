# brand.json for other tools

← [Manual index](index.md)

`blazon build` writes one more file next to the site: `brand.json`. It holds the whole brand: the tokens with their rules, the pages, the assets with what their sidecars state, the theme and the findings. It is for a tool that is not part of blazon, in any language: a script that draws a slide deck, a linter, another site generator. If you only want CSS or TypeScript, you do not need it: see [Using the outputs](08-using-the-outputs.md).

## Where it is

| Where | How |
|---|---|
| `dist/site/brand.json` | `blazon build` writes it. Publish the site, and it is at `https://your-site/brand.json` |
| `/brand.json` on the dev server | `blazon dev` answers it with the brand as it is now, compiled again on every request, so you can write a tool against a running dev server |

Every `file` and `dir` in it is a path beside `brand.json`: `brand-assets/logos/mark.png` is at `dist/site/brand-assets/logos/mark.png`, and at the same address on the web. Read the files from the same folder or the same URL.

A token's or page's `sourceFile` is different: it names the project file the entry was written in, such as `tokens/colors.json`, and that file is not published.

To read it without a build, run `blazon brand`: it prints the same document, compiled now, and writes nothing. `blazon brand --key theme.roles` prints one part by its dotted path. Paths to files in it are the ones a build would write beside `brand.json`, so they exist only after `blazon build`.

## What is in it

| Key | Holds |
|---|---|
| `$schema` | `brand.schema.json`: the [schema](#checking-a-file) the file follows, a path beside it |
| `format`, `version` | `"blazon-brand"` and a whole number. Check both before you read anything else |
| `generator` | Which blazon wrote the file: `name` (`"blazon"`), `commit` (the 40-digit commit of that blazon) and `dirty` (it had uncommitted changes). `commit` and `dirty` are left out when that blazon cannot say its commit; they are never guessed. There is no timestamp and no host, so the file is the same for the same inputs and the same blazon. Do not rely on what it says |
| `brand` | The title and description |
| `theme` | The viewer roles' values (`roles`), the token each came from (`tokens`), the font stylesheets (`fonts`), and `shadcn`: the [shadcn/ui](19-building-a-website.md#using-shadcnui) variables, each with its token and value in the default context, and the ones nothing supplies |
| `logo` | `onLight` and `onDark`: a path beside the file. A logo that is not in `assets/` is embedded as a data URI instead, so it is never missing. `onLightInk` and `onDarkInk`, when that logo's sidecar declares an `ink`: its color as a CSS color. Without one, read the file as black on light and white on dark |
| `vocabulary`, `sections` | The lockups and usage roles a value may name, and every section a page may declare with its title and whether it is standard: the standard ones first, then yours ([adding your own names](07-theme-and-config.md#adding-your-own-names)) |
| `tokens` | Every token once: its path, type, CSS value, resolved value, how it was authored, the CSS variable, and its `dev.blazon` rules as `blazon` (print values, usage, source, review flags) |
| `groups` | Groups with rules: proportions, contrast pairs, patterns |
| `modifiers`, `contexts` | The [contexts](04-contexts.md): each non-default one with only the tokens it changes (`tokens`), the tokens that keep the default's value but say something else, such as another description or an alias to another token with the same value (`metadataChanges`, absent when there are none), and its CSS selector |
| `pages` | Each page's front matter, the `sections` it holds (a list of ids from the file's own `sections`, empty when none), its Markdown, and the [directives](05-pages.md#directives) in it, in order. A directive inside a code fence is not listed |
| `assets` | Each asset's id, file, format, size in pixels (numbers), and `meta`, which is its [sidecar](06-assets-and-icons.md#sidecars): title, description, traits, dos and don'ts, the logo rules, its `order` and any `extensions` kept as written |
| `categories` | Each asset category with its label, order, description, [rules](06-assets-and-icons.md#asset-categories), what its guidelines leave unspecified and where they say so, and `experimental: true` when it holds [explorations](06-assets-and-icons.md#experimental-categories) or `reference: true` when it holds [reference material](06-assets-and-icons.md#reference-categories) |
| `iconSets` | Each [icon set](06-assets-and-icons.md#icon-sets) and `dir`, the folder of its SVGs |
| `findings` | What `blazon check` found |

## Lengths in units

A logo's rules may be written as a multiple of its unit: `{ "units": 1 }` for "one star". The pixels are the multiple times the asset's `meta.unit`, in the artwork's own pixels. A rule written as a dimension is already in pixels, and a `rem` is 16 pixels.

## Checking a file

`blazon build` writes the JSON Schema of `brand.json` beside it, as `brand.schema.json`, and `blazon dev` serves it at `/brand.schema.json`. The schema is [draft 2020-12](https://json-schema.org/draft/2020-12), so any validator can check a file against it, and an editor that reads the `$schema` key at the top of `brand.json`, such as VS Code, checks it as you read.

```python
# pip install jsonschema
import json
from jsonschema import Draft202012Validator

brand = json.load(open("dist/site/brand.json", encoding="utf-8"))
schema = json.load(open("dist/site/brand.schema.json", encoding="utf-8"))

for error in Draft202012Validator(schema).iter_errors(brand):
    print("/".join(map(str, error.path)) or "(top level)", error.message)
```

It prints nothing when the file is valid, and one line for each mistake otherwise.

The schema refuses a `format` that is not `blazon-brand`, a `version` other than 1, a missing key, and a `file` or `dir` that is absolute, is a URL, or leaves the folder with `..`. It also refuses `file` on a token or page: that name always means a path beside `brand.json`, and those entries use `sourceFile`. It allows keys it does not know, because a later blazon may add them. The same schema is in the repository at [`src/core/brand/brand.schema.json`](../../src/core/brand/brand.schema.json).

## Reading it

Python's standard library is enough. [`scripts/read-brand.py`](../../scripts/read-brand.py) loads a file or a URL and prints a summary, and it is a short place to start a tool of your own:

```python
import json

with open("dist/site/brand.json", encoding="utf-8") as handle:
    brand = json.load(handle)

assert brand["format"] == "blazon-brand" and brand["version"] == 1

for token in brand["tokens"]:
    if token.get("type") == "color":
        print(token["path"], token["value"], (token.get("blazon") or {}).get("print", {}))
```

Ignore keys you do not know. A later blazon may add keys without changing `version`. The `version` changes only when a key is removed or changes meaning, and then your reader should refuse the file, as `read-brand.py` does, and say which version it found.

## Drawing a deck

[`blazon.brand-deck`](14-shipped-plugins.md#blazonbrand-deck), a plugin that ships with blazon, turns a `brand.json` into a 16:9 PDF, for a review meeting or a printout. It draws the slides as web pages and prints them with Google Chrome (or the browser `BLAZON_CHROME` names), as `blazon.print-book` does, so it needs Node and a Chrome and nothing else: no Python, no uv and no network. Allow it by name in `blazon.json`, and `blazon build` writes `dist/tokens/blazon.brand-deck/brand-deck.pdf`. From a checkout of blazon, built with `npm run build`, its program is also a command line:

```bash
plugins/blazon.brand-deck/bin/blazon-blazon.brand-deck.🔌 dist/site/brand.json -o deck.pdf
```

The brand must be a file, with its images beside it, as `blazon build` writes them.

The deck follows the brand book. Each page of the book is a part of the deck, in the book's page order, and the slides that come from tokens and logos sit under the page whose section they belong to: the logo slides under the page for the `logo` section, the swatches and gradients under `color`, the typefaces and type scale under `typography`. If two pages share a section, the first takes the slides. Token slides that no page claims come last, in parts called Logo, Colors and Typography, so a brand with no pages gets exactly those three.

| Slide | Shows |
|---|---|
| Cover and contents | The title, the description, the logo, and the slide each page starts on. A long contents list is set smaller, in columns |
| A page | A divider with the page's title and its `description`, and below them what the guidelines leave open in each category the page's sections name (`Not specified: Photography`, the list, and the category's source), as far as there is room |
| Logo, one per logo asset | The logo on its background with its clear space drawn as a dashed line, titled by its sidecar `title` or else its readable name, and its sidecar rules written out: lockup, clear space in pixels, minimum and maximum size, the logo to use below a size, placement, partnership (a partnership with no divider says `no divider`) |
| Colors, up to three groups on a slide | Each group of colors is a row under its own heading and note: a swatch for each color that is not an alias, with its HEX, RGB, CMYK, Pantone and RAL values. A group is never split unless it has more than eight colors, and then it has slides of its own, eight to a slide. Two groups that end in the same name are told apart by the name before it (`Hue yellow`, `Product yellow`) |
| Gradients | Each gradient drawn from its stops at its angle, with the stops written out |
| Typefaces and type scale | Each family with its font stack, and a family the brand book cannot load says so. Each text style as a sample with its family, size, line height, weight and tracking, split evenly over as many slides as their height needs |
| Favicons, the last part | When [`blazon.favicons`](14-shipped-plugins.md#blazonfavicons) has drawn its set: a divider, then a slide for each of its three views (browser tabs, app-icon masks, iOS sizes), the table of its files with the head snippet and the colors under it (on a slide of their own when the table or the snippet is too long for one). Read from `favicons.json` in the plugin's folder, as below |
| An asset of a section | For each asset a [`blazon:section`](05-pages.md#sections) directive of the page lists, in the page's order: its image, and its sidecar title, description, traits, dos and don'ts and source line. All of the text is drawn, as below |
| A grid of figures | For the assets a [`blazon:assets`](05-pages.md#directives) directive of the page lists, in the page's order among its other asset slides: a grid of figures, each picture with its title under it, as the web book shows them. See below |

No text on a slide is set smaller than 10 points, which is about the least that can be read when a deck is projected; the footer, sources and notes are 10. The last line of a slide's body, a note or a source is at least 24 points above the footer, so a note never sits against it. Where a slide is short of room it holds less (a slide of colors has fewer groups, a head snippet that would be cut has a slide to itself, and typefaces that do not fit one slide go on slides titled `Typefaces (1 of 2)` and so on, shared evenly) and the type stays at 10. A section with nothing to show is left out, so a brand with no gradients has no Gradients slide. The deck draws the data of a page and not its prose: the paragraphs, tables and code of the Markdown are not in it, and neither are the other directives (`blazon:tokens`, and `blazon:logo-lockups` and the other logo directives: an asset category that a page names only with one of those has no slides after its divider; list it with `blazon:section` or `blazon:assets` to have them).

**A grid of figures.** A page that shows its assets with `blazon:assets` shows several to a page of the book, so the deck shows several to a slide: a grid of at most six figures, three to a row, each picture fitted into its cell (never cropped, never stretched) and sitting on the row's baseline with its sidecar `title` under it, centred; a title that needs more than two lines ends in `...`. The slide is titled by the heading above the directive in the page's Markdown (the nearest one, of any level; the page's title when there is none). Directives next to each other under one heading, with only text or directives other than `blazon:section` between them, are one run of figures. How many go on a slide follows their proportions: as many as keep every picture at least about 126 by 126 points, so three tall posts (9:16, 4:5), up to six squares, two wide banners (stacked in rows when they are as wide as 4:1). The figures keep the order the directive gives, and more than a slide holds go on slides titled `<heading> (continued)`. A picture on a dark ground (`background: dark` in its sidecar) is drawn on the dark color. Unlike an asset of a section, a figure has only its picture and its title: its description, traits and rules are not drawn; use `blazon:section` for those.

An asset that a `blazon:section` of the same page draws is not drawn again in a grid of that page, wherever the two directives are: its slide of its own says more, and the same picture twice on a page of the deck is noise. A second mention of an asset in a later grid of the page is drawn once, too. The same asset on another page is drawn again, because that page is another part of the book. A category in the plugin's `skip` option (below) has no grid slides either. A brand whose pages hold no `blazon:assets` directive gets the deck it always had, byte for byte.

**An asset's slide fits all of its text.** The image is on the left and the text on the right, at 12 points in the standard layout. When the description, traits, dos and don'ts and source do not fit, the deck changes the layout before it cuts anything, in this order: the traits become one line, Do and Don't go side by side where there is room, the image panel narrows (a tall image's panel is no wider than the image, so the text gets the room), and the text goes down to 11 and then 10 points. An asset that still does not fit has its image and description on its slide and the rest on a slide titled `<title> (continued)`, with the text across the whole slide, Do and Don't together. A single item longer than a whole slide is cut between its lines. Nothing is left out, and the contents counts the added slides. A Do, a Don't and a list of what the guidelines leave open are real lists: each item is one list item with a bullet in the margin, so a line that wraps starts under the text and not under the bullet, and the bullet is not a character of the text (a PDF text export has no "-" before each item). The source line is wrapped to the text's column, with room kept for it below the lists. The source line of a divider is wrapped to the list's width in the same way.

**As a plugin.** Blazon draws the deck in every `blazon build` as a [build plugin](13-writing-a-plugin.md#the-build-role) named `blazon.brand-deck`, which blazon ships: allow it with `plugins: [{ name: 'blazon.brand-deck' }]` and there is nothing to pin or install. `blazon build` then writes `dist/tokens/blazon.brand-deck/brand-deck.pdf`, with the images read from the built site. The same `brand.json` gives the same PDF, byte for byte, on one computer.

**Leaving asset categories out.** A category marked `reference: true` or `experimental: true` in `brand.json` is always left out of the deck, with no option needed. An otherwise ordinary category that you do not want in the deck, such as a set that was supplied and is not used, still costs a slide for each asset, or a place in a grid, when a page lists it. Name it in the plugin's `skip` option and the deck leaves it out: its asset slides and grid figures, and what the guidelines leave open for it on the divider. The page's divider and everything else stay.

```json
{
  "plugins": [ { "name": "blazon.brand-deck", "options": { "skip": [ "favicons-supplied" ] } } ]
}
```

On the command line it is `--skip favicons-supplied`, repeatable. A name is an asset category of the brand (a folder of `assets/`); `logos` leaves out the logo slides. A name that is no category is a warning, `blazon.brand-deck/skip-unknown`, and the deck is drawn without leaving anything out for it. A `skip` that is not a list of names is `blazon.brand-deck/option-invalid`, any other option is `blazon.brand-deck/option-unknown`; both are warnings and the deck is still drawn. The command line says the same on standard error.

**The favicons part.** `brand.json` does not say where a plugin wrote its files, so the deck looks where blazon puts them: as a plugin it reads `favicons.json` from `<tokensOutDir>/blazon.favicons/`, beside its own folder. A short head snippet is set under the table of files; one with a line of more than 70 characters has a slide of its own, so that no line is cut. List `blazon.favicons` before `blazon.brand-deck` in `plugins`, because they run in that order and the deck reads what the first left. On the command line, name the folder: `--favicons dist/tokens/blazon.favicons`. A folder with no `favicons.json` (the plugin is not used, or failed) adds no part. A `favicons.json` that is not format `blazon-favicons` version 1, or that names a view outside its own folder, stops the deck with the reason. One drawn for a symbol the brand does not have (the folder is left from another build) is said on standard error and left out. Remove the folder when you stop using the plugin: blazon empties it at each run of the plugin, never otherwise.

**In the brand's own typefaces.** The deck is set in the fonts the project's [`fonts` config](07-theme-and-config.md#logo-and-fonts) embeds: `brand.json` carries them in `theme.fonts`, and the deck reads them from there, whether the files are `.ttf`, `.otf`, `.woff` or `.woff2`. A web address in `fonts` (Google Fonts, say) is never fetched: the deck makes no network call, so a brand that loads its fonts from the web gives the deck the files as well, in the config or in a folder. Without a file for a family the deck is set in the computer's Helvetica (or Arial) and says so. Give it TrueType or OpenType fonts from a folder and it embeds them:

```bash
BLAZON_DECK_FONTS=~/brand-fonts blazon build
plugins/blazon.brand-deck/bin/blazon-blazon.brand-deck.🔌 dist/site/brand.json -o deck.pdf --fonts ~/brand-fonts
```

`--fonts` can be repeated, and `BLAZON_DECK_FONTS` names more folders, separated as a `PATH` is. The folder is scanned below too. A font is known by the family and weight it says it has, not by its file name, so `SpaceGrotesk-Bold.ttf` and `sg-700.ttf` are the same. The deck then sets:

- **Titles** in the display family, the family of the largest text style, at that style's weight.
- **Text, lists and captions** in the body family, the family of the style nearest 16 pixels, regular and bold.
- **The Typefaces slide and the type scale** in each family itself, each style at its own weight, or the nearest weight there is a file for. A family with no file stays in Helvetica, and the footnote says which: `Set in Space Grotesk, Inter, embedded from the font files given. Kinto: no font file given, shown in Helvetica.`

Only static, upright fonts whose license allows embedding are used. The deck skips a variable font (`Inter[wght].ttf`), an italic face, a font collection and a font whose license forbids embedding or subsetting, and says which file and why: a `blazon.brand-deck/font-not-used` warning for each, with the file as its path (the command line says the same on standard error). Download the static files from the typeface's own site: blazon never ships or downloads fonts, and checking that a license lets you embed one is yours.

What to know before you hand the PDF to someone:

- **The brand's typefaces are named, and embedded only if the config or you give font files** (see above). Otherwise the deck sets samples in the computer's Helvetica (Arial or Liberation Sans where there is no Helvetica) and says so on the slide, so the same deck drawn on two computers can differ in that font.
- **Any character the font has is drawn.** A Japanese description needs a font with Japanese in it: with only Helvetica, the browser takes the computer's own fallback for those characters.
- **The images come from beside `brand.json`.** If an image file is missing, the plugin stops with exit status 2, names the file, and writes no PDF (the command line exits 1). The one exception is an asset of a section in a category kept out of git (`local` in the config): its slide has a box with the category's `local` sentence where the image goes, and the text of the slide is still there. An image outside the folder `brand.json` is in is refused. Exit status 2 on the command line means the input was not a blazon brand or has a `version` the tool does not know.
- **The same `brand.json` gives the same PDF**, byte for byte, on one computer: the dates and the producer the browser writes are fixed. A logo or figure that is an SVG stays vector.

The deck draws what `brand.json` states. An asset's text is never cut: what does not fit one slide goes on a slide that continues it. The one place a list is cut is a divider's list of what a category leaves open, which stops above the footer and says how many items it left out (`+3 more`). A deck of a brand with many pages is long: one brand with fourteen guideline pages makes 78 slides.

## What it is not

It is not the data the brand book itself receives: that carries HTML, SVG markup and several copies of the tokens, and it changes whenever the brand book changes. `brand.json` has none of them, no timestamp and no path on your machine, so the same project writes the same file every time.

It is not a replacement for `tokens.json`, which is the tokens alone as DTCG for other design-token tools.

## Measuring a logo

The shipped plugin [`blazon.logo-geometry`](14-shipped-plugins.md#blazonlogo-geometry) reads the logos in `brand.json` and the built site, and reports how symmetric each one is, where its weight sits and what grid its points lie on. It can fail the build when a logo lacks an axis the brand requires, and it draws the construction figure that brand guidelines show. Its chapter has the options, the files it writes and what it reads.
