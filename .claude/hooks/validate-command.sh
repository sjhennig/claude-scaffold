#!/usr/bin/env bash
# PreToolUse Bash validator — blocks dangerous commands.
# Receives JSON on stdin with .tool_input.command field.
# Exit 0 = allow, Exit 2 = block (reason sent to stderr).

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

# If no command found, allow (not a Bash call we can validate)
if [ -z "$COMMAND" ]; then
  exit 0
fi

# Denylist: extended-regex patterns that should never run.
# Patterns err on the side of safety but avoid blocking benign subpaths
# (e.g. `rm -rf /tmp/foo` is allowed; `rm -rf /` and system dirs are not).
declare -a DENY_PATTERNS=(
  # Recursive/force delete of filesystem root or root glob
  'rm[[:space:]]+-[rf]+[[:space:]]+/([[:space:]]|$|\*)'
  # Recursive/force delete of a critical system directory
  'rm[[:space:]]+-[rf]+[[:space:]]+/(bin|boot|dev|etc|lib|proc|root|sbin|sys|usr|var)([[:space:]/]|$)'
  # Recursive/force delete of the home directory
  'rm[[:space:]]+-[rf]+[[:space:]]+(~|\$HOME)([[:space:]/]|$)'
  # Force push, any flag ordering, mid-line or end-of-line
  'git[[:space:]]+push.*(--force|[[:space:]]-[a-zA-Z]*f)([[:space:]]|$)'
  # World-writable recursive chmod
  'chmod[[:space:]]+-R[[:space:]]+777'
  # Filesystem creation
  'mkfs\.'
  # Redirect into a system directory
  '>[[:space:]]*/(bin|boot|etc|lib|sbin|sys|usr)/'
)

for pattern in "${DENY_PATTERNS[@]}"; do
  if echo "$COMMAND" | grep -qE "$pattern"; then
    echo "BLOCKED: Command matches dangerous pattern: $pattern" >&2
    exit 2
  fi
done

exit 0
