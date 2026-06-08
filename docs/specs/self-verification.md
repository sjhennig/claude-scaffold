# Self-Verification Spec

<!--
Living doc — update this whenever the self-verification suite changes what it
checks or how. Registered in docs/specs/subsystem-map.json so the drift hook
watches scripts/boot-test.mjs.
-->

## Purpose

The suite that proves the scaffold's own output works (design brief §7). A
scaffolder emits _another project's file tree_, not a unit-testable function, so
"the scaffold works" is exactly the kind of unverified claim the guardrail
philosophy exists to prevent. Three layers, all wired into this repo's CI:

1. **Generation test** — files exist _with expected content_.
2. **Boot test** — each generated project actually installs and verifies.
3. **Guardrail-fires test** — the emitted guards actually _fire_, not just exist.

It is NOT responsible for what the templates contain (that's `project-files.js`)
or what the guardrails are (that's [[guardrails]]) — only for proving they work.

## Owning files

- `scripts/boot-test.mjs` — boot harness (registered for drift). Generates each
  template into a temp dir and runs `npm install && npm run verify`.
- `src/templates/guardrails.fires.test.js` — behavioral guardrail-fires tests
  (execute the real hooks, assert exit codes/output).
- `src/index.test.js` — generation test: file existence + content invariants.
- `.github/workflows/ci.yml` — the `test` job (generation + guardrail-fires via
  `npm test`) and the `boot` job (one matrix leg per template).

It depends on the `generateProject(config, root)` contract in `src/index.js`
(the prompt-free generation entry point the harness drives).

## Public interface

```
scripts/boot-test.mjs [template...]   // default: all four templates
  // Generates each template, runs `npm install --no-audit --no-fund` then
  // `npm run verify` inside it, prints a per-template PASS/FAIL summary, and
  // exits non-zero on any failure.
  // Template names are validated against an allowlist; unknown → exit 2.
  // Exposed as `npm run test:boot` — NOT part of `npm test` / `npm run verify`.
```

## Invariants & constraints

- **Coverage is all four templates** (`none`, `node-ts`, `react-vite-ts`,
  `nextjs-ts`) — every template the scaffold can emit must boot.
- **Boot stays out of the fast loop.** `test:boot` is excluded from `npm test`
  and `npm run verify`, so the dogfooded Stop gate never triggers multi-minute
  installs. CI runs it in a separate `boot` job, parallel to (not gated behind)
  `test`, one leg per template.
- **Every emitted template ships a test.** Otherwise `vitest run` exits non-zero
  ("no test files found") and the generated project's own Stop gate blocks on
  day one. Adding a template requires adding its starter test.
- **Guardrail-fires tests are behavioral**, not string-assertions on the
  generator source (that's `guardrails.test.js`): they execute the real bash
  hooks against throwaway temp dirs.
- **Lint enforcement lives in the Stop gate, not PostToolUse.** §7.3 lists
  "introduce a lint error and assert `PostToolUse` surfaces it", but the emitted
  PostToolUse hook only runs prettier and ends in `; exit 0` (it never blocks an
  edit). Lint is instead enforced by the Stop gate's `npm run verify` (which runs
  `lint`), and the boot test proves a lint-clean template passes verify. So this
  §7.3 sub-case is realized as "a lint failure blocks the Stop gate", by design.
- **CI least-privilege:** the `boot` job runs third-party install lifecycle
  scripts, so the workflow token is `contents: read`, the job has a
  `timeout-minutes` bound, and checkout uses `persist-credentials: false`.

## Edge cases

- **Generation/spawn throws** for a template → counted as that template's
  failure (logged), not an abort of the whole run; remaining templates still boot.
- **Temp-dir cleanup failure** → warned, never allowed to mask the boot result.
- **No lockfile** ships in generated projects, so the boot job uses `npm install`
  (not `npm ci`); dependency ranges resolve fresh each run.

## Open decisions

- **Subagent runtime invocation is unverified.** §7.3 asks to "confirm the
  reviewer subagent loads and is invokable." Structural coverage exists
  (`agents.test.js`: frontmatter, read-only tools, dogfood byte-match), but true
  runtime invocation needs a live Claude and has no automated harness in CI.
- `next lint` is deprecated (removed in Next.js 16); the `nextjs-ts` lint script
  will need migrating to the ESLint CLI before then.
