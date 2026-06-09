# NOTES — decisions log

Long-horizon memory that survives context resets. When a non-obvious decision is
made or reversed — a tradeoff, a constraint discovered, an approach abandoned —
**Claude appends a dated entry here** (at the author's direction). Read this
before starting long-horizon work; it's the cheapest way to avoid re-litigating
settled questions or repeating a dead end.

This is for _decisions and their rationale_, not a task list or a changelog. Keep
entries short and high-signal. Newest at the top.

## Format

```
## YYYY-MM-DD — <short title>

**Context** — what prompted the decision.
**Decision** — what was chosen.
**Consequences** — what this commits us to, and what it rules out.
```

---

## 2026-06-09 — M6: QC subagents ship as the `claude-guardrails` plugin

**Context** — V2 goal #2 / design brief §3: the portable Claude config
(subagents, `/qc`) was emitted as committed `.claude/agents/` files by
`src/templates/agents.js`, freezing a snapshot that can't be updated without
re-scaffolding. The brief calls for a versioned plugin the CLI _enables_ while
still emitting the project-local config a plugin can't carry (hooks/permissions/
sandbox).

**Decision** — Stand up an in-repo plugin: `plugin/` (manifest under
`.claude-plugin/`, `agents/`, `commands/`) listed by a repo-root
`.claude-plugin/marketplace.json` (`source: ./plugin`). Plugin name
`claude-guardrails`, marketplace `claude-scaffold`, enable id
`claude-guardrails@claude-scaffold`. Decisions taken with the author: (1)
**in-repo, GitHub-sourced** marketplace; (2) **plugin-only** — generated
projects no longer commit the agents; (3) **plain files** are the source of
truth — `agents.js` generators retired (deleted, with `agents.test.js`);
`plugin.test.js` (repo root) replaces the dogfood/loadability tests and adds
manifest + enablement-resolution proxies. `generateClaudeSettings` now emits
`extraKnownMarketplaces` + `enabledPlugins`; it takes a `marketplaceSource` so
generated projects get the GitHub source while this repo dogfoods via a local
`directory` source. The agent-smoke harness now enables the plugin from the
working tree (local marketplace) to keep the live check honest.

