# QC Subagents Spec

<!--
Living doc — update this whenever src/templates/agents.js changes the emitted
subagents or the /qc command. Registered in docs/specs/subsystem-map.json so the
drift hook watches it.
-->

## Purpose

Layer 5 of the guardrail model (independent review): the pure generators for the
quality-control subagents and the `/qc` checkpoint command every scaffolded
project receives. Like `guardrails.js`, this is the single source of truth the
repo dogfoods — `agents.test.js` asserts the committed `.claude/agents/` and
`.claude/commands/qc.md` match this output.

## Owning files

- `src/templates/agents.js` — all subagent + `/qc` generators (pure: no I/O).

## Public interface

```
generateCodeReviewerAgent()     -> string   // .claude/agents/code-reviewer.md
generateSpecReviewerAgent()     -> string   // .claude/agents/spec-reviewer.md
generateTestRunnerAgent()       -> string   // .claude/agents/test-runner.md
generateSecurityReviewerAgent() -> string   // .claude/agents/security-reviewer.md
generateQcCommand()             -> string   // .claude/commands/qc.md (/qc)

getAgentFiles() -> Array<[relativePath, content]>
  // The five tuples above, in the commonFiles shape index.js consumes.
```

## Invariants & constraints

- **Reviewers are READ-ONLY.** No `Write`/`Edit`/`MultiEdit` in any reviewer's
  `tools` frontmatter. Tool allowlists stay narrow (`Read, Grep, Glob, Bash`).
- **One job each**, a precise `description` containing "use proactively", and a
  **structured return shape** so the main thread can act on the summary alone.
- `model: inherit` on every agent; the cost note in `/qc` (and CLAUDE.md) steers
  heavy use to checkpoints, not every turn.
- **No `hooks`/`mcpServers`/`permissionMode` frontmatter** — ignored for
  plugin-loaded agents; that behavior lives in `.claude/settings.json`.
- Single source of truth: changing a generator requires regenerating the repo's
  committed `.claude/` or the `agents.test.js` dogfood block fails.

## Edge cases

- **No governing spec:** the spec-reviewer must say so and stop — it must not
  invent requirements.
- **Living-docs drift:** the spec-reviewer also checks `docs/specs/subsystem-map.json`
  — if a changed file is owned by a mapped subsystem whose spec did not change,
  it reports the stale spec as a gap (complements the SessionStart drift hook by
  catching drift at review time, before the change lands).
- **No changes in the diff:** `/qc` reports that and stops.

## Open decisions

- Whether to ship these as a versioned plugin (project-brief V2 goal 2) rather
  than committed `.claude/agents/` files.
