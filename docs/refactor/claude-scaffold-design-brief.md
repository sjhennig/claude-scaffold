# Design Brief: `claude-scaffold` v2 — A Guardrailed Project Bootstrapper for Claude Code

**Audience:** Claude Code, working against the existing `claude-scaffold` repository.
**Status:** Design input, not a final implementation plan.
**Companion:** `agentic-coding-guardrails-research.md` (the "why" behind every requirement here).

---

## 0. How to use this brief

Do **not** treat this as a finished implementation plan. The author has an existing `claude-scaffold` (Node CLI; templates for React/Vite/TS, Next.js/TS, Node/TS; VS Code devcontainers). Your first job is to **read that repository in plan mode**, then run an **interview → `SPEC.md`** workflow with the author, using this brief as the design constraints. The implementation plan must be written against the code that actually exists, and the rebuild-vs-refactor decision (§9) is yours to make after reading it.

The author is a capable builder but is not a Git/CLI power user and wants to build expertise. Favor configuration that is **legible** (commented, documented) over clever. Explain Git operations as you perform them.

---

## 1. Purpose

`claude-scaffold` v2 stands up a fresh project that is **safe to hand a high degree of autonomy to Claude Code on day one**. It must install, by default and without further configuration, the five-layer guardrail model, a set of quality-control subagents, and a starter context network — the three systems described in the research doc. The design principle that governs every choice: **maximum _safe_ autonomy comes from automated guardrails, not from relaxed permissions.** A relatively new builder should be protected by the scaffold's defaults, not exposed by them.

A second, non-negotiable principle: **lean by default.** Everything the scaffold injects competes for the model's attention budget at session start. Prefer progressive disclosure (skills, `@`-imported docs) over inlining; cap what loads up front (§6).

---

## 2. Goals and non-goals

**Goals**

- One command produces a project where sandbox, verification harness, deterministic gates, scoped permissions, and an independent reviewer are already wired up.
- The generated project is _immediately verifiable_: `install`, `test`, `lint`, and `typecheck` work, and the guardrails demonstrably fire.
- A starter context network exists and is structured for just-in-time retrieval and drift detection.
- The tool **verifies its own output** (§7) — this is the hardest and most important requirement.

**Non-goals (v1)**

- Languages/frameworks beyond the existing three templates.
- Enterprise/managed-settings deployment, agent-teams orchestration, or any GUI (note agent teams as a _future_ extension only).
- Opinionated application architecture beyond the guardrail/context scaffolding.

---

## 3. Architecture decision: split the CLI from a versioned plugin

**Problem to design around:** Claude Code's hooks, subagents, skills, and settings surfaces change frequently. If the scaffold copies today's config as static files into every generated project, each project freezes a snapshot that rots.

**Recommended shape — a hybrid:**

- **A versioned Claude Code _plugin_** carries the fast-moving, _portable_ Claude config: **subagents, skills, and slash commands.** Updating the plugin refreshes those everywhere without re-scaffolding. The CLI _installs/enables_ this plugin in the generated project.
- **The CLI itself emits the project-local config** that a plugin **cannot** carry — see the hard constraint below — namely **`.claude/settings.json` (hooks, permissions, sandbox config)** and the **devcontainer**.

> **Hard constraint (verify against current docs before building):** plugin-provided subagents do **not** support the `hooks`, `mcpServers`, or `permissionMode` frontmatter fields — they're ignored when loaded from a plugin. Therefore the **Stop hook, `PreToolUse` validators, auto-mode/permission configuration, and per-agent hooks must live in the project's `.claude/settings.json` (emitted by the CLI), not in the plugin.** Do not put the verification gate inside the plugin and assume it will run. Confirm this constraint still holds in the installed Claude Code version during the interview.

**Open decision (resolve with author):** distribution/versioning of the plugin (private vs public marketplace, pinning a compatible Claude Code version, an `upgrade`/`doctor` command). Recommend pinning a tested Claude Code version range and shipping a `claude-scaffold doctor` that checks the installed version and config health.

---

## 4. Guardrail layers the scaffold must install

Emit these into the generated project. Each is annotated with the file it lives in.

### 4.1 Sandbox + container (Layer 1) — defense in depth