**Consequences** — Two gotchas worth remembering. (1) `extraKnownMarketplaces[].source`
**must be an object** with a `source` discriminator (`github`/`directory`/…) —
the settings schema _rejects a bare path string_ (the guide doc was wrong; the
validator caught it). The local dogfood source is `{ source: "directory", path: "." }`.
(2) Plugin components live at the **plugin root**, never under `.claude-plugin/`
(only `plugin.json` goes there) — misplacement makes Claude Code silently skip
them. Accepted trade: generated projects now need the marketplace reachable to
load reviewers (offline clones won't have `/qc` until they can fetch). Plugin
agents already carried no `hooks`/`mcpServers`/`permissionMode` frontmatter
(ignored when plugin-loaded), so the guardrail layer correctly stayed in
CLI-emitted settings. M7 = marketplace publish/pin (tag versioning) + a starter
skill + `claude-scaffold doctor`.

## 2026-06-09 — Subagent invocation: structural proxies in CI, live smoke opt-in

**Context** — Design brief §7.3/§11 wants CI to confirm the reviewer subagent
"loads, is invokable by name, and returns the structured shape." True runtime
invocation needs a live Claude; this repo's CI has no `ANTHROPIC_API_KEY`. It
was the last open decision in `docs/specs/self-verification.md`.

**Decision** — Split into two layers. (1) **Always-on loadability proxies** in
`agents.test.js`: frontmatter parses, every declared tool is a real Claude Code
tool (catches typos Claude Code silently drops), agent `name` matches filename,
and `/qc` only delegates to agents that ship. These are the strongest
"it would load" signals obtainable without a key. (2) **Opt-in live smoke
harness** `scripts/agent-smoke.mjs` (`npm run test:agent-smoke`): invokes the
`code-reviewer` subagent by name via `claude -p --agent code-reviewer` against a
generated project and asserts a non-empty review comes back; SKIPs (exit 0)
without a key or CLI so it's never a false red. Wired as a manual
`workflow_dispatch` `agent-smoke` CI job, not a per-PR gate. Runs least-privilege
(`--permission-mode dontAsk` + a scoped read-only allowlist) so the agent can't
run arbitrary Bash — a QC security finding flagged that `bypassPermissions` plus
the agent's `Bash` tool would let the model `printenv` the API key into CI logs.

**Consequences** — Two accepted residuals: (1) a runtime-only regression isn't
caught on every PR, only by the manual/opt-in run (release-time or after touching
`agents.js`); (2) the live run smoke-tests only `code-reviewer` as a
representative — the other agents are proven loadable by the structural proxies,
not invoked live. Worth it — keyless CI can't do better, and faking a live
invocation would be the exact dishonesty the guardrail philosophy rejects.
`scripts/agent-smoke.mjs` is registered in the subsystem map so the drift hook
watches it. Closes M5.

## 2026-06-09 — nextjs-ts lints via the ESLint CLI, not `next lint`

**Context** — `next lint` is deprecated and removed in Next.js 16; the
`nextjs-ts` template's `lint`/`lint:fix` scripts called it, so a generated
project on Next 16 would fail `npm run verify` (and its dogfooded Stop gate).
Flagged as an M4 open decision in `docs/specs/self-verification.md`.

**Decision** — Switch the scripts to `eslint .` / `eslint . --fix`, matching the
other templates. Keep `eslint-config-next` and the `@eslint/eslintrc`
`FlatCompat` layer (it still supplies `next/core-web-vitals` + `next/typescript`
rules) — only the invocation changed. Added an explicit
`{ ignores: ['.next', 'out', 'dist', 'node_modules'] }` because the bare
`eslint .` CLI, unlike `next lint`, doesn't auto-skip build output.

**Consequences** — `nextjs-ts` no longer depends on the deprecated command and
is one Next.js major safer. Verified by `npm run test:boot -- nextjs-ts` (npm
install, format:check, `eslint .`, `tsc --noEmit`, and vitest all green). The
`@types/node` dep stays, now justified by `tsc --noEmit` rather than `next
lint`'s old auto-install behavior.

## 2026-06-08 — QC-subagent memory is gitignored, not committed

**Context** — The dogfooded `code-reviewer` subagent has `memory: project`
(design brief §8: accumulate codebase patterns across sessions), so it writes
`.claude/agent-memory/` during reviews. Question: commit it (shared, persistent
review context) or ignore it (machine-written, ever-growing local state)?

**Decision** — **Ignore it** — `.claude/agent-memory/` added to both this repo's
`.gitignore` and the generated template, alongside `.claude.json`. Machine-authored
memory churns every session and can hold stale/wrong notes (the recall system even
warns memories reflect "what was true when written"); committing it would add noise
and merge conflicts.

**Consequences** — Accumulation is per-developer/per-clone, not shared, and CI
starts fresh — acceptable, since review memory is an optimization, not correctness.
A team that wants shared review context can un-ignore deliberately. Generated
projects inherit the same default.

## 2026-06-08 — M4 self-verification: boot all four templates in CI

**Context** — Design brief §7 (the "highest-risk requirement") demands the
scaffold verify its own output. Before M4, the generation test only checked file
_existence_, no boot test existed, and hook tests only asserted on generator
source strings. Open question: how faithful/expensive should the boot test be,
given React/Next pull large dep trees (minutes, flaky) while node-ts/none are cheap.

**Decision** — (1) **Boot all four templates** (`none`, `node-ts`,
`react-vite-ts`, `nextjs-ts`) by running `npm install && npm run verify` inside a
generated temp dir, in a **dedicated CI `boot` job** (matrix, one leg per
template, parallel to `test`), kept out of `npm test` / `npm run verify` so the
fast loop and the dogfooded Stop gate never trigger installs. (2) Generation
**content** test uses **targeted invariants, not golden snapshots** (no snapshot
churn; boot now proves the content actually works). (3) Guardrail-fires tests are
**behavioral** — execute the real hooks. (4) Refactored `generateProject(config,
root)` out of `run()` so the harness generates without mocking prompts.

**Consequences** — Building the boot test surfaced that three templates shipped
**no test file** (so their own Stop gate would block on day one) and that the
React/Next `setup-tests.ts` jest-dom import was broken — both fixed by emitting a
starter test per template + the `/vitest` jest-dom entry. Commits us to: every
new template must ship a starter test, and `next lint` must migrate before
Next 16. Subagent _runtime_ invocation (§7.3) stays unverified in CI (no live
Claude) — structural coverage in `agents.test.js` is the accepted substitute.
See [[self-verification]].

## 2026-06-08 — Drift detection ships dormant; specs are opt-in per subsystem

**Context** — M3 added a `SessionStart` drift hook (`.claude/hooks/check-drift.sh`)
that warns when a subsystem's source changes without its spec. A hook that fires
on every session risks becoming wallpaper the author learns to ignore (§6 of the
design brief).

**Decision** — The scaffold emits **no** `subsystem-map.json` — generated
projects start with the hook fully dormant. A subsystem is watched only once the
author adds it to the map, and the lookback window is a tunable `LOOKBACK=10`
constant at the top of the hook. This repo dogfoods the feature by maintaining a
real map (`docs/specs/subsystem-map.json`) for its own stable subsystems.

**Consequences** — Drift warnings only ever name subsystems the author opted into,
so the signal stays high. The cost is that an unmapped subsystem gets no drift
coverage — acceptable, and consistent with the hook's fail-open philosophy
(a missed warning beats a false one).
