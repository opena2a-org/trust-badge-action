#!/usr/bin/env bash
# Cells for scripts/verify-dist.sh over a throwaway git repository: one cell per way the
# committed bundle can differ from a rebuild. Each cell is keyed on the exit status and, for a
# failure, on the drifted path being named.
#
#   bash scripts/test/verify-dist-test.sh
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$HERE/../verify-dist.sh"

T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT

fresh() {  # a repository with dist/index.js and src/index.ts committed, clean tree
  rm -rf "$T/repo"; mkdir -p "$T/repo/dist" "$T/repo/src"
  git -C "$T/repo" init -q
  git -C "$T/repo" config user.email t@example.invalid
  git -C "$T/repo" config user.name t
  echo 'bundle' > "$T/repo/dist/index.js"
  echo 'source' > "$T/repo/src/index.ts"
  git -C "$T/repo" add -A
  git -C "$T/repo" commit -q -m init
}

run() {  # -> rc, OUT
  set +e
  OUT="$(cd "$T/repo" && bash "$SCRIPT" 2>&1)"
  rc=$?
  set -e
}

pass=0; failn=0
cell() { if eval "$2"; then pass=$((pass+1)); echo "ok   $1"; else failn=$((failn+1)); echo "FAIL $1"; echo "     rc=$rc"; sed 's/^/     | /' <<< "$OUT"; fi; }

# 1 clean: committed bundle equals the tree
fresh; run
cell "a clean dist passes" '[ $rc = 0 ] && grep -q "matches the clean rebuild" <<< "$OUT"'

# 2 a tracked bundle file changed by the rebuild
fresh; echo 'rebuilt differently' > "$T/repo/dist/index.js"; run
cell "a changed tracked file fails and is named" '[ $rc = 1 ] && grep -q "dist/index.js" <<< "$OUT"'

# 3 an untracked file under dist (the case git diff never reports)
fresh; echo 'stray' > "$T/repo/dist/extra.js"; run
cell "an untracked file under dist fails and is named" '[ $rc = 1 ] && grep -q "dist/extra.js" <<< "$OUT"'

# 4 a committed bundle file the rebuild removed
fresh; rm "$T/repo/dist/index.js"; run
cell "a removed tracked file fails and is named" '[ $rc = 1 ] && grep -q "dist/index.js" <<< "$OUT"'

# 5 the whole dist directory missing
fresh; rm -rf "$T/repo/dist"; run
cell "a missing dist directory fails" '[ $rc = 1 ] && grep -q "missing" <<< "$OUT"'

# 6 drift outside dist is not this check's business
fresh; echo 'edited' > "$T/repo/src/index.ts"; echo 'note' > "$T/repo/NOTES"; run
cell "changes outside dist do not fail the check" '[ $rc = 0 ]'

# 7 an untracked file in a nested directory under dist is still seen
fresh; mkdir -p "$T/repo/dist/vendor"; echo 'x' > "$T/repo/dist/vendor/lib.js"; run
cell "an untracked nested file under dist fails and is named" '[ $rc = 1 ] && grep -q "dist/vendor/lib.js" <<< "$OUT"'

echo "$pass passed, $failn failed"
[ "$failn" = 0 ]