- Keep/refresh the **devcontainer** (CLI-emitted) as the outer boundary.
- Emit `.claude/settings.json` sandbox configuration enabling Claude's `/sandbox`, **plus the security hardening the sandbox does not do for you:**
  - `denyRead` entries for secrets: `~/.ssh`, `~/.aws/credentials`, and the project's `.env*` files.
  - **Environment scrubbing** for sandboxed Bash (do not let it inherit credentials by default).
  - A **tight network allowlist** (only the registries/domains the template needs: npm registry, etc.).
  - **Do not** enable broad `allowUnixSockets` (never `docker.sock`) and **do not** grant writes to `$PATH` dirs or shell rc files.
- Document in a comment that the sandbox is a strong containment layer for prompt injection but not a complete security boundary, so the container matters too.

### 4.2 Permissions and mode (Layer 4 of safety; Layer 2 in research order)

- `.claude/settings.json` `permissions.allow`: the safe, frequently-used commands for the template — `npm run lint`, `npm test`, `npm run typecheck`, `git status`, `git diff`, `git add`, `git commit` (scope `git push` deliberately — see below).
- `permissions.deny`: destructive/credential-touching commands; writes to `.git/`, migrations, and secret paths.
- **Default working mode: auto mode.** Document how to launch with `--permission-mode auto`. **Never ship `bypassPermissions`** as a default anywhere.
- Treat `git push` and any publish/deploy command as **prompted, not allowlisted** (the author should approve outbound/irreversible actions).

### 4.3 Deterministic gates — hooks (Layer 3)

Emit into `.claude/settings.json` (and document each):

- **`PostToolUse`** matcher `Edit|Write` → run formatter + linter + type-check on changed files.
- **`Stop`** → run the test suite (or a fast subset) and **block turn-end until it passes.** This is the core verification gate. Note in a comment that Claude Code releases the gate after ~8 consecutive blocks so it cannot deadlock.
- **`PreToolUse`** matcher `Bash` → a validator script that blocks an explicit denylist of dangerous commands (e.g., `rm -rf` outside the project, force-push, writes to protected paths) and returns exit code 2 with a reason. Keep this list short and legible.
- **`SessionStart`** → the **drift-detection** hook (§5.3). Ship it **opt-in / degrade-gracefully**: on a fresh project with no subsystem map yet, it must no-op silently.

### 4.4 Verification harness (Layer 4)

- Pre-wire the template's test runner (e.g., **Vitest** for Vite/React/TS) with one passing **smoke test** so the Stop gate has something to run immediately.
- Emit npm scripts: `test`, `lint`, `typecheck`, and a `verify` script that runs all three.
- Put an **"evidence before claims"** rule in `CLAUDE.md`: Claude must show the command and its output before asserting success.

### 4.5 Independent review (Layer 5)

- Ship the QC subagents in §8. Document the `/code-review` built-in and the adversarial-review-against-`SPEC.md` prompt pattern in `CLAUDE.md`.

---

## 5. The starter context network (Part C)

### 5.1 A lean `CLAUDE.md`

- Generated by `/init`-style analysis of the template, then **pruned to high-signal lines only.** Target the "right altitude": project-specific commands, code-style deltas from defaults, test instructions, repo etiquette, known gotchas. **Hard cap the size** (see §6) and reject anything Claude could infer by reading code.
- Use `@`-imports to point at deeper docs (`@docs/architecture.md`, etc.) rather than inlining them.
- Include a **compaction directive**: "When compacting, always preserve the list of modified files, the test/verify commands, and any open decisions."

### 5.2 Structure for just-in-time retrieval

- Create a `docs/` (or `context-network/`) directory with a **template per-subsystem spec** (AI-authored, file-path-and-parameter explicit) and a short `README` explaining the convention: _living documents, updated by Claude at the author's direction, one per subsystem._
- Seed a `NOTES.md` (or decisions log) convention for long-horizon note-taking the agent maintains across sessions.
- Put _sometimes-relevant_ domain knowledge in `.claude/skills/` (via the plugin), **not** in `CLAUDE.md`.
- Use folder hierarchy and naming conventions deliberately — they are signal the agent reads.

### 5.3 Drift detection

- Ship a `SessionStart` hook that parses recent git commits against a maintained **subsystem→file map** and injects a warning when source changed without a corresponding spec update. Must **no-op gracefully** until the map exists (fresh projects have no subsystems).
- Wire the reviewer subagent / Stop gate to prompt updating the relevant spec as part of finishing a change, so docs stay living rather than rotting.

---

## 6. The leanness budget (a real constraint, not advice)

Because every injected token competes with the work:

