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
- **Strategy:** Unit-test each template function by asserting on the returned string content. Integration test in `src/index.test.js` exercises the full orchestration (mocked prompts → generated file tree).

## Directory Layout Rationale

- `bin/` — Executable entry point (referenced by package.json `"bin"` field)
- `src/templates/` — One file per output category, not per output file. A single template function may generate multiple related files (e.g., `devcontainer.js` produces both Dockerfile and devcontainer.json).
- `docs/` — Human and AI context. Not loaded into Claude's context by default — referenced via @-imports from CLAUDE.md.
- `.claude/` — Claude Code configuration (settings.json, hooks, future agents/skills)
- `.devcontainer/` — Docker-based dev environment; the primary isolation boundary for Claude Code (see [sandbox.md](sandbox.md))
