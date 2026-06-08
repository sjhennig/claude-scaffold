# Feature & Subsystem Specs

This directory holds spec documents — living, AI-maintained descriptions of what
the code is supposed to do. Two kinds live here:

- **Feature specs** — written _before_ a feature is built (spec-driven workflow).
- **Subsystem specs** — one per subsystem, kept _alongside_ the code as it
  evolves. Copy `_template.md` to start one (e.g. `auth.md`).

## Spec-Driven Workflow (new features)

1. **Describe** the feature to Claude in a conversation
2. **Ask Claude:** "Ask me hard questions about this feature, then write a spec"
3. **Save** the spec here (e.g., `user-auth.md`)
4. **Start a fresh Claude session** to implement — point it at the spec

Writing specs before code forces you to think through edge cases and gives Claude the context it needs to build the right thing.

## Subsystem Specs (the convention)

- **One spec per subsystem**, each naming the exact files it owns and its public
  interface. `_template.md` is the starting point.
- **Living documents.** Claude updates the relevant spec — at your direction — as
  part of finishing a change that touches the subsystem. A stale spec is worse
  than no spec, because it makes the agent confidently wrong.
- **High-signal, on-demand.** Specs are read just-in-time (when working on that
  subsystem), not loaded into every session. Keep them file-path-and-parameter
  explicit so they're worth the read.

## Drift detection (keeping specs honest)

A `SessionStart` hook (`.claude/hooks/check-drift.sh`) can warn when a
subsystem's source changed in recent commits but its spec didn't. It reads an
optional **subsystem→file map** you maintain at `docs/specs/subsystem-map.json`:

```json
{
  "subsystems": [
    { "name": "auth", "files": ["src/auth.ts"], "spec": "docs/specs/auth.md" }
  ]
}
```

The map starts empty (fresh projects have no subsystems) and the hook stays
silent until you add entries. Add a subsystem here once it's worth tracking.
