# shellcheck shell=bash
# Shared by .githooks/pre-commit and .githooks/pre-push: how a step is run and reported, and the memory of which trees passed.

# Tools installed outside the minimal PATH a hook may start with; appended, so a caller's own PATH still wins.
export PATH="$PATH:/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin"

# Few workers and one retry: a hook runs on a machine that is often busy, and a test that times out under load and passes
# alone must not stop a correct commit. BLAZON_HOOK_TEST_ARGS replaces them (empty for none).
TEST_ARGS="${BLAZON_HOOK_TEST_ARGS---maxWorkers=4 --retry=1}"

fail=0
failed=""   # the labels of the steps that failed, in order, for the line that says the tests were skipped

# hook_log NAME: where the whole output of a failed step is saved, in the repository's own git folder.
hook_log() {
    LOG="$(git rev-parse --absolute-git-dir)/$1.log"
    : > "$LOG"
}

# now_ds: the time in tenths of a second. macOS ships bash 3.2, which has neither EPOCHREALTIME nor a fractional SECONDS, so perl
# (on macOS and every Linux image) reads the clock; with no perl it falls back to whole seconds.
now_ds() {
    if command -v perl >/dev/null 2>&1; then perl -MTime::HiRes=time -e 'printf "%d", time * 10'; else echo $(( $(date +%s) * 10 )); fi
}

# step LABEL COMMAND...: run it, say ✓ or ✗ and how long it took, and on a failure print what names the failure. Returns the command's status.
step() {
    local label="$1"; shift
    local out t0 t1 took
    t0="$(now_ds)"
    if ! out="$("$@" 2>&1)"; then
        t1="$(now_ds)"; took=$(( t1 - t0 ))
        printf '  ✗ %s %d.%ds\n' "$label" $(( took / 10 )) $(( took % 10 ))
        printf '=== %s ===\n%s\n' "$label" "$out" >> "$LOG"
        # What the person needs is the failing lines. A suite prints a banner first and a lot of noise in between (jsdom's "Not
        # implemented" lines), so the first lines are rarely it: show the lines that name a failure, or the end when there are none.
        local failing
        failing="$(printf '%s\n' "$out" | grep -v 'Not implemented: ' | grep -E '(×|✗| FAIL |AssertionError|Error:|error TS|ERROR|leaks found|Secret:|File:|RuleID:)|^\+ +"' | head -25)"
        if [ -z "$failing" ]; then failing="$(printf '%s\n' "$out" | tail -25)"; fi
        printf '%s\n' "$failing" | sed 's/^/      /'
        printf '      full output: %s\n' "$LOG"
        fail=1
        failed="${failed:+$failed, }$label"
        return 1
    fi
    t1="$(now_ds)"; took=$(( t1 - t0 ))
    printf '  ✓ %s %d.%ds\n' "$label" $(( took / 10 )) $(( took % 10 ))
}

# tests_gate: the line between the cheap steps and the test steps. A cheap step that failed means the commit or push is refused
# whatever the tests say, so they are not started (a full run on a busy machine for a refusal already decided). They are skipped,
# not passed: nothing is remembered for them, so the attempt after the fix runs them. Returns 1 when they are to be skipped.
tests_gate() {
    [ "$fail" -eq 0 ] && return 0
    printf '  – tests not run: %s failed; fix those first\n' "$failed"
    return 1
}

# --- the test lock. Test steps run one gate at a time for each repository: every session's hook builds the viewer and starts Chrome,
# so two or three gates at once oversubscribe the cores and each takes several times longer. The lock is a directory in the COMMON git
# folder (every worktree of the checkout queues on it, like the hook cache); mkdir is atomic and macOS has no flock. Its `owner` file
# records pid, hook, worktree, start time and the process start time (`ps lstart`, so a reused pid is not taken for the holder).
# Only the test steps are behind it (test_step), so format and lint errors show at once; it is taken lazily, when a test step is
# about to run, never on a cache hit; held across the test steps of one hook run and released when the hook ends, however it ends
# (release_test_lock, from the hooks' EXIT trap). A holder that is gone is taken over. After BLAZON_HOOK_LOCK_WAIT_SECONDS (2400) a
# gate runs its tests without the lock: the lock costs time and never skips a test. BLAZON_HOOK_NO_LOCK=1 does not use it.
# BLAZON_HOOK_LOCK_POLL_SECONDS (2) and BLAZON_HOOK_LOCK_NOTICE_SECONDS (30) exist for the tests of the hooks.
TEST_LOCK_DIR=""      # set while this hook holds the lock
LOCK_WAITED=0         # seconds this hook waited for it, for the line at the end

