---
title: Layout
order: 6
group: System
cover: canvas
section: layout
description: A 4px module, visible rules and square panels.
---

## Grid

Everything sits on the 4px module (`space.0` to `space.16`: 0, 4, 8, 12, 16, 24, 32, 48, 64). Gaps between parts use 16, 24 or 32. Nothing is placed by eye between those steps.

<!-- blazon:tokens space -->

## Structure stays visible

Panels are divided by a 2px rule (`border.rule`, Graphite in light and Zinc in dark); secondary dividers use the 1px Steel hairline (`border.hairline`). A rule is never replaced by a gap alone.

Ticks and measure marks are rules too, and take the rule colors. A long tick is `rule.default` at the width of `border.rule`, and a short tick is `rule.quiet` at the width of `border.hairline`. Long ticks fall every 64px (`space.16`) and short ones every 16px (`space.4`). On an inverse surface every tick is `text.inverse`. A tick is never Signal Orange.

Steel is the lightest a tick gets: `blazon can rule.quiet surface.canvas --role ui` reports 4.94:1 against the 3:1 a mark needs. In dark `rule.quiet` is Steel, 2.30:1 on Graphite and 2.64:1 on Carbon, so a scale there draws every tick in `rule.default` and tells long from short by width and spacing.

## Surfaces

Pages sit on Bone (`surface.background`). Panels and canvases sit on Concrete (`surface.canvas`). Inverse areas use Graphite (`surface.inverse`) with Bone text (`text.inverse`).

<!-- blazon:tokens surface -->