- **Cap `CLAUDE.md`** at a defined budget (e.g., ≤ ~150 lines / a stated token target). The generator should warn if it exceeds it.
- Default skills/plugin content to **descriptions + on-demand loading**, never bulk-preloaded except where a subagent always needs it.
- Document the **"prune CLAUDE.md when Claude ignores a rule"** failure mode for the author.

---

## 7. Self-verification (the highest-risk requirement)

A scaffolder's output is _another project's file tree_, not a unit-testable function — which makes "the scaffold works" exactly the kind of unverified claim the whole guardrail philosophy exists to prevent. The tool **must** verify itself:

1. **Generation test:** scaffold each template into a temp directory; assert the expected files exist with expected content (a golden-output snapshot is acceptable, but snapshots must be reviewed when they change).
2. **Boot test:** inside each generated project, run `npm install && npm run verify` (install + test + lint + typecheck) and assert success. A generated project that doesn't boot is a failed build.
3. **Guardrail-fires test:** prove the guardrails actually work, not just that the files exist — e.g., introduce a failing test and assert the `Stop` gate blocks; introduce a lint error and assert `PostToolUse` surfaces it; confirm the reviewer subagent loads and is invokable.
4. Wire 1–3 into the scaffold repo's own CI.

This acceptance suite is part of the deliverable, not an afterthought.

---

## 8. Quality-control subagents to ship (in the plugin)

Each: one job, narrow tools, a precise `description` (include "use proactively"), a structured return shape, and stop rules. Reviewers are **read-only**.

- **`code-reviewer`** — `tools: Read, Grep, Glob, Bash`; `model: inherit` (or Haiku for routine, see cost note). Reviews the current diff for correctness, security (no exposed secrets/keys, input validation), and maintainability. **Returns gaps grouped Critical / Warning / Suggestion with file:line and a fix, and is scoped to flag only correctness/requirements issues — not style preferences** (prevents over-engineering). Give it `memory: project` so it accumulates codebase patterns across sessions.
- **`spec-reviewer`** — read-only; checks a diff against `SPEC.md`/`PLAN.md`: every requirement implemented, listed edge cases tested, nothing out of scope changed. Reports gaps only.
- **`test-runner`** — `tools: Bash, Read`; runs the suite and returns **only failing tests with their errors** (isolates verbose output from the main thread).
- **`security-reviewer`** (optional, recommended given the author's domain) — read-only; injection vulnerabilities, authn/z flaws, secrets in code, insecure data handling; specific line references and fixes.

**Cost guardrail (document in `CLAUDE.md`):** subagent-heavy workflows can cost ~7× the tokens of single-thread work. Invoke QC subagents **at checkpoints** (pre-commit, end of feature), not on every turn; route routine review to Haiku and milestone review to a stronger model.

---

## 9. Rebuild vs. refactor (your call, after reading the repo)

"Rebuild" was the author's word, but a full rewrite usually costs more than it looks and discards working knowledge baked into the current CLI. After reading the existing repo, recommend the smaller change that achieves §1–§8: likely a **targeted refactor** that introduces the plugin, the settings/hooks emission, and the self-verification suite, rather than a teardown. State your reasoning before proceeding.

---

## 10. Dogfooding

The `claude-scaffold` repo should run Claude Code **using the very guardrails it emits** (its own `.claude/settings.json`, hooks, and reviewer subagents). This is both a correctness check and a way to catch a bad template before it ships into every generated project.

---

## 11. End-to-end acceptance criteria

The build is done when:

1. `claude-scaffold <template>` produces a project that passes the §7 self-verification suite for **all three templates**.
2. In a generated project: a deliberately failing test **blocks** the `Stop` gate; a lint error is surfaced by `PostToolUse`; `git push` and deploy **prompt** rather than auto-run; secret paths are unreadable under sandbox.
3. The reviewer and spec-reviewer subagents load, are invokable by name, and return the structured shape in §8.
4. `CLAUDE.md` is within the leanness budget (§6) and the drift hook no-ops cleanly on a fresh project.
5. The scaffold repo's own CI runs the acceptance suite and the repo dogfoods its own config (§10).
6. A short `README` explains, for a non-expert, what each guardrail does and how to run the project in auto mode.

---

## 12. Source of requirements

Every requirement above traces to `agentic-coding-guardrails-research.md`, which cites the authoritative Claude Code documentation (best practices, subagents, sandboxing), Anthropic's engineering writing on sandboxing and context engineering, and the "codified context" drift-detection pattern. Re-verify version-specific behavior (especially the §3 plugin-frontmatter constraint and current hook/permission field names) against the installed Claude Code version during the interview before implementing.
