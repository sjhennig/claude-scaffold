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
