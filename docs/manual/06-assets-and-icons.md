# Assets and icons

← [Manual index](index.md)

## Assets

Assets are image files in `assets/`: SVG, PNG, JPEG, GIF, WebP and AVIF. Other files are ignored. An asset's **category** is the first folder it sits in: `logos`, `icons`, or any name you choose, including `constructor` or `__proto__`. A file directly in `assets/` has the category `assets`. Its id is `category/name`, such as `logos/logotype-black`, with no extension. `mark.svg` and `mark.png` in one folder have the same id, `logos/mark`, and share one sidecar: they are one asset in two formats, and blazon's own readers take the SVG first, then PNG, WebP, JPEG, GIF, and any other format by name, unless a tool needs one format (the favicons plugin needs an SVG). A `logo` in `blazon.json` names a file, and a plugin that draws that logo draws that file, even when its asset has other files; a plugin option that names an id, such as the `logo` option of `blazon.office-template`, takes the choice above. Two files with one id in different folders are an error (`asset-id-duplicate`), because the id would name both.

The brand book has an assets page for each category. For SVG it offers Copy SVG, Copy JSX and Download. For raster images it offers Download and Copy URL. The files are served from `brand-assets/` in the dev server and copied there by `blazon build`.

Show assets in a page with [`blazon:assets`](05-pages.md#directives).

## Asset categories

A category is a folder of `assets/`. To label it, order it, describe it, scan another folder as part of it, or state rules its files must follow, add an entry for it to the `assets` block of `blazon.json`. The key is the folder's name:

```json
{
  "assets": {
    "photography": {
      "label": "Imagery",
      "order": 1,
      "description": "People, product and campaign photos.",
      "rules": {
        "formats": [ "webp", "jpg" ],
        "minPixels": { "width": 1600 },
        "aspectRatios": [ "16:9", "1:1" ]
      },
      "notSpecified": [ "Shot sizes", "Retouching" ],
      "source": { "doc": "brand-guidelines", "locator": "slide 61" }
    },
    "illustrations": { "dir": "../shared/illustrations" }
  }
}
```

| Field | Does |
|---|---|
| `label` | The name in the sidebar and the page title. The folder name, capitalized, when absent |
| `order` | Where the category sits in the sidebar, lowest first. Categories with an `order` come first, then `logos`, then `icons`, then the rest by name |
| `description` | One line under the page title |
| `dir` | An extra folder whose images join this category. A path relative to the project or an absolute one. It may sit outside the project, such as a shared folder in a monorepo, only when you approve that folder when you run blazon, see [An extra folder](#an-extra-folder) |
| `rules` | What every file in the category must follow, below |
| `notSpecified` | What the guidelines leave open, as short plain statements: `['Shot sizes', 'Retouching']`. [`blazon:section`](05-pages.md#sections) lists them under the category |
| `source` | Where the guidelines say it, as `{ "doc": "brand-guidelines", "locator": "slide 61" }`, the shape a sidecar's `source` has |
| `local` | The images are kept out of git, and this sentence says how to make them: `'Run render-art.py with your copy of the guidelines PDF.'` See [Images kept out of git](#images-kept-out-of-git) |
| `experimental` | `true` for a category of explorations, such as logo directions that are not the identity. See [Experimental categories](#experimental-categories) |
| `reference` | `true` for a category of material that follows the guidelines but is kept for comparison, or was supplied by someone else. See [Reference categories](#reference-categories) |

A key that has no folder and no `dir` is a warning (`asset-config-unused`), because it is usually a typo. An entry with a mistake is left out whole, and `blazon check` reports it (`asset-config-invalid`).

### Images kept out of git

Some images may not be shared: a brand's guidelines can forbid passing its logos on, or the files are made from a document you keep out of the repository. Commit the sidecars and the pages, keep the images out with `.gitignore`, and mark the category `local`:

```json
{
  "assets": { "logos": { "local": "Run render-art.py with your copy of the guidelines PDF." } }
}
```

In a checkout without the images, `blazon check` gives one note per category (`asset-local-missing`) instead of an error for every sidecar, logo and directive that needs them, and the brand book leaves them out. When one image of the category is there, everything is checked as usual, so images made only in part still show. `brand.json` keeps `local` on the category, so a tool that reads it knows not to pass those images on.

### Experimental categories

A category of explorations does not gate the book. Mark it `experimental`:

```json
{
  "assets": { "experiments": { "label": "Experiments", "experimental": true } }
}
```

An asset in it can say `review: needs-review` for as long as it likes: `blazon check` reports no `review-pending`, no `asset-review-missing`, and no `page-review-pending` for a page that draws it, so `--strict` can pass. A page that draws experimental and ordinary assets together still reports the ordinary ones that are flagged. The `review` stays in the sidecar and in `brand.json`, and every other check applies as usual.

The brand book labels the category "Experiment" on its page and on every asset a page draws from it: with `blazon:assets`, `blazon:section`, `blazon:logo-space`, `blazon:logo-lockups`, `blazon:logo-partner`, `blazon:logo-initiative`, `blazon:logo-placement` and `blazon:logo-misuse`, each asset or pair carries the label, and `blazon:icons` carries it once above the icons. A partner pair or a logo with its mark is labelled when either file is in an experimental category. The Review page lists it under Experiments with the number of files, apart from the findings. `brand.json` keeps `experimental: true` on the category. The press kit and the logo kit draw only the `logos` and `partners` categories, so they never include one, and the brand deck leaves every experimental category out with no option.

### Reference categories

Some material is neither a live asset nor an exploration: the card faces extracted unedited from the guidelines so that your own masters can be compared with them, or a favicon set that someone else supplied and you keep as a record. Mark the category `reference`:

```json
{
  "assets": { "cards-reference": { "label": "Card faces from the guidelines", "reference": true } }
}
```

A reference category does not gate the book, as an experimental one does not: `blazon check` reports no `review-pending`, no `asset-review-missing`, and no `page-review-pending` for a page that draws one of its assets. A page that draws both reference and ordinary assets still reports the ordinary ones that are flagged. Every other check applies as usual. A category cannot be both `experimental` and `reference`: setting both to `true` is an `asset-config-invalid` error.

The difference is what the book says. The brand book labels the category "Reference" on its page and on every asset a page draws from it, in the same places that carry the "Experiment" label, and the Review page lists it under Reference with the number of files, apart from the findings. `brand.json` keeps `reference: true` on the category. The brand deck leaves every reference category out with no option. The press kit and the logo kit draw only the `logos` and `partners` categories, so they never include one.

### An extra folder

Every image under a `dir` joins the category, in folders at any depth, with sidecars beside them as usual. Its files get the same ids and addresses as files in `assets/<key>/`: a file `deep/panel.png` in the folder is `illustrations/panel`, shown at `brand-assets/illustrations/deep/panel.png`. If `assets/<key>/` also exists, both are scanned. A key with a `dir` is a URL segment, so it is lowercase letters, digits and hyphens.

**A folder outside the project needs your approval.** A `dir` inside the project is read as it is. One outside it, by `../`, an absolute path or a link, is refused with the `config-path-outside` error (on `assets.<key>.dir`) and the category is left out, until the person running blazon approves the folder. The brand cannot do that for itself, because everything in `blazon.json` comes from the brand: there is no key for it, and a key that tries is an unknown field. Approve a folder on the command line, once for each folder:

```sh
blazon dev --allow-dir ../shared
blazon build --allow-dir ../shared --allow-dir /srv/brand-media
```

or in the environment, with the folders separated as a `PATH` is (`:` on macOS and Linux, `;` on Windows):

```sh
BLAZON_ALLOW_DIRS=../shared:/srv/brand-media blazon check
```

A monorepo puts the option in the script that runs blazon: `"dev": "blazon dev --allow-dir ../shared"` in the brand's `package.json`. A relative folder is relative to the folder you start blazon in (before `--cwd` moves it). An approved folder covers the folders under it. Blazon compares where folders really are, links followed: a `dir` that is a link out of the approved folder, or a `..` that leaves it, is refused. The refusal reads the same whether or not the folder exists, so a brand cannot use it to look around your disk. The dev server serves, and the build copies, only image files in an approved folder, and plugins are never given `BLAZON_ALLOW_DIRS`. The MCP server reads an outside folder only if its own environment sets it, see [chapter 20](20-blazon-for-agents.md#a-folder-outside-the-brand).

The dev server serves only image files from the folder, and never a link that points out of it. `blazon build` copies only the images it cataloged. Local paths never reach the page.

### Rules

`rules` tests every file in the category, whether it sits in `assets/` or in a `dir`. A file that breaks a rule is an error (`asset-rule-violated`), as a contrast pair that fails is.

| Rule | Means |
|---|---|
| `formats` | The file formats allowed, from `svg`, `png`, `jpg`, `gif`, `webp` and `avif`. A `.jpeg` file is `jpg` |
| `minPixels` | The smallest pixel size a raster image may have: `width`, `height` or both. Blazon reads the size from the file's header. A vector file is not measured |
| `aspectRatios` | The ratios allowed, each written `16:9`. A file matches one when its width over its height is within 1% of it. This applies to vector files too, by their `viewBox` |

Blazon judges what it can read cheaply: the format, the pixel size and the ratio. It does not judge what is in a photo or how it is graded.

## Sidecars

A sidecar is a JSON file beside an asset, with the same name: `logos/mark.json` describes `logos/mark.svg` and `logos/mark.png` alike. It states what the brand says about the artwork.

```json
{
  "title": "White logo",
  "description": "Primary usage: the white logo goes on dark backgrounds.",
  "traits": ["Sharp edges", "Never recolored"],
  "do": ["Place it on dark backgrounds"],
  "dont": ["Place it on a busy photo"],
  "background": "dark",
  "unit": { "value": 12, "unit": "px" },
  "clearSpace": { "units": 1 },
  "minSize": { "width": { "value": 80, "unit": "px" } },
  "lockup": "horizontal",
  "placement": ["top-left", "bottom-left"],
  "partnership": { "gap": { "units": 1 }, "dividerHeight": { "value": 40, "unit": "px" } },
  "initiative": { "name": "Open Banking Lab", "mark": "initiatives/open-banking-lab", "gap": { "units": 2 }, "position": "below" },
  "source": { "doc": "brand-guidelines", "locator": "slide 17" },
  "review": { "status": "needs-review", "note": "Slide shows a different black" }
}
```

| Field | Meaning |
|---|---|
| `title` | A name for the asset where its file name will not do: `Lifestyle` for `lifestyle-01.webp`. A non-empty string |
| `description` | One line, shown on the asset's card |
| `traits` | The qualities the brand asks of this kind of asset, as short plain statements, such as `"Candid and real"` |
| `do`, `dont` | What to do and what not to do, as short plain statements |
| `background` | `light` or `dark`: the background the artwork is made for |
| `ink` | The artwork's main color: a hex string such as `"#0B1F3A"`, or an alias to a color token such as `"{color.navy.900}"`. On a logo it makes the file a candidate for `blazon:logo-on`, `blazon:logo-contrast` and the page covers: where its ink reaches 3:1 on the background, it is used in place of the `logo.onLight` or `logo.onDark` file. When the asset is itself the `logo.onLight` or `logo.onDark` file (matched by file), `blazon:logo-contrast` judges that file as this ink and not as black or white, and `brand.json` carries it as `logo.onLightInk` or `logo.onDarkInk`. Anything that is not a color is an error |
| `colorways` | The named backgrounds this logo is shown on, each with the contrast it must reach: a list of at least one `{ "name": "Graphite on Bone", "on": "{color.base.bone}", "variant": "logos/acme-bone", "min": "AA" }`. `name` is the label of the figure and must be unique in the list. `on` is an alias to a color token, the background. `variant` is another logo of the brand, an asset id written `category/name`, drawn in place of this one (the white version on a dark background, say); a variant that names no asset is an `asset-sidecar-invalid` error. `min` is `AA-large` (3:1, the default, the level for a logo as a graphical object), `AA` (4.5:1) or `AAA` (7:1). The artwork is measured as the `ink` of the file drawn, else black when its `background` is `light` and white when it is `dark`. A colorway below its `min` is a `contrast-insufficient` error, and one that cannot be measured (no `ink` and no `background`, or a translucent background) is a `contrast-unknown` warning. [`blazon:logo-colorways`](05-pages.md#directives) draws them |
| `unit` | The length the brand measures this artwork in, in the artwork's own pixels: the height of a star, say. Rules written as multiples of it hold at any size |
| `clearSpace` | The space to keep free around it: a dimension, or a multiple of the `unit` |
| `minSize` | `width`, `height` or both: the smallest it may be shown, such as `{ "height": { "value": 32, "unit": "px" } }` for a logo that must be 32px high or more. With both, `blazon:logo-space` draws the width. Blazon does not measure a size on a page or app you build: the rule is for the person or agent who builds it, and `blazon logo` and `brand.json` carry it. Only the plugins that draw the logo themselves hold to it |
| `maxSize` | `width`, `height` or both: the largest it should be shown, as for a logo drawn only for small use |
| `replacedBelow` | Below a size, use another asset instead: `{ "width": { "value": 30, "unit": "px" }, "by": "logos/small-mark" }`. `by` is an asset id, and one that names no asset is an error |
| `lockup` | The shape of this artwork: `horizontal`, `stacked`, `mark` or `wordmark`, or a name you added in `vocabulary.lockups` ([adding your own names](07-theme-and-config.md#adding-your-own-names)) |
| `misuse` | The kinds of misuse `blazon:logo-misuse` draws for this logo when the directive names none: a list of at least one of `stretch`, `squash`, `rotate`, `outline`, `recolor`, `shadow`, `crop`, `low-contrast` and `busy-background`. Without it the default six are drawn: `stretch`, `rotate`, `outline`, `recolor`, `shadow`, `low-contrast`. A name that is not a kind is an `asset-misuse-unknown` error |
| `placement` | The corners the logo may sit in, listed in order of preference, from `top-left`, `top-right`, `bottom-left` and `bottom-right`. Blazon does not check a page against it |
| `partnership` | How the logo sits beside a partner's: `gap` (the space on each side of the divider), and optionally `dividerHeight` and `partnerHeight`. Each is a measure. A brand whose partner lockup has no divider leaves out `dividerHeight`, and `gap` is then the space between the two logos |
| `initiative` | A program the brand runs, drawn with the logo as the program lockup: `name` (the program), `mark` (the program's artwork, an asset id written `category/name`) and `gap` (a measure) are required; `position` is `beside` (the default: to the right, on one baseline) or `below` (under the logo, left edges aligned), and `markHeight` (a measure) is the mark's height, the logo's own height when absent. A `mark` that names no asset is an error |
| `order` | A number: where the asset sits among the others of its category, lowest first. Assets without one follow, by file name, and ties keep file-name order. Any number works, including negative and fractional ones |
| `extensions` | What a tool or team records of its own, such as contrast results or safe zones: an object whose keys are reverse domain names, `{ "com.acme.contrast": { "onDark": 7.2 } }`. Blazon keeps it as written in `brand.json` under `meta.extensions` and never reads it. The key `dev.blazon` is not allowed here: a sidecar's own fields are blazon's. It is `extensions` and not DTCG's `$extensions` because a sidecar is not a DTCG file, and its other fields have no `$` either; `brand.json` spells a token's the same way |
| `source`, `review` | As on a token: [`dev.blazon` fields](02-tokens.md#the-devblazon-extension). `review` takes `by` and `at` too (`{ "status": "ok", "by": "Dana Whitfield", "at": "2026-10-29" }`). Its `value` is the fingerprint of the image file's bytes, from `blazon approvals`: replace the artwork and `blazon check` warns `approval-stale`; editing the sidecar does not. An asset in two formats (`mark.svg` and `mark.png`) has one approval and one `value`, which covers both files: `blazon approvals` prints one row for the id with its files, and a change to, an addition of or a removal of either file makes it stale once. A malformed `review` is an `asset-sidecar-invalid` error |
| `generated` | Where an AI-generated image came from: `{ "by": "Midjourney v7", "prompt": "a lighthouse at dusk", "licence": "Midjourney commercial plan" }`. `by` is the model or tool and is required; `prompt` and `licence` are optional strings. Unknown keys inside it are errors. An asset with `generated` and no `review` is a warning (`asset-review-missing`) until a person checks it and sets `review.status` to `ok`. `brand.json` carries it under the asset's `meta` |

`traits`, `do` and `dont` are each a list of at least one non-empty string, with no formatting: the same file is read by the brand book and by other tools (see [chapter 11](11-brand-json.md)). [`blazon:section`](05-pages.md#sections) draws them with the asset.

A **dimension** is `{ "value": 20, "unit": "px" }` with the unit `px` or `rem`, or an alias to a dimension token such as `"{spacing.4}"`. A **measure** is a dimension, or a multiple of the artwork's `unit`: `{ "units": 1 }` means one unit. Brand guidelines write logo rules in a unit ("clear space equals the height of the star"), and a multiple says exactly that. It needs a `unit` in the same sidecar, and `units` must be above 0. `minSize`, `maxSize` and `replacedBelow` are always dimensions, because a size to show a logo at is an absolute size on a screen. Unknown fields are errors, so a typo shows.

The `unit` is measured in the artwork's own pixels. For an SVG that is its own coordinates, so it holds at any size. For a PNG or other raster file it holds only at the size the file has: if you export the logo again at another size, update the `unit`. A `unit` taller than the artwork is an error.

[`blazon:logo-space`](05-pages.md#directives) draws the clear space and minimum size from a sidecar, `blazon:logo-lockups` groups logos by `lockup`, `blazon:logo-partner` draws a partnership, `blazon:logo-initiative` draws a program lockup, `blazon:logo-placement` draws the corners and `blazon:logo-misuse` draws the logo misused in named ways, one figure for each, with the `dont` rules listed beneath. The rules also show on the asset's card.

Each `blazon:logo-misuse` figure is the logo's own image changed by CSS, so no file is processed: `stretch` and `squash` set another aspect ratio on the image, `rotate` turns it, `outline` traces its shape with four zero-blur drop shadows (a CSS `filter`), `recolor` flattens it to mid tones and turns the hue, `shadow` adds a drop shadow, `crop` draws it larger than a box that clips it, `low-contrast` puts it on a background nearly the color of its `ink` (or, with no `ink`, on the surface it is not made for), and `busy-background` puts it on a pattern of crossed stripes. The colors come from the sidecar's `ink` and from the theme, never from blazon.

A sidecar that is not valid JSON, has an unknown or malformed field, or is a symbolic link that points outside the assets folder is an error (`asset-sidecar-invalid`). A sidecar with no image of its name is a warning (`asset-sidecar-orphaned`). Sidecars are not copied by `blazon build`.

## Icon sets

An icon set previews an icon package, such as Lucide or Tabler, instead of copying its files into `assets/`. Install the package, then name it in `blazon.json`:

```bash
npm install lucide-static
```

```json
{
  "iconSets": [
    {
      "name": "lucide",
      "package": "lucide-static",
      "categories": { "Navigation": [ "arrow-left", "house" ] }
    },
    { "name": "tabler", "package": "@tabler/icons" }
  ]
}
```

Each entry is `{ name, package, dir?, categories? }`:

- `name` is lowercase letters, digits and hyphens, and starts with a letter. It is the name you give the directive.
- `package` is an npm package in the project's `node_modules`. The version is whatever your lockfile pins.
- `dir` is the folder of `.svg` files inside the package. Blazon knows it for the packages below. Any other package needs `dir`.

| Package | Default `dir` | Categories without a map |
|---|---|---|
| `lucide-static` | `icons` | None |
| `@tabler/icons` | `icons/outline` | Tabler's own `category` for each icon |
| `@mdi/svg` | `svg` | The first tag of each icon |
| `@material-symbols/svg-<weight>`, such as `svg-400` | `outlined` | None |

An icon is a file name without `.svg`.

### Categories

- Your `categories` map wins. It maps a category name to icon names, inline or as the path of a JSON file inside the project. The categories appear in the order you list them. A directive names a category exactly as the map spells it, capitals included.
- Without a map, Tabler and MDI use their own data, in alphabetical order.
- An icon in no category goes under "Other", which is last. Lucide and Material ship no category data, so give them a map.
- A name in your map that the package lacks is a warning (`icon-unknown`).

### Showing the set

`<!-- blazon:icon-set lucide -->` shows every category, or name some: `<!-- blazon:icon-set lucide Navigation Security -->`. Each category is collapsed, with its icon count. Open one and its icons are drawn in the theme's text color. Icons are drawn only while a category is open, so a set of thousands costs nothing when the page loads.

### What blazon does with the files

The dev server serves a set's SVGs from the package, under `/brand-assets/icon-sets/<name>/<icon>.svg`. `blazon build` copies every icon of each set to the same place in `dist/site/`. Lucide is about 1 MB and Tabler about 3 MB. A symbolic link inside the package that points outside it is not an icon of the set, and is never copied. `package` is a package name as npm writes it (`name` or `@scope/name`), looked up in the project's `node_modules`; a path such as `../shared` is not a package name and the set is refused.

### When a set fails

A set that cannot be read is an error (`icon-set-invalid`) and is left out; the others still load. The message says why: a name that is not lowercase letters, digits and hyphens starting with a letter, a name used twice, a `package` that is a path and not a package name, a package that is not installed (it names the folder it looked in and the `npm install` to run), a package that needs `dir`, a `dir` outside the package or missing from it, a folder with no `.svg` files, or a categories file that is not valid JSON or is outside the project.

The package must be installed at `<project>/node_modules/<package>`. A package hoisted into a parent folder's `node_modules` is not found.
