---
title: Form and motion
order: 5
group: System
cover: canvas
description: Square cuts, 2px rules, three hard shadows and keys that seat like a machine part.
section: motion
---

## Shape

- Panels and covers are cut square (`radius.none`); inputs and buttons get a 2px hairline (`radius.hairline`). There is no corner between the two and none past the hairline.
- Structure is drawn with a 2px rule (`border.rule`); secondary dividers with a 1px hairline (`border.hairline`). The rule is Graphite in light and Zinc in dark, 5.14:1 on the Graphite page, so a control's edge stays above 3:1. The hairline is Steel in both themes, 2.30:1 on Graphite in dark: it divides and does not bound a control.
- A part filled with Signal Orange, such as the primary key, has its own edge, `border.onSignal`: a 2px rule in `rule.onSignal`, Graphite in both themes. It reaches 5.29:1 on the orange, where the Zinc rule of dark reaches only 1.03:1.

<!-- blazon:tokens radius border -->

## Depth

Depth is a hard offset, never blurred and never translucent. In light, `shadow.plate` and `shadow.shim` are Graphite; in dark they are Carbon, the darkest color of the brand, and `shadow.recess` is Zinc. There are three:

- `shadow.plate`, 4px: a part raised off the panel, like a plate bolted onto it. A key at rest, or a card under the pointer.
- `shadow.shim`, 2px: a key under the pointer, seated halfway into its plate.
- `shadow.recess`, 2px inset: a well cut into the panel, such as an input or the rail that holds tabs.

No other shadow is used. A raised part is never deeper than `shadow.plate`.

### Shadows in dark

A shadow is darker than the part it falls on. A Graphite shadow is not there on a Graphite page. A light one, Zinc or Steel, reads as a second edge or a glow, not as depth. So in dark `shadow.plate` and `shadow.shim` are Carbon, the one ink darker than the Graphite page. Each keeps its offset; only its color changes. `shadow.recess` stays Zinc: it is a well cut into the panel, not a raised plate.

| Plate color | On the Graphite page |
|---|---|
| Graphite, as in light | 1.00:1 |
| Carbon, darker than the page | 1.15:1 |
| Steel | 2.30:1 |
| Zinc | 5.14:1 |

- Carbon is the only brand color darker than Graphite. Black would be darker still, but it is not a brand color.
- The plate is faint by design: it is a dark offset, not an outline. The key's edge (`border.rule`, Zinc in dark) is what marks where the key ends, and the key's travel is still the difference between two offsets.
- On a Carbon surface, such as the canvas or a code plate's header, the Carbon plate has no contrast (1.00:1). A key there is marked by its edge and its lighter Graphite face, and it still travels the same distances.
- The primary key stands on the same Carbon plate; its Graphite edge, not an orange shadow, marks where its face ends.

<!-- blazon:tokens shadow -->

## Spacing

A 4px module: 4, 8, 12, 16, 24, 32, 48, 64 (`space.*`).

## Motion

Fast start, hard stop (`motion.easing.mechanical`): 120ms for toggles and presses, 200ms for panels and menus.

<!-- blazon:tokens motion -->

## Keys

A button or a tab is a key: it stands on `shadow.plate` and travels into it.

| State | Shadow | Moved by |
|---|---|---|
| At rest | `shadow.plate` | nothing |
| Under the pointer | `shadow.shim` | the plate's offset less the shim's: 2px right and 2px down |
| Pressed, or the active tab | none | the plate's whole offset: 4px right and 4px down |
| Disabled | none | nothing |

- The face ends where its shadow was, so the travel is always the difference between two shadow offsets. It has no token of its own. In CSS it is `calc(var(--shadow-plate-offset-x) - var(--shadow-shim-offset-x))` under the pointer and `var(--shadow-plate-offset-x)` pressed, and the same for `y`.
- Each move takes `motion.duration.snap` with `motion.easing.mechanical`: a press is a toggle, and the key seats like a machine part.
- The fill, text and edge stay as they are. Signal Orange has no hover or pressed shade (see the [color page](03-color.md)).
- With reduced motion set, each state is a hard cut: the key changes shadow and position at once.

## Animating the mark and icons

There are no animation files in this book yet. These rules apply to any animation made from the mark and the icons, and they use only the motion tokens above.

- A part appears as a hard cut, not a fade or a blur.
- Use the motion tokens above as the interface does: `motion.duration.move` for panels and `motion.duration.snap` for toggles and presses, both with `motion.easing.mechanical`.
- Do not move, scale or recolor the fold while the mark is shown, and do not animate the clear space.
- Do not fade, blur or grow a shadow. A shadow changes only as a key travels into it, and a panel's shadow appears or disappears with the panel.
- With reduced motion set, show the finished mark and the icon's end state at once.
