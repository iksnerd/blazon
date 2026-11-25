# blazon.office-template

The plugin blazon ships to write an editable PowerPoint template from a brand: a theme with the brand's colors and fonts, a slide master, and five layouts (Cover, Section divider, Title and content, Two columns, Closing) with the logo placed as its sidecar says. It fills the `build` role and needs only Node: no browser.

The source is `src/shipped/office-template/`, and `npm run build` (`npm run build:plugins`) bundles it, with the blazon code it uses, into `bin/blazon-blazon.office-template.🔌`, the one file that holds the plugin's code and that `plugins/shipped.lock` pins. It loads nothing from `node_modules`, so the pin covers all the code it runs, apart from Node itself. The manual's plugins chapter says what to put in the config and what the plugin writes.

## What goes where

| Theme slot | From the brand |
|---|---|
| `dk1`, `lt1` | The `text` and `background` roles, the darker in `dk1`. A dark brand has its background in `dk1`, and the master's color map says so |
| `dk2`, `lt2` | The `inverse` and `canvas` roles, the darker in `dk2` |
| `accent1` | The `accent` role |
| `accent2` to `accent6` | The `accents` option, then `muted`, `border`, then the brand's color tokens that are not aliases, in token order, then tints of the accent. A color the theme already has is skipped |
| `hlink`, `folHlink` | The accent, and `muted` |
| Heading font (major) | The first named family of `fontDisplay` |
| Body font (minor) | The first named family of `fontBody` |

The Cover, Section divider and Closing layouts sit on the `inverse` surface, the others on the background. A logo made for dark surfaces goes where the surface is dark, and a logo made for light surfaces where it is light; a logo is made for what its sidecar `background` says, else for what `logo.onLight` and `logo.onDark` in brand.json make it. A `logo.deny` on the token that `theme.tokens` names for `background` or `inverse` (or on a token it aliases) is honoured as `blazon logo --on` honours it: the denied logo is left off that surface and another that is allowed and reaches the contrast bar is used, else the surface has none.

The logo is drawn at 1.3 inches wide on the master, 2.4 on the Cover and 2 on the Section divider and Closing layouts, held between the sidecar's `minSize` and `maxSize`. Its `clearSpace` is kept free on every side: no placeholder reaches into it. A plain SVG logo is written as PowerPoint shapes, so it is vector in every program and can be edited; any other SVG is embedded as the SVG, which PowerPoint 2016 and later draws.

## Title style

The master's title line spacing and the titles' character spacing come from the brand's typography tokens: one non-alias style set in the heading font gives its `lineHeight` and, in `em`, its `letterSpacing`: the style whose path ends in `.display`, else one ending in `.h1`, else the largest; of several with the same name, the largest. Without one, titles use a line height of 1.1 and no tracking.

## In Keynote

Keynote opens both files. The layouts arrive as Keynote master slides with the same names, with their placeholders and their backgrounds, and the logo as a group on each master. The colors show as drawn; the theme's palette is not something the Keynote scripting interface shows, so whether its color picker offers the twelve theme colors is not checked. Keynote has no theme fonts, and text in a font the computer lacks is set in Helvetica. This plugin writes PowerPoint files only; saving a Keynote file from the opened template is Keynote's job.
