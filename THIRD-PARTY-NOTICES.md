# Third-party notices

Blazon is MIT licensed (see [LICENSE](LICENSE)). The published package contains or installs the third-party software below. Each package keeps its own license and copyright notice in its own folder under `node_modules` and in the bundles blazon builds from it.

## Font

The brand book's viewer ships the **Geist** variable font (`@fontsource-variable/geist`), under the SIL Open Font License 1.1.

> Copyright 2024 The Geist Project Authors (<https://github.com/vercel/geist-font>)
>
> This Font Software is licensed under the SIL Open Font License, Version 1.1. The license is at <https://openfontlicense.org/open-font-license-official-text/>.

The starter brand book (`template/`, copied by `blazon init`) carries one font file, `fonts/IBMPlexMono-Regular-latin.woff2`: the Latin subset of **IBM Plex Mono** Regular from `@fontsource/ibm-plex-mono` 5.3.0, under the SIL Open Font License 1.1. The licence text is `fonts/OFL.txt` beside it. A brand replaces the file with its own.

> Copyright 2017 IBM Corp. All rights reserved. This Font Software is licensed under the SIL Open Font License, Version 1.1. The license is at <https://openfontlicense.org/open-font-license-official-text/>.

## Packages

These are blazon's direct dependencies and the packages bundled into the viewer and the shipped plugins, with the version built against. Packages they depend on in turn are under licenses of the same kind (MIT, ISC, BSD, Apache-2.0); `npm ls --all` lists them and each one's `package.json` names its license.

| Package | Version | License |
|---|---|---|
| `@base-ui/react` | 1.9.0 | MIT |
| `@clack/prompts` | 1.8.1 | MIT |
| `@shadcn/react` | 0.3.1 | MIT |
| `cac` | 7.1.0 | MIT |
| `class-variance-authority` | 0.7.1 | Apache-2.0 |
| `clsx` | 2.1.1 | MIT |
| `cmdk` | 1.1.1 | MIT |
| `colorjs.io` | 0.7.1 | MIT |
| `dompurify` | 3.4.17 | MPL-2.0 OR Apache-2.0 |
| `embla-carousel-react` | 8.6.0 | MIT |
| `gray-matter` | 4.0.3 | MIT |
| `image-size` | 2.0.4 | MIT |
| `lucide-react` | 1.69.0 | ISC |
| `marked` | 18.1.3 | MIT |
| `pdf-lib` | 1.17.1 | MIT |
| `picocolors` | 1.1.1 | ISC |
| `playwright-core` | 1.64.1 | Apache-2.0 |
| `pptxgenjs` | 4.0.1 | MIT |
| `react` | 19.3.1 | MIT |
| `react-dom` | 19.3.1 | MIT |
| `react-resizable-panels` | 4.18.1 | MIT |
| `recharts` | 3.10.1 | MIT |
| `shiki` | 4.6.0 | MIT |
| `tailwind-merge` | 3.7.0 | MIT |
| `tw-animate-css` | 1.4.0 | MIT |
| `vite` | 8.3.6 | MIT |

`playwright-core` is a dependency, but blazon never downloads a browser: plugins that need Chrome use the one on the computer (`BLAZON_CHROME`).

A new direct or bundled dependency needs a row here.
