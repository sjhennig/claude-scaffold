# Project Brief — claude-scaffold

## What It Does

A single CLI command that stands up a fresh project pre-configured for safe, high-autonomy Claude Code development. The generated project includes a devcontainer, five-layer guardrail system (sandbox, verification harness, deterministic hooks, scoped permissions, independent review), quality-control subagents, and a starter context network.

## Who It's For

Builders who use Claude Code as their primary development interface and want maximum autonomy without sacrificing safety. The defaults protect relatively new builders; experienced users can progressively relax constraints.

## Current State (v1)

- Scaffolds three framework templates: React+Vite+TS, Next.js+TS, Node+TS
- Generates devcontainer, basic Claude Code hooks, permissions, and context docs
- Interactive CLI via inquirer
- Tested with Vitest

## V2 Goals

1. **Five-layer guardrail system** installed by default in every generated project
2. **Versioned plugin** carrying subagents, skills, and slash commands (updateable independently of the scaffold)
3. **Self-verification suite** — the scaffold proves its own output works (generation, boot, and guardrail-fires tests)
4. **Framework-agnostic core** — guardrail layer is independent of framework templates
5. **Dogfooding** — this repo runs the same guardrails it emits

## Milestones

- **M0**: Dogfood guardrails on this repo (devcontainer, hooks, permissions, sandbox, lint, CLAUDE.md)
- **M1**: Core scaffold (framework-agnostic guardrail emission)
- **M2**: Plugin with subagents (code-reviewer, spec-reviewer, test-runner, security-reviewer)
- **M3**: Context network (docs templates, drift detection, NOTES.md convention)
- **M4**: Self-verification suite in CI
- **M5**: Framework templates (Node+TS first, then React+Vite, Next.js)

## Out of Scope

- Languages beyond JavaScript/TypeScript
- Enterprise/managed-settings deployment
- Agent-teams orchestration
- GUI or web interface
