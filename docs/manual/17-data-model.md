# The data model

← [Manual index](index.md)

A list of everything blazon reads, holds and writes, with the name each field has in the code and in `brand.json`. The formal rules are in [RFC 0001](../rfc/0001-data-model.md); this chapter is the reference to look a field up in. [The glossary](16-glossary.md) says what the words mean.

Blazon works in three steps. It **reads** the files you write, **compiles** them into one model (`BlazonData`), and **writes** outputs from that model. `blazon check` tests the model, and plugins see a copy of it as [`brand.json`](11-brand-json.md).

```text
tokens/  docs/  assets/  blazon.config.ts   →   BlazonData   →   dist/tokens/  dist/site/  brand.json
(what you write)                                (compiled)       (what blazon writes)
```

## What you write

| Input | Where | Holds | Chapter |
|---|---|---|---|
| Token files | `tokens/*.json` (`tokensDir`) | [DTCG](https://www.designtokens.org/TR/2025.10/format/) tokens and groups, and their `$extensions["dev.blazon"]` | [2](02-tokens.md) |
| Resolver document | `blazon.resolver.json` (`resolver`) | The token files, the modifiers and their contexts | [4](04-contexts.md) |
| Pages | `docs/*.md` (`docsDir`) | Front matter and Markdown, with directives | [5](05-pages.md) |
| Assets | `assets/` (`assetsDir`) | Image files, grouped into categories by folder | [6](06-assets-and-icons.md) |
| Sidecars | `<name>.json` beside an asset | The asset's title, rules, review and provenance | [6](06-assets-and-icons.md) |
| Icon packages | `node_modules` (`iconSets`) | Icons, listed by category | [6](06-assets-and-icons.md) |
| Configuration | `blazon.config.ts` | Titles, folders, theme, logo, the `assets` block, sections, vocabulary, plugins, fonts | [7](07-theme-and-config.md) |
| Locks | `blazon.lock`, `blazon.plugins.lock` | The blazon commit that builds the brand, and the digests of pinned plugins | [12](12-plugins.md), [15](15-maintaining-a-brand-book.md) |

## What blazon holds: `BlazonData`

`compileBlazonData` returns one object. The brand book, the checks and the outputs all read it.

| Field | Holds |
|---|---|
| `title`, `description` | The brand book's name and one line about it, from the config |
| `version` | An optional version string for the brand |
| `tokens` | The parsed tokens (`ParsedTokens`, below) |
| `findings` | The findings of `blazon check`: load problems plus rule checks |
| `theme` | The brand book's own look: each theme role's resolved CSS value |
| `themeTokens` | The token path behind each theme role, so a context that changes the token changes the role |
| `fonts` | The font stylesheet addresses the brand book loads |
| `logo` | The logo variants as data URIs (`LogoSet`) |
| `docs` | The pages (`DocItem`) |
| `assets` | The assets, as a catalog of logos, icons and custom categories (`AssetCatalog`) |
| `assetCategories` | Each asset category with its label, order, description and rules, in display order |
| `iconSets` | The icon packages named in `iconSets`, with their categories |
| `vocabulary` | The lockups and usage roles a value may name: the standard ones, then the brand's own |
| `sections` | Every section a page may declare: the standard ones, then the brand's own |
| `emailSignature` | The `emailSignature` block of the config, for the email signature directive |

## Tokens

`ParsedTokens` is the token side of the model.

| Field | Holds |
|---|---|
| `items` | Every token (`TokenItem`), in file then document order |
| `byPath` | The tokens by full path. It exists only where blazon runs: the brand book receives the data as JSON, where a map is empty |
| `groups` | The tokens grouped by top-level group (`TokenGroup`) |
| `nested` | The resolved values in the original hierarchy; a composite is an object of CSS-ready parts |
| `groupMeta` | The groups that carry a `$description` or `dev.blazon` fields (`GroupMeta`) |
| `problems` | The problems found while loading and resolving; `blazon check` adds its rule findings |
| `contexts` | With a resolver document, every non-default context, one modifier at a time (`TokenContext`) |
| `modifiers` | With a resolver document, each modifier with its default context and all its contexts |

### A token: `TokenItem`

| Field | Holds |
|---|---|
| `path` | The full dotted path from the root: `color.brand.indigo` |
| `group` | The first path segment: `color` |
| `name` | The last path segment: `indigo` |
| `file` | The file the token was declared in, from the project root: `tokens/colors.json`. A token written inside a resolver document names that file and says it is inline |
| `rawValue` | `$value` as written, aliases included |
| `resolvedValue` | `$value` with every alias replaced, in DTCG structure |
| `value` | The CSS-ready value: `#635DFF`, `16px`, `600 64px/1.125 'Inter'` |
| `parts` | For a composite type (typography, border, transition, a single shadow): each part as a CSS-ready value |
| `type` | The declared or inherited `$type`. Undefined when there is neither, which is an error |
| `description` | `$description`, when the token has one |
| `deprecated` | `$deprecated`: `true`, or a sentence |
| `aliasOf` | The path of the token this one aliases directly, when its `$value` is a single alias |
| `extensions` | `$extensions` as written, other vendors' included |
| `blazon` | The `dev.blazon` fields merged from the ancestor groups and the token (`BlazonExtension`) |
| `cssVariable` | The CSS custom property name: `--color-brand-indigo` |

### A group: `TokenGroup` and `GroupMeta`

`TokenGroup` has `name` (the top-level group, `color`), `files` (the files that contributed tokens), `tokens` and `blazon` (the group's own `dev.blazon` fields). `GroupMeta` has `path`, `description` and `blazon`, for each group that carries a description or `dev.blazon` fields.

### A context: `TokenContext`

| Field | Holds |
|---|---|
| `modifier` | The resolver modifier's name: `locale` |
| `context` | The context's name: `ja` |
| `selector` | The CSS selector its variables are written under: `:lang(ja)` |
| `tokens` | The tokens whose CSS value differs from the default's, which is what the context's CSS block holds |
| `metadataChanges` | The tokens that keep the default's CSS value but say something else: another description, deprecation, type, extension or alias |

A context holds only what it changes. The whole set of tokens in a context is the default's with those changes applied, and a copy kept by hand drifts from it.

### The brand rules: `BlazonExtension`

The `dev.blazon` fields of a token or group. Every field is optional.

| Field | Holds |
|---|---|
| `tier` | `primitive`, `semantic` or `component` |
| `role` | The usage role the token plays, checked against the usage of what it aliases |
| `usage` | `allow` and `deny`: the usage roles the token may and may not be used for |
| `print` | Print values: `cmyk` (four numbers), `pms`, a Pantone name, and `ral`, a RAL number such as `5012` |
| `source` | Where the guidelines state the value (`doc`, `locator`), and `cssVar`, the live site's variable it was read from, which `blazon drift` compares |
| `review` | Whether a person has confirmed the value (`Review`, below) |
| `logo` | `deny`: the logo variants the brand forbids on this background, whatever their contrast, with a `reason` |
| `angle` | A gradient's direction in degrees |
| `preview` | How the brand book previews the token, when its type and name do not say |
| `webFont` | `false`, or a sentence, for a typeface the brand book cannot load |
| `font` | On a font family token or group: `source`, `license` and `licenseUrl` |
| `proportion` | Group only: the documented share of a composition, by group path or by a label with its tokens |
| `pairs` | Group only: contrast rules, each a foreground `fg`, a background `bg` and a minimum `min` |
| `pattern` | Group only: marks the group as a pattern of one kind |

`Review` has `status` (`ok` or `needs-review`), and optionally `note`, `by` (who confirmed the value), `at` (the day, `YYYY-MM-DD`) and `value` (the fingerprint of the confirmed value, 12 hex digits printed by `blazon approvals`).

## Pages

### A page: `DocItem`

| Field | Holds |
|---|---|
| `slug` | The file name without its extension and its ordering prefix: `01-intro.md` has the slug `intro` (route `#doc/intro`), `colors.md` has `colors` |
| `filePath` | The file's path relative to the docs folder |
| `title` | The title from the front matter, else the first H1, else the file name |
| `order` | The sort order from the front matter, else the file name's prefix |
| `meta` | The front matter (`DocFrontmatter`) |
| `sections` | The sections the page holds, from `section:` in its front matter: each id once, in the order written |
| `markdown` | The Markdown without its front matter |
| `html` | The compiled HTML |

The front matter has `title`, `order`, `description`, `group` (the sidebar heading the page sits under), `opener` (`full` for a full-height cover or `compact` for a short header; the first page defaults to `full`) and `section`.

### Sections and vocabulary

`SectionInfo` has `id`, `title` and `standard` (true for one of the fourteen standard sections, false for one the brand added). `Vocabulary` has `lockups` and `usageRoles`: the names a value may use, the standard ones first and the brand's own after.

## Assets

### An asset: `Asset`

| Field | Holds |
|---|---|
| `id` | The asset's identifier: `logos/master-dark`, `icons/arrow-right` |
| `name` | The file name without its extension: `master-dark` |
| `category` | `logos`, `icons`, a folder under `assets/`, or `assets` for a file at the top |
| `filePath` | The path relative to the assets folder, with forward slashes |
| `format` | `svg`, `png`, `jpg`, `gif`, `webp` or `avif` |
| `mediaType` | The media type of the file |
| `url` | The relative address the brand book loads the file from |
| `bytes` | The file size in bytes |
| `width`, `height` | The pixel size of a raster; for an SVG, its `width` and `height` attributes when present |
| `viewBox` | SVG only: the `viewBox` attribute |
| `svg` | SVG only: the markup without its XML prologue, for copying and inline display |
| `meta` | The sidecar (`AssetMeta`), when the asset has one |

### A sidecar: `AssetMeta`

| Field | Holds |
|---|---|
| `title`, `description` | A name for the asset where its file name will not do, and a sentence about it |
| `traits`, `do`, `dont` | The qualities the brand asks of this kind of asset, and what to do and not to do, as short statements |
| `background` | `light` or `dark`: the background the artwork is made for |
| `ink` | The artwork's main color as a CSS color, so a logo can be chosen for a background by contrast |
| `unit` | The length the brand measures this artwork in, in its own pixels |
| `clearSpace` | The space to keep free around the artwork |
| `minSize`, `maxSize` | The smallest and the largest size it may be shown at |
| `replacedBelow` | Below this width or height, the asset to use instead |
| `lockup`, `placement` | The logo lockup this artwork is, and the corners it may sit in |
| `partnership`, `initiative` | The layout of a partner lockup, and of a lockup with an initiative's mark |
| `order` | Where the asset sits among the others of its category |
| `extensions` | What a consumer records of its own, under a reverse-domain key. Kept as written and never read by blazon |
| `source` | Where the guidelines state the asset (`doc`, `locator`) |
| `review` | Whether a person has confirmed it (`Review`) |
| `generated` | The provenance of an AI-generated image: `by` (the model or tool), and optionally `prompt` and `licence` |

### A category: `AssetCategoryConfig` and `AssetCategoryInfo`

`AssetCategoryConfig` is what the `assets` block of `blazon.config.ts` says about a folder: `label`, `order`, `description`, `dir`, `rules`, `notSpecified`, `source`, `local` and the flags below. `AssetCategoryInfo` is what the brand book and `brand.json` show: the folder's name as `category`, and the config fields except `dir`. `dir` is read from the config only and is left out of the viewer data and `brand.json`, so a local path is not published.

| Field | Holds |
|---|---|
| `category` | The folder name, as directives and addresses use it |
| `label` | The sidebar and page title. The folder name made readable when the config gives none |
| `order` | The sort key. Categories without one follow: logos, icons, then the rest by name |
| `description` | One line shown under the page title |
| `dir` | Config only, not in `AssetCategoryInfo`. An extra folder whose images join the category: a path relative to the project, or an absolute one |
| `rules` | What the brand requires of the files: `formats`, `minPixels`, `aspectRatios` (`AssetRules`) |
| `notSpecified` | What the guidelines leave open, as short statements |
| `source` | Where the guidelines state it |
| `local` | Says the images are kept out of git, and how to make them |
| `experimental` | The files are explorations, not the identity |
| `reference` | The files follow the guidelines but are kept for comparison, or were supplied by someone else. Like `experimental`, it keeps the files from gating the book, and the book labels them "Reference" where it labels the other kind "Experiment". A category is one or the other |

### Logos and icons

`LogoSet` has `onLight` and `onDark` (data URIs) with `onLightAsset`, `onDarkAsset` (the ids of the logo assets they are), `onLightInk` and `onDarkInk`. `IconSet` has `name`, `package`, `version`, `license`, `count` and `categories`, and each category has a `name` and its `icons`.

## Findings

A finding (`Finding`) is one result of `blazon check`.

| Field | Holds |
|---|---|
| `code` | What kind of finding it is: `usage-violated`. A plugin's codes start with its name and a `/` |
| `severity` | `error`, `warning` or `info` |
| `path` | The token, group or asset it is about, or a file name for a parse error |
| `message` | The sentence that says what is wrong |
| `context` | Set when the finding occurs only in one resolver context: `locale=ja` |
| `file` | The file it is about, relative to the project |
| `line` | The line in `file` where the token's key is written, when known |
| `fix` | What to do about this finding, when it is not the fix of its code: a `plugin-failed` finding gives the fix for its own cause |

## The controlled lists

Names blazon checks a value against.

| List | Members |
|---|---|
| Token type (`$type`) | `color`, `dimension`, `fontFamily`, `fontWeight`, `duration`, `cubicBezier`, `number`, `strokeStyle`, `border`, `transition`, `shadow`, `gradient`, `typography` |
| Tier | `primitive`, `semantic`, `component` |
| Contrast level | `AA`, `AA-large`, `AAA` |
| Pattern kind | `dots`, `lines`, `diagonal`, `grid`, `checks` |
| Preview kind | `radius`, `square`, `stroke`, `tracking`, `fontSize`, `frame`, `opacity`, `border`, `bar` |
| Asset format | `svg`, `png`, `jpg`, `gif`, `webp`, `avif` |
| Logo corner | `top-left`, `top-right`, `bottom-left`, `bottom-right` |
| Initiative position | `beside`, `below` |
| Theme role | `background`, `canvas`, `text`, `muted`, `border`, `accent`, `accentText`, `inverse`, `inverseText`, `fontDisplay`, `fontBody`, `radius` |
| Severity | `error`, `warning`, `info` |
| Lockup | `horizontal`, `stacked`, `mark`, `wordmark`, and the names added in `vocabulary.lockups` |
| Usage role | `text`, `background`, `border`, `icon`, `illustration`, `accent`, `interactive`, and the names added in `vocabulary.usageRoles` |
| Section | The fourteen standard sections ([chapter 5](05-pages.md)), and the names added in `customSections` |

## What blazon writes

| Output | Where | Holds |
|---|---|---|
| CSS, TypeScript and JSON | `dist/tokens/` | `theme.css`, `typography.css`, `tailwind.css`, `tailwind-reset.css`, `tokens.ts`, `tokens.json`, and `tokens.<modifier>.<context>.json` for each context ([chapter 8](08-using-the-outputs.md)) |
| The brand book | `dist/site/` | The static site |
| `brand.json` | `dist/site/` | The model as one versioned file, with `brand.schema.json` beside it |
| Plugin files | `dist/tokens/<plugin>/` | What each build plugin writes |

`brand.json` has these top-level keys, all required: `format`, `version`, `generator`, `brand`, `theme`, `logo`, `vocabulary`, `sections`, `tokens`, `groups`, `modifiers`, `contexts`, `pages`, `assets`, `categories`, `iconSets`, `findings`. A reader checks `format` and `version`, and ignores a key it does not know. [Chapter 11](11-brand-json.md) describes each.
