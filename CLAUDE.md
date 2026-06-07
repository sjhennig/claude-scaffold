# CLAUDE.md — claude-scaffold

CLI tool that generates guardrailed, AI-first project scaffolding for Claude Code.

## Commands

| Command                | Purpose                               |
| ---------------------- | ------------------------------------- |
| `npm test`             | Run tests (vitest)                    |
| `npm run lint`         | ESLint                                |
| `npm run format`       | Prettier (write)                      |
| `npm run format:check` | Prettier (check only)                 |
| `npm run verify`       | Full gate: format:check + lint + test |

## Project Structure

```
bin/                CLI entry point (claude-scaffold command)
src/
  index.js          Orchestrator: gathers input, dispatches templates, writes files
  prompts.js        Interactive prompts (inquirer)
  templates/        Template generators (pure functions → strings)
    claude-md.js    CLAUDE.md generation
    devcontainer.js Dockerfile + devcontainer.json
    docs.js         Project documentation templates
    hooks.js        .claude/settings.json with permissions + hooks
    project-files.js Framework-specific configs and source
.claude/            Claude Code settings, hooks, and agents
.devcontainer/      Dev container for sandboxed development
docs/               Architecture and planning documents
```

## Conventions

- ES Modules (`"type": "module"`), plain JavaScript (no TypeScript)
- Pure functions for templates: config object in, string out
- Side effects only in `src/index.js` (file writes, git init)
- Conventional commits: `feat|fix|docs|refactor|test|chore(scope): message`
- Tests colocated: `foo.js` → `foo.test.js`

## Rules

- **Evidence before claims**: run `npm run verify` and show output before asserting correctness
- Do not add TypeScript, additional frameworks, or application architecture beyond guardrails
- Keep this file under 100 lines — details belong in @docs/architecture.md

## On Compaction

When compacting, always preserve:

- The list of modified files in this session
- Test/verify commands and their last output
- Any open decisions or unresolved issues

## Further Reading

- @docs/architecture.md — system design and data flow
- @docs/project-brief.md — goals, audience, and v2 roadmap
