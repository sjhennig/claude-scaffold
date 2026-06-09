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
    guardrails.js   Framework-agnostic core: settings.json (incl. plugin enablement) + hook scripts
    hooks.js        .claude/commands README (re-exports guardrails settings)
    project-files.js Framework configs/source (incl. 'none' = guardrails only)
plugin/             The claude-guardrails plugin (QC subagents + /qc) — source of truth, not generated
  .claude-plugin/   plugin.json manifest
  agents/           code/spec/security-reviewer, test-runner
  commands/         qc.md
.claude-plugin/     Repo-root marketplace.json listing the plugin (source: ./plugin)
plugin.test.js      Validates the committed plugin files + manifests + enablement
.claude/            Claude Code settings + hooks the CLI emits (QC agents are plugin-borne)
.devcontainer/      Dev container for sandboxed development
docs/               Architecture and planning documents
```

## Conventions

- ES Modules (`"type": "module"`), plain JavaScript (no TypeScript)
- Pure functions for templates: config object in, string out
- Side effects only in `src/index.js` (file writes, git init)
- Conventional commits: `feat|fix|docs|refactor|test|chore(scope): message`
- Tests colocated: `foo.js` → `foo.test.js` (exception: `plugin.test.js` sits at the repo root — the plugin is markdown with no generator to sit beside)

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
- `docs/specs/` — subsystem specs (living docs; update the relevant one when you change what it describes). `subsystem-map.json` drives the drift hook.
- `NOTES.md` — decisions log; read before long-horizon work, append a dated entry when a non-obvious decision is made
