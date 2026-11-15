# Contexts

← [Manual index](index.md)

Some values replace each other: Japanese text uses another typeface, a dark theme uses other colors. A context is one such alternative. You declare them in a [DTCG resolver document](https://www.designtokens.org/TR/2025.10/resolver/). You do not need one if nothing in the brand varies.

## The resolver document

By default it is `blazon.resolver.json` in the project folder. Set `resolver` in `blazon.json` to use another path. With one, blazon loads only the token files it names. Without one, blazon loads every file in `tokens/`. A project from `blazon init` has one: the starter's `theme` modifier, with a `light` default and a `dark` context in `tokens/theme/dark.json`. A token file you add to `tokens/` loads only once you list it in `sets`. Deleting the resolver loads every file in `tokens/` again, the dark file included, so remove or move that file with it.

```json
{
  "version": "2025.10",
  "sets": { "base": { "sources": [{ "$ref": "tokens/base.json" }] } },
  "modifiers": {
    "locale": {
      "contexts": {
        "en": [],
        "ja": [{ "$ref": "tokens/locale/ja.json" }]
      },
      "default": "en"
    }
  },
  "resolutionOrder": [{ "$ref": "#/sets/base" }, { "$ref": "#/modifiers/locale" }]
}
```

- **Every modifier needs a `default`.** The defaults make up the main output.
- **Sources merge as DTCG documents.** Groups merge key by key, and a token is replaced whole. A token in a later source that has no `$type` takes the type its group had in an earlier source.
- **To change only what a token says, write the token again with its `$value`.** A fragment with no `$value` is a group, not a token, and replaces the token. Restating a token with the same value and another `$description`, `$deprecated`, extension or alias (pointing at another token that holds the same value) is a change to how it is described or written, not to its value: the context's `tokens.<modifier>.<context>.json` carries it, the brand book shows it with the context chosen, `brand.json` lists it under `metadataChanges`, and the CSS block is unchanged.
- **You write only what changes.** A file such as `tokens/locale/ja.json` can hold just `{ "font": { "family": { "body": { "$value": "Kinto" } } } }`. Every text style that uses that family differs in `ja` too, and blazon finds them for you.
- **Combinations are not compiled.** Japanese and dark at once is not a context of its own. Both blocks apply in the browser, and where they set the same variable the CSS cascade decides. The brand book with two contexts chosen shows each token with every change either makes, a value from one and a description from the other.
- **The check runs in every context.** A finding that only occurs in one is tagged with it.

## What blazon writes

| Output | Contains |
|---|---|
| `theme.css` | The default context under `cssSelector`, then one block per other context, holding only the tokens it changes |
| `tokens.ts` | `tokens` for the default context, and `contexts.<modifier>.<name>` for the overrides, each a flat map of token path to value |
| `tokens.<modifier>.<context>.json` | A complete DTCG file for that context |
| The brand book | A select per modifier in the top bar, and in the menu on a phone. A `theme` modifier with a `light` and a `dark` context has none: the light and dark switch picks it ([theme roles](07-theme-and-config.md#theme-roles)) |

The selector of each context block comes from `contextSelectors` in `blazon.json` ([every option](07-theme-and-config.md#every-option)): a selector per modifier, with `{context}` as the placeholder. The defaults are `:lang({context})` for a modifier named `locale`, and `[data-<modifier>="{context}"]` for any other. A `theme` modifier with a `dark` context therefore writes `[data-theme="dark"] { ... }`.

## When the resolver document is wrong

Problems are `resolver-invalid` errors, not crashes. The message names the problem:

| Message starts | Cause |
|---|---|
| `resolver <path> does not exist` | `resolver` in `blazon.json` points at a missing file |
| `version must be "2025.10"` | Wrong or missing `version` |
| `resolutionOrder is required and must be an array` | No `resolutionOrder` |
| `modifier "x" needs a "default" context` | A modifier has no `default`. Blazon compiles the defaults as its main tokens |
| `modifier "x" default "y" is not one of its contexts` | The `default` names a context that is not declared |
| `modifier "x" has no contexts` | An empty modifier |
| `modifier name "x" is not allowed`, `context of modifier ... name "x" is not allowed` | A modifier, context or inline item name with a character other than letters, digits, `_` and `-`. The names go into file names, selectors and comments |
| `inline resolutionOrder name "x" is already a declared set or modifier` | An inline item reuses the name of a set or modifier |
| `resolutionOrder points at ..., which does not exist` | A `$ref` that matches no set or modifier |
| `a source points at ..., which does not exist` | A token file that is not there |
| `a source points at ...; sources cannot reference modifiers` | A source refers to `#/modifiers/...` |
| `a source points at ...; blazon reads whole token files and #/sets/ references only` | A `$ref` with a JSON pointer inside a file |
| `a source points at ..., which is outside the project` | A path that leaves the project folder, by `..` or by an absolute path |
| `sets reference each other in a circular chain` | Two sets include each other |
