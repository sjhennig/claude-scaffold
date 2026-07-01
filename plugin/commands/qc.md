---
description: Run a quality checkpoint on the current diff using the QC subagents
---

Run a quality checkpoint on the current uncommitted changes. Invoke the
relevant review subagents and synthesize their findings — do not review the
code yourself in this main thread.

Steps:

1. Run `git status` and `git diff` to see what changed. If there are no
   changes, say so and stop.
2. Delegate to the **code-reviewer** subagent for correctness, security, and
   maintainability.
3. If the change implements something with a spec in `docs/specs/` (or a
   `SPEC.md`/`PLAN.md`), or touches a subsystem listed in
   `docs/specs/subsystem-map.json`, delegate to the **spec-reviewer** subagent
   (it also flags specs left stale by the change).
4. If the change touches authentication, input handling, secrets, or external
   data, delegate to the **security-reviewer** subagent.
5. Synthesize all findings into a single list grouped Critical / Warning /
   Suggestion, each with `file:line` and the proposed fix. Present it; do not
   apply fixes unless asked.

Cost note: independent subagent review can cost several times the tokens of a
single-thread turn. Run this at checkpoints — pre-commit or end of a feature —
not on every turn. `/qc`'s structured `spec-reviewer` is pinned to sonnet, while
the deep `code-reviewer`/`security-reviewer` inherit the session model — so
running `/qc` from a frontier-model session is what reserves that depth for
milestone review.
