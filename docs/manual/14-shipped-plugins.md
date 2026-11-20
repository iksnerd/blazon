# Plugins that ship with blazon

← [Manual index](index.md)

Blazon's package carries plugins of its own. To use one, allow it by name in `blazon.json`; how blazon finds and trusts a shipped plugin is in [Plugins](12-plugins.md#plugins-that-ship-with-blazon). This chapter says what each one writes and how to configure it.

**Variables.** A shipped plugin starts with an empty environment like any other, and the config approves each variable its manifest lists, in the `env` of its entry ([Writing a plugin](13-writing-a-plugin.md#what-a-plugin-is)). The seven plugins that draw in Chrome (`blazon.brand-deck`, `blazon.favicons`, `blazon.logo-geometry`, `blazon.logo-kit`, `blazon.press-kit`, `blazon.print-book`, `blazon.social-cards`) list `BLAZON_CHROME`, `HOME` and `TMPDIR`, and `blazon.brand-deck` also `BLAZON_DECK_FONTS`. `blazon.copy`, `blazon.office-template`, `blazon.platform-tokens`, `blazon.shadcn` and `blazon.tailwind` list none. The snippets below leave `env` out to stay short; without it a set `HOME` stops the plugin with a message that says what to add.

## The plugins

### blazon.brand-deck

`blazon.brand-deck` draws the brand as a PDF deck of 16:9 slides, `brand-deck.pdf` in its `out_dir`: the cover and contents, each logo with its clear space and rules, the palette with its print values, the gradients, the typefaces and type scale, the brand book's pages with the asset slides and figure grids their directives list, and the Favicons part. It has the `build` role. Drawing needs Google Chrome on the computer (or `BLAZON_CHROME`), as `blazon.print-book` does. It is TypeScript on blazon's own npm dependencies, so it needs no Python, no uv and no network, and it runs offline on a page made in memory. Chapter 11 says what each slide shows and how the deck fits an asset's text to its slide ([Drawing a deck](11-brand-json.md#drawing-a-deck)).

```json
{
  "plugins": [
    { "name": "blazon.favicons", "env": ["BLAZON_CHROME", "HOME", "TMPDIR"] },
    { "name": "blazon.brand-deck", "env": ["BLAZON_CHROME", "BLAZON_DECK_FONTS", "HOME", "TMPDIR"], "options": { "skip": [ "favicons-supplied" ] } }
  ]
}
```

| Option | Value |
|---|---|
| `skip` | A list of asset categories to leave out of the deck, such as `["favicons-supplied"]`. `"logos"` leaves out the logo slides. An [experimental category](06-assets-and-icons.md#experimental-categories) or a [reference category](06-assets-and-icons.md#reference-categories) is always left out, with no option |

It reads the favicon set where `blazon.favicons` leaves it, beside its own folder in `tokensOutDir`, so list `blazon.favicons` first. `BLAZON_DECK_FONTS` names folders of the brand's own `.ttf` and `.otf` fonts, which the deck sets its text in with the fonts the project's `fonts` config embeds; blazon gives the plugin that variable when it is set.

It answers with these findings, all warnings, and still draws the deck:

| Code | Means |
|---|---|
| `blazon.brand-deck/option-unknown` | The options hold a key other than `skip`. `path` is `options.<key>` |
| `blazon.brand-deck/option-invalid` | The options are not an object, or `skip` is not a list of text |
| `blazon.brand-deck/skip-unknown` | A name in `skip` is no asset category of the brand, so nothing is left out for it |
| `blazon.brand-deck/font-not-used` | A font file in a `BLAZON_DECK_FONTS` folder, or a font of the config, cannot be used (variable, italic, a collection, a license that forbids embedding, not a font). `path` is the file |
| `blazon.brand-deck/favicons-not-drawn` | The `favicons.json` beside the plugin is for a symbol the brand does not have, so the deck has no Favicons part |
| `blazon.brand-deck/page-count` | The PDF has other than the planned number of pages |

It exits `2` with the reason, and writes nothing, when the request is wrong, when an image or a font folder cannot be read, when `favicons.json` is damaged (the reason names the file), and when it finds no browser.

### blazon.copy

Holds the brand book's text to the brand's copy rules: the terms it avoids, the case of its headings and the length of its sentences. It is a `check` plugin. It reads `brand.json` (the pages' Markdown and the assets' sidecar text), writes nothing and needs only Node.

```json
{
  "plugins": [
    {
      "name": "blazon.copy",
      "options": {
        "avoid": [
          {
            "terms": [ "powerful", "seamless", "robust", "effortless" ],
            "say": "a number, or nothing"
          }
        ],
        "headings": "sentence",
        "sentences": { "maxWords": 25 },
        "skip": [ "11-voice.md" ]
      }
    }
  ]
}
```

With no options it checks nothing. The starter's `blazon.json` names it with blazon's own rules, as a model to edit. It reads a page's title and description and its Markdown outside code spans, code fences, HTML comments (the directives) and link targets, and an asset's `title`, `description`, `traits`, `do` and `dont`. A term inside code is not flagged, so a counter-example written as code is safe. A page that quotes counter-examples as plain text, such as a voice page with a "Not" column, goes in `skip`.

| Option | Default | Does |
|---|---|---|
| `avoid` | none | A list of groups. `terms` is a list of strings, matched case-insensitively as text and never as a pattern, as whole words when a term starts and ends with a letter or a digit. A single trailing `*` makes a term a stem that matches every word beginning with it (`решени*` finds решение, решения and решенията), and no other character is special. `say` is the advice a finding quotes. `only` and `skip` are lists of page paths, or asset ids for a sidecar, that scope the group: it applies to every page and asset, or to those in `only`, less those in `skip`. A path ending in `*` is a prefix, so `social/*` is a category of assets. Use them for a word with two senses, such as "free" in a layout note and in a claim |
| `headings` | `any` | `sentence` or `any`, or an object `{ case, maxWords, only, skip }`. `sentence` flags a heading of three or more words in which every word after the first, apart from those in `names`, starts with a capital letter. `any` checks nothing. `maxWords`, a positive integer, is the most words a heading may have. `only` and `skip` limit both heading checks to some pages, as for an `avoid` group, because a limit on a headline is not a limit on every heading of a guideline page |
| `ignoreQuoted` | `false` | `true` leaves text inside quotation marks (straight, curly, low-high and guillemets) out of the search for avoided terms, so a page can quote what it forbids and still be read. It does not hide a long sentence or a heading |
| `names` | none | Words the brand writes in capitals, which the heading check leaves out |
| `sentences` | none | `{ maxWords }`, a positive integer: the longest sentence the brand allows. Neither of the two reference decks gives a number for "short", so the plugin sets none |
| `skip` | none | Pages, by their path from the docs folder (`11-voice.md`), and assets, by id, that are not read, such as a page that quotes counter-examples as plain text. A path ending in `*` is a prefix |

The checks are heuristics, and every finding but a wrong option is a warning. A sentence ends at a full stop, a question mark or an exclamation mark followed by a capital letter of any script (Cyrillic included) or a digit, and not at `e.g.`, `i.e.`, `etc.`, `vs.`, `cf.`, `fig.`, `mr.`, `mrs.` or `dr.`. A table row and a heading are not measured as sentences. The plugin does not judge tone, spelling or meaning, and it does not rewrite a page. The design is [RFC 0006](../rfc/0006-copy-rules.md).

| Finding | Severity | Means |
|---|---|---|
| `blazon.copy/option-invalid` | error | An unknown option, an `avoid` that is not a list of groups with a non-empty list of non-empty terms, an unknown key in a group, a `say` that is not text, an `only` or `skip` that is not a list of page paths, an `ignoreQuoted` that is not `true` or `false`, a term that is empty or only `*`, a `headings` that is not `sentence`, `any` or an object of `case` and `maxWords`, a `names` or `skip` that is not a list of strings, or a `sentences.maxWords` that is not a positive integer. The option is left out and the others stay |
| `blazon.copy/avoided-term` | warning | A term from `avoid` appears in a page or a sidecar. One finding for each term and each source, with how often it appears, where, and the group's `say` |
| `blazon.copy/heading-case` | warning | A heading is in title case and `headings` is `sentence` |
| `blazon.copy/heading-length` | warning | A heading has more words than `headings.maxWords`. The message gives the count |
| `blazon.copy/sentence-length` | warning | A sentence has more words than `sentences.maxWords`. The message gives the count |

### blazon.favicons

`blazon.favicons` draws a brand's favicon and app-icon set from its symbol, three views of it for the brand book, and the Android adaptive layers, and judges the symbol as an icon. It has both roles, so `blazon check` and `blazon build` run it. Drawing needs Google Chrome on the computer (or `BLAZON_CHROME`, the path of a Chrome or Chromium program), as `blazon.print-book` does. The browser runs offline on a page made in memory: the logo file is never sent anywhere, and the plugin makes no network call.

```json
{
  "plugins": [
    {
      "name": "blazon.favicons",
      "options": { "symbol": "logos/mark", "ground": "brand.primary", "ink": "#FFFFFF" }
    }
  ]
}
```

The symbol is an SVG asset of the brand. It is the one SVG asset whose [sidecar](06-assets-and-icons.md#sidecars) says `"lockup": "mark"`, or the asset `symbol` names. It is drawn in one color: the plugin takes the fills off its shapes, so give it a single-color drawing of paths and shapes. Strokes are not recolored: a shape with a `stroke` keeps that color, so draw the symbol with fills. A file with a script, a style, an embedded image, a link or an event handler is refused, not rendered.

| Option | Default | Does |
|---|---|---|
| `symbol` | the one `mark` SVG | The asset id of the symbol, such as `logos/mark` |
| `ground` | the theme's `accent` | The app icon's ground: a color token (`brand.primary`) or a CSS color. It must be solid |
| `ink` | `#FFFFFF` | The symbol's color in the app icons |
| `favicon` | `ground` | The symbol's color in the favicon, which has no ground |
| `share` | `{ app: 0.52, favicon: 0.88 }` | How much of the height the symbol fills, above 0 and up to 1. A symbol wider than tall is limited by its width |
| `tabs` | `{ light: '#FFFFFF', dark: '#202124' }` | The browser tab colors the favicon is judged and previewed on |
| `themeColor` | `ground` | The `theme-color` of the head snippet |
| `name` | the brand's title | The name in `site.webmanifest` |
| `base` | `/` | The path the files are served under in the snippet and the manifest, such as `/brand/` |
| `supplied` | none | An asset category that holds the project's own files, below |

`blazon build` writes `dist/tokens/blazon.favicons/`:

| File | Is |
|---|---|
| `favicon.svg` | The symbol alone, transparent, in a 32 x 32 viewBox |
| `favicon.ico` | 16, 32 and 48 px, transparent (PNG images in an ICO). Blazon ignores `.ico` as an asset format, so the book does not list it |
| `favicon-16.png`, `favicon-32.png` | The two small sizes as PNG, for the previews |
| `apple-touch-icon.png` | 180 x 180, the ground with the symbol in `ink` |
| `icon-192.png`, `icon-512.png` | The same, for the web manifest, with the symbol well inside the maskable safe zone |
| `app-icon-1024.png` | The master: 1024 x 1024, an RGB image with no alpha channel, square corners |
| `head.html` | Tags to paste into `<head>`: the SVG and ICO icons, the touch icon, the manifest and `theme-color` |
| `site.webmanifest` | The 192 and 512 icons with `"purpose": "any maskable"`, the theme and background colors |
| `android-adaptive-foreground.png` | 432 x 432 (108 dp at 4 px per dp), transparent: the symbol in `ink`, at `share.app`, to sit inside the 66 dp safe circle |
| `android-adaptive-background.png` | 432 x 432, the ground alone |
| `favicon-tabs.png` | A view, 2400 x 680: the favicon in a light and a dark browser tab, with the 16 px icon enlarged 8 times and the 32 px icon 4 times, drawn pixelated |
| `app-icon-masks.png` | A view, 2400 x 600: the master square, under the iOS rounding (22.37%) and an Android circle, squircle and rounded square, and with the two safe-zone circles drawn over it (maskable 80%, Android adaptive 66 dp) |
| `app-icon-sizes.png` | A view, 2400 x 600: the master rounded as iOS rounds it, at 180, 120, 87, 60, 40 and 29 px |
| `favicons.json` | What a Favicons page of the book or deck shows, in one file: the colors, the tab backgrounds, the 16 and 32 px previews and the app-icon tiles, the `views` (file and size), the iOS sizes, the Android layers with the measured `symbolReach`, a `files` table (file, size, use) and the `head` snippet |

The three views are for the brand book and the deck, not for an app. They are drawn in the browser from the files above and a neutral, system-font page: grey placeholder tabs and no imitation of the browser, iOS or Android interface. Their text is set in the computer's own sans-serif, so the same brand gives the same bytes on one computer, and the lettering may differ between computers. The [brand deck](11-brand-json.md#drawing-a-deck) ends with a Favicons part made from `favicons.json`.

#### The Favicons page in the book

The web book is a static page whose data is fixed before any plugin runs, so it cannot read `dist/tokens/blazon.favicons/`. So `blazon.favicons` also copies `favicons.json` and the three views into `favicons/` in the site folder (`dist/site/favicons/`, which blazon had emptied and filled before the plugin ran). This is the one place a plugin writes outside its own `out_dir`. The plugin replaces that folder on each build, and refuses, writing nothing, when the site already has a `favicons/` that is not its own copy (one without a `favicons.json` of this plugin).

The book then asks for `favicons/favicons.json` when it opens. When the file is there, the sidebar lists Favicons under Assets and the page shows what the brand deck shows: one block for each view, the table of files, and the head snippet with the colors the set is drawn in. A brand without the plugin has no entry and no page, and `#favicons` is "Not found" as any unknown page. The only trace is that the browser's network list and console show one request for `favicons/favicons.json` answered 404. The site must be served over http, as the book already must be: it does not work opened as a file. `blazon dev` does not run build plugins, so it has no Favicons page.

The print book (`blazon.print-book`) gets a Favicons chapter the same way: after the guideline pages in the full book, and as `favicons` in `pages`. It is not in `essentials` or `reference`. The chapter is in the printed book only if the copy is in the site when `blazon.print-book` runs, so **list `blazon.favicons` before `blazon.print-book`**: plugins run in the order of the list.

```json
{
  "plugins": [ { "name": "blazon.favicons" }, { "name": "blazon.print-book" } ]
}
```

In the wrong order the book prints without the chapter, and `blazon.print-book` can say so only from the second build on, when the folder of the earlier build is there: the warning `blazon.print-book/favicons-not-in-site`. It also shows when `blazon.favicons` was removed from the list and its folder is left in `dist/tokens`; delete the folder then.

The same brand gives the same bytes. **Supplied files.** When the project already has a file, name the asset category that holds it in `supplied` and give the asset the name of the file without its extension: `favicon.svg`, `apple-touch-icon.png` (180 x 180), `icon-192.png`, `icon-512.png` or `app-icon-1024.png` (1024 x 1024). Each one is copied in place of the file the plugin would draw, and an `info` finding `blazon.favicons/supplied` says so. A supplied file of the wrong format or size stops the build with the reason. An `.ico` cannot be supplied, because blazon does not catalog it: the ICO is always drawn.

**Findings.** The plugin warns, and never fails the check or the build on its own. A wrong option (an unknown key, a color that is not a token or a CSS color, a symbol the brand does not have) is the error `blazon.favicons/option-invalid` with the path `options`: nothing is drawn and the build goes on. The safe-zone findings are measured from the pixels of the drawn layer, so they come from the build and not from `blazon check`. A supplied icon is not measured: they judge the layer the plugin draws from the symbol.

| Code | Means |
|---|---|
| `blazon.favicons/min-size` | In a 16 px favicon the symbol is drawn smaller than the symbol's own sidecar `minSize` |
| `blazon.favicons/contrast` | The favicon color has under 3:1 contrast on a light or a dark tab, or the symbol has under 3:1 on the app icon's ground |
| `blazon.favicons/maskable-safe-zone` | From the build only, because it reads pixels. The symbol, as drawn in the Android foreground layer, reaches past 40% of the layer's width from its center: more than a maskable icon's safe circle (80% of its width). A launcher mask may cut it |
| `blazon.favicons/adaptive-safe-zone` | From the build only. The symbol reaches past 30.56% of the width from the center, outside the 66 dp safe circle of Android's 108 dp adaptive icon. Lower `share.app`. A square symbol at the default `0.52` has its corners at about 37% and warns here |
| `blazon.favicons/symbol-not-drawn` | From the build only. Nothing of the symbol is drawn in the Android layer: its drawing is empty, or so large or so small that it rounds away. Check the symbol's `viewBox`. The path is `android-adaptive-foreground.png` |
| `blazon.favicons/supplied` | `info`, from the build: a supplied file is used in place of a drawn one |

### blazon.logo-geometry

Measures the logos in the brand and draws the construction figure that brand guidelines show (Auth0's "Logotype construction", Slack's 19×19 octothorpe grid). It reads each logo's file from the built site. It needs Node for SVG, and a Chrome for PNG and WebP (`BLAZON_CHROME`, or the Google Chrome on the computer). With no Chrome the SVGs are still measured and each raster gets a `raster-skipped` warning.

```json
{
  "plugins": [ { "name": "blazon.logo-geometry", "options": { "require": [ "mirror-x" ], "grid": 4 } } ]
}
```

`blazon build` writes into `dist/tokens/blazon.logo-geometry/`:

- `geometry.json`: the measurements of every logo that could be measured, by asset id, with its keys in sorted order so the same brand writes the same bytes.
- `<name>-construction.svg` for each SVG logo: the logo with its box, its axes, its grid and the numbers drawn over it. The two dashed axes cross at the center of the box, marked by a hollow ring; the filled dot is the measured center of mass, so its distance from the ring is the `balance`, and the caption says so. The name is the asset's name (`logos/blazon-graphite` is `blazon-graphite-construction.svg`), or the whole id with hyphens when two logos share a name. Put a figure in an assets folder and show it with [`blazon:assets`](05-pages.md#directives); [examples/blazon](../../examples/blazon/docs/02-logo.md) does.

For each logo `geometry.json` has:

| Field | Means |
|---|---|
| `symmetry` | How closely the logo matches itself mirrored left to right (`mirror-x`), top to bottom (`mirror-y`), turned 180° (`rot180`) and turned 90° (`rot90`, only for a logo that is nearly square, else `null`). Each has two scores from 0 to 1, the share of the logo's area that lands on the same thing: `silhouette` ignores color, and `color` needs each point to keep its fill, so a pinwheel in four colors turns into itself as a shape but not as a color |
| `axes` | The axes whose `silhouette` is at least `tolerance` |
| `balance` | How far the logo's center of mass is from the center of its box, as a share of its size. Negative `x` is left and negative `y` is up |
| `ink`, `aspect` | The share of the box that is ink, and its width over its height |
| `grid` | An SVG only. `detected` is the coarsest whole-number grid every point sits on, or `null`; `stated` is the grid you gave; `off` lists the points that are off the stated grid |
| `box` | An SVG only. The ink's box, in the SVG's own units |
| `tolerance` | The score that counted as symmetric |

| Option | Default | Does |
|---|---|---|
| `logos` | every SVG, PNG and WebP asset in `logos/` | The logos to measure: asset ids, or `{ id, crop?, grid?, require?, tolerance? }` to set one logo apart. A logo you name that cannot be measured is an error, not a warning |
| `require` | none | Axes (`mirror-x`, `mirror-y`, `rot180`, `rot90`) every logo must hold. A logo that lacks one is an `axis-not-held` error, which fails the build |
| `tolerance` | `0.97` | The `silhouette` score, above 0 and at most 1, that counts as holding an axis |
| `grid` | none | The grid the logos are drawn on. The points off it are listed |
| `crop` | the whole file | `[x, y, width, height]`, in the SVG's units or a raster's pixels, to cut a mark out of a lockup. Per logo only. The grid is read from the points inside it |
| `accent` | the theme's accent, else `#ff5a1f` | The color of the figure's lines: a hex color, a color name, or `rgb()` or `hsl()` |
| `figures` | `true` | `false` writes no figure |
| `report` | `true` | `false` writes no `geometry.json` |

The reading is the same for the same file. An SVG is drawn into a grid of 256 cells on its longer side, measured on the part of the artboard the ink covers, so padding in the file does not change a score. It is read for `rect` (with rounded corners), `polygon`, `polyline`, `circle`, `ellipse` and `path` (`M L H V C S Q T A Z`, absolute or relative, curves and arcs flattened), with `transform`, groups, and a fill from an attribute, a `style` or a group. A hole drawn with `fill-rule="evenodd"` stays a hole. A shape with `fill="none"`, `display="none"`, `visibility="hidden"`, `opacity="0"` or `fill-opacity="0"` is not ink.

What it does not read is named, not guessed. Live `<text>` is refused because it is not outlines yet, `<use>` and `<image>` because they point at something else, and a logo drawn with strokes only because there is no fill to measure. A stroke on a shape that also has a fill, and a `<style>` element that colors shapes by class, are not read and are reported as `reading-limited`. A gradient fill counts as one color. A PNG or WebP is decoded by the browser, scaled to the same grid by averaging, and compared with a one-cell tolerance for its anti-aliased edge; it has no points, so it has no `grid` and no `box`.

| Finding | Severity | Means |
|---|---|---|
| `blazon.logo-geometry/option-invalid` | error | An unknown option, a logo the brand does not have, a wrong `require`, `tolerance`, `grid`, `crop` or `accent` |
| `blazon.logo-geometry/file-missing` | error | A logo's file is not in the built site, or its path leaves it |
| `blazon.logo-geometry/axis-not-held` | error | A logo lacks an axis `require` names, or is not nearly square and cannot be tested for `rot90` |
| `blazon.logo-geometry/not-measured` | warning (error for a logo you named) | The logo could not be read: text, `<use>`, an image, strokes only, nothing to measure, a file that is not a picture. The message says which |
| `blazon.logo-geometry/raster-skipped` | warning | A PNG or WebP was not measured because there is no browser to read it with |
| `blazon.logo-geometry/off-grid` | warning | Points of an SVG sit off the stated `grid`; the first five are named |
| `blazon.logo-geometry/reading-limited` | warning | Something in a measured SVG was not read, so a score may be off |

### blazon.logo-kit

Draws the files a brand's logo rules describe, from the `partnership`, `initiative` and `clearSpace` rules in the logo sidecars ([chapter 6](06-assets-and-icons.md#sidecars)). It needs Node for SVG, and a Chrome for PNG (`BLAZON_CHROME`, or the Google Chrome on the computer).

```json
{
  "plugins": [ { "name": "blazon.logo-kit" } ]
}
```

`blazon build` writes into `dist/tokens/blazon.logo-kit/`:

- `partnership-<logo>--<partner>.svg` and `.png`, for each logo that states a `partnership` and each partner: the logo, a divider and the partner on one baseline, with the gap on each side of the divider and the divider's height from the rule. The layout is the one the book's `blazon:logo-partner` figure draws, from one shared function. There is no background, so the file goes on any surface. The divider is drawn in the sidecar's `ink`, else white for a logo made for a dark surface and black for one made for a light surface.
- `initiative-<logo>--<mark>.svg` and `.png`, for each logo that states an `initiative`: the logo and the program's mark, beside it on one baseline or under it, as the rule says. The layout is the one the book's `blazon:logo-initiative` figure draws. There is no background and no divider.
- `clear-space-<logo>.svg` and `.png`, for each logo that states a `clearSpace`: the logo inside a hatched, dashed band the width of its clear space, on the surface it is made for.

The names are the asset ids with anything but letters, digits, dots, hyphens and underscores turned into hyphens (`logos/logotype-black` is `logos-logotype-black`). Each SVG stands alone, with its logos embedded.

| Option | Default | Does |
|---|---|---|
| `logos` | every asset in `logos/` | The logos to draw, as asset ids |
| `partners` | every asset in `partners/` | The partners to draw beside them, as asset ids |
| `formats` | `['svg', 'png']` | `svg`, `png` or both. With only `svg`, no browser is needed |
| `scale` | `1` | `2` also writes `<name>@2x.png` |

A PNG is never drawn wider or taller than 4096 px, and a larger artwork is drawn smaller. Wrong options are findings and the rest is drawn. A broken request, or no browser when a PNG is asked for, is exit 2 and nothing is written.

| Finding | Severity | Means |
|---|---|---|
| `blazon.logo-kit/option-invalid` | error | An unknown option, an asset the brand does not have, a wrong `formats` or `scale` |
| `blazon.logo-kit/file-missing` | error | An asset's file is not in the built site, or its path leaves it |
| `blazon.logo-kit/no-size` | warning | A file does not give its width and height, so it cannot be laid out |
| `blazon.logo-kit/no-partnership-rule` | warning | A logo you named states no `partnership`, so it gets no lockup |
| `blazon.logo-kit/initiative-mark-missing` | warning | A logo's `initiative.mark` names an asset the brand does not have, so no program lockup is drawn for it |
| `blazon.logo-kit/no-clear-space` | warning | A logo you named states no `clearSpace`, so it gets no sheet |
| `blazon.logo-kit/nothing-to-draw` | warning | No logo states a `partnership`, an `initiative` or a `clearSpace`, or none could be laid out |

It does not draw a stacked lockup of the logo itself or the URL beside the logo: those need rules the sidecars do not state yet.

### blazon.office-template

Writes an editable PowerPoint template from the brand: a theme with the brand's colors and fonts, a slide master, and five layouts with real placeholders and the logo placed as its sidecar says. It needs only Node, no browser.

```json
{
  "plugins": [ { "name": "blazon.office-template" } ]
}
```

`blazon build` writes into `dist/tokens/blazon.office-template/`:

- `<name>.potx`, the template: PowerPoint offers it under New, and a deck made from it keeps the theme, the layouts and the logo.
- `<name>.pptx`, the same file with one sample slide for each layout, to see them and to start from.

The layouts are Cover, Section divider and Closing, on the `inverse` surface (the divider with an accent bar); Title and content; and Two columns. Each has a title and body placeholders, and the master carries the logo, so every layout that shows the master has it. The Cover, Section divider and Closing layouts hide the master's shapes and carry a larger logo of their own. Placeholders keep the side margin of `blazon.brand-deck`, 56 of its 960 points (5.8% of the width), so a deck and a template made from one brand have the same margins. A bullet is set in the font of its text (`a:buFontTx`), so it follows the body font.

The theme's twelve colors and two fonts come from the brand's roles:

| Slot | From |
|---|---|
| `dk1`, `lt1` | The `text` and `background` roles, the darker in `dk1` (a dark brand has its background in `dk1`) |
| `dk2`, `lt2` | The `inverse` and `canvas` roles, the darker in `dk2` |
| `accent1` | The `accent` role |
| `accent2` to `accent6` | The `accents` option, then `muted`, `border`, the color tokens that are not aliases in token order, then tints of the accent; a color the theme has is skipped |
| `hlink`, `folHlink` | The accent, and `muted` |
| Heading and body font | The first named family of `fontDisplay` and of `fontBody` |

Titles take their line height and tracking from the brand's typography tokens: a style that is not an alias and is set in the heading font (the first named family of `fontDisplay`): one whose path ends in `.display`, else one ending in `.h1`, else the largest. Among several of the same name the largest is taken, so a large number style does not set the titles. Its `lineHeight` becomes the master's title line spacing, and its `letterSpacing`, when it is in `em`, becomes the character spacing of each title layout, scaled to that layout's size. With no such style, or no `lineHeight` on it, titles are set at 1.1 and with no tracking; a tracking in any other unit is not used. No finding is written for the fallback.

The logo goes where its surface is: the one made for dark surfaces on a dark layout, the one made for light on a light layout. A logo is made for what its sidecar `background` says, else for what `logo.onLight` and `logo.onDark` make it. It is drawn 1.3 inches wide on the master, 2.4 on the Cover and 2 on the Section divider and Closing layouts, held between its `minSize` and `maxSize`, and its `clearSpace` is kept free on every side: no placeholder reaches into it. A logo with no stated clear space keeps a quarter of its height. A plain SVG logo (paths, rectangles, polygons and circles with solid fills) is written as PowerPoint shapes: vector in every program, and editable. Any other SVG is embedded as the SVG, which PowerPoint 2016 and later draws and Keynote does not.

A font file cannot go in a template. A font the brand names that is not one every computer has is named in the theme, and each computer that opens the template needs it installed, or PowerPoint shows another. Keynote opens both files: the layouts become master slides of the same names, with placeholders and the logo, and text in a font the computer lacks is set in Helvetica.

| Option | Default | Does |
|---|---|---|
| `name` | the brand's title, as a file name | The file name, without its extension |
| `logo` | the logo `brand.json` names | The logo to place, as an asset id |
| `formats` | `['potx', 'pptx']` | `potx`, `pptx` or both |
| `accents` | none | Up to five color tokens (by path, such as `color.magenta.500`, an alias too) or colors (hex or `rgb()`), written in order into `accent2` onward, ahead of the colors the plugin picks. Use it to put a chart series in the theme |

The same brand gives the same bytes. Wrong options are findings and the rest is written. A broken request is exit 2 and nothing is written.

| Finding | Severity | Means |
|---|---|---|
| `blazon.office-template/option-invalid` | error | An unknown option, a `name` that is not a file name, a `logo` the brand has no asset for, a wrong `formats`, a wrong `accents` list or an accent that is neither a color token nor a color |
| `blazon.office-template/file-missing` | error | The logo's file is not in the built site, or its path leaves it |
| `blazon.office-template/color-role-missing` | warning | A role the theme needs (`text`, `background`, `inverse`, `canvas`, `accent`) is absent or not a hex or rgb() color; a default is used |
| `blazon.office-template/low-contrast` | warning | The text color has under 4.5:1 contrast on the background |
| `blazon.office-template/font-fallback` | warning | `fontDisplay` or `fontBody` names no font; the theme uses Arial |
| `blazon.office-template/font-not-embedded` | info | The theme names a font that a template cannot carry and that is not one every computer has |
| `blazon.office-template/logo-none` | warning | The brand has no logo asset, so the template carries none |
| `blazon.office-template/logo-no-variant` | warning | No logo is made for the light surfaces, or for the dark ones, so those layouts carry none |
| `blazon.office-template/logo-no-size` | warning | The logo does not give its width and height, so it cannot be placed |
| `blazon.office-template/logo-no-clear-space` | warning | The logo states no clear space, so a quarter of its height is kept clear |
| `blazon.office-template/logo-not-vector` | warning | An SVG logo is not plain enough to be shapes (a transform, a stroke, a gradient, text) and is embedded as an SVG picture |
| `blazon.office-template/logo-format-unsupported` | warning | The logo's format is not SVG, PNG, JPEG or GIF |

It writes PowerPoint files only, and checks the result in Keynote, not in PowerPoint.

### blazon.platform-tokens

Writes the brand's color and dimension tokens as native files for apps: Android resources, an iOS Swift file with an asset catalog, and Jetpack Compose Kotlin. It reads `brand.json` and nothing else, and needs only Node, no browser.

```json
{
  "plugins": [ { "name": "blazon.platform-tokens" } ]
}
```

`blazon build` and `blazon tokens` write into `dist/tokens/blazon.platform-tokens/` only the files of the platforms you ask for (all three by default):

- `android/values/colors.xml`: `<color name="color_brand_primary">#FF5A1F</color>`, with `#AARRGGBB` where the color has alpha. `android/values-night/colors.xml` holds the colors the dark context changes (see below). `android/values/dimens.xml`: `<dimen>` in dp. A px token is 1 dp and a rem token is 16 dp to the rem; the file says so in a comment.
- `ios/BlazonTokens.swift` (`ios/<Prefix>Tokens.swift` with a `prefix`, for example `AcmeTokens.swift`): `public enum BlazonColors` with a SwiftUI `Color` for each color, and `public enum BlazonDimensions` with a `CGFloat` for each dimension. A color the dark context changes is a `Color` that follows the system appearance, through a small helper the file defines for iOS 13 and macOS 10.15 and later. `ios/Colors.xcassets`: a colorset for each color, named as in the Swift file (with a `prefix`, the prefix in lowerCamel comes first: `acmeBrandPrimary`), with a dark appearance where the dark context changes it.
- `compose/Colors.kt`: `object BlazonColors { val brandPrimary = Color(0xFFFF5A1F) }`, and, when the dark context changes a color, `object BlazonDarkColors` with every color: the dark value where the dark context sets one and the main value otherwise, so you can swap the whole object. (`values-night` and the colorsets hold only the colors that differ, because night resources and appearances fall back to the main value.) `compose/Dimens.kt`: `object BlazonDimens` with `Dp` values.
- `README.txt`: a line for each platform written, saying where to copy it.

**Using the files.** Android: copy `values/` and `values-night/` into the `res` folder of your Android module, and use `@color/color_brand_primary` and `@dimen/space_4`. iOS: add `BlazonTokens.swift` and `Colors.xcassets` to your target, and use `BlazonColors.brandPrimary` in SwiftUI or `Color("brandPrimary")` for a color in the catalog (UIKit takes `UIColor(named: "brandPrimary")`); with a `prefix` the file and the catalog names carry it (`AcmeTokens.swift`, `"acmeBrandPrimary"`). Compose: copy the two files into your module, change the `package blazon.tokens` line to your own, and use `BlazonColors.brandPrimary`; use `BlazonDarkColors` in place of `BlazonColors` when the theme is dark.

**What is written.** Only tokens of type `color` and `dimension`. A `border` token is written as its width only, a dimension named `<token path>.width`: `border.rule` with a width of 2px is `border_rule_width` on Android, `borderRuleWidth` in Swift and Kotlin, 2 dp, and `include` and `exclude` match `border.rule`, not `.width`. Its colour and style are not written; a style other than `solid` is named in a `border-style-dropped` finding. Every other type is skipped, and one finding names the types and how many tokens of each. An alias is written with the value it resolves to, under its own name. Any CSS color the brand uses (hex, `rgb()`, `hsl()`, `hwb()`, `lab()`, `oklch()`, `color()`, a name) is converted to sRGB with colorjs.io and keeps its alpha. A color that sRGB cannot show is clamped channel by channel, and a finding says so. A dimension in px or rem is written; one in another unit (`em`, `%`) or a calculation is left out with a finding.

**Names.** From the token's dotted path. Android: lower snake case, the prefix first, so `color.brand.primary` is `color_brand_primary` (and `onSignal` is `on_signal`). Swift and Kotlin: lowerCamel inside the type, with the leading `color` segment of a color left out because the type says it: `brandPrimary`. A name that starts with a digit gets an underscore (`_4xl`) on those two, and `n_` on Android. A name that is a keyword (`class`, `in`, `fun`) gets a suffix, `Token` (`_token` on Android), and a name that two tokens make after conversion (`color.brandPrimary` and `color.brand.primary`) gets a number on the one that comes later in path order (`brandPrimary2`, `color_brand_primary_2`). A finding says each time, so no token is dropped.

**The dark context.** `brand.json` lists each non-default context with only the tokens it changes. The dark values come from the one context named `dark`, or from the context the `dark` option names. In `values-night` and the colorsets a color is written only when its dark value differs from its main value, since those fall back to the main one; `BlazonDarkColors` in Compose has every color. Dimensions are never dark. A brand with no such context gets the light files and no finding. If two modifiers each have a context of that name, no dark values are written and a finding says so.

| Option | Default | Does |
|---|---|---|
| `platforms` | `['android', 'ios', 'compose']` | Any of those three |
| `dark` | the context named `dark` | The name of the context that is the dark appearance |
| `prefix` | none | Letters and digits, starting with a letter. First in each Android name (`acme_color_brand_primary`), the start of the Swift and Kotlin type names in place of `Blazon` (`AcmeColors`, `AcmeDimens`), the Swift file name (`AcmeTokens.swift`) and, in lowerCamel, each colorset name (`acmeBrandPrimary`). Not the Kotlin `package` line, which stays `blazon.tokens` because you set it to your own when you copy the files |
| `include` | none (every token) | A list of token path prefixes in dot form. Only the tokens under one of them are written |
| `exclude` | none | A list of token path prefixes in dot form. The tokens under one of them are not written; applied after `include` |

`include` and `exclude` are plain path prefixes, compared name by name: no glob and no regular expression. `["breakpoint", "component.button.website"]` matches `breakpoint.md` and everything under `component.button.website`, and does not match `breakpoints.x`. Each name is letters, digits, `_` and `-`, and a list holds 1 to 100 entries; an empty list is refused. They apply to colors and dimensions, the dark context and every output. An entry that matches no token is not an error: an info finding names it, so a typo shows.

The same brand gives the same bytes: files are written in path order from fixed text, with no date. Wrong options are findings and the rest is written. A broken request is exit 2 and nothing is written.

| Finding | Severity | Means |
|---|---|---|
| `blazon.platform-tokens/option-invalid` | error | An unknown option, a `platforms` that is not a non-empty list of `android`, `ios` and `compose`, a `dark` that names no context of the brand, a `prefix` that is not letters and digits, or an `include` or `exclude` that is not a list of 1 to 100 token paths in dot form |
| `blazon.platform-tokens/filter-unmatched` | info | An `include` or `exclude` entry matches no token of the brand, which is usually a typo |
| `blazon.platform-tokens/tokens-skipped` | info | One finding, at `tokens`, for every token that is not a color or a dimension, naming the types and counts |
| `blazon.platform-tokens/border-style-dropped` | info | A `border` token has a style other than `solid`, which the files cannot carry; its width was still written, as `<path>.width` |
| `blazon.platform-tokens/color-unreadable` | warning | A color token's value is not a color (a `var()`, `currentcolor`, a gradient); the token is left out. For a dark value, the token keeps its main value only |
| `blazon.platform-tokens/color-out-of-gamut` | warning | A color is outside sRGB, so each channel was clamped to its range |
| `blazon.platform-tokens/dimension-unreadable` | warning | A dimension, or the width of a `border` token, is not in px or rem, or is a calculation; the token is left out |
| `blazon.platform-tokens/name-collision` | warning | Two tokens make the same name on a platform; the later one in path order got a number |
| `blazon.platform-tokens/name-reserved` | warning | A token's name is a keyword on a platform, so it got a suffix |
| `blazon.platform-tokens/dark-ambiguous` | warning | Two modifiers each have a context with the dark name, so no dark values were written |
| `blazon.platform-tokens/dark-unmatched` | warning | The dark context sets a color that the main tokens do not have, so it was left out |
| `blazon.platform-tokens/dark-dimensions-ignored` | info | The dark context changes dimension tokens, which are written once, with the main values |
| `blazon.platform-tokens/dark-empty` | info | The dark context changes no color, so no dark values were written |
| `blazon.platform-tokens/no-tokens` | warning | The brand has no color or dimension token, so nothing was written |

The Swift file type-checks for macOS 10.15 and iOS 13 and the asset catalog compiles with Xcode's `actool`; the Android files are well-formed XML with valid resource names. The Kotlin is not compiled by blazon: it uses the Compose `Color(Long)` and `Dp` API as documented.

### blazon.press-kit

Packs what a person outside the brand (a journalist, a partner, an agency) needs into one folder and one zip. It needs only Node; the one-page PDF needs a Chrome as well (`BLAZON_CHROME`, or the Google Chrome on the computer), and without one the rest is still written.

```json
{
  "plugins": [ { "name": "blazon.press-kit" } ]
}
```

`blazon build` writes into `dist/tokens/blazon.press-kit/`:

- `press-kit/`, the folder, and `press-kit.zip`, which holds the same files under `press-kit/`. Both take the `name` option in place of `press-kit`, and so does the PDF.
- `logos/`: the brand's logos, copied as they are and never drawn again, in `on-light-backgrounds/` and `on-dark-backgrounds/` by what each sidecar's `background` says (else by the pair `logo.onLight` and `logo.onDark` name, else in `background-not-stated/`), and `logos.txt`, which gives each file's description, lockup, clear space, smallest and largest size and main color where its sidecar states them.
- `colors/`: `colors.json`, `colors.css` (custom properties) and `colors.txt` (name, hex and RGB), for the brand's own colors; a token that is another name for a color is listed under that color. A CMYK, Pantone or RAL value is written only for a token whose `print` states it. A value that is not a hex or `rgb()` color (an `oklch()`, say) is given as written, with no hex or RGB.
- `fonts.txt`: each brand font, what it is used for and where it comes from: its own Google Fonts address (`https://fonts.googleapis.com/css2?family=Big+Shoulders+Display`, with no weights, which the brand data does not give per family) or a font file the brand embeds, which is not copied into the kit. The source and license are what the font token's `font` extension states (`source`, `license`, `licenseUrl`; see [Extensions](02-tokens.md)): a stated source wins over the one found in a stylesheet, a license address alone is written as `License: see <address>`, a `license` text in any other extension still counts, and when the token states none the license file that sits beside the font file of the config (`OFL.txt` and the like, which blazon reads into `brand.json`; see [Theme and config](07-theme-and-config.md#logo-and-fonts)) gives its path as `License file:` and, as `License:`, an `SPDX-License-Identifier:` line or else its first short line that is not a copyright notice, or `see <path>` when there is none. What is not stated is `not stated`, for a font whose stylesheet is not Google's too, and blazon does not guess it. A brand font is the family at the front of a stack that is not a system font, or one a stylesheet or font file loads, or one whose token states a source or license; a system font such as `SFMono-Regular` or `Arial` and every later family of a stack are fallbacks, printed once on a last line, `Fallback fonts, not shipped: ...`, and never as a font with `License: not stated`. The kit copies no font and the plugin is not given the project folder, so it prints the file's path and one line, not the text. A stack with no brand font writes no `fonts.txt`.
- `about.txt`: the brand's name, then the description to quote: the `company` option's description when it has one, else the brand's. The company's boilerplate, its facts as `Label: value` lines and the `note` follow. Without any description it says `No description is set in blazon.json.` below the name, and a finding says so. A brand with no name has no file.
- `README.txt`: what is in the kit, in plain words, with no date, and the `note` under the title when there is one. The descriptions start two spaces after the longest file name, or at column 16 when the names are shorter.
- `press-kit.pdf` (`<name>.pdf`): one A4 page of the name, the description (the company's when the option gives one), the boilerplate, the facts, the note, up to ten colors as swatches and a logo (the one for light backgrounds, else the first). A color is in the group named by the path before its last segment, and a swatch reads `blue 500` (group and step). Groups run in the order their first color appears in the brand, each group's steps together, a group goes in whole, and the walk stops at the first group that does not fit in the places left; the first group alone is cut at ten. A color straight under `color` keeps its short description, else its last segment. The page uses the fonts the brand embeds (a font file listed in `fonts` of `blazon.json`, `{ family: 'Kinto', file: 'fonts/Kinto.woff2' }`; the file is not copied into the kit, and the brand's listing it is the statement that its license allows embedding) and otherwise a font Chrome has, else its sans serif; it does not fetch Google Fonts, and a `pdf-font-fallback` finding names the display and body families it could not set.

A logo is left out, and a finding says which and why, when its sidecar marks it `needs-review`, or when it is generated and has no `review` yet: an unchecked file must not reach an outsider. A color token marked `needs-review` is left out the same way, unless the `unreviewed` option is `true`: the color is then in the kit, labelled `(unreviewed)` in `colors.txt` and with `"review": "needs-review"` in `colors.json`. The same brand gives the same bytes, the PDF included: its dates and producer are fixed.

| Option | Default | Does |
|---|---|---|
| `name` | `press-kit` | The folder and zip name, without an extension: letters, digits, dots, hyphens and underscores, no leading dot, up to 64 characters |
| `pdf` | `true` | `false` writes no PDF, and needs no browser |
| `unreviewed` | `false` | `true` includes the colors whose tokens are marked `needs-review`, labelled as unreviewed |
| `logos` | every logo | The logos to include, as asset ids; one that is not ready stays out all the same |
| `company` | none | An object for a brand whose own title and description are a book's, not the company's. Every key is optional: `description` (up to 1000 characters; replaces the brand's description in `about.txt` and the PDF), `boilerplate` (up to 2000; printed after it) and `facts` (up to 20 `{ "label": "...", "value": "..." }` pairs, a label up to 60 characters and a value up to 300, each on one line, printed in order) |
| `note` | none | One line of up to 280 characters, printed as `Note: ...` in `README.txt`, `about.txt`, `colors/colors.txt` and the PDF, such as `The colours are proposed and not yet approved.` |

```json
{
  "plugins": [
    {
      "name": "blazon.press-kit",
      "options": {
        "company": {
          "description": "Acme builds payment tools for teams that move money across borders.",
          "boilerplate": "Acme Ltd is a licensed payment institution.",
          "facts": [ { "label": "Legal name", "value": "Acme Ltd" } ]
        },
        "note": "The colours are proposed and not yet approved."
      }
    }
  ]
}
```

Wrong options are findings and the rest is written. No Chrome, or a PDF that cannot be drawn, is a `pdf-skipped` finding and not a failure, even when `pdf` is `true`. A broken request is exit 2 and nothing is written.

| Finding | Severity | Means |
|---|---|---|
| `blazon.press-kit/option-invalid` | error | An unknown option, a `name` that is not a file name, a `pdf` or `unreviewed` that is not true or false, a `logos` that is not a list of the brand's logo ids, a `company` or `note` with an unknown key, a wrong type, an empty text, a text or list over its limit; the finding's path is `options.company.facts[1].value`, say, and the option is left unset |
| `blazon.press-kit/file-missing` | error | A logo's file is not in the built site, or its path leaves it; the logo is left out |
| `blazon.press-kit/logo-left-out` | warning | A logo is marked `needs-review`, or is generated and not reviewed, so it is not in the kit |
| `blazon.press-kit/logo-none` | warning | No logo is ready to go in the kit |
| `blazon.press-kit/logo-no-variant` | warning | No logo in the kit is made for light backgrounds, or none for dark ones |
| `blazon.press-kit/logo-background-unstated` | info | A logo's sidecar states no background and brand.json does not pair it, so it sits in `background-not-stated/` |
| `blazon.press-kit/color-left-out` | warning | A color token is marked `needs-review`, so it is not in the kit; the message says to set `unreviewed` to include it |
| `blazon.press-kit/color-not-hex` | info | A color is not a hex or `rgb()` value, so the kit gives it as written and states no hex or RGB |
| `blazon.press-kit/color-none` | warning | The brand has no color token, so there is no `colors/` |
| `blazon.press-kit/font-license-unstated` | warning | One finding, at `fonts`, for every font with no license in the brand data (on the token, or in a license file beside its font file), listing the families; `fonts.txt` says `not stated` for each, and blazon does not guess one |
| `blazon.press-kit/font-none` | warning | The brand names no font it ships or loads (system fonts and generic families are fallbacks), so there is no `fonts.txt` |
| `blazon.press-kit/about-no-description` | warning | The brand has no description, so `about.txt` says none is set |
| `blazon.press-kit/pdf-skipped` | warning | The PDF is not in the kit: no Chrome, or the browser could not draw it |
| `blazon.press-kit/pdf-font-fallback` | info | The display or body family the brand names is not embedded as a font file, so the PDF is not set in it |

It states no color's CMYK, Pantone or RAL value that a token does not, no font license that the brand data does not, and no usage rule beyond the sidecars'.

### blazon.print-book

`blazon.print-book` prints the built brand book to a PDF of 16:9 slides (1280 by 720 px) and to a PowerPoint file of the same slides. In the PowerPoint each slide is a picture, so its text is not editable; for an editable file see [blazon.office-template](#blazonoffice-template). It fills the `build` role, so `blazon build` runs it once the site is written. It needs Node and a Chrome (`BLAZON_CHROME`, or the Google Chrome on the computer), and never downloads a browser. The plugin waits up to 30 seconds for the page to say it is ready; `BLAZON_PRINT_SECONDS`, a whole number from 1 to 30, shortens that wait, and any other value is ignored.

```json
{
  "plugins": [ { "name": "blazon.print-book", "options": { "preset": "essentials" } } ]
}
```

| `options` | Prints | Files in `out_dir` |
|---|---|---|
| none, or `{ "preset": "full" }` | The whole book | `brand-book.pdf`, `brand-book.pptx` |
| `{ "preset": "essentials" }` | The essentials | `brand-book-essentials.pdf`, `.pptx` |
| `{ "preset": "reference" }` | The token reference | `brand-book-reference.pdf`, `.pptx` |
| `{ "pages": ["doc/logo", "tokens/colors"] }` | The pages you name | `brand-book-pages.pdf`, `.pptx` |

Three more options, each optional and on top of any row above. `title` and `subtitle` put the book's own words on the cover and in the footer, and `layout` chooses how closely the slides are set:

| Option | Does | Limits |
|---|---|---|
| `title` | Replaces the brand's title in the cover heading and in the footer of every slide that has one (the contents and the content slides) | A non-empty string of at most 120 characters |
| `subtitle` | Replaces the line under the cover heading, which is the brand's description otherwise | A non-empty string of at most 200 characters |
| `layout` | `"compact"` (the default) shares a slide between a figure and the text before it by drawing pictures down to 60% of their height, and sets the prose and sections tighter; `"roomy"` draws every picture whole and sets the text looser, so the book runs on more slides (the starter brand's book is 81 pages roomy and 72 compact) | `"compact"` or `"roomy"` |

Without them the cover and the footers show the brand's title and description, as before. Neither may hold a control character (a tab or a line break, say), and a value outside its limit, a `layout` that is not `compact` or `roomy`, or an option that is not one of `preset`, `pages`, `title`, `subtitle` and `layout`, is the error finding `blazon.print-book/option-invalid` and nothing is printed. The text is shown as it is written: `&`, `<`, quotes and any script are not markup here. The footer stays one line high however long the title is, and the PowerPoint file, made from pictures of the slides, carries the same words.

**Output size.** The PDF is Chrome's own output, with lossless images, so it is large: a book can be 3 to 4 times the size of a compressed one. The plugin has no option to compress it and calls no other program. To shrink it, run a post-processing step such as Ghostscript on the file. Ghostscript's `-dJPEGQ` is ignored by its `pdfwrite` device; image quality changes only through `setdistillerparams` (a `QFactor` in the color image dictionary).

**Task lists.** A Markdown task item (`- [ ]`, `- [x]`) prints without a bullet, as a box with a border in the theme's text color; a checked box is filled, so it differs from an unchecked one.

Every option set writes the same file names, so to print more than one book list the plugin once for each, with an `as` ([Use one plugin more than once](12-plugins.md#use-one-plugin-more-than-once)). Each instance writes into its own folder, `dist/tokens/<as>/`, so the four books below are four `brand-book-pages.pdf` that do not overwrite one another, and you copy each out of its folder:

```json
{
  "plugins": [
    {
      "name": "blazon.print-book",
      "as": "blazon.print-logo",
      "options": { "pages": [ "doc/logo" ] }
    },
    {
      "name": "blazon.print-book",
      "as": "blazon.print-colors",
      "options": { "pages": [ "tokens/colors" ] }
    },
    {
      "name": "blazon.print-book",
      "as": "blazon.print-both",
      "options": { "pages": [ "doc/logo", "tokens/colors" ] }
    },
    { "name": "blazon.print-book", "as": "blazon.print-all" }
  ]
}
```

Each of the four also runs Chrome once, so the build takes as long as four print runs.

Two books of one brand, told apart by `title` and `subtitle`:

```json
{
  "plugins": [
    {
      "name": "blazon.print-book",
      "as": "blazon.print-logo",
      "options": {
        "pages": [ "doc/logo" ],
        "title": "Acme Logo Guide",
        "subtitle": "Marks, clear space and minimum sizes"
      }
    },
    {
      "name": "blazon.print-book",
      "as": "blazon.print-colors",
      "options": {
        "pages": [ "tokens/colors" ],
        "title": "Acme Colour Guide",
        "subtitle": "The palette and its print values"
      }
    }
  ]
}
```

A heading is never the last thing on a slide, and a paragraph that introduces a figure or a table goes with it. A table, a list or a grid of figures that is taller than a slide is split by its rows over as many slides as it takes, and each slide draws it at its own size. Text is set at slide size: a slide prints at 0.75 pt per px, so body text is 20 px, which is 15 pt, a table 16 px (12 pt), and the small type of captions and labels 12 px or more (9 pt). A slide the packer fills is never drawn at less than 0.9 of its size, so body text stays at 13.5 pt or more and a caption at 8 pt or more on paper. A table narrower than half a slide (two or three short columns, no merged cells, no footer or caption) is set, when it has to be split, in two groups of rows side by side with the header over each, read down the left group and then the right, and its slides are cut in even pieces; a grid of wide marks, which each take a whole row, is laid out in as many columns as fit when it has to be split, so that a slide holds several rows of marks and not two. A grid of tiles that are all the same height (colour swatches, say) is cut with the slack that guards a table's rows given back, and without counting the gap under a slide's last row, so a slide holds every whole row it can: a row that fits is not left for the next slide, at the cost of drawing the slide a few per cent smaller. A table or a grid that is not split is drawn as it was. The heading and the paragraph above a table or a grid stay with its first slide. A later slide of the same table or grid is a continued slide: it starts a slide of its own (a short last piece is not joined to the slide before it), it has no heading of its own but a label at the top, the nearest heading above the block and "(continued)", such as "Rates (continued)", in the book's muted text colour at 14 px on one line (a heading that is too long is cut with an ellipsis, the "(continued)" never), the label's height is taken off the room for rows, the first slide has no label, a table repeats its header row below the label, and a note under the table or grid is on the last one. A note or a small table with no heading of its own, a third of a slide or less, is never left alone on a slide: it joins the slide before it when the two fit (drawn at 0.9 at the smallest), else the slide after it, and a section still starts a slide of its own. One block that has no rows to cut at, such as a single tall figure or a long code block, is drawn smaller to fit, down to 0.5 of its size, so that none of it is lost (a wide picture shrinks with the text: its width is held while the slide is drawn smaller). Only a block that is taller than a slide even at 0.5 is cut off at the foot, and then the warning `blazon.print-book/slide-clipped` names the pages of the PDF that are cut off: shorten the block or split it in the page's Markdown. The cover is page 1 and the contents follow it, three columns of up to 10 lines. An entry is one line, and a title that does not fit a column of about 320 px wraps to a second line (or a third) and is never cut: the entry counts as the lines it takes, with its page number on the first line at the right. A book with more entries than the columns hold, more than 30 one-line chapters or fewer when some titles wrap, has more than one contents slide, each with an even share of the lines, and the first chapter starts after the last of them, so a page number in the contents, and a link to a page, is the page of the PDF. A code block has no Copy button in the book. A logo sample that states a minimum size, such as `Minimum width 150px`, is drawn at that many px of the 1280 px slide even when the slide is drawn smaller to fit; a slide prints at 0.75 pt per px, so the sample measures that many px at 96 dpi only when the PDF is printed at 100%. A PDF with a different number of pages than planned is a warning, `blazon.print-book/page-count`, and both files are still written. When a `blazon.favicons` folder with a `favicons.json` sits beside this plugin's but the site has no `favicons/` copy, the book has no Favicons chapter and the warning is `blazon.print-book/favicons-not-in-site`: list `blazon.favicons` before `blazon.print-book` in `plugins`, or delete the leftover folder. The plugin exits `2` with the reason, and writes nothing, when its options are wrong, when the site has no `index.html`, when it finds no browser, and when the page does not say it is ready in time. When `blazon.favicons` has drawn its set, the book gets a Favicons chapter: see [blazon.favicons](#blazonfavicons) for the order to list them in.

### blazon.shadcn

Writes which token each [shadcn/ui](https://ui.shadcn.com) variable takes, and those variables as CSS. It reads `brand.json` and nothing else, so `blazon tokens` runs it as well as `blazon build`, and it needs only Node, no browser.

```json
{
  "plugins": [ { "name": "blazon.shadcn", "options": { "variables": { "destructive": "text.primary", "ring": "text.primary" } } } ]
}
```

It writes into `dist/tokens/blazon.shadcn/`:

- `shadcn.json`: for each variable blazon supplies, `{ "token", "value", "from", "role"? }` (`value` is the default context's; `from` is `theme` or `config`); `unsupplied`, the variables nothing supplies; and, when the brand declares contrast `pairs`, `pairs`, each shadcn text-on-surface pair with `declared`, whether a `pairs` rule covers its two tokens. [Chapter 19](19-building-a-website.md#using-shadcnui) says how to use it.
- `shadcn.css`: a `:root` block with each supplied variable, and, for each other context, a block under that context's selector with the variables whose token it changes. A header names the variables nothing supplies, which keep shadcn's own value.

A variable takes its value from the theme role it reads, or from the token the `variables` option names. `destructive` and `chart-1` to `chart-5` have no role, so only the option fills them.

| Option | Default | Does |
|---|---|---|
| `variables` | none | An object of shadcn variable names (no leading dashes) to token paths. A pick wins over the role |

This is what the `shadcn` key of `blazon.json` did before it became this option; a config that still has the key fails with `config-invalid`, and the message names this plugin.

| Finding | Severity | Means |
|---|---|---|
| `blazon.shadcn/token-missing` | error | A pick in `variables` names a path that is not a token. The variable falls back to its role |
| `blazon.shadcn/option-invalid` | error | An option other than `variables`, a `variables` that is not an object, a variable shadcn does not have, or a pick that is not a string |

### blazon.social-cards

`blazon.social-cards` draws marketing images, one PNG for each card you list, from what the brand already has: its tokens, its logo and a background picture. It fills the `build` role, so `blazon build` writes the files to `<tokensOutDir>/blazon.social-cards/`. It needs Node and a Chrome, like `blazon.print-book` (`BLAZON_CHROME` names one; it never downloads a browser). It composes images you already have. It does not generate pictures.

```json
{
  "plugins": [
    {
      "name": "blazon.social-cards",
      "options": {
        "cards": [
          {
            "id": "launch",
            "format": "horizontal",
            "background": "backgrounds/aurora",
            "headline": "Say it in one line.",
            "subline": "A brand book that checks itself."
          },
          {
            "id": "post",
            "format": "square",
            "background": "backgrounds/aurora",
            "headline": "One signal. Every surface.",
            "align": "center",
            "logo": "dark"
          }
        ]
      }
    }
  ]
}
```

`examples/blazon` does exactly this: its two cards are `launch.png` (1200 by 630) and `post.png` (1080 by 1080), drawn on `assets/backgrounds/aurora.svg`, a background made for the example.

| Option | Says |
|---|---|
| `cards` | The list of cards. Required, and not empty |
| `scale` | `1` (default) or `2`. With `2` each card is also written at twice the size, as `<id>@2x.png` beside `<id>.png` |

| Card key | Says |
|---|---|
| `id` | The file's name: letters, digits, `-` and `_`, at most 64. Required, and unique |
| `format` | A group under `social.format` in your tokens. Its `width` and `height` are the card's size in px. Its `margin` is the safe area (5% of the shorter side when it has none), and its `columns` decide how wide the headline may run: with 3 or more, five sixths of the safe width on six columns. Required |
| `background` | Required. An image asset id (any category, such as `backgrounds/aurora`), or the path of a color or gradient token. The picture covers the card |
| `headline` | The text, in the display font. Required |
| `subline` | A line or two under it, in the body font |
| `logo` | `auto` (default), `light` or `dark`. `light` uses the logo made for light surfaces (`logo.onLight`), `dark` the one for dark surfaces (`logo.onDark`). `auto` takes the one that reads better against the picture under it (the higher contrast, measured as described under the card rules) |
| `textColor` | A color token path. Without it the card tries the theme's `inverseText`, then `text`, and keeps the one that needs the weaker scrim |
| `align` | `left` (default) or `center` |
| `anchor` | `top` or `bottom`: the edge the text hangs from. The logo goes in a corner of the other edge, the first one its sidecar lists there (else its first corner mirrored). Leave it out and the text takes the edge opposite the logo's first corner. Set it when a photo has a person where the text would land. With `logoCorner` on the same edge, see [a logo on the text's edge](#a-logo-on-the-texts-edge) |
| `logoWidth` | The logo's width: a number of px, or a percentage of the card's shorter side such as `"22%"`. Leave it out and the logo is 14% of the card's width, as before. It is never narrower than the logo sidecar's `minSize`: a width in px under it is drawn at the minimum and reported as `card-logo-width-clamped` (a warning, because the card is still good and the brand's minimum wins). A percentage that lands under the minimum is drawn at the minimum without a finding, because "22%, and at least 120px" is how such a rule reads |
| `logoCorner` | `top-left`, `top-right`, `bottom-left` or `bottom-right`: the corner the logo sits in, inside the margin. Leave it out and the logo takes the first corner its sidecar lists, as before |
| `keepClear` | A list of parts of the card the headline, the subline and the logo must stay out of. Each is `{ x, y, width, height }` in percent of the card (0 to 100), measured from the top left, and must lie inside the card, or the name of a zone. The one zone is `"avatar"`, `{ x: 0, y: 50, width: 25, height: 50 }`: the bottom left quarter of the width by half of the height, where the profile photo of a LinkedIn or X cover sits. Those numbers are a convention of those platforms, not a rule of blazon's, and a platform can change them: write the rectangle yourself when yours differs. A list may mix both. The plugin only reports: it does not move or reflow the text (see the rules below). Leave it out and nothing is checked, and the card is drawn as before |

Any other key, on the options or on a card, is an error.

**What the card does.**

- The headline starts at the brand's largest display type (`type.display`) and steps down by about 8% until it fits the safe area, never below the smallest type token in the display font (`type.h2`, 40px in the example). If it does not fit there, it is a `card-text-overflow` error.
- The plugin takes the picture's real pixels under the text and measures the contrast of the text color against them, at the worst few pixels, not the average. Under 4.5:1 it lays a scrim of the theme's `inverse` color behind the text, in steps of 0.05 and no stronger than 0.75, the weakest that reaches 4.5:1. A picture that already reads gets none.
- The text hangs from the edge opposite the logo's corner. The logo goes in the first corner its sidecar's `placement` lists (top left without one), inside the margin, at least as wide as `minSize` and 14% of the card. Its `clearSpace` is measured in the logo's own pixels (or its `unit`), so it grows with the logo. `logoWidth` and `logoCorner` replace the 14% and the sidecar's corner for one card; the minimum size and the clear space still hold. Mind that 14% is of the card's width: on a wide, short banner it makes a logo whose clear space may not fit the margin, and `logoWidth: "22%"` (of the shorter side) is the way to size it.
- A brand with no logo draws its cards with none: `logo`, `logoWidth` and `logoCorner` have nothing to act on, and are ignored without a finding.
- A `logoWidth` is never more than the card's width. A logo that wide does not fit the safe area, and the card reports `card-logo-clear-space`; the other cards are still drawn.
- The logo is measured the same way: its solid pixels against the picture under its box (with the scrim on), at the worst few. `logo: auto` measures both files and takes the higher; one file alone, or one you asked for, is measured too. Under 3:1, the WCAG minimum for graphical objects, it is a `card-logo-contrast` error. The plugin never recolors the logo or puts a plate behind it: give the brand a logo for that surface, move it with `anchor` or `logoCorner`, or change the background.
- `keepClear` is checked on the card as drawn: the boxes of each rendered line of the headline (and the accent rule above it) and of the subline, and the logo's own box, not its clear space. A headline that wraps to a second line is measured at that line, so a short headline can pass where a longer one enters the area. A box that goes more than 2 px into a rectangle is reported; one that only touches its edge, or goes in by up to 2 px (the box of a line is a little taller than its glyphs), is not.

A card with an error is still drawn, so you can see it, and its finding names it.

| Finding code | Severity | When |
|---|---|---|
| `blazon.social-cards/card-text-contrast` | error | Even with the strongest scrim the headline is under 4.5:1 |
| `blazon.social-cards/card-text-overflow` | error | The headline does not fit the safe area at the smallest type step |
| `blazon.social-cards/card-logo-clear-space` | error | The logo leaves the safe area, its clear space reaches past the edge of the card, or the text is inside that space |
| `blazon.social-cards/card-text-logo-overlap` | error | The text hangs from the same edge as the logo (`anchor` and `logoCorner` on one edge) and is inside the logo's clear space |
| `blazon.social-cards/card-text-keep-clear` | error | The headline or the subline has a line more than 2 px inside a `keepClear` rectangle. The message names which, how far in, and the rectangle |
| `blazon.social-cards/card-logo-keep-clear` | error | The logo's box is more than 2 px inside a `keepClear` rectangle |
| `blazon.social-cards/card-logo-contrast` | error | The logo that is drawn (the better of the two under `auto`) is under 3:1 against the picture under it |
| `blazon.social-cards/card-logo-width-clamped` | warning | `logoWidth` is a width in px under the logo sidecar's `minSize`, so the logo is drawn at the minimum |
| `blazon.social-cards/card-background-generated-unreviewed` | error | The background asset's sidecar says it was generated (`generated`), and its `review.status` is not `ok`. An asset with no `generated` field counts as not generated |
| `blazon.social-cards/card-background-small` | warning | The image has fewer pixels than the card at 1:1, so it is enlarged. Vector images (SVG) are never small |
| `blazon.social-cards/card-option-invalid` | error | An option is wrong: an unknown key, a missing `id` or `format`, a repeated `id`, a format or background that does not exist, a `logoWidth` that is not a positive number or a percentage up to 100%, a `logoCorner` that is not one of the four corners, a `keepClear` that is not a list of rectangles inside the card and named zones, and so on. The card is not drawn; the others are |
| `blazon.social-cards/findings-left-out` | warning | There were more findings than a plugin's answer may hold (64 KB of standard output). The answer keeps the first ones that fit, errors before warnings, and this one says how many it left out. Fix the ones shown and run again; the ones left out come back if they are still there |

The `path` of each card finding is `<id>.png`, and its message starts with `card "<id>"`. Findings about the options as a whole have the path `options`. The plugin exits `2`, with the reason, only for a broken request or when it finds no browser to draw with. The fonts are the brand's `fonts` stylesheets, loaded as the viewer loads them: a computer that cannot reach them draws the card in the fallback faces named in the font token.

#### A logo on the text's edge

Some surfaces cover one corner (a profile photo sits over the bottom left of a LinkedIn or X cover), so the brand needs the logo at the top right and the headline at the top left. Set `"anchor": "top"` and `"logoCorner": "top-right"`. The text then hangs from the same edge as the logo, which only happens when the card sets `anchor` itself and a `logoCorner` on that edge. Then:

- The text block stops short of the logo by the logo's clear space: left-aligned text is cut off at the logo, centered text gives up that room on both sides to stay centered. Text that fits already is not narrowed.
- The logo no longer takes room from the text's height, since it sits beside the text and not under it.
- The scrim hangs from the same edge and runs across the whole card, so it covers the text and the logo's surface alike; both are measured with it on.
- If the text and the logo's clear space still overlap (a logo in the corner the text starts from, a headline that cannot be narrower, a very wide logo), the card is reported as `card-text-logo-overlap`.

```json
{ "id": "cover", "format": "linkedinCover", "background": "plates/glow", "headline": "Brand work that keeps up.", "anchor": "top", "logoCorner": "top-right", "logoWidth": "22%" }
```

Add `"keepClear": ["avatar"]` to the same card and the plugin tells you when the headline has wrapped into the bottom left quarter, which a short headline avoids and a longer one does not:

```json
{ "id": "cover", "format": "linkedinCover", "background": "plates/glow", "headline": "Brand work that keeps up.", "anchor": "top", "logoCorner": "top-right", "logoWidth": "22%", "keepClear": ["avatar"] }
```

With `logoCorner` and no `anchor`, the text takes the edge opposite the logo's corner, as it always did. With `anchor` and no `logoCorner`, the logo moves to the opposite edge, as it always did.

### blazon.tailwind

Writes the brand's tokens as a Tailwind v4 theme. It reads `brand.json` and nothing else, so `blazon tokens` runs it as well as `blazon build`, and it needs only Node, no browser.

```json
{
  "plugins": [ { "name": "blazon.tailwind" } ]
}
```

It writes into `dist/tokens/blazon.tailwind/`:

- `tailwind.css`: an `@theme` block with a variable for each token that fills a Tailwind theme namespace. [Chapter 8](08-using-the-outputs.md#tailwind) has the table of what maps and how the names are made.
- `tailwind-reset.css`: an `@theme` block that sets `initial` on each namespace the brand fills, so only the brand's values remain ([Closing Tailwind's defaults](08-using-the-outputs.md#closing-tailwinds-defaults)).

A brand with no token in any namespace gets neither file. The plugin has no option. The same brand gives the same bytes.

| Finding | Severity | Means |
|---|---|---|
| `blazon.tailwind/variable-duplicate` | error | Two tokens with different values write one Tailwind variable (`color.brand` and `colors.brand` are both `--color-brand`); `tailwind.css` keeps the first. Rename one of them. Two tokens with one value, such as a semantic alias and its primitive, are not reported |
| `blazon.tailwind/option-invalid` | error | The entry gives an option, which this plugin does not take, or `options` is not an object |
