#!/usr/bin/env python3
"""Copy the plugin protocol conformance corpus that blazon's plugin host is tested against into test/spec/, with the draft
schema of a host's profile and the CUE check of it, which blazon's own profile is vetted against.

    python3 scripts/vendor-spec-corpus.py <path to a checkout of the corpus source>

The corpus is what blazon's host is held to: it must agree with every file in corpus/core and
corpus/tree-digest. The copy is committed so the tests run on every machine. SOURCE.json records the
corpus commit it came from and a digest of the copied files, and a test fails when the files
and the digest disagree, so an edit to the copy cannot pass for the corpus's own text.

Standard library only. The source checkout's two folders must be clean: a case that is not committed
in the source is not one a host has to agree with.
"""
import hashlib
import json
import pathlib
import shutil
import subprocess
import sys

FOLDERS = ("corpus/core", "corpus/tree-digest")
# Single files, kept at the same relative path: the licence and notice the copy must carry, the draft schema of a host's profile and the stricter CUE check beside it.
FILES = ("LICENSE", "NOTICE", "schemas/draft/host-profile.schema.json", "experiments/cue-host-profile/profile.cue")
TARGET = pathlib.Path(__file__).resolve().parent.parent / "test" / "spec"


def git(spec, *args):
    return subprocess.run(["git", "-C", str(spec), *args], check=True, capture_output=True, text=True).stdout.strip()


def digest(root):
    """sha256 of the lines `<path> <sha256 of the file>`, sorted by path, over every file under root."""
    lines = []
    for path in sorted(p for p in root.rglob("*") if p.is_file()):
        lines.append(f"{path.relative_to(root).as_posix()} {hashlib.sha256(path.read_bytes()).hexdigest()}\n")
    return "sha256:" + hashlib.sha256("".join(lines).encode()).hexdigest(), len(lines)


def main(argv):
    if len(argv) != 2:
        print(__doc__.split("\n\n")[0] + "\n\nusage: vendor-spec-corpus.py <path to a checkout of the corpus source>", file=sys.stderr)
        return 2
    spec = pathlib.Path(argv[1]).expanduser().resolve()
    try:
        commit = git(spec, "rev-parse", "HEAD")
        dirty = git(spec, "status", "--porcelain", "--", *FOLDERS, *FILES)
    except (subprocess.CalledProcessError, FileNotFoundError) as error:
        print(f"{spec} is not a git checkout of the corpus source: {error}", file=sys.stderr)
        return 2
    if dirty:
        print(f"the files in {spec} have uncommitted changes; commit or discard them first:\n{dirty}", file=sys.stderr)
        return 1
    if TARGET.exists():
        shutil.rmtree(TARGET)
    for folder in FOLDERS:
        shutil.copytree(spec / folder, TARGET / pathlib.Path(folder).name)
    for file in FILES:
        (TARGET / file).parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(spec / file, TARGET / file)
    value, count = digest(TARGET)
    (TARGET / "SOURCE.json").write_text(json.dumps({"commit": commit, "folders": list(FOLDERS), "single_files": list(FILES), "files": count, "digest": value}, indent=2) + "\n")
    print(f"copied {count} files at {commit[:7]} to {TARGET}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