lock_dir() {
    local common
    common="$(cd "$(git rev-parse --git-common-dir)" && pwd)"
    echo "$common/blazon-hook-test.lock"
}
# fmt_dur SECONDS: 4m10s
fmt_dur() {
    local s="$1"
    if [ "$s" -ge 3600 ]; then printf '%dh%02dm' $(( s / 3600 )) $(( s % 3600 / 60 ))
    elif [ "$s" -ge 60 ]; then printf '%dm%02ds' $(( s / 60 )) $(( s % 60 ))
    else printf '%ds' "$s"; fi
}
# proc_start PID: when the process started, as ps prints it; empty when there is no such process
proc_start() { echo $(ps -o lstart= -p "$1" 2>/dev/null); }
# owner_field DIR KEY
owner_field() { sed -n "s/^$2=//p" "$1/owner" 2>/dev/null | head -n 1; }
# lock_is_stale DIR: succeeds when nobody holds it any more
lock_is_stale() {
    local dir="$1" pid recorded current mtime
    pid="$(owner_field "$dir" pid)"
    if [ -z "$pid" ]; then
        # mkdir is done and the record is not written yet; a holder that died between the two leaves a bare directory
        mtime="$(stat -f %m "$dir" 2>/dev/null || stat -c %Y "$dir" 2>/dev/null || date +%s)"
        [ $(( $(date +%s) - mtime )) -gt 10 ]
        return
    fi
    kill -0 "$pid" 2>/dev/null || return 0
    recorded="$(owner_field "$dir" lstart)"
    current="$(proc_start "$pid")"
    # the pid is alive but is another process than the one that took the lock: the pid was reused
    [ -n "$recorded" ] && [ -n "$current" ] && [ "$recorded" != "$current" ]
}

# acquire_test_lock: wait for the lock and take it; returns 0 either way (a gate that cannot take it still runs its tests)
acquire_test_lock() {
    [ -n "$TEST_LOCK_DIR" ] && return 0
    [ -n "${BLAZON_HOOK_NO_LOCK:-}" ] && return 0
    local dir limit poll notice start now waited last="" pid since
    dir="$(lock_dir)"
    limit="${BLAZON_HOOK_LOCK_WAIT_SECONDS:-2400}"
    poll="${BLAZON_HOOK_LOCK_POLL_SECONDS:-2}"
    notice="${BLAZON_HOOK_LOCK_NOTICE_SECONDS:-30}"
    start="$(date +%s)"
    until mkdir "$dir" 2>/dev/null; do
        [ -d "$dir" ] || return 0   # the folder cannot be written: no lock, the tests still run
        if lock_is_stale "$dir"; then
            pid="$(owner_field "$dir" pid)"
            printf '  – tests: the test lock was left by pid %s, which is not running; taking it over\n' "${pid:-unknown}"
            # the record is read again just before the removal, so a lock another gate took in between is not removed
            if [ "$(owner_field "$dir" pid)" = "$pid" ]; then rm -rf "$dir"; fi
            continue
        fi
        now="$(date +%s)"; waited=$(( now - start ))
        if [ "$waited" -ge "$limit" ]; then
            LOCK_WAITED="$waited"
            printf '  – tests: waited %s for the test lock; running the tests without it\n' "$(fmt_dur "$waited")"
            return 0
        fi
        if [ -z "$last" ] || [ $(( waited - last )) -ge "$notice" ]; then
            last="$waited"
            since="$(owner_field "$dir" started)"
            printf '  – tests: waiting for another gate to finish: %s in %s, pid %s, running for %s\n' \
                "$(owner_field "$dir" hook)" "$(owner_field "$dir" worktree)" "$(owner_field "$dir" pid)" \
                "$(fmt_dur $(( now - ${since:-$now} )))"
        fi
        sleep "$poll"
    done
    {
        echo "pid=$$"
        echo "hook=$(basename "$0")"
        echo "worktree=$(git rev-parse --show-toplevel)"
        echo "started=$(date +%s)"
        echo "lstart=$(proc_start $$)"
    } > "$dir/owner.tmp" && mv "$dir/owner.tmp" "$dir/owner"
    TEST_LOCK_DIR="$dir"
    LOCK_WAITED=$(( $(date +%s) - start ))
}

