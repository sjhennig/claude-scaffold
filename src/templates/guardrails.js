/**
 * Framework-agnostic guardrail core.
 *
 * Emits the project-local Claude Code guardrails every scaffolded project
 * receives regardless of framework:
 *   - .claude/settings.json  (permissions, sandbox, hooks)
 *   - .claude/hooks/validate-command.sh  (PreToolUse Bash denylist)
 *   - .claude/hooks/verify-gate.sh       (blocking Stop gate)
 *   - .claude/hooks/sandbox-preflight.sh (SessionStart honesty check)
 *   - .claude/hooks/check-drift.sh       (SessionStart spec-drift warning)
 *
 * These are the single source of truth for the guardrails this repo also
 * dogfoods — guardrails.test.js asserts the committed .claude/ files match
 * this output, so the tool can never drift from what it ships.
 *
 * The guardrails depend on exactly one project contract: an `npm run verify`
 * script. They never name `typecheck`/`test`/`lint` directly, so the same
 * core works for every framework (and the no-framework option).
 */

// The `verify` script each template provides. The Stop gate runs `npm run
// verify` and blocks until it passes — so what "verified" means is owned by
// the template, not the guardrail layer.
export const VERIFY_SCRIPT_TS =
  'npm run format:check && npm run lint && npm run typecheck && npm test';
export const VERIFY_SCRIPT_JS =
  'npm run format:check && npm run lint && npm test';

// The versioned plugin that carries the portable Claude config (QC subagents +
// the /qc command, Layer 5). The CLI emits only the *enablement* here; the
// plugin's content lives in the `claude-scaffold` marketplace, updated
// independently of the scaffold. See docs/specs/qc-agents.md.
export const MARKETPLACE_NAME = 'claude-scaffold';
export const PLUGIN_NAME = 'claude-guardrails';
export const PLUGIN_ID = `${PLUGIN_NAME}@${MARKETPLACE_NAME}`;

// The release tag generated projects pin their marketplace to. Without a ref
// they would track main and pick up plugin changes the moment they merge,
// tested or not; pinning means they only move when a release is cut. Must
// always equal `guardrails-v<version>` from plugin/.claude-plugin/plugin.json —
// plugin.test.js enforces that, so bumping the plugin version forces this pin
// (and a matching git tag) in the same change. Release ritual:
// docs/specs/qc-agents.md § Releasing.
export const PINNED_PLUGIN_REF = 'guardrails-v1.1.0';

// Default marketplace source for *generated* projects: the public GitHub repo
// that hosts this scaffold (and its in-repo plugin), pinned to the last
// released tag. This repo itself dogfoods the same plugin unpinned, from its
// own working tree — see generateClaudeSettings's `marketplaceSource` param
// and guardrails.test.js.
export const GITHUB_MARKETPLACE_SOURCE = {
  source: 'github',
  repo: 'sjhennig/claude-scaffold',
  ref: PINNED_PLUGIN_REF,
};

// The source this repo uses to load the plugin from its own working tree: a
// `directory` source pointing at the repo root, which holds
// `.claude-plugin/marketplace.json`. (extraKnownMarketplaces sources must be
// objects with a `source` discriminator — a bare path string is rejected by the
// settings schema.)
export const LOCAL_MARKETPLACE_SOURCE = { source: 'directory', path: '.' };

