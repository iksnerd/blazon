---
title: Web
order: 12
group: Applications
cover: canvas
section: applications
description: "What a website in this brand does where the tokens are silent: type, spacing, surfaces, buttons, inputs, cards, focus, light and dark, logo and copy."
---

A site built in this brand takes every color, size and font from the tokens. This page states the choices the tokens do not make for it. Each rule names the token it uses. Where a value has no token, the page says so.

## Type for each role

| Page role | Style |
|---|---|
| Hero headline | `type.display` |
| Page title | `type.h1` |
| Section heading | `type.h2` |
| Sub-section heading inside a page or chapter | `type.subhead` |
| Card heading | `type.h3` |
| Running text | `type.body` |
| Captions and meta text | `type.small` |
| Commands, file excerpts and code in running text | `type.code` |
| Eyebrows, navigation labels, token paths and numbers | `type.label` |

The display family (`font.family.display`) sets headlines only. Body text, buttons and form text never use it.

<!-- blazon:tokens type -->

### Code

A code block is `type.code` on `surface.canvas`. Its plain text stays `text.primary`. A token in it takes one `syntax` color:

| Kind of token | Token |
|---|---|
| Keywords | `syntax.keyword` |
| Strings | `syntax.string` |
| Constants and numbers | `syntax.constant` |
| Function names | `syntax.function`, at `font.weight.semibold` |
| Comments | `syntax.comment` |
| Punctuation | `syntax.punctuation` |

The mono family has a real semibold, so function names are set in the face and not a synthesized bold. The pigments behind the colors color code and nothing else (see the [color page](03-color.md)). Signal Orange is never code text.

### Narrow screens

Below 640px, a heading steps down one level: `type.display` becomes `type.h1`, and `type.h1` becomes `type.h2`. `type.h2` stays `type.h2`. Every other role is unchanged. This is a rule the site applies, not a token, and blazon does not check it. The 640px is a layout width with no token (see the next section).

## Rhythm and widths

<!-- blazon:tokens space -->

- Sections are separated by `space.16` above and below.
- Blocks inside a section are separated by `space.8`.
- Items in a group are separated by `space.4` or `space.6`.
- Nothing sits between those steps.
- Body text runs at most 64 characters to a line.
- The content column is 1200px wide and centered. On narrow screens it has `space.6` of padding on each side.

1200px and 640px are layout widths. They have no token, and blazon does not check them. The site writes each once, in its layout, and nowhere else.

## Surfaces

<!-- blazon:tokens surface -->

