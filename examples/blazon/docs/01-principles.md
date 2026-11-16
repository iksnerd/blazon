---
title: Built to spec
order: 1
group: Foundations
cover: accent
description: "blazon turns a brand into parts with tolerances. Its own identity looks the way it works: exposed structure, honest materials, one signal color."
section: intro
---

## What blazon is

A compiler for brand books. It reads design tokens, checks them against the brand's own rules, and builds the code and the book from the same files. Nothing in the book is drawn by hand; everything in it is measured.

## Who blazon is for

Teams whose brand guidelines live in a PDF or a slide deck, and whose developers copy the values out by hand. A copy drifts from its source, and nothing says so until someone looks.

## The promise

The brand and the build come from the same files. A build that breaks the brand's own rules stops: `blazon tokens` and `blazon build` run `blazon check` first and stop on an error.

## Attributes

| Attribute | Proof |
|---|---|
| Checked | A rule sits beside the value it governs. A text token that aliases Signal Orange fails `blazon check` with `usage-violated`. |
| One source | One build writes the CSS variables, a typed `tokens.ts` and the static book from `tokens/`, `docs/` and `assets/`. |
| Readable from any language | `blazon build` also writes `brand.json`: the tokens with their rules, the pages, the assets and the findings, with a JSON Schema. |
| Open to plugins | A plugin is a program in any language. blazon ships ten, and a config names one to turn it on. |

blazon is at version 0.1.0 and on npm as `@iksnerd/blazon`. The attributes above describe what is built today.

## Exposed structure

Show the frame. Rules, grids and labels stay visible instead of hiding behind decoration, because the structure is the information.

## Honest materials

Bone and concrete for surfaces, graphite and steel for everything that is read. Nothing pretends to be glass or depth: shadows are hard offsets, corners are cut square.

## Signal over decoration

Signal Orange marks what acts: buttons, links, warnings. It is never used for body text, and it never fills a surface for atmosphere. Hazard Yellow is rarer still.

## Built to spec

Every value has a source and a check. If blazon cannot measure a rule, the rule is written down in plain words instead of guessed.
