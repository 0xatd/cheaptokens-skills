#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="${TMPDIR:-/tmp}/veniceai-skills-update.$$"
trap 'rm -rf "$TMP"' EXIT

git clone --depth 1 https://github.com/veniceai/skills.git "$TMP"

# Preserve the CheapTokens wrapper skill; sync official Venice skills beside it.
rsync -a --delete --exclude cheaptokens "$TMP/skills/" "$ROOT/skills/"
mkdir -p "$ROOT/vendor"
cp "$TMP/LICENSE" "$ROOT/vendor/VENICE-SKILLS-LICENSE"

VENICE_COMMIT="$(git -C "$TMP" rev-parse HEAD)"
cat > "$ROOT/vendor/VENICE-SKILLS-SOURCE.txt" <<SRC
Upstream: https://github.com/veniceai/skills
Commit: $VENICE_COMMIT
Synced: $(date -u +%Y-%m-%dT%H:%M:%SZ)
License: MIT, see vendor/VENICE-SKILLS-LICENSE
SRC

echo "Synced Venice skills from $VENICE_COMMIT"
