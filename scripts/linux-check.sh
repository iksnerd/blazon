#!/usr/bin/env bash
# Run a few tests on Linux (Docker, node:24) against a clean export of HEAD, so a failure only Linux shows is caught before a release
# tag is pushed. Usage: scripts/linux-check.sh [test file ...]   (default: the dev-plugin and test-lock tests)
# It tests HEAD, not the working tree: commit first. It removes its export folder and its container when it ends.

ROOT="$(cd "$(dirname "$0")/.." && pwd)" || exit 1

if [ "$#" -eq 0 ]; then
  set -- test/build/dev-plugin.test.ts test/hooks/test-lock.test.ts
fi

# No `timeout` on macOS: perl alarm bounds the daemon probe, which can hang when Docker is wedged.
if ! command -v docker >/dev/null 2>&1 || ! perl -e 'alarm 20; exec @ARGV' docker info >/dev/null 2>&1; then
  echo "linux-check: Docker is not running; start it and run again."
  exit 1
fi

EXPORT="$(mktemp -d "$HOME/.blazon-linux-check.XXXXXX")" || { echo "linux-check: cannot make an export folder under $HOME"; exit 1; }
NAME="blazon-linux-check-$$"

cleanup() {
  docker rm -f "$NAME" >/dev/null 2>&1
  rm -rf "$EXPORT"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

if ! git -C "$ROOT" archive HEAD | tar -x -C "$EXPORT"; then
  echo "linux-check: FAIL (could not export HEAD)"
  exit 1
fi

# localhost resolves to ::1 in the container, so the dev-server WebSocket needs ipv4first. 0.4 CPUs is slow on purpose: a starved run
# exposed a watcher race that passed at full speed. The test files are passed as arguments to sh, never spliced into the command.
docker run --rm --name "$NAME" --cpus=0.4 \
  -e NODE_OPTIONS=--dns-result-order=ipv4first \
  -v "$EXPORT:/src:ro" node:24 \
  sh -c 'cp -r /src /app && cd /app && npm ci && npm run build && npx vitest run "$@"' sh "$@"
STATUS=$?

if [ "$STATUS" -eq 0 ]; then
  echo "linux-check: PASS ($*)"
else
  echo "linux-check: FAIL, exit $STATUS ($*)"
  exit "$STATUS"
fi
