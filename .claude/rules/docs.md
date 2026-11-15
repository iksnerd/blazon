---
paths:
  - "docs/**"
  - "README.md"
  - "CONTRIBUTING.md"
  - "plugins/*/README.md"
---

- One H1 per file, chapters H2, sections H3. A heading rename breaks links to it: grep the repo for `#anchor` first (GitHub's anchor drops dots, so `### blazon.social-cards` is `#blazonsocial-cards`).
- Manual pages: GitHub-flavoured Markdown only, fenced code with a language tag, no raw HTML, links relative to the file.
- RFCs: RFC 2119 words only in capitals and only where they bind. Status header current, Status section a table, open questions struck through when decided and pointing at the decision.
- Every number in prose (plugin counts, finding counts, line counts) must come from the code or a test. Grep for every phrasing when one changes.
- After editing, `npm run test:docs`.
