The `plugin-failed` fix for a refused plugin interpreter now fits the reason: a
bad `#!` line, an interpreter that env cannot find, a folder or file others can
write (with its path, mode and `chmod`), another owner, a missing or
non-executable file, or a loop of links. The checks themselves are unchanged.
