---
title: Voice and tone
order: 11
group: Foundations
cover: canvas
description: "blazon writes the way it builds: plain, exact and checkable. Say what it does, name the file or the flag, and say proposed when it is not built."
section: voice
---

## Voice

Four traits, in the order they win an argument. The voice does not change between pages; the tone does (next section).

| Trait | It means | It does not mean |
|---|---|---|
| Plain | Short sentences, common words, one idea each, active voice. | Casual, jokey or simplified until it is wrong. |
| Exact | Names the file, the flag, the command or the number, and the number comes from the code. | Hedging with "usually" or "generally" where the code decides. |
| Direct | The verdict first, then the reason. An error says what is wrong and what to do about it. | Blunt about people. The rule is named, not whoever broke it. |
| Honest | Says proposed for what is not built and not yet for what is missing. A limit is stated once. | Apologetic, or promising in the present tense. |

## Tone by situation

| Where | Tone | Example |
|---|---|---|
| A finding from `blazon check` | Flat and specific: the rule, then the token. | `<path>: Used as text, but <alias> is not allowed as text` |
| An error that stops a command | The cause, then the next step. | `outDir and tokensOutDir are the same folder ("dist", "dist"): emptying one would remove the other's files. Put the site in its own folder, such as "dist/site"` |
| The manual | Instructions in the imperative, one task for each section, the command before the explanation. | `Run blazon check again.` |
| An RFC | Precise and neutral. Capital MUST and SHOULD only where a rule binds. Proposed for anything not built. | `Only the vocabulary is implemented.` |
| A README or release note | The verdict first. A fact in place of an adjective. | `blazon check` exits 1 on an error. |
| A commit message | `type(scope): what changed`, lowercase, in the imperative. | `fix(check): a logo on its own color is reported once` |

## Address and register

Pick one form for each place and keep it to the end of the page.

| Where | Form | Example |
|---|---|---|
| The manual and the brand book | The imperative. "You" only where the reader's own file or choice is the subject. | `Run blazon check again.` |
| An error or a finding | The imperative for the next step, or a statement of the cause. No apology, no "we". | `Put the site in its own folder, such as "dist/site"` |
| A release note | The imperative for what to change, and blazon as the subject of what changed. | `Fix the block, or remove the field.` |

- **blazon is third person.** The text says "blazon checks", never "we check" or "our tool".
- **Tense.** The present tense for what is built, "proposed" for what is not. No future tense for a feature.

## Word choices

| Write | Not |
|---|---|
| blazon compiles the tokens. | Leverage blazon's powerful engine to unlock your tokens. |
| `blazon check` fails the build on an error. | Seamlessly catches issues before they become problems. |
| Proposed: not built yet. | Coming soon. |
| `blazon tokens` writes `dist/tokens/`. | Effortlessly outputs your design system. |
| Move the file, or move `tokensOutDir`. | Something went wrong with your configuration. |

Hype words (powerful, seamless, robust, effortless) get a number or are cut. A claim that the code does not back is not written.

## Names and formatting

- **The name.** blazon is lowercase in running text, including at the start of a sentence, as the wordmark is set. A page title or a table heading may capitalize it.
- **Headings.** Sentence case. The page title in the front matter is the H1, so a page starts at H2 for chapters and H3 for sections. A heading does not end in a period.
- **Case in messages.** Sentence case. A finding or error message is not set in capitals, apart from a name or an acronym such as `SPDX`.
- **Bullets.** A bullet is a full sentence or a fragment that ends in a period.
- **Code.** Files, flags, commands, config keys and token paths go in backticks. A token path is written as the code writes it: `interactive.primary`.
- **Dates.** Year, month, day: `2026-10-26`.
- **Punctuation.** No em-dashes. Use a period, a colon or parentheses.
- **Links.** Relative to the file, and to a heading that exists. The docs tests check every link and anchor.

## Before you publish

1. Is every command, flag and number in it true today? Check it against the code.
2. Does the first sentence give the verdict?
3. Is anything described as built that is only proposed?
4. Does a word in it ask the reader to take the claim on faith?
5. Would the sentence still be right after a rename? If it names something that moves, link it instead of copying it.
