# Safe, Scalable, High-Autonomy Claude Code — A Deep-Dive Research Brief

_Research backing the redesign of `claude-scaffold`. Three parts: (A) scalable guardrails for highly autonomous agentic coding, (B) subagents for quality control, (C) building a context network. A synthesis and source list follow._

---

## How to read this

This is the "why" document. It establishes the state of the art so the design brief (`claude-scaffold-design-brief.md`) can make defensible choices. Where a claim is operationally important, it's stated plainly; sources are listed at the end. The throughline across all three parts is a single idea from Anthropic's own engineering writing: **the model's attention is a finite resource, and an agent's reliability is mostly a function of what you put in front of it and what guardrails catch it when it's wrong** — not of how clever the prompt is.

---

## Part A — Scalable guardrails for highly autonomous agentic coding

### The core problem

Claude Code is an agent: it reads files, runs commands, edits code, and works through problems while you watch _or step away_. Its defining failure mode is that it is **confident** — it will report "tests pass" or "the bug is fixed" without having verified it. Left unchecked, _you_ become the verification loop, and every error waits for a human to notice. Autonomy is therefore not something you grant by relaxing permissions; it's something you _earn_ by building checks the agent can run itself. "Scalable" guardrails are the ones that keep holding as you remove yourself from the loop — across long sessions, parallel sessions, and unattended runs.

### The five layers (weakest dependency on humans, strongest first)

1. **Sandbox** — OS-level isolation so a bad command can't reach the rest of the machine.
2. **Verification harness** — tests/builds that give a hard pass/fail the agent reads and iterates against.
3. **Deterministic gates (hooks)** — scripts that _must_ run; unlike instructions, they can't be ignored.
4. **Scoped permissions** — pre-approve only safe actions; a classifier watches for the rest.
5. **Independent review** — a fresh agent that grades the work it didn't write.

The order matters: lower layers protect you even when higher ones are misconfigured. A scaffold should install all five by default.

### Layer 1 — Sandboxing

Anthropic ships OS-level sandboxing for the Bash tool, built on two boundaries that **must work together**:

- **Filesystem isolation** — Claude can only read/write specified directories. Implemented via macOS _Seatbelt_ and Linux _bubblewrap_.
- **Network isolation** — Claude can only reach approved domains. Traffic is routed through a proxy running _outside_ the sandbox that enforces an allowlist and prompts for new domains.

The stated purpose is blunt and important: even a _successful prompt injection is contained_ — a compromised Claude can't read your SSH keys or phone home to an attacker. The feature is open-sourced. You enable it with `/sandbox`.

**Critical caveats (the sandbox is strong, not bulletproof):**

- **Default reads can still reach secrets.** `~/.aws/credentials` and `~/.ssh/` are readable unless you add them to `denyRead`.
- **Sandboxed Bash inherits the parent environment by default**, including credentials, unless you configure environment scrubbing.
- **Unix sockets are a bypass vector** — allowing `/var/run/docker.sock`, for example, effectively grants host access. Don't broaden `allowUnixSockets` casually.
- **Broad filesystem writes enable privilege escalation** — writes to `$PATH` directories or to `.bashrc`/`.zshrc` can lead to code execution in other contexts.
- **TLS-aware network isolation is an active area of development**, and at least one allowlist bypass (a SOCKS5 hostname-parser differential) has been demonstrated.

The practical conclusion is **defense in depth**: run the project inside a dev container _and_ enable Claude's `/sandbox`, set `denyRead` for secrets, scrub the environment, and keep network allowlists tight. No single layer is the whole answer.

### Layer 2 — Permissions and permission modes

By default Claude asks before any system-modifying action. That's safe but unsustainable — after the tenth approval you're clicking, not reviewing. The modes, from most to least supervised:

- `default` — prompt on each sensitive action.
- `acceptEdits` — auto-accept edits/common FS commands within the working directory.
- `auto` — a **background classifier model** reviews each command and protected-directory write, blocking only the risky ones (scope escalation, unknown infrastructure, hostile-content-driven actions). This is the sweet spot for "trust the direction, don't click every step."
- `dontAsk` — auto-deny prompts (explicitly allowed tools still run).
- `bypassPermissions` — skip all prompts. **Never the default in a template.** (Even it keeps a circuit breaker for `rm -rf /`-style root/home deletions.)
- `plan` — read-only exploration.

Alongside modes, **permission rules** in `settings.json` (`permissions.allow` / `permissions.deny`) let you allowlist specific safe commands (`npm run lint`, `npm test`, `git commit`) and denylist dangerous ones. For unattended `-p` runs, auto mode **aborts if the classifier repeatedly blocks**, since there's no human to fall back to.