- Pages sit on `surface.background`.
- Alternate bands use `surface.canvas`.
- A page has at most one inverse band: a full-width section on `surface.inverse` with `text.inverse`. The band is Graphite on a light page and Bone on a dark one. The logo in it is the variant for that surface (see [The logo on the web](#the-logo-on-the-web)).
- Small parts may be inverse too: a figure tag, the title strip of a panel, the active tab, a status plate. Each is `surface.inverse` with `text.inverse`, set in `type.label`, and no wider than the panel it belongs to. None carries the logo.
- The primary action color, `interactive.primary`, marks the single primary action and small accents such as the fold, a rule or a badge. It is never a section background and never text. The only text on it is `text.onSignal`.

## Buttons

<!-- blazon:tokens border radius shadow motion -->

A button is set in `type.body` at `font.weight.semibold`. It does not use the display family or `type.label`. It is 48px tall (`space.12`) with `space.6` of horizontal padding.

| Kind | Fill | Text | Edge |
|---|---|---|---|
| Primary | `interactive.primary` | `text.onSignal` | `border.onSignal`, `radius.hairline` |
| Secondary | `surface.background` | `text.primary` | `border.rule`, `radius.hairline` |
| Disabled | `surface.canvas` | `text.muted` | `border.rule`, `radius.hairline`, no shadow |

- A button is a key, as the [form page](05-form.md) says. At rest it stands on `shadow.plate`. On hover it moves 2px right and 2px down and its shadow becomes `shadow.shim`. On press it moves the plate's whole offset and has no shadow. Write each distance from the shadow tokens' offsets, never as a number of its own.
- Each move takes `motion.duration.snap` with `motion.easing.mechanical`: "toggles and presses", and "a machine part seating into place". With reduced motion set, the states change at once.
- The button's fill, text color and edge do not change on hover or press. Signal Orange has no hover or pressed shade, and an opacity blend over it is not one either.
- A disabled button has no shadow and does not move.
- On an inverse band the primary button stays as above. The secondary button inverts: `text.inverse` on `surface.inverse`, with a `text.inverse` rule. In light the Graphite shadow does not show on the Graphite band, so both buttons there look flat. In dark the band is Bone and the Carbon shadow shows strongly on it. Either way they travel the same distances.
- The primary button's edge is `border.onSignal`, Graphite in both themes. It keeps 5.29:1 on its fill: `blazon can rule.onSignal interactive.primary --role ui` exits 0. `border.rule` would be Zinc in dark, 1.03:1 on Signal Orange. In dark the button's fill reads at 5.29:1 on Graphite and its shadow is Carbon, as for every key.
- A view has one primary button.

## Inputs and tabs

An input is a well cut into the panel. It has a `surface.background` fill, `border.rule`, `radius.hairline` and `shadow.recess`, and its text is `type.body` in `text.primary`. Placeholder text is `text.muted`. It is 48px tall (`space.12`), like a button, with `space.4` of horizontal padding.

Tabs sit in a rail that is a well too: `surface.canvas` with `shadow.recess`. Each tab is a key. The active tab is pressed: it is `surface.inverse` with `text.inverse` and has no shadow. Tab labels are `type.label`.

## Cards

A card sits on `surface.background`, or on `surface.canvas` when the page behind it is `surface.background`. It has `border.rule`, `radius.none`, `space.6` of padding and `space.4` between its parts. Its heading is `type.h3` and its text is `type.body`. Hover may add `shadow.plate` as a hard cut; a card does not move. A card has no blur, no gradient and no opacity blend.

## Focus

Every interactive element shows a 2px solid outline in `text.primary` with a 2px offset. It is not `rule.default`: the dark theme draws its rules in a quieter ink, and focus stays the high-contrast color. On an inverse surface the outline is `text.inverse`. The primary action color is not used for focus, in either theme. A focus indicator needs 3:1, and in light `blazon can interactive.primary surface.background --role ui` reports 2.74:1 and exits 1, while `blazon can text.primary surface.background --role ui` reports 14.48:1 and exits 0. In dark, `text.primary` is Bone: 14.48:1 on Graphite and 16.59:1 on Carbon. `text.inverse` on `surface.inverse` is 14.48:1 in both themes.

## Light and dark

The brand has a light and a dark theme, with the same token names in both. The [color page](03-color.md) lists them. `theme.css` holds the light values under `:root` and the dark ones in a `[data-theme="dark"]` block. A site that takes every color, rule and shadow from the token variables switches with one attribute and needs no second stylesheet.

- A website opens in dark. Printed matter, documents, decks and the brand book open in light, the default.
- The site picks the theme once, before the first paint, in a short script in the `<head>`. The visitor's stored choice wins. Without one, the system setting picks: `matchMedia('(prefers-color-scheme: light)').matches` means light. Otherwise it is dark. The script writes the answer as `data-theme` on `<html>`.
- The served HTML carries `<html data-theme="dark">`, so a page without script is dark too. Blazon writes no `prefers-color-scheme` block, so CSS alone does not follow the system setting.
- A toggle in the header switches between the two. It is a secondary button with a word on it ("Light" or "Dark"), it sets `data-theme` on `<html>`, and it stores the choice. Each page has one toggle.
- The switch is a hard cut. Colors do not fade from one theme to the other.

On a dark page:

- The page is `surface.background` (Graphite) and alternate bands are `surface.canvas` (Carbon).
- The one inverse band is Bone, with Graphite text. A page still has at most one.
- Signal Orange marks the single primary action and small accents, as in light. It is never text, though it measures 5.29:1 on Graphite: the `usage` rule on the signal colors fails a text token that aliases one.
- Hazard Yellow marks a warning and nothing else.
- The plate and the shim are Carbon and the recess is Zinc, at the same offsets as in light (see the [form page](05-form.md)).

### Industrial details

Three details give a page the brand's industrial look. Each uses only tokens, and each holds in both themes.

- Hazard stripes mark a warning and nothing else. A stripe is Hazard Yellow and Graphite, the ink of `text.onSignal`, at 45 degrees, on the warning's own panel. It is never a divider or a decoration.
- A readout (a count, a version, a port, a measurement) is `type.label` in `text.primary`, and its caption is `type.label` in `text.muted`. A command or a file excerpt in it is `type.code`.
- Scales and ticks are rules: a major tick is `border.rule` in `rule.default`, a minor tick is `border.hairline` in `rule.quiet`. In dark `rule.quiet` is Steel, 2.30:1 on Graphite, under the 3:1 a mark needs, so a scale in dark draws every tick in `rule.default`.

`blazon check` enforces the color rules behind these details (signal colors are never text, and every text pair keeps its contrast in both themes). It does not see a page you build, so it does not check where a site puts a stripe or a tick.

## The logo on the web

- Put the logo at the left of the header.
- The variant follows the surface. Use `onLight` (Graphite) on Bone and Concrete, and `onDark` (Bone) on Graphite and Carbon. On a light page that is `onLight` on `surface.background` and `surface.canvas`, and `onDark` on `surface.inverse`. On a dark page it is the other way round: `onDark` in the header and on the page, `onLight` on the Bone inverse band.
- Never place it on `interactive.primary`. `blazon check` flags it.
- Keep the clear space the logo's sidecar states.
- Show the mark with the wordmark at 32px high or more: `blazon logo` gives it as the `min size` of `blazon-graphite` and `blazon-bone`. Show the mark alone at 24px high or more. Its sidecar does not state that, because `blazon.favicons` would then warn that the 16px tab icon is under it. Blazon does not measure a size on a page you build.
- The favicon is the mark alone.

## Imagery and copy

- Imagery is the brand's own: construction drawings, the mark and diagrams. No stock photography, no gradients, and no shadow other than the three on the form page.
- Copy follows the four traits of the [voice page](11-voice.md). Headlines are in sentence case and say what the thing does. They name a file, a command or a number where one exists.

## Using shadcn/ui

A shadcn/ui project takes its colors from the brand through the `blazon.shadcn` plugin. `blazon tokens` writes `dist/tokens/blazon.shadcn/shadcn.css` and `shadcn.json`, as the "Using shadcn/ui" section of `docs/manual/19-building-a-website.md` in the blazon source repository describes. Its components also hard-code `text-sm`, `h-8`, `rounded-xl`, `ring/10`, opacity blends such as `hover:bg-primary/80`, and 0.35s transitions. The brand takes none of them. A site overrides each in its own button and card components, using the rules on this page.

The brand has no role for two groups of shadcn variables, so the `variables` option of `blazon.shadcn` in `blazon.json` maps them:

- `destructive` is `text.primary`. The brand has no red. An error is `text.primary` with `border.rule`, and the message is in words. It is never a red fill.
- `chart-1` to `chart-5` are `text.primary`, `text.muted`, `surface.canvas`, `rule.default` and `rule.quiet`, in that order. Separate series with `rule.default` hatching. Add no hue.

## Do not

- Do not use `interactive.primary` as a background.
- Do not darken, lighten or fade `interactive.primary` for a hover or a press.
- Do not use a blurred or translucent shadow, or one deeper than `shadow.plate`.
- Do not put a second inverse band on a page.
- Do not round a corner past `radius.hairline`.
- Do not set body text in the display family.
- Do not put a second primary button in a view.
- Do not put a second theme toggle on a page, or fade between the themes.
- Do not make Signal Orange text on a dark page because it measures AA there.
