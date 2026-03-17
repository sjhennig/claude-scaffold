[![CI](https://github.com/sjhennig/claude-scaffold/actions/workflows/ci.yml/badge.svg)](https://github.com/sjhennig/claude-scaffold/actions/workflows/ci.yml)

# claude-scaffold

Generate a fully configured project directory for AI-first development with Claude Code inside a VS Code devcontainer.

One command. Seven questions. A complete project ready to open in VS Code and start building.

## Why

Starting a new Claude Code project means manually wiring up a Docker devcontainer, context documents, Claude Code hooks, a testing setup, and standard config files. That's roughly a dozen files across five concerns. This tool does all of it in seconds.

## Quick Start

```bash
# Clone and install
git clone https://github.com/sjhennig/claude-scaffold.git
cd claude-scaffold
npm install
npm link

# Scaffold a new project
claude-scaffold
```

You'll be prompted for:

| Prompt                       | Default                                  |
| ---------------------------- | ---------------------------------------- |
| Project name (kebab-case)    | _(required)_                             |
| One-line description         | "A new Claude Code project"              |
| Framework                    | React + Vite + TypeScript (see below)    |
| Dev server port              | 5173 (React+Vite) / 3000 (Next.js, Node) |
| Uses Anthropic API directly? | No                                       |
| Additional API key names     | _(none)_                                 |
| Initialize git?              | Yes                                      |

The scaffolded project is created at `./{project-name}` relative to your current directory.

> **Note:** `npm link` creates a symlink so you can run `claude-scaffold` from anywhere. If it fails with a permissions error, try `sudo npm link`. Alternatively, skip linking and run the tool directly with `node bin/claude-scaffold.js`.

## Frameworks

Three framework templates are available:

| Framework                     | Best for                                                             |
| ----------------------------- | -------------------------------------------------------------------- |
| **React + Vite + TypeScript** | Client-side apps, dashboards, browser-based tools                    |
| **Next.js + TypeScript**      | Full-stack web apps, anything needing SSR or API routes              |
| **Node + TypeScript**         | CLI tools, APIs, backend services, automation, anything without a UI |

Each framework generates the appropriate package.json, tsconfig, starter files, and directory structure. The devcontainer, Claude Code config, context docs, and permissions are shared across all frameworks.

## What You Get

The exact files vary by framework. Here's the React + Vite + TypeScript structure:

```
my-project/
├── .claude/              ← Settings, permissions, and hooks
│   ├── settings.json
│   └── commands/         ← Custom slash commands
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

## Default Permissions

Every scaffolded project ships with sensible Claude Code permissions in `.claude/settings.json`. The goal is to reduce approval prompts for safe, everyday operations while keeping destructive or external-facing actions gated.

**Auto-approved (no prompts):**

- File operations — Read, Edit, Write, Glob, Grep
- Local git — status, diff, log, add, commit, branch, checkout, stash
- Project scripts — `npm run`, `npm test`, `npx`, `node`
- Read-only shell — cat, head, tail, wc, tree, ls, find, grep, sort
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

The generated `.claude/settings.json` also includes two hooks:

- **PostToolUse** — Runs Prettier on any file Claude edits or writes, keeping style consistent without manual formatting.
- **Stop** — Runs `npm run typecheck` and `npm test` whenever Claude finishes a task, catching regressions immediately.

## After Scaffolding

1. `cd my-project`
2. Open in VS Code: `code .`
3. Click **"Reopen in Container"** when prompted
4. Fill in `docs/project-brief.md` with your project details
5. Start building with Claude Code

## The Development Workflow

The scaffolded project isn't just files — it's a methodology. Here's the intended flow:

1. **Fill in `docs/project-brief.md` first.** This anchors everything. Claude reads it to understand what it's building, who it's for, and what's in scope.
2. **Write a spec before implementing a feature.** Start a Claude Code session, describe the feature, and ask Claude to "ask me hard questions about this feature, then write the spec." Save it in `docs/specs/`.
3. **Implement each spec in a fresh Claude Code session.** Fresh sessions have clean context, which produces better results than continuing a long conversation where context has accumulated.
4. **Let TDD and hooks enforce quality.** The CLAUDE.md instructions tell Claude to write failing tests first, and the Stop hook runs typecheck + tests automatically when Claude finishes — regressions are caught immediately.

CLAUDE.md is intentionally kept under 100 lines. It's a quick-reference card, not a manual. If Claude keeps getting something wrong, add a one-line instruction there. If it needs detailed context, put it in `docs/` and add a pointer from CLAUDE.md. This progressive disclosure keeps Claude's context window focused on what matters for the current task.

## Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
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

```bash
# Run the tool locally
node bin/claude-scaffold.js

# Run tests
npm test

# Watch mode
npm run test:watch

# Format
npx prettier --write .
```

This tool follows its own TDD methodology — the same testing discipline it generates for scaffolded projects.

## License

MIT
