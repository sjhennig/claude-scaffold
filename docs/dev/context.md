# Context: AI-First Project Workflow Scaffold

## What This Document Is

This document captures a complete workflow methodology for building projects with Claude Code. It was developed through hands-on experience setting up a browser-based game project and represents the converged best practices from Anthropic's official documentation, community power users, and practical trial and error.

The goal: build a tool or automation that scaffolds this entire workflow for any new project — so that starting a new Claude Code project means running one command (or one prompt) and getting a fully configured devcontainer, context network, testing setup, and hooks, ready to start spec-driven development immediately.

---

## The Workflow Has Five Layers

### Layer 1: Devcontainer (Isolated Development Environment)

A Docker-based development container that runs inside VS Code. It provides an isolated sandbox where Claude Code can work autonomously without risk to the host machine.

**Why it matters:**

- Enables `--dangerously-skip-permissions` safely — Claude can read, write, and execute without approval prompts because the container is the sandbox
- Reproducible environment — all tools and dependencies defined in code
- If something breaks, rebuild in minutes

**What gets created:**

```
.devcontainer/
├── Dockerfile           — Node.js 20, system tools, Claude Code installed globally
├── devcontainer.json    — VS Code config, extensions, port forwarding, persistent volumes
└── init-firewall.sh     — (Optional) Network allowlist for extra security
```

**Key Dockerfile components:**

- Base image: `node:20-bookworm-slim`
- System tools: git, curl, ripgrep, fd-find, jq, tree, bat, zsh, python3
- Claude Code: `npm install -g @anthropic-ai/claude-code`
- Non-root user (`node`) with sudo access
- Persistent command history directory

**Key devcontainer.json components:**

- VS Code extensions auto-installed: Claude Code, ESLint, Prettier, GitLens
- Persistent volumes for bash history and Claude config (survive container rebuilds)
- Port forwarding for the dev server (e.g., 5173 for Vite)
- GitHub CLI installed via devcontainer features
- Format-on-save enabled with Prettier as default formatter

**Authentication approach:**

- Authenticate Claude Code on the host machine first (`npm install -g @anthropic-ai/claude-code && claude`)
- Bind-mount the host's `~/.claude` directory into the container: `"source=${localEnv:HOME}/.claude,target=/home/node/.claude,type=bind"`
- This avoids the known issue where Claude's OAuth login hangs in containers because the callback port isn't forwarded

### Layer 2: Context Network (Progressive Disclosure)

A hierarchy of documents that give Claude Code the knowledge it needs, loaded progressively rather than all at once. The core principle: Claude's context window is finite and quality degrades when it's cluttered. Only load what's relevant to the current task.

**The hierarchy:**

```
CLAUDE.md                        ← Always loaded (every session). Keep under 100 lines.
├── Points to docs/              ← On-demand. Claude reads these when relevant.
│   ├── project-brief.md         ← What the project is, concept, scope
│   ├── game-design.md           ← (or equivalent domain doc) Core mechanics/logic
│   ├── tone-guide.md            ← (if applicable) Writing voice, content guidelines
│   ├── art-direction.md         ← (if applicable) Visual style, asset pipeline
│   ├── api-integration.md       ← External API patterns, prompt templates
│   ├── architecture.md          ← Technical decisions, data model, component structure
│   └── specs/                   ← Per-feature specifications
│       ├── feature-a.md
│       └── feature-b.md
├── .claude/commands/             ← Slash commands (explicit invoke)
│   ├── new-scene.md
│   └── playtest.md
└── .claude/agents/               ← Subagents (isolated context, advanced)
    ├── narrative-writer.md
    └── ui-developer.md
```

**CLAUDE.md rules (the most expensive real estate):**

- Under 100 lines (ideally under 60)
- Only universally applicable instructions
- Essential bash commands (build, test, lint, dev server)
- One-line project structure overview
- Pointers to docs/ with the instruction: "IMPORTANT: Before starting any task, identify which docs below are relevant and read them first."
- Git workflow conventions
- Testing workflow (TDD rules)
- Never include: code style rules (let linters handle it), full architecture docs, historical context, anything that only matters sometimes

**Context docs (docs/) rules:**

- Each doc is self-contained and focused on one topic
- Claude reads these on demand when CLAUDE.md points to them
- They can be as long as needed — they only consume tokens when loaded
- Write them in a way that gives Claude actionable instructions, not just information

**Spec-driven development pattern:**

- Each major feature gets a spec written in `docs/specs/` before implementation begins
- The spec is written in one Claude Code session (use the interview pattern — "ask me hard questions about this feature, then write the spec")
- Implementation happens in a fresh session that reads the spec
- Fresh sessions have clean context, which produces better results than continuing a long conversation

### Layer 3: Testing Hygiene (TDD + Automated Hooks)

Test-driven development enforced through both CLAUDE.md instructions and deterministic hooks.

**The TDD cycle (in CLAUDE.md):**

```
1. Write failing tests FIRST. Do not write implementation yet.
2. Run tests. Confirm they fail.
3. Commit the failing tests.
4. Write minimum implementation to make tests pass. Do NOT modify the tests.
5. Run tests. If any fail, fix the implementation, not the tests.
6. Refactor if needed. Run tests after each change.
7. Commit passing implementation.
```

