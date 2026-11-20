# Change fragments

A user-visible change records itself as one small file in this folder. Nobody edits the `Unreleased` section of `CHANGELOG.md`, so two branches never conflict on it. `npm run release -- <version>` reads the fragments, writes them as the new version's section, and removes them in the release commit.

## A fragment

`changelog.d/<slug>.<kind>.md`

- `<slug>` is lowercase letters, digits, `.`, `_` and `-`, and names the change (`press-kit-company-option`). Bullets of one kind are listed in file-name order.
- `<kind>` is one of `breaking`, `added`, `changed`, `fixed`: the headings `CHANGELOG.md` already uses, written in that order.
- The content is the text of one bullet. It may wrap over several lines. The release writes it as `- ` plus the text, with continuation lines indented.
- No em-dash, and the body must not be empty. A file the release would refuse fails the docs test, and so the commit hook.

Example, `changelog.d/acme-logo-margin.fixed.md`:

```markdown
The print book keeps the margin around an Acme logo that is wider than its
column.
```

The release writes:

```markdown
### Fixed

- The print book keeps the margin around an Acme logo that is wider than its
  column.
```

A change with no user-visible effect needs no fragment.

## Preview

`npm run changelog:preview` prints the section the next release would write and changes nothing.

## The CHANGELOG

`## Unreleased` in `CHANGELOG.md` stays an empty heading, the anchor the release script reads. The release refuses a version when that heading holds text next to fragments (two sources), and when there are no fragments and no text (nothing to release).
