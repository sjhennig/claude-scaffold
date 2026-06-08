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
