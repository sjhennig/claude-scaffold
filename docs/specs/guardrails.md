# Guardrails Spec

<!--
Living doc — update this whenever src/templates/guardrails.js changes what it
emits. Registered in docs/specs/subsystem-map.json so the drift hook watches it.
-->

## Purpose

The framework-agnostic guardrail core: the pure generators for the project-local
Claude Code config every scaffolded project receives, regardless of framework.
It produces `.claude/settings.json` (permissions, sandbox, hooks, **and the
plugin enablement**) and the four hook scripts. It is NOT responsible for
framework files, docs, or the QC subagents themselves (those ship as the
`claude-guardrails` plugin — see [[qc-agents]]); it only emits the settings that
_enable_ that plugin.

This repo dogfoods these generators: its committed `.claude/` is regenerated from
here, and `guardrails.test.js`'s `dogfood:` block asserts the two match.

## Owning files

- `src/templates/guardrails.js` — all guardrail generators (pure: no I/O).

## Public interface

```
VERIFY_SCRIPT_TS : string   // "npm run format:check && lint && typecheck && test"
VERIFY_SCRIPT_JS : string   // same, minus typecheck (no-framework / JS templates)

generateClaudeSettings({ marketplaceSource } = {}) -> string
  // JSON for .claude/settings.json: permissions.allow/deny, hooks
  // (PreToolUse Bash, PostToolUse Edit|Write prettier, Stop verify-gate,
  // SessionStart [sandbox-preflight, check-drift]), sandbox config, and the
  // claude-guardrails plugin enablement (extraKnownMarketplaces +
  // enabledPlugins). `marketplaceSource` defaults to GITHUB_MARKETPLACE_SOURCE
  // (what generated projects get); this repo passes LOCAL_MARKETPLACE_SOURCE.
  // Trailing newline. Must be valid JSON.

// Plugin enablement constants (also exported):
MARKETPLACE_NAME = "claude-scaffold"   PLUGIN_NAME = "claude-guardrails"
PLUGIN_ID = "claude-guardrails@claude-scaffold"
PINNED_PLUGIN_REF = "guardrails-v<version>"  // must match plugin.json version (plugin.test.js)
GITHUB_MARKETPLACE_SOURCE = { source: "github", repo: "sjhennig/claude-scaffold", ref: PINNED_PLUGIN_REF }
LOCAL_MARKETPLACE_SOURCE  = { source: "directory", path: "." }

generateValidateCommandScript()  -> string   // PreToolUse Bash denylist (exit 2 = block)
generateVerifyGateScript()       -> string   // Stop gate: `npm run verify`, exit 2 = keep working
generateSandboxPreflightScript() -> string   // SessionStart: warn if sandbox enabled but bwrap can't run
generateCheckDriftScript()       -> string   // SessionStart: warn on spec drift (this file's enforcement)
```

## Invariants & constraints

- **Single source of truth.** The committed repo `.claude/` is generated from
  these functions; changing a generator requires regenerating the repo files or
  the dogfood test fails. See [[dogfood-drift-test]].
- **`git push` is never allowlisted** — outbound/irreversible actions stay
  prompted. Secrets (`.env`, `~/.ssh`, `~/.aws/credentials`) are denied to both
  Read (permissions.deny) and Bash subprocesses (sandbox.filesystem.denyRead).
- **Hook exit-code contract:** PreToolUse/Stop may block with `exit 2`;
  **SessionStart hooks are advisory and must never `exit 2`** (they cannot block
  a session). All hook scripts **fail open** when `jq` is missing.
- **The guardrails depend on exactly one project contract:** an `npm run verify`
  script. They never name `typecheck`/`test`/`lint` directly, so the same core
  works for every framework.
- `allowUnixSockets` nests under `sandbox.network` (schema correctness).
- **Plugin enablement, not plugin content.** The settings carry only the
  `extraKnownMarketplaces` + `enabledPlugins` reference; the subagents/`/qc`
  live in the [[qc-agents]] plugin. The guardrail behavior a plugin _cannot_
  carry (hooks, permissions, sandbox) stays here by design — plugin-loaded
  agents ignore `hooks`/`mcpServers`/`permissionMode` frontmatter (design
  brief §3).
- **`extraKnownMarketplaces[].source` must be an object** with a `source`
  discriminator (`github`/`directory`/…), never a bare path string — the
  settings schema rejects a string.

## Edge cases

- **Sandbox enabled but inert** (Docker Desktop LinuxKit, no user namespaces):
  preflight detects `bwrap` cannot create a namespace and warns; it does not
  weaken the container. See [[sandbox-preflight-and-macos-vm]].
- **Verify cannot be made to pass:** the Stop gate has a session-scoped counter
  (`MAX_ATTEMPTS=3`) and releases with a warning so it can never deadlock.
- **Drift hook on a fresh/young repo:** no map, empty map, or fewer than
  `LOOKBACK` commits → silent no-op.

## Open decisions

- Whether to add a drift/dogfood test for the devcontainer Dockerfile beyond the
  loose-invariant guard (currently only shared security tools are asserted).
