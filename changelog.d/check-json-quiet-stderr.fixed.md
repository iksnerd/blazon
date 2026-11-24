`blazon check --json`, `build --json` and `tokens --json` no longer print the
banner and the findings list to standard error. Standard output is the one JSON
document and standard error is empty on a normal run, so `2>&1` parses.
