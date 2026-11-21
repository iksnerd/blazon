An asset in two formats (`logos/mark.svg` and `logos/mark.png`, one sidecar) is now one asset with one approval.
`review.value` is a fingerprint of the id, made from all its files; an id with one file keeps its old fingerprint.
Approving it no longer makes the other file stale, `blazon approvals` prints one row for the id with its files, and
`approval-stale`, `asset-review-missing` and `review-pending` are reported once for each id. Every reader now takes the
same file for an id (SVG, then PNG, WebP, JPEG, GIF, then other formats), so the favicons symbol works for `mark.svg`
beside `mark.png`.
