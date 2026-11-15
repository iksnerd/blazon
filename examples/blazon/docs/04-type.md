---
title: Type
order: 4
group: System
cover: canvas
description: Big Shoulders Display for headlines, IBM Plex Sans for reading, IBM Plex Mono for labels, values and code.
section: typography
---

## Display

Big Shoulders Display, heavy and condensed, drawn from Chicago's industrial signage. Headlines only, set tight (`type.display`, `type.h1`, `type.h2`, `type.subhead`).

<!-- blazon:tokens font.family -->

## Reading

IBM Plex Sans for anything longer than a headline (`type.h3`, `type.body`, `type.small`). Plex has an engineering lineage, and it reads that way.

## Labels

IBM Plex Mono at 12/16px in capitals with wide tracking (`type.label`), for part numbers, token paths and values.

## Code

IBM Plex Mono at 14/20px, as typed and with no tracking (`type.code`), for commands, file excerpts and code in running text. It is never set in capitals, because a command has to be copied exactly.

Function names in code are set in the semibold weight (`font.weight.semibold`, 600) and take the `syntax` colors (see the [color page](03-color.md)).

This starter loads Plex Mono from two files in the folder, `fonts/IBMPlexMono-Regular-latin.woff2` and `fonts/IBMPlexMono-SemiBold-latin.woff2`, to show how a brand carries its own font. They are the Latin subsets of IBM Plex Mono Regular and SemiBold from the `@fontsource/ibm-plex-mono` package, under the SIL Open Font License 1.1 (`fonts/OFL.txt`). A brand replaces them with its own licensed files and lists them in `fonts` in `blazon.config.ts`.

## Scale

Every text style is a token, so the build can check it and the code can use it.

<!-- blazon:tokens type -->
