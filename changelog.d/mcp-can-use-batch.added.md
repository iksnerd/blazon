`can_use` takes `pairs` (up to 50 `{ fg, bg }`) and answers one result for each,
in order; `blazon can` takes `--pair fg:bg`, repeated. `verbose: false`
(`--no-verbose`) leaves out the `checks` of an allowed answer and keeps them
for a denial. A batch answer has `allowed` (true when every pair is) and
`results`, so `reason` is no longer required in the `can_use` output schema.
