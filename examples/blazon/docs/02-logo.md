---
title: Logo
order: 2
group: Foundations
cover: inverse
description: A folded sheet and a stencil-cut wordmark. The fold is the only Signal Orange in the mark.
section: logo
---

## Construction

The mark is a sheet with its top-right corner folded down: a blazon. Two lines are cut out of it, the text on the page. The wordmark is Big Shoulders Stencil Display Black, outlined, so the stencil bridges are part of its paths. Both are paths, so the logo renders without any font loaded.

The mark is a 40-unit square on a 2-unit grid. The fold and the two cut lines break its symmetry. The mark matches itself 78 to 82% under every mirror and turn, and its center of mass sits within 1% of the center. The figure is measured, not drawn by hand: the `blazon.logo-geometry` plugin, given `logos: [{ id: 'logos/blazon-graphite', crop: [0, 0, 40, 40], grid: 2 }]`, redraws it.

<!-- blazon:assets construction -->

## Usage

- Graphite on light surfaces, Bone on dark ones. In the dark theme the page is Graphite, so the logo there is Bone. The inverse band is Bone, so the logo there is Graphite. `blazon check` judges both themes.
- The fold stays Signal Orange on both.
- Signal Orange is not a logo surface. The fold would be the color it sits on, so the book shows no logo on it and `blazon check` would flag one.

<!-- blazon:logo-usage -->

## Clear space

Keep clear space equal to the height of the fold (12 units of the 40-unit mark) on every side. The mark with the wordmark is never shown below 32px high; the sidecars of the two files state it as `minSize`. The mark alone is shown at 24px high or more on a page.

<!-- blazon:logo-space logos -->

## Used with other marks

The blazon mark can sit beside a partner or product mark. The book has no partner lockup file, so these rules say how to set one up. They reuse the clear space and the two variants above.

- Keep the fold-height clear space (12 of 40 units) between the two marks, and keep each mark's own clear space on every other side.
- Choose the blazon variant by the surface, as in Usage: Graphite on light, Bone on dark. Signal Orange is not a surface for a pair either.
- Do not overlap the marks, crop one, or place a partner mark inside the blazon mark's clear space.

## Don't

- Recolor the fold, or add a second signal color.
- Round the corners, add a shadow, or retype the wordmark as live text.
