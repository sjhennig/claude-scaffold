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

# Denylist: patterns that should never run
declare -a DENY_PATTERNS=(
  'rm -rf /'
  'rm -rf ~'
  'rm -rf \$HOME'
  'git push.*--force'
  'git push.*-f '
  'chmod -R 777'
  'mkfs\.'
  '> /etc/'
  '> /usr/'
)

for pattern in "${DENY_PATTERNS[@]}"; do
  if echo "$COMMAND" | grep -qE "$pattern"; then
    echo "BLOCKED: Command matches dangerous pattern: $pattern" >&2
    exit 2
  fi
done

exit 0
