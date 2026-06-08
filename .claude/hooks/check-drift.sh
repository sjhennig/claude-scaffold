#!/usr/bin/env bash
# SessionStart drift check — warn when a subsystem's source changed in recent
# commits but its spec did not. Reads an optional subsystem->file map at
# docs/specs/subsystem-map.json:
#
#   { "subsystems": [ { "name": "auth", "files": ["src/auth.ts"],
#                       "spec": "docs/specs/auth.md" } ] }
#
# No map (or an empty one) => silent: a fresh project has no subsystems to
# track, so the hook stays dormant until you add entries.
#
# Advisory only: prints to stdout (so Claude and the developer both see it) and
# always exits 0. SessionStart cannot block a session, and a docs-hygiene nudge
# must never get in the way of work. Every "cannot tell" branch is a silent exit.

ROOT="${CLAUDE_PROJECT_DIR:-.}"
MAP="$ROOT/docs/specs/subsystem-map.json"

# How many recent commits to inspect. Raise it to widen the window, set it very
# high to effectively mute the check, or just prune the map to stop watching a
# subsystem.
LOOKBACK=10

# If we cannot tell (no jq, no git, no map), stay silent rather than cry wolf.
command -v jq >/dev/null 2>&1 || exit 0
command -v git >/dev/null 2>&1 || exit 0
[ -f "$MAP" ] || exit 0

# Empty or malformed map => nothing to check.
jq -e '.subsystems | length > 0' "$MAP" >/dev/null 2>&1 || exit 0

# Must be inside a git work tree to inspect history.
git -C "$ROOT" rev-parse --git-dir >/dev/null 2>&1 || exit 0

# Resolve the base of the lookback window. On a young/shallow repo with fewer
# than LOOKBACK commits, HEAD~$LOOKBACK does not resolve — fall back to the root
# commit so early drift is still caught instead of silently skipped.
BASE=$(git -C "$ROOT" rev-list --max-count=1 "HEAD~$LOOKBACK" 2>/dev/null)
[ -n "$BASE" ] || BASE=$(git -C "$ROOT" rev-list --max-parents=0 HEAD 2>/dev/null | tail -1)
[ -n "$BASE" ] || exit 0

# Files touched in the window (committed history only; the Stop gate already
# covers the working tree).
CHANGED=$(git -C "$ROOT" diff --name-only "$BASE" HEAD 2>/dev/null)
[ -n "$CHANGED" ] || exit 0

# For each subsystem: if any owned file changed but its spec did not, it drifted.
DRIFTED=""
while IFS= read -r sub; do
  name=$(echo "$sub" | jq -r '.name')
  spec=$(echo "$sub" | jq -r '.spec // empty')

  src_changed=""
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    if echo "$CHANGED" | grep -qxF "$f"; then
      src_changed=1
      break
    fi
  done < <(echo "$sub" | jq -r '.files[]?')

  [ -z "$src_changed" ] && continue

  # Source moved — did the spec move with it?
  if [ -n "$spec" ] && echo "$CHANGED" | grep -qxF "$spec"; then
    continue
  fi

  DRIFTED="$DRIFTED  - $name (spec: ${spec:-none})
"
done < <(jq -c '.subsystems[]' "$MAP")

if [ -n "$DRIFTED" ]; then
  printf '⚠️  Spec drift: source for these subsystems changed in the last %s commits without their spec being updated:\n' "$LOOKBACK"
  printf '%s' "$DRIFTED"
  echo "If the change altered behavior, update the spec so the docs stay honest. Advisory only."
fi

# Nothing drifted (or we could not tell) — say nothing.
exit 0
