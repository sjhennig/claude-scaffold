# Doctor Spec

<!--
Living doc — update this whenever src/doctor.js or the bin dispatch changes
what `claude-scaffold doctor` checks or reports. Registered in
docs/specs/subsystem-map.json so the drift hook watches it.
-->

## Purpose

`claude-scaffold doctor` (design brief §3): run from a scaffolded project's
root, it verifies the machine and the project agree with what the scaffold
emitted — so a broken guardrail is reported instead of silently inert. It is
the runtime complement to the repo's keyless structural tests (e.g. nothing
offline can prove the pinned release tag exists on origin; doctor can).

## Owning files

- `src/doctor.js` — gather/evaluate split: `evaluate*` functions are pure
  (facts in, finding out); I/O lives in `gatherHookStates`/`runDoctor` with an
  injectable, shell-free `exec`. The bin layer consumes `runDoctor` (findings
  array) and `formatReport` (findings → printable report).
- `bin/claude-scaffold.js` — subcommand dispatch (`doctor`, unknown-command
  usage, default scaffold run).

## Checks (name → fail / warn meaning)

| Check              | fail                                            | warn                                                      |
| ------------------ | ----------------------------------------------- | --------------------------------------------------------- |
| Node.js version    | below `NODE_MAJOR_REQUIRED` (20)                | —                                                         |
| Claude Code CLI    | not on PATH                                     | older than `CLAUDE_CODE_MIN_VERSION`                      |
| Claude settings    | `.claude/settings.json` missing or invalid JSON | —                                                         |
| Hook scripts       | referenced script missing or not executable     | settings wire no hook scripts at all                      |
| Plugin enablement  | enabled id's marketplace not in settings        | nothing enabled                                           |
| Plugin release pin | pinned ref absent from the GitHub repo          | github source unpinned; or offline (unverifiable)         |
| Sandbox            | —                                               | disabled, dormant (bwrap can't namespace), or unprobeable |

Taxonomy rule: **fail = the guardrails cannot work as configured; warn =
degraded or unverifiable** (see NOTES.md 2026-06-09 doctor entry). Exit code 1
only on fails, so warnings never break CI.

## Invariants & constraints

- **Shell-free probes.** settings.json is untrusted input (doctor runs in any
  clone), so values from it must never reach a shell parser: every probe is an
  `execFileSync` argv array, and repo/ref interpolate only behind fixed
  prefixes (`https://github.com/…`, `refs/tags/…`). Any future check that
  shells out must follow this rule.
- **Pure evaluators.** `evaluate*` take plain values and return
  `{ status, detail }` — unit-testable like template generators. The
  CLAUDE.md side-effects convention names this module as the sanctioned
  read-only exception.
- The pin check follows the marketplace **backing an enabled plugin** (falling
  back to the first listed one), and the hook check derives the script list
  from the settings' own hook commands — both judge the project's actual
  config, not this repo's constants.

## Edge cases

- Not a scaffolded project (no `.claude/settings.json`): settings check fails
  and the settings-dependent checks are skipped — exit 1, no crash.
- Offline: the tag check warns rather than fails (air-gapped use is legal; an
  absent tag is not).
- Non-Linux or no bwrap: sandbox check warns "unprobeable" rather than
  guessing.

## Open decisions

- `CLAUDE_CODE_MIN_VERSION` is a warn, not a fail, and currently 2.0.0 —
  tightening it to a tested range is future work (design brief §3 pairing).
- A CI-side assertion that `PINNED_PLUGIN_REF` resolves on origin (so a
  forgotten release-tag push is caught without running doctor) was suggested
  by QC at the 1.1.0 release; not yet implemented.