export function generateClaudeSettings({
  marketplaceSource = GITHUB_MARKETPLACE_SOURCE,
} = {}) {
  const settings = {
    permissions: {
      allow: [
        // File operations (core coding loop)
        'Read',
        'Edit',
        'MultiEdit',
        'Write',

        // File discovery (non-destructive)
        'Glob',
        'Grep',
        'LS',

        // Task tracking
        'TodoWrite',

        // Web access (read-only, useful for looking up docs)
        'WebFetch',
        'WebSearch',

        // Local git commands (no pushing — push is prompted, not allowlisted)
        'Bash(git status:*)',
        'Bash(git diff:*)',
        'Bash(git log:*)',
        'Bash(git add:*)',
        'Bash(git commit:*)',
        'Bash(git branch:*)',
        'Bash(git checkout:*)',
        'Bash(git stash:*)',

        // Project scripts and dev tools
        'Bash(npm run:*)',
        'Bash(npm test:*)',
        'Bash(npx:*)',
        'Bash(node:*)',

        // Read-only shell utilities
        'Bash(cat:*)',
        'Bash(head:*)',
        'Bash(tail:*)',
        'Bash(wc:*)',
        'Bash(tree:*)',
        'Bash(ls:*)',
        'Bash(echo:*)',
        'Bash(find:*)',
        'Bash(grep:*)',
        'Bash(sort:*)',
      ],
      deny: [
        'Bash(sudo:*)',
        // Belt-and-suspenders with the sandbox denyRead below: these stop
        // Claude's file tools (Read) from touching secrets; the sandbox stops
        // Bash subprocesses.
        //
        // Enumerated, not globbed: Claude Code silently ignores glob patterns
        // in Read/Edit permission rules on Linux, so a single 'Read(./.env.*)'
        // would be a no-op there and leave .env.local/.env.production exposed.
        // We list the framework env-file variants explicitly instead. (The
        // sandbox denyRead below keeps its '.env.*' glob — that layer uses
        // gitignore-style matching where '*' works.)
        'Read(./.env)',
        'Read(./.env.local)',
        'Read(./.env.development)',
        'Read(./.env.development.local)',
        'Read(./.env.production)',
        'Read(./.env.production.local)',
        'Read(./.env.test)',
        'Read(./.env.test.local)',
        'Read(~/.ssh/**)',
        'Read(~/.aws/credentials)',
      ],
    },
    hooks: {
      // Block dangerous shell commands before they run.
      PreToolUse: [
        {
          matcher: 'Bash',
          hooks: [
            {
              type: 'command',
              command:
                'bash "$CLAUDE_PROJECT_DIR/.claude/hooks/validate-command.sh"',
            },
          ],
        },
      ],
      // Auto-format any file Claude edits so style stays consistent.
      PostToolUse: [
        {
          matcher: 'Edit|Write',
          hooks: [
            {
              type: 'command',
              command:
                "jq -r '.tool_input.file_path // empty' | xargs -I{} npx prettier --write '{}' 2>/dev/null; exit 0",
            },
          ],
        },
      ],
      // Verification gate: block turn-end until `npm run verify` passes.
      Stop: [
        {
          hooks: [
            {
              type: 'command',
              command:
                'bash "$CLAUDE_PROJECT_DIR/.claude/hooks/verify-gate.sh"',
            },
          ],
        },
      ],
      // Both advisory, never block (SessionStart cannot). First: warn if the
      // sandbox is enabled below but cannot actually run here. Second: warn if a
      // subsystem's source changed recently without its spec being updated.
      SessionStart: [
        {
          hooks: [
            {
              type: 'command',
              command:
                'bash "$CLAUDE_PROJECT_DIR/.claude/hooks/sandbox-preflight.sh"',
            },
          ],
        },
        {
          hooks: [
            {
              type: 'command',
              command:
                'bash "$CLAUDE_PROJECT_DIR/.claude/hooks/check-drift.sh"',
            },
          ],
        },
      ],
    },
    sandbox: {
      enabled: true,
      filesystem: {
        denyRead: ['~/.ssh', '~/.aws/credentials', '.env', '.env.*'],
      },
      network: {
        // Tight allowlist. Add the APIs your app needs here — an empty/over-
        // broad list silently breaks Claude's sandboxed network access.
        allowedDomains: ['registry.npmjs.org', 'github.com'],
        allowUnixSockets: [],
      },
    },
    // Independent-review layer (Layer 5) ships as a versioned plugin, not as
    // committed .claude/agents files — so the reviewers update independently of
    // the scaffold. The plugin's portable config (subagents + /qc) loads from
    // the marketplace below; the guardrail config a plugin CANNOT carry (hooks,
    // permissions, sandbox above) stays here, CLI-emitted.
    extraKnownMarketplaces: {
      [MARKETPLACE_NAME]: { source: marketplaceSource },
    },
    enabledPlugins: {
      [PLUGIN_ID]: true,
    },
  };

  return JSON.stringify(settings, null, 2) + '\n';
}

export function generateValidateCommandScript() {
  return `#!/usr/bin/env bash
# PreToolUse Bash validator — blocks dangerous commands.
# Receives JSON on stdin with .tool_input.command field.
# Exit 0 = allow, Exit 2 = block (reason sent to stderr).

# Fail open if jq is unavailable so we never break every Bash call.
command -v jq >/dev/null 2>&1 || exit 0

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

# If no command found, allow (not a Bash call we can validate)
if [ -z "$COMMAND" ]; then
  exit 0
fi

# Denylist: extended-regex patterns that should never run.
# Patterns err on the side of safety but avoid blocking benign subpaths
# (e.g. \`rm -rf /tmp/foo\` is allowed; \`rm -rf /\` and system dirs are not).
declare -a DENY_PATTERNS=(
  # Recursive/force delete of filesystem root or root glob
  'rm[[:space:]]+-[rf]+[[:space:]]+/([[:space:]]|$|\\*)'
  # Recursive/force delete of a critical system directory
  'rm[[:space:]]+-[rf]+[[:space:]]+/(bin|boot|dev|etc|lib|proc|root|sbin|sys|usr|var)([[:space:]/]|$)'
  # Recursive/force delete of the home directory
  'rm[[:space:]]+-[rf]+[[:space:]]+(~|\\$HOME)([[:space:]/]|$)'
  # Force push, any flag ordering, mid-line or end-of-line
  'git[[:space:]]+push.*(--force|[[:space:]]-[a-zA-Z]*f)([[:space:]]|$)'
  # World-writable recursive chmod
  'chmod[[:space:]]+-R[[:space:]]+777'
  # Filesystem creation
  'mkfs\\.'
  # Redirect into a system directory
  '>[[:space:]]*/(bin|boot|etc|lib|sbin|sys|usr)/'
)

for pattern in "\${DENY_PATTERNS[@]}"; do
  if echo "$COMMAND" | grep -qE "$pattern"; then
    echo "BLOCKED: Command matches dangerous pattern: $pattern" >&2
    exit 2
  fi
done

exit 0
`;
}