### Layer 3 — Deterministic gates (hooks)

Hooks run scripts automatically at lifecycle points and are **deterministic**: unlike CLAUDE.md instructions (which are advisory and can be "forgotten" as context fills), a hook _guarantees_ the action happens. The events most useful as guardrails:

- `PostToolUse` (matcher `Edit|Write`) — run a linter/formatter/type-check after every edit.
- `Stop` — block the turn from ending until a check passes (e.g., the test suite). Claude Code overrides the gate after ~8 consecutive blocks, so it can't deadlock.
- `PreToolUse` (matcher `Bash`) — validate a command before it runs; exit code 2 blocks it and feeds the reason back to Claude. (The docs' canonical example blocks any SQL write so a "read-only" agent stays read-only.)
- `SessionStart` — inject context at the start of a session (used below for drift detection).

Hooks are the bridge between "we have a rule" and "the rule is enforced." Anything that must happen _every time with zero exceptions_ belongs here, not in CLAUDE.md.

### Layer 4 — The verification harness

This is the single highest-leverage guardrail. Give Claude a check that returns a signal it can read — a test suite, a build exit code, a linter, a screenshot diff — and the loop closes on its own. Supporting practices:

- **"Evidence before claims."** Require Claude to show the command it ran and its output, not just assert success. Reviewing evidence is faster than re-running it yourself, and it works for sessions you didn't watch.
- **Gate strength is a dial.** Weakest: ask Claude to run the check in the same prompt. Stronger: a `/goal` condition re-checked every turn. Strongest: a `Stop` hook running the check as a script.
- **Tests as an external oracle** make test-driven prompts ("write a failing test that reproduces this, then fix it") far more reliable than "fix the bug."

### Layer 5 — Independent review

The agent that wrote the code is the wrong one to grade it — it's biased toward its own reasoning. A **reviewer running in a fresh context** (a subagent — see Part B) sees only the diff and the criteria, so it evaluates on the result's own terms. Anthropic ships a `/code-review` skill that reviews the current diff for bugs in a fresh subagent. One caution baked into the docs: a reviewer told to "find problems" will _always_ find some, which pushes toward over-engineering — so instruct it to flag only issues affecting **correctness or stated requirements**.

### Scaling out (where "scalable" earns its name)

- **Headless mode** (`claude -p "…"`, with `--output-format json|stream-json`) integrates Claude into CI, pre-commit hooks, and scripts.
- **Fan-out**: loop `claude -p` across many files, using `--allowedTools` to scope what each invocation may do — this scoping is what makes unattended batch work safe.
- **Auto-mode fallback** protects unattended runs by aborting rather than guessing when blocked.
- **Agent teams** coordinate many sessions with shared tasks for sustained parallelism, each with its own context.

### The threat model behind all of this

The reason sandboxing sits at layer 1 is **prompt injection**. An agent that (1) can see private data, (2) is exposed to untrusted content (a fetched web page, a dependency's README, an issue comment), and (3) can act/exfiltrate, is a standing exfiltration risk — every `npm install` pulls untrusted code, and a single injected instruction can try to POST your secrets outward. You reduce this by removing one leg of that triad: the sandbox removes the _exfiltrate_ leg (network allowlist) and the _read-secrets_ leg (filesystem + `denyRead` + env scrubbing). Guardrails aren't only about Claude making honest mistakes; they're about containing a Claude that has been _manipulated_.

---

## Part B — Subagents for quality control and better outcomes

### What a subagent is

A named, isolated Claude instance with its **own context window, system prompt, tool allowlist, model, and permission mode**. The main agent delegates a task; the subagent works independently and returns **only its final summary**. All the intermediate noise — file reads, search output, exploratory calls — stays in the subagent's context and never pollutes the main thread.

### The key insight

Subagents **do not make Claude smarter**. They preserve the _quality of the context that already exists_. A 200K window sounds huge until a multi-hour session fills it with tool output and repeated file contents; past roughly two-thirds capacity, response quality degrades because the signal-to-noise ratio collapses. Subagents are the primary tool for keeping the main thread's signal high.

### Built-in subagents

- **Explore** — read-only, runs on **Haiku** (fast, cheap); for codebase search and discovery. Skips CLAUDE.md/git status to stay lean.
- **Plan** — read-only research during plan mode; inherits the main model.
- **General-purpose** — all tools; for tasks needing both exploration and modification.

Subagents **cannot spawn other subagents** (no infinite nesting). The _only_ channel from parent to subagent is the delegation prompt string, so any file paths, errors, or decisions it needs must be stated in that prompt.

### Design principles (from Anthropic's own guidance)

1. **One job.** Each subagent should excel at a single task.
2. **Narrow tools.** Grant the minimum (`tools:` allowlist or `disallowedTools:` denylist). A read-only reviewer gets `Read, Grep, Glob, Bash` and nothing that writes.
3. **A precise `description`.** Claude uses it to decide when to delegate; "use proactively" encourages automatic delegation.
4. **A structured return shape.** E.g., findings grouped as _Critical / Warning / Suggestion_, with file/line references and a fix — so the main thread can act on the summary.
5. **Obstacle reporting and stop rules**, so it finishes and reports clearly rather than spinning.

### Quality-control patterns

- **Writer / Reviewer.** One session (or subagent) implements; a _separate_ one reviews in fresh context. Fresh eyes catch what the author rationalizes.
- **Adversarial review against the spec.** "Review this diff against `SPEC.md`. Check every requirement is implemented and the listed edge cases have tests. Report gaps, not style." The reviewer returns gaps directly to the implementing session, which fixes and re-reviews without you ferrying findings between windows.
- **High-volume isolation.** "Use a subagent to run the test suite and report only the failing tests with their errors" keeps verbose output out of the main context.
- **Parallel research / chaining.** Spawn independent subagents for independent investigations; chain them for multi-step flows (reviewer finds issues → optimizer fixes them).

### Finer-grained control

- **`PreToolUse` hooks inside a subagent** enforce constraints the `tools` field can't express — e.g., allow `Bash` but block any SQL write via a validation script returning exit code 2.
- **Permission-mode inheritance.** If the parent is in auto mode, the subagent inherits auto mode and its own `permissionMode` is ignored — the classifier judges its calls too.
- **Worktree isolation** (`isolation: worktree`) gives a subagent an isolated git checkout so its edits don't touch your working tree.

### Persistent memory — reviewers that learn

A subagent can be given a `memory` scope (`project`, `user`, or `local`). It then maintains a `MEMORY.md` (and supporting files) that survives across conversations, accumulating codebase patterns, recurring issues, and architectural decisions. `project` scope is the recommended default because the knowledge is shareable via version control. A reviewer told to "check your memory for patterns you've seen before" and "save what you learned" gets measurably more useful over a project's life. **This is the natural bridge to Part C: subagent memory is a piece of the context network.**

### Costs and anti-patterns

- **Token cost.** Subagent-heavy workflows can consume **~7× the tokens** of a single-thread session (each maintains its own context). Use QC subagents at _checkpoints_, not on every turn, and route routine review to Haiku, milestone review to Sonnet/Opus.
- **Don't split coupled work.** Subagents can't see each other's context; work that needs shared state belongs on the main thread.
- **Don't delegate trivia.** Subagents have a startup cost; for a one-shot call it's not worth it.
- **Reviewer over-reporting.** As in Layer 5: scope the reviewer to correctness/requirements or it manufactures work.
- **Result flooding.** Many subagents each returning detailed results can themselves fill the main context — keep returns distilled (Anthropic's multi-agent work targets ~1–2k-token summaries from subagents that may burn tens of thousands internally).

---

## Part C — Building a context network

### Definition

A **context network** is a deliberately engineered, navigable, version-controlled body of project knowledge designed for **just-in-time retrieval** by the agent — not a pile of docs dumped into the prompt. It is the applied form of _context engineering_: curating the _smallest set of high-signal tokens_ that reliably produce the behavior you want.

### Why it matters: the attention budget

Anthropic frames context as a **finite resource with diminishing returns**. As tokens grow, recall degrades — the phenomenon called **context rot**. This is a performance _gradient_, not a cliff, but it's universal across models and stems from the transformer's n² attention. Bigger context windows don't dissolve the problem; they postpone it. So the goal is never "load everything" — it's "load the right thing at the right moment."

### The central technique: just-in-time, not pre-loaded

Rather than pre-ingesting everything, effective agents keep **lightweight identifiers** — file paths, stored queries, links — and load data dynamically at runtime via tools. Claude Code embodies this with a **hybrid**: `CLAUDE.md` is dropped in up front, while `glob`/`grep`/file reads pull in the rest on demand, sidestepping stale indexes. The _structure itself carries signal_: folder hierarchy, naming conventions (`test_utils.py` in `tests/` vs `src/core_logic/`), and timestamps all tell the agent what to load and when. This enables **progressive disclosure** — the agent assembles understanding layer by layer and keeps only what's needed in working memory.

### What the context network is made of (mapped to Claude Code primitives)

1. **A lean `CLAUDE.md` at the right "altitude."** The Goldilocks zone between brittle hardcoded if-else logic and vague hand-waving: specific enough to guide, flexible enough to leave heuristics to the model. _Minimal does not mean short — it means high-signal._ Every line must earn its place (an over-stuffed CLAUDE.md causes Claude to ignore _all_ of it). Use `@path` imports to point at deeper docs rather than inlining them.
2. **Skills (`.claude/skills/`)** for domain knowledge that's only _sometimes_ relevant. Loaded on demand, so they don't tax every session's startup — the canonical progressive-disclosure mechanism. (Skills can also be _preloaded_ into a subagent via the `skills` frontmatter field when a worker always needs them.)
3. **Codified per-subsystem specs**, written _for AI consumption_: explicit code patterns, file paths, parameter names, expected behavior. Treated as **living documents generated and updated by Claude at the developer's direction** — one document per subsystem, navigable via the file tree.
4. **Structured note-taking / agentic memory.** A `NOTES.md` or a to-do list the agent maintains _outside_ the context window and pulls back in later — this is what gives long-horizon tasks coherence across resets. Subagent `MEMORY.md` (Part B) is the same idea for specialized workers.
5. **Compaction discipline.** When the window fills, Claude summarizes and reinitiates — preserving architectural decisions, unresolved bugs, and implementation details plus the most recently accessed files. You can steer it from CLAUDE.md ("when compacting, always preserve the list of modified files, test commands, and open decisions").

### Keeping it fresh: the drift problem and its fix

The danger of a context network is **staleness**: an out-of-date spec is worse than no spec, because it makes the agent _confidently wrong_. The state-of-the-art mitigation (from the "codified context" research) is a **drift-detection hook**: a `SessionStart` script that parses recent git commits against a subsystem→file map and **injects a warning into the session when source files change without a corresponding spec update**. This automates the "are the docs lying?" check that humans forget to run. The complementary discipline is keeping docs _living and AI-maintained_ — Claude updates the relevant spec as part of finishing a change, prompted by the reviewer/Stop gate.

### The unifying principle

Across system prompts, tools, examples, and message history, the guidance is identical: **find the smallest set of high-signal tokens that maximizes the likelihood of the desired outcome.** A context network is how you _operationalize_ that across sessions — lean up front, rich on demand, kept honest by drift detection, and persisted through note-taking and memory.

---

## Synthesis: how the three combine

The three topics are not separate — they're one system seen from three angles:

- **Guardrails (A)** keep an autonomous agent safe and verifiable. Hooks and the verification harness are deterministic; the sandbox is the backstop against manipulation.
- **Subagents (B)** are simultaneously a _quality-control_ mechanism (independent review) and a _context-protection_ mechanism (isolating verbose work) — and via persistent memory they feed knowledge back into the project.
- **The context network (C)** is what keeps the _main_ agent grounded and lean so it stays in the high-performance region of its attention budget, and it's the substrate that subagent memory and codified specs write into.

A scaffold that installs all three by default gives a relatively new builder **maximum safe autonomy**: the guardrails do the verifying so the human doesn't have to catch every mistake by eye; the subagents keep quality high without manual review of every diff; and the context network keeps the agent oriented across a long, multi-session build.

---

## Sources

- **Claude Code — Best practices** (plan/auto modes, allowlists, sandboxing, hooks, subagents, verification, `/goal`, headless, fan-out, adversarial review): code.claude.com/docs/en/best-practices
- **Claude Code — Create custom subagents** (built-ins, frontmatter, tool/permission scoping, `PreToolUse` validation, persistent memory, forks, costs): code.claude.com/docs/en/sub-agents
- **Claude Code — Configure the sandboxed Bash tool** + **Anthropic Engineering: Claude Code's sandboxing architecture** (Seatbelt/bubblewrap, network proxy, security caveats, prompt-injection containment): code.claude.com/docs/en/sandboxing ; anthropic.com/engineering/claude-code-sandboxing
- **Anthropic Engineering: Effective context engineering for AI agents** (attention budget, context rot, just-in-time retrieval, compaction, note-taking, sub-agent architectures): anthropic.com/engineering/effective-context-engineering-for-ai-agents
- **"Codified Context: Infrastructure for AI Agents in a Complex Codebase"** (per-subsystem AI-authored specs; the context-drift detection hook): arXiv 2602.20478
- Supporting practitioner analyses on subagent cost (~7× tokens), sandbox bypass research, and context-drift failure rates (see body for where each is used).
