# Build Spec: `claude-scaffold` CLI Tool

## What to Build

A Node.js command-line tool called `claude-scaffold` that generates a fully configured project directory, ready for AI-first development with Claude Code inside a VS Code devcontainer.

The user runs `claude-scaffold` from their Mac terminal, answers a few questions, and gets a complete project folder they can open in VS Code and immediately start working in.

## Why This Tool Exists

Starting a new Claude Code project currently requires manually creating and configuring about a dozen files across five concerns: a Docker devcontainer, a context document network, Claude Code hooks, a testing setup, and standard project files. This tool automates all of that into a single interactive command.

## Tech Stack

- **Runtime:** Node.js (ES modules — use `"type": "module"` in package.json)
- **Interactive prompts:** `inquirer` (version ^9.x)
- **File I/O:** Node built-ins only (`fs/promises`, `path`, `child_process`)
- **No build step** — this is a plain JS tool, not TypeScript

## How It Works

### Step 1: Ask Questions

When the user runs `claude-scaffold`, it should prompt for:

1. **Project name** (kebab-case, e.g. `my-cool-app`) — required, validated
2. **One-line description** — defaults to "A new Claude Code project"
3. **Framework** — list selection. Start with just "React + Vite + TypeScript" (value: `react-vite-ts`). Structure the code so adding more frameworks later (Next.js, plain Node TS) is straightforward — use a switch/case or map pattern, not if/else chains
4. **Dev server port** — number, defaults to 5173 (Vite's default)
5. **Uses Anthropic API directly?** — yes/no, defaults to no
6. **Additional API key names** — comma-separated, optional (e.g. "GEMINI_API_KEY, ELEVENLABS_API_KEY")
7. **Initialize git?** — yes/no, defaults to yes

### Step 2: Generate Files

Create the project directory at `./{project-name}` relative to where the user ran the command. Generate every file listed in the "Files to Generate" section below.

### Step 3: Initialize Git

If the user chose yes, run `git init` in the project directory. Wrap in try/catch — if git isn't available, warn but don't fail.

### Step 4: Print Summary

Show what was created and the next steps the user should follow (open in VS Code, reopen in container, fill in project-brief.md, etc.).

---

## Files to Generate

### `.devcontainer/Dockerfile`

```dockerfile
FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y \
    git \
    curl \
    ripgrep \
    fd-find \
    jq \
    tree \
    bat \
    zsh \
    python3 \
    sudo \
    && rm -rf /var/lib/apt/lists/*

RUN echo "node ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

RUN npm install -g @anthropic-ai/claude-code

RUN mkdir -p /home/node/.bash_history_dir && chown node:node /home/node/.bash_history_dir

USER node
WORKDIR /workspace
```

### `.devcontainer/devcontainer.json`

JSON file with these fields (substitute `{projectName}` and `{devPort}` from user answers):

- `name`: `{projectName}`
- `build.dockerfile`: `"Dockerfile"`
- `forwardPorts`: `[{devPort}]`
- `customizations.vscode.extensions`: `["anthropic.claude-code", "dbaeumer.vscode-eslint", "esbenp.prettier-vscode", "eamodio.gitlens"]`
- `customizations.vscode.settings`: format-on-save enabled, Prettier as default formatter, tab size 2
- `mounts`: two entries:
  - Bind mount for Claude auth: `"source=${localEnv:HOME}/.claude,target=/home/node/.claude,type=bind"`
  - Named volume for bash history: `"source=claude-scaffold-bashhistory,target=/home/node/.bash_history_dir,type=volume"`
- `features`: `{ "ghcr.io/devcontainers/features/github-cli:1": {} }`
- `postCreateCommand`: `"npm install"`
- `remoteUser`: `"node"`

### `CLAUDE.md`

This is the most important file. It's what Claude Code reads on every single session. It must be **short** — under 100 lines, ideally under 60. Longer context wastes Claude's attention. Details belong in `docs/`, not here.

Contents:

1. Project name as H1 heading
2. One-line description
3. **Commands** section — the exact bash commands for build, test, lint, typecheck, format (use the right commands for the chosen framework)
4. **Project Structure** — a brief 4-line tree showing `src/`, `docs/`, `docs/specs/`, `.claude/`
5. **Context Docs** section — starts with: "IMPORTANT: Before starting any task, identify which docs below are relevant and read them first." Then lists `docs/project-brief.md`, `docs/architecture.md`, and `docs/specs/` with one-line descriptions
6. **Git Workflow** — feature branches, conventional commits (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`), small focused commits
7. **Testing (TDD)** — the full 7-step TDD cycle:
   1. Write failing tests FIRST. Do not write implementation yet.
   2. Run tests. Confirm they fail.
   3. Commit the failing tests.
   4. Write minimum implementation to make tests pass. Do NOT modify the tests.
   5. Run tests. If any fail, fix the implementation, not the tests.
   6. Refactor if needed. Run tests after each change.
   7. Commit passing implementation.

   Plus: "Tests live next to the code they test: `foo.ts` → `foo.test.ts`"

### `.claude/settings.json`

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "jq -r '.tool_input.file_path // empty' | xargs npx prettier --write 2>/dev/null; exit 0"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "npm run typecheck 2>&1 | tail -20; npm test 2>&1 | tail -30; exit 0"
          }
        ]
      }
    ]
  }
}
```

### `.claude/commands/README.md`

Brief explanation of what slash commands are, how to create them (add `.md` files to this directory), and a link to the docs.

### `docs/project-brief.md`

A template with placeholder sections the user fills in:

- **What is this project?** — with HTML comment prompting a 2-3 sentence description
- **Who is it for?**
- **What's the scope of v1?** — checklist with placeholder items, note to keep it to 3-5 features max
- **What's explicitly out of scope for v1?** — to prevent scope creep
- **Key technical decisions** — pre-filled with the chosen framework and test setup, with a TBD for styling
- **Open questions**

### `docs/architecture.md`

A template with:

- **Overview** — placeholder for high-level structure description
- **Directory Structure** — pre-filled tree of `src/` subdirectories
- **Data Model** — placeholder for TypeScript interfaces
- **Key Patterns** — placeholder for coding conventions
- **External Services** — if `useAnthropicApi` is true, include a pointer to `docs/api-integration.md`

### `docs/api-integration.md` (only if `useAnthropicApi` is true)

Template with sections for authentication (.env key), usage patterns (prompt templates), and error handling.

### `docs/specs/README.md`

Explains the spec-driven workflow: describe the feature to Claude, ask it to "ask me hard questions, then write the spec", save it here, start a fresh session to implement.

### `package.json`

- `name`: `{projectName}`
- `private`: true
- `version`: "0.0.1"
- `type`: "module"
- `scripts`: dev, build, preview, test, test:watch, lint, lint:fix, typecheck, format (with correct commands for the chosen framework — for React+Vite+TS, `dev` is `vite`, `build` is `tsc -b && vite build`, etc.)
- `dependencies`: react, react-dom (^19)
- `devDependencies`:
  - Build: `@vitejs/plugin-react`, `vite`, `typescript`
  - Types: `@types/react`, `@types/react-dom`
  - Testing: `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `jsdom`
  - Linting/formatting: `eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, `@eslint/js`, `typescript-eslint`, `prettier`, `globals`

### `vite.config.ts`

Standard Vite config with the React plugin and `server.port` set to `{devPort}` and `server.host: true` (needed for devcontainer port forwarding).

### `vitest.config.ts`

Vitest config using the React plugin, `jsdom` environment, setup file pointing to `./src/setup-tests.ts`, and `verbose` reporter.

### `tsconfig.json`

Strict TypeScript config: target ES2020, JSX react-jsx, bundler module resolution, `noEmit: true`, strict mode, `noUnusedLocals`, `noUnusedParameters`, `noUncheckedIndexedAccess`. Include only `src/`.

### `src/setup-tests.ts`

One line: `import '@testing-library/jest-dom/vitest';` (the `/vitest` entry binds
the matchers to vitest's `expect`; the bare import expects a global `expect`,
which these templates don't enable, and throws at test startup).

### `src/App.tsx`

Minimal starter component that renders the project name and description.

### `src/main.tsx`

Standard React entry point: `createRoot` + `StrictMode` + `<App />`.

### `src/vite-env.d.ts`

One line: `/// <reference types="vite/client" />`

### `index.html`

Standard Vite HTML shell with `<div id="root">` and `<script type="module" src="/src/main.tsx">`.

### `.gitignore`

node*modules, dist, .env, .env.local, .env.*.local, .DS*Store, Thumbs.db, .vscode/*, !.vscode/extensions.json, _.swp, _.swo, .claude.json, coverage/

### `.env` and `.env.example`

Both identical. Include `ANTHROPIC_API_KEY=` if `useAnthropicApi` is true. Include any additional keys from the user's answer. Comment at the top: "This file is in .gitignore — never commit API keys."

### `README.md`

- Project name and description
- Prerequisites (Docker Desktop, VS Code with Dev Containers extension, Claude Code authenticated on host)
- Setup steps: clone, copy .env.example to .env, open in VS Code, reopen in container, start dev server
- Section explaining the Claude Code workflow (CLAUDE.md, docs/, specs, hooks)
- Project structure tree

### Empty directories to create

- `src/components/`
- `src/hooks/`
- `src/utils/`
- `src/types/`
- `src/assets/`

---

## Project Structure of the Tool Itself

```
claude-scaffold/
├── bin/
│   └── claude-scaffold.js     ← CLI entry point (#!/usr/bin/env node)
├── src/
│   ├── index.js               ← Main orchestrator (gathers input, calls generators, writes files)
│   ├── prompts.js             ← Interactive question definitions (inquirer)
│   └── templates/
│       ├── devcontainer.js    ← Generates Dockerfile + devcontainer.json
│       ├── claude-md.js       ← Generates CLAUDE.md
│       ├── hooks.js           ← Generates .claude/settings.json
│       ├── docs.js            ← Generates docs/ templates
│       └── project-files.js   ← Generates package.json, .gitignore, .env, README, vite/ts/vitest configs, starter React files
└── package.json               ← Tool's own package.json (bin entry, inquirer dependency)
```

Each template file exports functions that take the user's config object and return file content as a string. The orchestrator (`index.js`) calls each generator and writes the results to disk.

## package.json for the Tool Itself

- `name`: "claude-scaffold"
- `type`: "module"
- `bin`: `{ "claude-scaffold": "./bin/claude-scaffold.js" }`
- `dependencies`: `{ "inquirer": "^9.2.12" }`

The `bin` entry is what makes `npm link` work — it tells Node.js that `claude-scaffold` should run `bin/claude-scaffold.js`.

---

## Testing the Tool

After building, test it by running:

```bash
node bin/claude-scaffold.js
```

Answer the prompts with a test project name. Then verify:

1. The directory was created with all expected files
2. All JSON files are valid (parse them with `JSON.parse`)
3. The `CLAUDE.md` is under 100 lines
4. The devcontainer.json has the correct project name and port
5. The hooks in `.claude/settings.json` have the correct structure

---

## Important Design Notes

- **Keep CLAUDE.md minimal.** This is the biggest leverage point. It should be a quick-reference card, not a manual. If something only matters sometimes, it goes in `docs/`.
- **Template functions should be pure.** Each generator takes a config object in, returns a string out. No side effects, no file I/O inside templates.
- **The framework choice should be extensible.** When a new framework is added later, it should only require: adding a choice to the prompts, adding a case to the command generator, and adding framework-specific template variations. The orchestrator shouldn't need to change.
- **All generated JSON must be valid.** Use `JSON.stringify` with indentation, don't hand-write JSON strings.
- **Comments in generated files should explain "why."** The devcontainer Dockerfile, hooks config, and vitest config should include comments explaining what each piece does and why it's there. A developer new to this workflow should be able to read the generated files and understand the setup.
