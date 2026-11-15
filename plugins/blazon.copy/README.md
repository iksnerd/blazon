# blazon.copy

The plugin blazon ships to hold a brand book's text to the brand's copy rules: the terms it avoids, the case of its headings and the length of its sentences. It fills the `check` role, reads `brand.json` only (the pages' Markdown and the assets' sidecar text), writes nothing and needs only Node.

The source is `src/shipped/copy/`, and `npm run build` (`npm run build:plugins`) bundles it, with the blazon code it uses, into `bin/blazon-blazon.copy.🔌`, the one file that holds the plugin's code and that `plugins/shipped.lock` pins. It loads nothing from `node_modules`, so the pin covers all the code it runs, apart from Node itself. Name it in `blazon.config.ts` and give it the rules:

```ts
plugins: [
  {
    name: 'blazon.copy',
    options: {
      avoid: [{ terms: ['powerful', 'seamless', 'robust', 'effortless'], say: 'a number, or nothing' }],
      headings: 'sentence',
      sentences: { maxWords: 25 },
      skip: ['11-voice.md'],
    },
  },
],
```

With no options it checks nothing. The options and the findings are in [the manual](../../docs/manual/14-shipped-plugins.md#blazoncopy), and the design is [RFC 0006](../../docs/rfc/0006-copy-rules.md).

## What it reads

A page's title and description, and its Markdown outside code spans, code fences, HTML comments (the directives) and link targets. An asset's `title`, `description`, `traits`, `do` and `dont`. A group of terms may be scoped to some pages or assets with `only` and `skip` (a path ending in `*` is a prefix, so `social/*` is a category), and `headings` may be an object `{ case, maxWords, only, skip }` that also limits the words of a heading on the pages it names. A term ending in `*` is a stem that matches every form of a word (`решени*`). `ignoreQuoted: true` leaves text inside quotation marks out of the search for avoided terms. Sentences are split at a capital letter of any script, so Cyrillic text works. A term inside code is not flagged, so a counter-example written as code is safe; a page that quotes counter-examples as plain text goes in `skip`.

## What it does not do

It does not judge tone, spelling or meaning, and it does not rewrite a page. The checks are heuristics, so every finding but a wrong option is a warning. A term is a literal compared as text, never a pattern, so a term cannot make a check run away.
