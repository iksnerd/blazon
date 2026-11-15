# Tree-digest vectors

Test vectors for RFC 0002 section 3.4: the digest of a `tree` pin, the digest of a `file` pin, and the trees a host MUST refuse. A host passes when its own digest function gives every `valid/` case's `digest` and refuses every `invalid/` case.

## A case

One JSON file describes a tree to build, so a case can hold what git cannot (a FIFO, a newline in a name, an execute bit):

```json
{
  "about": "what the case shows",
  "kind": "tree",
  "root": "symlink",
  "entries": [
    {"path": "bin", "type": "dir"},
    {"path": "bin/run", "type": "file", "exec": true, "content": "#!/bin/sh\n"},
    {"path": "link", "type": "symlink", "target": "bin/run"},
    {"path": "pipe", "type": "fifo"}
  ],
  "digest": "t1:<hex>"
}
```

- `kind` is `tree` (hash the directory) or `file` (hash the first entry, a file pin).
- `root` is optional. `symlink` means the path handed to the digest is a symlink to the built tree or file, which a host MUST refuse.
- `entries` are built in order under an empty directory. Directories are mode 0755. A file is mode 0755 with `exec: true`, else 0644, and holds `content` as UTF-8.
- A case has exactly one of `digest` (a `valid/` case) and `refuse` (an `invalid/` case). Read every key strictly: an unknown key is an error in the case file, not something to skip.

`refuse` names why: `symlink`, `special` (anything that is not a regular file or a directory), `name` (a byte below 0x20, or 0x7F, in a name). A host need not use these words. It MUST refuse, and SHOULD say which entry and why.

## How a digest is written

With its scheme in front: `sha256:<hex>` for a file pin, `t1:<hex>` for a tree pin (RFC 0002 section 3.4, amended 2026-10-14). Hex is lower case.

## Readings the cases settle

- A directory's line carries its owner execute bit like a file's, so a directory the host can read is always `d x <path> -`.
- The root is not listed. An empty tree has no lines, so its digest is the sha256 of the empty string (`empty-tree`).
- Sorting is by the bytes of the UTF-8 path, with `/` as the separator, so `a-b` and `a.c` come before `a/b` (`byte-order`).

## Not here

The 10,000-entry and 256 MiB limits, sockets and devices: they are cheap for a host to build in its own tests and expensive to describe here.

## Running them

`tools/tree_digest.py` is a reference implementation in the Python standard library:

```
python3 tools/tree_digest.py check corpus/tree-digest     # every case, exit 1 on a mismatch
python3 tools/tree_digest.py hash <path>                   # one file or tree
```

The expected digests of `single-exec-file`, `exec-bit-differs` and `nested` were also computed by hand with `printf ... | shasum -a 256`, so the vectors do not rest on this tool alone. Contra's Elixir implementation is the second.
