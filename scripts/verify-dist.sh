#!/usr/bin/env bash
# Verify that the committed bundle matches a clean rebuild.
#
# The action runs dist/index.js, a build artifact committed to the repository, while review
# reads src/. This check runs after `npm run build` in CI and fails on ANY difference between
# the rebuilt tree and the committed one under dist/: a tracked file that changed, a file the
# rebuild removed, and a file present on disk that is not committed (an untracked file is
# what `git diff` alone never reports, and an untracked file under dist/ is exactly a bundle
# nobody reviewed).
#
#   bash scripts/verify-dist.sh [dir]      # dir defaults to dist
set -euo pipefail

DIR="${1:-dist}"

if ! git rev-parse --show-toplevel >/dev/null 2>&1; then
  echo "verify-dist: not inside a git repository" >&2
  exit 2
fi
if [ ! -d "$DIR" ]; then
  echo "verify-dist: $DIR/ is missing; the build produced nothing where the action expects its bundle" >&2
  exit 1
fi

drift="$(git status --porcelain --untracked-files=all -- "$DIR")"
if [ -n "$drift" ]; then
  echo "verify-dist: $DIR/ does not match the clean rebuild. Run 'npm run build' and commit the result."
  echo "$drift"
  git --no-pager diff --stat -- "$DIR" || true
  exit 1
fi

echo "verify-dist: $DIR/ matches the clean rebuild ($(git ls-files -- "$DIR" | wc -l | tr -d ' ') committed files, no untracked files)"