export function generateVerifyGateScript() {
  return `#!/usr/bin/env bash
# Stop gate — block turn-end until \`npm run verify\` passes.
#
# Claude Code runs this each time Claude tries to finish. Exit 2 keeps Claude
# working and feeds the stderr text back as the reason; exit 0 releases the gate.
#
# A session-scoped counter caps consecutive blocks so the gate can never
# deadlock if verify simply cannot be made to pass: after MAX_ATTEMPTS it
# releases with a warning. (We do not rely solely on the harness
# \`stop_hook_active\` flag, which is not guaranteed to be present.)

# Fail open if jq is unavailable.
command -v jq >/dev/null 2>&1 || exit 0

MAX_ATTEMPTS=3
INPUT=$(cat)
SESSION=$(echo "$INPUT" | jq -r '.session_id // "default"')
MARKER="\${TMPDIR:-/tmp}/claude-verify-gate-\${SESSION}"

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
`;
}

export function generateSandboxPreflightScript(config = {}) {
  // When the opt-in egress firewall is enabled (M9 Option A), the dormant-bwrap
  // warning would otherwise imply "no boundary" — but the firewall is a real,
  // independent network boundary that works where bwrap can't. Append a note so
  // the message stays honest in both directions.
  const firewallNote = config.networkFirewall
    ? ' (A network-egress firewall (iptables allowlist) is configured separately and DOES enforce here, so network egress is still restricted even with bwrap dormant.)'
    : '';
  return `#!/usr/bin/env bash
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

SETTINGS="\${CLAUDE_PROJECT_DIR:-.}/.claude/settings.json"

# Only relevant when the sandbox is actually turned on. If we cannot tell
# (no jq, or no settings file), stay silent rather than cry wolf.
command -v jq >/dev/null 2>&1 || exit 0
[ -f "$SETTINGS" ] || exit 0

ENABLED=$(jq -r '.sandbox.enabled // false' "$SETTINGS" 2>/dev/null)
[ "$ENABLED" = "true" ] || exit 0

# Sandbox is enabled — is bubblewrap present and able to create a namespace?
if ! command -v bwrap >/dev/null 2>&1; then
  echo "⚠️  Sandbox preflight: settings.json sets sandbox.enabled=true, but 'bwrap' (bubblewrap) is not installed — the sandbox cannot start, so Bash commands run with only the devcontainer as the isolation boundary. Install bubblewrap, or set sandbox.enabled=false to drop the unenforced claim.${firewallNote}"
  exit 0
fi

if ! bwrap --ro-bind / / true >/dev/null 2>&1; then
  echo "⚠️  Sandbox preflight: settings.json sets sandbox.enabled=true and bubblewrap is installed, but it cannot create a user namespace here (common on Docker Desktop's LinuxKit kernel, which disables unprivileged user namespaces). The sandbox is NOT active — Bash commands run with only the devcontainer as the isolation boundary. Either enable unprivileged user namespaces for this container, or set sandbox.enabled=false so the config matches reality.${firewallNote}"
  exit 0
fi

# Sandbox enabled and functional — say nothing (no startup noise).
exit 0
`;
}

export function generateCheckDriftScript() {
  return `#!/usr/bin/env bash
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

ROOT="\${CLAUDE_PROJECT_DIR:-.}"
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

  DRIFTED="$DRIFTED  - $name (spec: \${spec:-none})
"
done < <(jq -c '.subsystems[]' "$MAP")

if [ -n "$DRIFTED" ]; then
  printf '⚠️  Spec drift: source for these subsystems changed in the last %s commits without their spec being updated:\\n' "$LOOKBACK"
  printf '%s' "$DRIFTED"
  echo "If the change altered behavior, update the spec so the docs stay honest. Advisory only."
fi

# Nothing drifted (or we could not tell) — say nothing.
exit 0
`;
}
