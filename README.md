[![CI](https://github.com/sjhennig/claude-scaffold/actions/workflows/ci.yml/badge.svg)](https://github.com/sjhennig/claude-scaffold/actions/workflows/ci.yml)

# claude-scaffold

Generate a fully configured project directory for AI-first development with Claude Code inside a VS Code devcontainer.

One command. Seven questions. A complete project ready to open in VS Code and start building.

## Why

Starting a new Claude Code project means manually wiring up a Docker devcontainer, context documents, Claude Code hooks, a testing setup, and standard config files. That's roughly a dozen files across five concerns. This tool does all of it in seconds.

## Quick Start

No install needed — just Node 20+:

```bash
# One line, no prompts (defaults for everything unspecified):
npx @sjhennig/claude-scaffold my-app --framework node-ts --yes

# Or interactive — answer seven questions:
npx @sjhennig/claude-scaffold
```

> **Naming note:** the package is scoped (`@sjhennig/claude-scaffold`) because
> the unscoped npm name `claude-scaffold` belongs to an unrelated tool. The
> installed command is still `claude-scaffold`.

Every prompt has a flag — any subset works, and whatever you don't pass is
asked interactively (or defaulted by `--yes`):

```
claude-scaffold <name> [--description <text>] [--framework <id>] [--port <n>]
                [--anthropic-api] [--api-keys <a,b>] [--isolated-creds]
                [--no-git] [--yes]
claude-scaffold doctor   # guardrail health check in a scaffolded project
```

In interactive mode, you'll be prompted for:

| Prompt                       | Default                                  |
| ---------------------------- | ---------------------------------------- |
| Project name (kebab-case)    | _(required)_                             |
| One-line description         | "A new Claude Code project"              |
| Framework                    | React + Vite + TypeScript (see below)    |
| Dev server port              | 5173 (React+Vite) / 3000 (Next.js, Node) |
| Uses Anthropic API directly? | No                                       |
| Additional API key names     | _(none)_                                 |
| Isolate Claude credentials?  | No (bind-mounts host `~/.claude`)        |
| Initialize git?              | Yes                                      |

The scaffolded project is created at `./{project-name}` relative to your current directory.

## Frameworks

Four templates are available:

| Framework                     | Best for                                                                               |
| ----------------------------- | -------------------------------------------------------------------------------------- |
| **React + Vite + TypeScript** | Client-side apps, dashboards, browser-based tools                                      |
| **Next.js + TypeScript**      | Full-stack web apps, anything needing SSR or API routes                                |
| **Node + TypeScript**         | CLI tools, APIs, backend services, automation, anything without a UI                   |
| **Guardrails only (none)**    | Bring your own stack — devcontainer, guardrails, docs, and a minimal JS verify harness |

Each framework generates the appropriate package.json, tsconfig, starter files (including a passing starter test, so the verification gate works on day one), and directory structure. The devcontainer, Claude Code config, context docs, and permissions are shared across all frameworks — the guardrail core is framework-agnostic.

## What You Get

The exact files vary by framework. Here's the React + Vite + TypeScript structure:

```
my-project/
├── .claude/              ← Settings, permissions, sandbox, and hooks
│   ├── settings.json     ← Permissions + sandbox + hook wiring + QC plugin enablement
│   ├── hooks/            ← Deterministic gates (see "Hooks" below)
│   │   ├── validate-command.sh
│   │   ├── verify-gate.sh
│   │   ├── sandbox-preflight.sh
│   │   └── check-drift.sh
│   └── commands/         ← Custom slash commands (starter README)
├── .devcontainer/        ← Docker devcontainer (Node 20, Claude Code pre-installed)
│   ├── Dockerfile
│   └── devcontainer.json
├── docs/                 ← Context docs Claude reads as needed
│   ├── project-brief.md  ← Fill this in first — scope, audience, v1 features
│   ├── architecture.md   ← System design, directory layout, key patterns
│   └── specs/            ← Feature specs (spec-driven development)
├── src/                  ← Application source code
│   ├── components/
│   ├── hooks/
│   ├── utils/
│   ├── types/
│   ├── assets/
│   ├── App.tsx
│   └── main.tsx
├── CLAUDE.md             ← Quick-reference card Claude reads every session
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── vitest.config.ts
```

## The Five-Layer Guardrail System

The point of the scaffold is **maximum safe autonomy**: every generated project ships with five independent guardrail layers already wired up. Relaxing one doesn't silently weaken the others.

| #   | Layer                  | Where it lives                                       | What it does                                                                                                      |
| --- | ---------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 1   | Sandbox + devcontainer | `.claude/settings.json` `sandbox` + `.devcontainer/` | OS-level isolation; secrets (`~/.ssh`, `~/.aws/credentials`, `.env*`) unreadable, network limited to an allowlist |
| 2   | Verification harness   | `npm run verify`                                     | format check + lint (+ typecheck) + tests — the project's ground truth                                            |
| 3   | Deterministic hooks    | `.claude/hooks/*.sh`                                 | Block dangerous commands, auto-format, gate turn-end on verify (see below)                                        |
| 4   | Scoped permissions     | `.claude/settings.json` `permissions`                | Safe commands auto-approved; `sudo` and secrets denied; push prompted                                             |
| 5   | Independent review     | `claude-guardrails` plugin                           | `/qc` + three read-only reviewers (code/spec/security) and a test-runner, each in a fresh context                 |

Layer 5 ships as a **versioned plugin**, not as project files: settings.json enables `claude-guardrails@claude-scaffold` from this repo's marketplace, **pinned to a tested release tag** (`guardrails-v<version>`). The plugin carries the `code-reviewer`, `spec-reviewer`, `security-reviewer`, and `test-runner` subagents, the `/qc` checkpoint command, and a `guardrails-help` skill that explains and troubleshoots all of this on demand inside the generated project. Reviewer improvements reach your projects by release, never by re-scaffolding.

## Default Permissions

Every scaffolded project ships with sensible Claude Code permissions in `.claude/settings.json`. The goal is to reduce approval prompts for safe, everyday operations while keeping destructive or external-facing actions gated.

**Auto-approved (no prompts):**

- File operations — Read, Edit, Write, Glob, Grep
- Local git — status, diff, log, add, commit, branch, checkout, stash
- Project scripts — `npm run`, `npm test`, `npx`, `node`
- Read-only shell — cat, head, tail, wc, tree, ls, echo, find, grep, sort
- Web access — WebFetch, WebSearch (for looking up docs)

**Denied entirely:**

- `sudo` — no privilege escalation

**Manual approval required (default behavior):**

- `rm`, `mv`, `cp` — destructive or could overwrite files
- `git push`, `git merge`, `git rebase` — affects remote or rewrites history
- `npm install` — runs arbitrary postinstall scripts
- `curl`, `wget` — network requests from the shell

There are two layers of permission configuration:

- **`.claude/settings.json`** is committed to git and shared with anyone who clones the project. Team-wide rules live here — hooks, deny rules, and baseline permissions.
- **`.claude/settings.local.json`** is gitignored. Use it for personal preferences on your machine — for example, if you trust `npm install` and want to auto-approve it, add it here without affecting collaborators.

You can also adjust permissions on the fly during a session with `/permissions add [tool]`.

## Hooks

The generated `.claude/settings.json` wires four hook events to scripts in `.claude/hooks/`:

- **PreToolUse** (`validate-command.sh`) — Blocks a short, legible denylist of dangerous Bash commands (recursive root deletes, force-push, and similar) before they run, with a reason. It's a best-effort guard against destructive _accidents_, not an adversarial control — denylists are bypassable, so it's a speed-bump, with the sandbox and devcontainer as the real boundaries.
- **PostToolUse** — Runs Prettier on any file Claude edits or writes, keeping style consistent without manual formatting. Never blocks the edit.
- **Stop** (`verify-gate.sh`) — Runs `npm run verify` (format check + lint + typecheck where applicable + tests) whenever Claude tries to finish, and **blocks turn-end until it passes**. This is the core verification gate; it releases itself after a capped number of consecutive failures so it can never deadlock a session.
- **SessionStart** (`sandbox-preflight.sh`, `check-drift.sh`) — Advisory only: warns honestly when the sandbox is enabled but inert on this machine (common on Docker Desktop), and warns when source changed without its spec once you opt subsystems into the drift map. Both stay silent when there is nothing to report; the drift check is fully dormant until you add subsystems to the map.

## Setting Up a New Project, Step by Step

Everything you need is listed under [Prerequisites](#prerequisites). The short
version: Node 20+, Docker Desktop, VS Code with the Dev Containers extension,
and Claude Code authenticated on your host machine.

### 1. Start Docker

Launch Docker Desktop and wait until it reports "running". The devcontainer
build in step 4 needs the Docker daemon up — if it isn't, VS Code will fail
with a "Docker not found / not running" error rather than offering to start it.

### 2. Generate the project

From the directory that should contain your new project:

```bash
# Interactive — answer seven questions:
npx @sjhennig/claude-scaffold

# Or one line, no prompts:
npx @sjhennig/claude-scaffold my-app --framework node-ts --yes
```

This writes the complete project to `./my-app` and (by default) initializes a
git repository. Nothing is installed yet — dependencies are handled inside the
container in step 4.

### 3. Open it in VS Code

```bash
cd my-app
code .
```

VS Code detects the `.devcontainer/` folder and shows a toast in the corner:
**"Reopen in Container"**. Click it. (If you miss the toast: Command Palette →
**Dev Containers: Reopen in Container**.)

### 4. Let the container build

On first open, VS Code hands the `.devcontainer/Dockerfile` to Docker and
builds an image — Node 20 plus dev tools (git, ripgrep, jq, GitHub CLI) with
Claude Code pre-installed. When the container starts, `npm install` runs
automatically inside it. The first build takes a few minutes; reopening the
project later reuses the image and takes seconds.

Two things carry over from your host automatically:

- **Claude Code auth** — your host `~/.claude` directory is mounted into the
  container, so the `claude` command is already logged in. No re-authentication.
- **Your files** — the project folder itself is mounted, not copied. Everything
  you or Claude edit in the container is on your host disk; deleting the
  container loses nothing.

You're now working _inside_ the container: the VS Code terminal, the extensions
(Claude Code, ESLint, Prettier), and every command Claude runs all execute in
the isolated environment, not on your host.

### 5. Fill in the project brief

Open `docs/project-brief.md` and describe what you're building, who it's for,
and what's in scope for v1. Claude reads this first in every session — five
minutes here pays for itself immediately.

### 6. Start Claude Code

In the VS Code terminal:

```bash
claude
```

On Docker Desktop (macOS/Windows) the session may start with a sandbox
preflight warning saying the inner bubblewrap sandbox is dormant. That's
expected and honest: on those platforms the devcontainer is the isolation
boundary, and the warning exists so an inactive layer never silently looks
active. See the layer table above — the other four layers are unaffected.

Because the devcontainer is usually the effective boundary, it's worth knowing
what it does and doesn't protect: it deliberately shares your host `~/.claude`
credentials and grants the container user passwordless sudo, so it is **not** a
boundary against a malicious dependency (an `npm install` postinstall runs with
both). That's an accepted convenience tradeoff — pin and vet what you install,
and lean on CI's dependency review. Full trust model:
[`docs/sandbox.md` § Trust model & residual risk](docs/sandbox.md#trust-model--residual-risk).

### 7. Confirm everything works

```bash
npm run verify              # the ground-truth gate: format + lint + tests
npm run dev                 # frameworks with a dev server (React/Next.js)
```

The dev server port is forwarded out of the container automatically — open
`http://localhost:5173` (React + Vite) or `http://localhost:3000` (Next.js) in
your host browser.

At any point, run `npx @sjhennig/claude-scaffold doctor` from the project root to check
guardrail health: Claude Code installed, settings valid, hook scripts
executable, the QC plugin's enablement and pinned release tag resolvable, and
whether the sandbox is actually active (it reports honestly when it's dormant,
e.g. on Docker Desktop). Exits non-zero on failures, so it's CI-friendly.

**Day-to-day:** closing VS Code stops the container; reopening the folder
offers to start it again. If you ever edit `.devcontainer/`, apply the change
with Command Palette → **Dev Containers: Rebuild Container**. To work without
Docker entirely, see [Prerequisites](#prerequisites).

From here, the intended methodology is the [development workflow](#the-development-workflow) below.

## The Development Workflow

The scaffolded project isn't just files — it's a methodology. Here's the intended flow:

1. **Fill in `docs/project-brief.md` first.** This anchors everything. Claude reads it to understand what it's building, who it's for, and what's in scope.
2. **Write a spec before implementing a feature.** Start a Claude Code session, describe the feature, and ask Claude to "ask me hard questions about this feature, then write the spec." Save it in `docs/specs/`.
3. **Implement each spec in a fresh Claude Code session.** Fresh sessions have clean context, which produces better results than continuing a long conversation where context has accumulated.
4. **Let TDD and hooks enforce quality.** The CLAUDE.md instructions tell Claude to write failing tests first, and the Stop hook runs the full `npm run verify` gate (format check, lint, typecheck, tests) automatically when Claude finishes — regressions are caught immediately.
5. **Review at checkpoints with `/qc`.** Before a commit or at the end of a feature, run `/qc` to have the plugin's read-only reviewers check the diff in fresh contexts — correctness, spec conformance, and security.

CLAUDE.md is intentionally kept under 100 lines. It's a quick-reference card, not a manual. If Claude keeps getting something wrong, add a one-line instruction there. If it needs detailed context, put it in `docs/` and add a pointer from CLAUDE.md. This progressive disclosure keeps Claude's context window focused on what matters for the current task.

## Prerequisites

- [Node.js](https://nodejs.org/) (v20+)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (for the devcontainer)
- [VS Code](https://code.visualstudio.com/) with the [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) authenticated on your host machine

Docker is required for the devcontainer but the scaffolded project works without it. The context docs, hooks, testing setup, and permissions are all independent of Docker — skip the "Reopen in Container" step, run `npm install` manually, and everything works. The devcontainer adds isolation and a pre-configured environment, but it's optional.

## Adding More Frameworks

The tool is structured so new frameworks can be added without changing the orchestrator. To add one:

1. Add a choice to `FRAMEWORKS` in `src/prompts.js`
2. Add commands to `commandsByFramework` in `src/templates/claude-md.js`
3. Add deps/scripts to `packagesByFramework` in `src/templates/project-files.js`
4. Add a case to `getFrameworkFiles()` and `getFrameworkDirs()` in `src/templates/project-files.js`
5. Add a directory tree to `directoryTree()` in `src/templates/docs.js`
6. Add an ESLint config variant to `generateEslintConfig()` in `src/templates/project-files.js` if the framework needs custom lint rules or plugin configuration

## Development

Working on the scaffold itself (users should `npx` instead — see Quick Start):

```bash
# Clone and link the command globally
git clone https://github.com/sjhennig/claude-scaffold.git
cd claude-scaffold
npm install
npm link        # or run directly: node bin/claude-scaffold.js

# Run tests
npm test

# Watch mode
npm run test:watch

# Full gate (format check + lint + tests)
npm run verify

# Prove the npm artifact works (pack → install → scaffold → verify)
npm run test:pack

# Format
npx prettier --write .
```

Releases: bump `package.json`, merge, then push a matching `cli-vX.Y.Z` tag —
the publish workflow verifies, pack-tests, and publishes to npm with
provenance. See `docs/specs/distribution.md`.

This tool follows its own TDD methodology — the same testing discipline it generates for scaffolded projects.

## License

MIT