# release_test_lock: give it back, when this hook holds it (the record names this process). Safe to call twice.
release_test_lock() {
    [ -n "$TEST_LOCK_DIR" ] || return 0
    if [ "$(owner_field "$TEST_LOCK_DIR" pid)" = "$$" ]; then rm -rf "$TEST_LOCK_DIR"; fi
    TEST_LOCK_DIR=""
}

# test_step KEY LABEL COMMAND...: cached_step for a test step; the lock is taken here, only when the step is about to run
test_step() {
    local key="$1" label="$2"
    if ! passed_before "$key"; then acquire_test_lock; fi
    cached_step "$@"
}

# --- trees that passed. A step that passed on a tree is not run again on the same tree: a reset and a second commit, or a push of
# a tree that pre-commit already ran in full. The key names the kind of run and what it was given; a failure is never kept.
# BLAZON_HOOK_NO_CACHE=1 ignores the memory. It lives in the common git folder, so every worktree of the repository shares it.
CACHE_VERSION=v1
cache_dir() {
    local common
    common="$(cd "$(git rev-parse --git-common-dir)" && pwd)"
    echo "$common/blazon-hook-cache"
}
digest_of() { git hash-object --stdin; }

# passed_before KEY
passed_before() { [ -z "${BLAZON_HOOK_NO_CACHE:-}" ] && [ -f "$(cache_dir)/$CACHE_VERSION-$1" ]; }

# remember KEY: keep the newest 300, so the folder does not grow for ever.
remember() {
    local dir
    dir="$(cache_dir)"
    mkdir -p "$dir"
    : > "$dir/$CACHE_VERSION-$1"
    # shellcheck disable=SC2012
    ls -t "$dir" 2>/dev/null | tail -n +301 | while IFS= read -r old; do rm -f "$dir/$old"; done
}

# cached_step KEY LABEL COMMAND...: step, but not when this tree passed it before; a pass is remembered.
cached_step() {
    local key="$1" label="$2"; shift 2
    if passed_before "$key"; then
        printf '  ✓ %s (this tree passed before)\n' "$label"
        return 0
    fi
    if step "$label" "$@"; then remember "$key"; return 0; fi
    return 1
}