**Why commit the tests at step 3:** Claude will sometimes modify tests to make them pass rather than fixing the implementation. Committing first creates a safety net — the git diff shows if tests were altered.

**Why "do NOT modify the tests" is explicit:** Claude's default behavior is to write implementation first and tests second. TDD requires the inverse, and Claude must be explicitly told this every time.

**Recommended test framework (for React/TypeScript projects):**

- Vitest (fast, Vite-native)
- @testing-library/react (component testing)
- @testing-library/jest-dom (DOM assertions)
- jsdom environment

**Test file convention:** Tests live next to the code they test. `foo.ts` → `foo.test.ts`

### Layer 4: Hooks (Deterministic Automation)

Shell commands that fire automatically at specific points in Claude Code's lifecycle. Unlike CLAUDE.md instructions (which are advisory), hooks are deterministic — they run every time, no exceptions.

**Configuration location:** `.claude/settings.json`

**Recommended hooks:**

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

**What each hook does:**

- **PostToolUse (Edit|Write) → Prettier**: Auto-formats every file Claude edits. Runs after each edit, needs to be fast. The `exit 0` ensures it never blocks even if Prettier encounters an error.
- **Stop → typecheck + test**: Runs the TypeScript type checker and full test suite when Claude finishes a task. Claude sees the output and can self-correct. The `exit 0` means failures are informational, not blocking.

**Key principle:** Hooks that run on PostToolUse must be fast (milliseconds). Hooks that run on Stop can be slower (seconds) since they only fire once per task. Never put a full test suite on PostToolUse — it would run after every single file edit and destroy the workflow.

**Important gotcha:** Stop hooks have a `stop_hook_active` field in their JSON input. When it's true, the hook should exit 0 immediately to avoid creating an infinite loop where the stop hook's output triggers another stop.

### Layer 5: Project Foundation Files

Standard files that every project needs:

**`.gitignore`** — node_modules, dist, .env, .DS_Store, .claude.json

**`.env`** — API keys (never committed). Template:

```
ANTHROPIC_API_KEY=
# Add other service keys as needed
```

**`README.md`** — Project overview with devcontainer setup instructions

**`package.json`** — Scripts should include at minimum:

```json
{
  "scripts": {
    "dev": "[dev server command]",
    "build": "[build command]",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint src/",
    "lint:fix": "eslint src/ --fix",
    "typecheck": "npx tsc --noEmit",
    "format": "prettier --write src/"
  }
}
```

---

## The Scaffold Tool Should Produce

Given a project name and type (e.g., "React + Vite + TypeScript"), the tool should generate:

1. **Project directory** with git initialized
2. **`.devcontainer/`** with Dockerfile, devcontainer.json (customized with project name, appropriate port forwarding)
3. **`CLAUDE.md`** with project name, standard commands, doc pointers, TDD rules, git workflow
4. **`docs/`** directory with a starter `project-brief.md` template
5. **`docs/specs/`** directory for feature specs
6. **`.claude/settings.json`** with the PostToolUse formatter hook and Stop test/typecheck hook
7. **`.claude/commands/`** directory for future slash commands
8. **`.gitignore`** with standard ignores
9. **`.env`** template with `ANTHROPIC_API_KEY=`
10. **`README.md`** with project name and devcontainer setup instructions
11. **`package.json`** with test, lint, format, typecheck scripts
12. **Test framework** installed and configured (vitest, testing-library, jsdom)
13. **Formatter/linter** installed and configured (prettier, eslint)

**Optional based on project type:**

- React component structure (`src/components/`, `src/hooks/`)
- API integration structure (`src/api/`)
- Asset directories (`src/assets/`)

---

## Design Considerations for the Tool

**It should be interactive.** The tool should ask questions: What's the project name? What framework (React, Next.js, plain TypeScript, etc.)? What port does the dev server use? Do you need API integration? What external services (Anthropic API, Gemini, ElevenLabs, etc.)?

**CLAUDE.md should be minimal and templated.** The tool generates a starter CLAUDE.md with the right commands for the chosen framework, but it should be short. The user grows it based on what Claude gets wrong.

**The devcontainer should just work.** The authentication bind-mount, persistent volumes, port forwarding, and extensions should all be pre-configured. The user opens VS Code, reopens in container, and starts working.

**Hooks should be conservative.** Start with formatting + stop-time testing. Users can add more hooks later. Don't over-engineer the initial setup.

**The project-brief.md template should prompt the user.** Include sections with placeholder questions: "What is this project?", "Who is it for?", "What's the scope of v1?", "What are the key technical decisions?" This becomes the first document the user fills in, and it anchors the rest of the context network.

---

## Key Sources and References

- Anthropic official devcontainer reference: `github.com/anthropics/claude-code/tree/main/.devcontainer`
- Progressive disclosure deep dive: `alexop.dev/posts/stop-bloating-your-claude-md-progressive-disclosure-ai-coding-tools/`
- HumanLayer on writing good CLAUDE.md: `humanlayer.dev/blog/writing-a-good-claude-md`
- TDD with Claude Code (community best practices): `aihero.dev/skill-test-driven-development-claude-code`
- Claude Code hooks documentation: `code.claude.com/docs/en/hooks-guide`
- Spec-driven development: `alexop.dev/posts/spec-driven-development-claude-code-in-action/`
- DataCamp Claude Code best practices: `datacamp.com/tutorial/claude-code-best-practices`
