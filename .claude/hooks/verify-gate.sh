#!/usr/bin/env bash
# Stop gate — block turn-end until `npm run verify` passes.
#
# Claude Code runs this each time Claude tries to finish. Exit 2 keeps Claude
# working and feeds the stderr text back as the reason; exit 0 releases the gate.
#
# A session-scoped counter caps consecutive blocks so the gate can never
# deadlock if verify simply cannot be made to pass: after MAX_ATTEMPTS it
# releases with a warning. (We do not rely solely on the harness
# `stop_hook_active` flag, which is not guaranteed to be present.)

# Fail open if jq is unavailable.
command -v jq >/dev/null 2>&1 || exit 0

MAX_ATTEMPTS=3
INPUT=$(cat)
SESSION=$(echo "$INPUT" | jq -r '.session_id // "default"')
MARKER="${TMPDIR:-/tmp}/claude-verify-gate-${SESSION}"

OUTPUT=$(npm run verify 2>&1)
CODE=$?

if [ "$CODE" -eq 0 ]; then
  rm -f "$MARKER"
  exit 0
fi

ATTEMPTS=0
[ -f "$MARKER" ] && ATTEMPTS=$(cat "$MARKER" 2>/dev/null || echo 0)
ATTEMPTS=$((ATTEMPTS + 1))
echo "$ATTEMPTS" > "$MARKER"

if [ "$ATTEMPTS" -ge "$MAX_ATTEMPTS" ]; then
  rm -f "$MARKER"
  echo "Verification still failing after $ATTEMPTS attempts; releasing the Stop gate so you are not stuck. Fix 'npm run verify' before finishing." >&2
  exit 0
fi

{
  echo "Verification gate failed (attempt $ATTEMPTS of $MAX_ATTEMPTS) — fix before finishing:"
  echo "$OUTPUT" | tail -50
} >&2
exit 2