# classify_paths ROOT: reads paths, one on a line, and sets what they ask for. ROOT holds the tree they are in, so a path that is
# gone is not handed to a run. The same mapping serves pre-commit (the staged paths) and pre-push (the paths of the pushed commits).
#   full           the whole suite: a path nothing names, one that configures the build or the tests, or a data file under test/ whose
#                  readers are not a small known set
#   deck, docs     the deck and plugin tests; the manual and RFC tests
#   related_files  the .ts and .tsx files of src/ and test/, for `vitest related`
#   extra_tests    test files and folders that read a hook, a script or a plugin folder by name
#   (nothing)      a file only a linter or the formatter reads: their steps run on every commit
classify_paths() {
    local root="$1" path
    full=0; deck=0; docs=0; related_files=""; extra_tests=""
    while IFS= read -r path; do
        [ -n "$path" ] || continue
        # The MCP server runs the blazon command line and prints what it says, so a change to the commands it wraps asks for its tests too
        case "$path" in
            mcp/src/*|mcp/test/*|src/cli/*|src/core/read/*) extra_tests="$extra_tests mcp/test" ;;
        esac
        case "$path" in
            eslint.config.js|prettier.config.js|.prettierignore|ruff.toml|.editorconfig|.git-blame-ignore-revs) ;;
            .githooks/*|scripts/install-hooks.mjs) extra_tests="$extra_tests test/hooks" ;;
            # The generators write the finding tables of the manual and RFC 0001 and the layers diagram of ARCHITECTURE.md; their tests are in the docs run
            scripts/gen-checks-docs.ts|scripts/gen-layers-docs.ts|scripts/layers.json) docs=1 ;;
            scripts/shipped-lock.mjs) extra_tests="$extra_tests test/scripts/shipped-lock.test.ts" ;;
            # The build of the plugins' programs: what the conformance test and the print-book test hold them to
            scripts/build-plugins.mjs|scripts/plugin-externals.ts) extra_tests="$extra_tests test/scripts/shipped-lock.test.ts test/plugins/shipped/conformance test/plugins/shipped/print-book.test.ts" ;;
            scripts/blazon-src.ts)
                extra_tests="$extra_tests test/core/config/config-validation.test.ts test/plugins/roles/commands test/plugins/host/cli test/plugins/shipped/brand-deck test/plugins/examples/cue-rules.test.ts test/plugins/shipped/shipped.test.ts test/plugins/examples/reference test/build/first-run.test.ts" ;;
            test/deck/python/*|scripts/*.py|scripts/blazon-blazon.*) deck=1 ;;
            # A plugin folder is not a page of the manual: plugins/shipped.lock (build output) holds a digest of each one, so a changed
            # README or package.json makes the lock stale, and only the tests that compare the two (and the conformance test) see that
            plugins/*) extra_tests="$extra_tests test/plugins/shipped/shipped.test.ts test/plugins/shipped/conformance" ;;
            docs/*|.github/*|LICENSE|CODEOWNERS) docs=1 ;;
            # The MCP workspace: its source and tests ask for its tests (above); a dependency or build change needs the whole suite; its README is a page
            mcp/src/*|mcp/test/*) ;;
            mcp/*.md) docs=1 ;;
            src/*) docs=1; [ -f "$root/$path" ] && related_files="$related_files $path" ;;
            # Data files whose readers are a small, known set (test/hooks/data-file-mapping.test.ts greps the repository for them and fails when
            # a reader appears outside this list). A file read through a folder loader or by many tests stays in the full suite below.
            test/surface/public-surface.json) extra_tests="$extra_tests test/surface" ;;
            test/first-run/expected.json) extra_tests="$extra_tests test/build/first-run.test.ts" ;;   # scripts/smoke-tarball.mjs reads it too, at release
            test/examples/golden/conformance/*) extra_tests="$extra_tests test/core/tokens/conformance.test.ts" ;;
            test/plugins/shipped/fixtures/tokens-plugins/*) extra_tests="$extra_tests test/plugins/shipped/shadcn.test.ts test/plugins/shipped/tailwind.test.ts" ;;
            test/plugins/shipped/logo-geometry/oracle/*) extra_tests="$extra_tests test/plugins/shipped/logo-geometry/oracle.test.ts" ;;
            # Only code is found through imports. Any other golden, corpus file or fixture is read by path, so it asks for the full suite.
            test/*.ts|test/*.tsx) [ -f "$root/$path" ] && related_files="$related_files $path" ;;
            # The starter is what `blazon init` copies, and many tests start from it (a page count, a note count, a plugin list). The whole suite
            # runs at push; these are the ones that break first, so a commit runs them too, and not the third failed push of the day.
            examples/blazon/*) full=1; extra_tests="$extra_tests test/core/starter.test.ts test/build test/init test/brand test/viewer/viewer-docs.test.tsx test/plugins/roles" ;;
            test/*|examples/*) full=1 ;;
            *.md) docs=1 ;;
            # A path no rule names is not safe to skip
            *) full=1 ;;
        esac
    done
    # Each test file, folder or name prefix (a split test file, such as test/plugins/shipped/conformance for conformance-*.test.ts) once, and only those that exist in the tree
    local listed="" item
    for item in $(printf '%s\n' $extra_tests | sort -u); do
        compgen -G "$root/$item*" >/dev/null && listed="$listed $item"
    done
    extra_tests="$listed"
}

# whole_tree_guards TREE DIR: the tests that read the whole tree, run in DIR, an export of the tree: test/core/no-private-markers.test.ts
# (no private name or home folder in any tracked file) and test/core/layers.test.ts (the layers of src/, no framework name in core).
# `vitest related` never selects them, and classify_paths names them for no path, so a README or a plugin test that carried a private
# name passed both hooks. Both hooks run them on every commit and on every push that does not run the whole suite (which holds them).
# They are not in classify_paths' extra_tests on purpose: that list depends on the paths, and these must run whatever the paths.
# The marker file lives outside the tree ($BLAZON_PRIVATE_MARKERS, or ~/.config/blazon/private-markers.json), so its content is part
# of the key: a new marker must not hide behind a pass of the same tree.
whole_tree_guards() {
    local tree="$1" dir="$2" markers="${BLAZON_PRIVATE_MARKERS:-$HOME/.config/blazon/private-markers.json}" mkey=none
    [ -f "$markers" ] && mkey="$(digest_of < "$markers")"
    cached_step "guards-$tree-$mkey" "tests: whole-tree guards" bash -c "cd '$dir' && npm run -s test:guards -- $TEST_ARGS"
}

# classify_lint ROOT: reads paths, one on a line (the staged ones), and sets what ESLint must be run on for them.
#   lint_full    1 when a change can alter what ESLint says about a file that is not staged, so the whole tree is linted
#   lint_files   otherwise, what to hand ESLint: the staged files it reads (.ts .tsx .js .mjs .cjs) that exist in ROOT, and for a
#                change in src/cli, src/viewer or src/shipped that whole folder; empty when there is nothing
# Every rule but the type-aware ones looks at one file alone. The type-aware ones (no-floating-promises and two more, src/ only)
# also read the types of what the file imports, so a changed file can change the findings of the files that import it. The asks
# for the whole tree are therefore a closed list:
#   - the config of ESLint, the compiler or the dependencies (eslint.config.js, package.json, package-lock.json, tsconfig*.json)
#   - a declaration file (*.d.ts): it can type anything
#   - a file under src/ that a file in another folder of src/ imports: src/core, types, plugins, server, builder. The importers
#     of src/cli, src/viewer and src/shipped are in the same folder (the layers in test/core/layers.test.ts; nothing in src/
#     imports them from outside), so for those the folder is linted, not the tree. Nothing in src/ imports src/index.ts.
# Tests, scripts and mcp/ are not type-aware and no type-aware file imports them: a change there is linted alone.
# A deleted path is not read, so it only counts when it asks for the whole tree.
classify_lint() {
    local root="$1" path dir
    lint_full=0; lint_files=""
    while IFS= read -r path; do
        [ -n "$path" ] || continue
        case "$path" in
            eslint.config.js|package.json|package-lock.json|tsconfig*.json|*/tsconfig*.json|*.d.ts) lint_full=1 ;;
            src/cli/*|src/viewer/*|src/shipped/*)
                dir="$(printf '%s' "$path" | cut -d/ -f1-2)"
                [ -d "$root/$dir" ] && lint_files="$lint_files $dir"
                continue ;;
            src/index.ts) ;;
            src/*) lint_full=1 ;;
        esac
        case "$path" in
            *.ts|*.tsx|*.js|*.mjs|*.cjs) [ -f "$root/$path" ] && lint_files="$lint_files $path" ;;
        esac
    done
    lint_files="$(printf '%s\n' $lint_files | sort -u | tr '\n' ' ')"
    lint_files="${lint_files% }"
}

# finish HOOKNAME: the ending of a hook.
finish() {
    local hook="$1" bypass="$2"
    release_test_lock
    if [ "$LOCK_WAITED" -gt 0 ]; then echo "  waited $(fmt_dur "$LOCK_WAITED") for the test lock"; fi
    if [ "$fail" -ne 0 ]; then
        echo
        echo "$hook failed. Fix the above, or '$bypass' to skip."
        exit 1
    fi
    echo "$hook: ok"
}

# refuse HOOKNAME BYPASS MESSAGE: stop at once with one line saying why.
refuse() {
    echo "  ✗ $3"
    echo
    echo "$1 failed. Fix the above, or '$2' to skip."
    exit 1
}

# browser_excludes ROOT: the vitest arguments that leave out the test files that start Chrome, one `--exclude=<glob>` for each line of
# test/browser-tests.txt in ROOT (the one list of them; `#` starts a comment). Prints nothing when ROOT has no such list. pre-commit
# adds them to its related run: a Chrome start takes most of a core, and a commit that touches src/ is related to many of them. pre-push
# and `npm test` do not, so the push runs them. Printed one to a line, so the caller can word-split them (no glob has a space).
browser_excludes() {
    local list="$1/test/browser-tests.txt" line
    [ -f "$list" ] || return 0
    while IFS= read -r line || [ -n "$line" ]; do
        case "$line" in ''|'#'*) ;; *) printf '%s\n' "--exclude=$line" ;; esac
    done < "$list"
}
