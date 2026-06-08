#!/usr/bin/env bash
# SessionStart preflight — verify the configured sandbox can actually run.
#
# settings.json may set "sandbox.enabled: true", but on Linux the sandbox is
# implemented with bubblewrap (bwrap), which needs unprivileged user namespaces.
# Some environments — notably Docker Desktop's LinuxKit kernel — disable those,
# so the sandbox silently fails to start and Bash commands run with only the
# devcontainer as the isolation boundary. A guardrail that is configured on but
# not actually enforced is worse than an honest "off": this hook surfaces the
# gap instead of leaving it silent.
#
# Advisory only: prints to stdout (so both Claude and the developer see it) and
# always exits 0 — SessionStart cannot block a session, and it must not try to.

SETTINGS="${CLAUDE_PROJECT_DIR:-.}/.claude/settings.json"

# Only relevant when the sandbox is actually turned on. If we cannot tell
# (no jq, or no settings file), stay silent rather than cry wolf.
command -v jq >/dev/null 2>&1 || exit 0
[ -f "$SETTINGS" ] || exit 0

ENABLED=$(jq -r '.sandbox.enabled // false' "$SETTINGS" 2>/dev/null)
[ "$ENABLED" = "true" ] || exit 0

# Sandbox is enabled — is bubblewrap present and able to create a namespace?
if ! command -v bwrap >/dev/null 2>&1; then
  echo "⚠️  Sandbox preflight: settings.json sets sandbox.enabled=true, but 'bwrap' (bubblewrap) is not installed — the sandbox cannot start, so Bash commands run with only the devcontainer as the isolation boundary. Install bubblewrap, or set sandbox.enabled=false to drop the unenforced claim."
  exit 0
fi

if ! bwrap --ro-bind / / true >/dev/null 2>&1; then
  echo "⚠️  Sandbox preflight: settings.json sets sandbox.enabled=true and bubblewrap is installed, but it cannot create a user namespace here (common on Docker Desktop's LinuxKit kernel, which disables unprivileged user namespaces). The sandbox is NOT active — Bash commands run with only the devcontainer as the isolation boundary. Either enable unprivileged user namespaces for this container, or set sandbox.enabled=false so the config matches reality."
  exit 0
fi

# Sandbox enabled and functional — say nothing (no startup noise).
exit 0
