---
title: Color
order: 3
group: System
cover: canvas
description: Three surfaces, three inks and one signal, in a light and a dark theme. The ratio is 70 / 20 / 10.
section: color
---

## Materials

- **Bone** `#F2F0EB` and **Concrete** `#D9D6CF`: the surfaces of the light theme. **Carbon** `#101113`: the canvas of the dark theme.
- **Graphite** `#1E1F21` and **Steel** `#54585D`: text, rules and structure in light. Graphite is also the page of the dark theme. **Zinc** `#8C9096`: muted text and the rule in dark. **Carbon** is the shadow of a key in dark.
- **Signal Orange** `#FF5A1F` and **Hazard Yellow** `#F2C230`: actions and warnings only, in both themes.

<!-- blazon:tokens color.base color.ink color.signal -->

## Pigments for code

Code gets its own colors. **Oxide**, **Verdigris** and **Cobalt** are the pigments of the light theme. **Ember**, **Patina** and **Enamel** are their lighter counterparts for the dark theme. Oxide is rust, the oxide of Signal Orange's iron. Verdigris and Patina are oxidised copper. Cobalt and Enamel are enamel-sign blue.

<!-- blazon:tokens color.pigment -->

Pigments color code and nothing else. The `color.pigment` group allows only the text role, and they are not part of the 70 / 20 / 10 ratio below. A pigment is never a fill, a rule or an accent. Signal Orange is still never text, and no pigment stands in for it.

The `syntax` roles point at them. Keywords take Oxide (Ember in dark), strings Verdigris (Patina), constants and numbers Cobalt (Enamel). Function names, comments and punctuation take inks: Graphite (Bone), Steel (Zinc) and Steel (Zinc).

<!-- blazon:tokens syntax -->

Every `syntax` token reaches AA on both surfaces in both themes. The lowest are Verdigris on Concrete at 4.70:1 in light and Zinc on Graphite at 5.14:1 in dark.

## Two themes

Light is the default. The dark theme is a context of the same tokens (`blazon.resolver.json`, modifier `theme`). It changes what the roles point at, and nothing else. A site turns it on with `data-theme="dark"`.

| Role | Light | Dark |
|---|---|---|
| `surface.background` | Bone | Graphite |
| `surface.canvas` | Concrete | Carbon |
| `surface.inverse` | Graphite | Bone |
| `text.primary` | Graphite | Bone |
| `text.muted` | Steel | Zinc |
| `text.inverse` | Bone | Graphite |
| `text.onSignal` | Graphite | Graphite |
| `rule.default` | Graphite | Zinc |
| `rule.quiet` | Steel | Steel |
| `rule.onSignal` | Graphite | Graphite |
| `interactive.primary` | Signal Orange | Signal Orange |

<!-- blazon:tokens surface text rule interactive -->

- The canvas is the deeper surface in both themes: Concrete under Bone, Carbon under Graphite.
- Labels on Signal Orange stay Graphite in dark. Bone on Signal Orange is 2.74:1.
- The edge of an orange part is `rule.onSignal`, Graphite in both themes: 5.29:1 on Signal Orange. `rule.default` would not do in dark. Zinc on Signal Orange is 1.03:1, below the 3:1 a part's edge needs.
- Carbon and Zinc exist for the dark theme. Steel reaches only 2.30:1 on Graphite: too little for muted text or the edge of a control, so in dark it is the quiet hairline and nothing that has to be read. No other color of the brand sits below Graphite.

## Rules the build checks

`blazon check` runs every rule below in both themes. A finding that only the dark theme has is tagged `theme=dark`.

- Signal colors deny the text role; `blazon check` fails a text token that aliases them. That holds in dark too, where Signal Orange on Graphite measures 5.29:1. It is still not text.
- Primary text reaches AAA on both surfaces: 14.48:1 and 11.37:1 in light, 14.48:1 and 16.59:1 in dark.
- Muted text reaches AA on both surfaces: 6.29:1 and 4.94:1 in light, 5.14:1 and 5.89:1 in dark.
- Labels on signal colors are Graphite (`text.onSignal`): 5.29:1 on Signal Orange and 9.85:1 on Hazard Yellow, in both themes.
- Code colors reach AA on both surfaces: every `syntax` token measures 4.70:1 or more in light and 5.14:1 or more in dark.
- Inverse text reaches AAA on the inverse surface: 14.48:1 in both themes.

## One orange, one state

Signal Orange has no hover, pressed or disabled shade. Graphite on it is 5.29:1, close to the 4.5:1 that AA asks of `text.onSignal`. A shade dark enough to read as a hover leaves Graphite near 4.2:1, below AA. A control shows its state by moving instead: it travels into its shadow (see the [form page](05-form.md)). A disabled control is not orange at all.

## Orange and yellow in dark

- Signal Orange is the one signal in dark as in light. It marks the single primary action, the fold of the mark, and small accents such as a rule or a badge. As a part it reaches 5.29:1 on Graphite and 6.06:1 on Carbon. On Bone it reaches only 2.74:1, so a light page never relies on the orange alone to show where a part ends.
- Hazard Yellow marks a warning and nothing else: 9.85:1 on Graphite and 11.28:1 on Carbon. It is never a decoration, a highlight or a second accent.

## Proportion

About 70% base surfaces, 20% ink, 10% signal. In dark the surfaces are Graphite and Carbon, so the 70% is dark.
