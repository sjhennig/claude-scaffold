# Architecture — claude-scaffold

## Overview

A Node.js CLI that scaffolds new projects pre-configured with Claude Code guardrails (devcontainers, hooks, permissions, sandbox, context docs).

## Data Flow

```
User runs `claude-scaffold`
  → bin/claude-scaffold.js (entry, error handling)
    → src/index.js (orchestrator)
      → src/prompts.js (gathers user input via inquirer)
      → src/templates/*.js (each returns file contents as strings)
      → fs.writeFileSync (writes generated files to disk)
      → child_process.execSync (optional git init)
```

## Design Principles

1. **Template generators are pure functions.** Input: config object. Output: string. No I/O, no side effects. This makes them trivially testable.
2. **Single orchestrator.** All file-system interaction happens in `src/index.js`. Templates never touch the disk.
3. **Progressive disclosure.** Generated projects have a lean CLAUDE.md up front with @-imports to deeper docs loaded on demand.

## CLI vs. plugin split

The portable, fast-moving Claude config — the QC subagents and the `/qc`
command (Layer 5, independent review) — ships as a **versioned plugin**,
`claude-guardrails`, hosted in this repo under `plugin/` and listed by the
repo-root `.claude-plugin/marketplace.json`. The CLI does **not** emit those as
project-local files; it emits only the _enablement_ in `.claude/settings.json`
(`extraKnownMarketplaces` + `enabledPlugins`), so the reviewers update
independently of the scaffold.

The CLI keeps emitting the project-local config a plugin **cannot** carry:
`.claude/settings.json` (hooks, permissions, sandbox) and the devcontainer.
This split is forced by Claude Code — plugin-loaded subagents ignore
`hooks`/`mcpServers`/`permissionMode` frontmatter, so the verification gate and
validators must live in CLI-emitted settings. Generated projects reference the
marketplace via a GitHub source pinned to a `guardrails-v<version>` release tag
(plugin updates are a deliberate bump, not a HEAD-follow); this repo dogfoods
the same plugin unpinned via a local `directory` source. See `docs/specs/qc-agents.md` and `docs/specs/guardrails.md`.

## Sandbox Model

Generated projects enable Claude Code's `sandbox` (a per-command
filesystem/network allowlist via bubblewrap) on top of the devcontainer. The
bubblewrap layer needs unprivileged user namespaces, which **don't exist on
Docker Desktop's LinuxKit VM** — so on macOS/Windows the inner sandbox is
usually dormant and the devcontainer (plus the VM) is the real boundary. A
`SessionStart` preflight hook surfaces this honestly rather than letting an
inert-but-enabled sandbox look active. See [sandbox.md](sandbox.md) for the
full layer model, per-platform matrix, and the advanced opt-in (and its
tradeoff) for forcing it on.

## Testing

- **Runner:** Vitest
- **Pattern:** Colocated test files (`*.test.js` next to source)
- **Strategy:** Unit-test each template function by asserting on the returned string content. Integration test in `src/index.test.js` exercises the full orchestration (mocked prompts → generated file tree). The plugin has no generator (its markdown is the source of truth), so `plugin.test.js` lives at the repo root and validates the committed `plugin/` files + manifests directly.

## Directory Layout Rationale

- `bin/` — Executable entry point (referenced by package.json `"bin"` field)
- `src/templates/` — One file per output category, not per output file. A single template function may generate multiple related files (e.g., `devcontainer.js` produces both Dockerfile and devcontainer.json).
- `plugin/` — The `claude-guardrails` plugin (manifest under `.claude-plugin/`, subagents in `agents/`, `/qc` in `commands/`). Source of truth, edited directly — not generated. The CLI ships only the settings that enable it.
- `.claude-plugin/marketplace.json` — Repo-root marketplace listing the plugin (`source: ./plugin`); referenced by generated projects (GitHub source) and this repo (local source).
- `docs/` — Human and AI context. Not loaded into Claude's context by default — referenced via @-imports from CLAUDE.md.
- `.claude/` — Claude Code configuration the CLI emits: settings.json (incl. plugin enablement) + hooks. (The QC subagents/skills are plugin-borne, not here.)
- `.devcontainer/` — Docker-based dev environment; the primary isolation boundary for Claude Code (see [sandbox.md](sandbox.md))
