# Self-Verification Spec

<!--
Living doc — update this whenever the self-verification suite changes what it
checks or how. Registered in docs/specs/subsystem-map.json so the drift hook
watches scripts/boot-test.mjs and scripts/agent-smoke.mjs.
-->

## Purpose

The suite that proves the scaffold's own output works (design brief §7). A
scaffolder emits _another project's file tree_, not a unit-testable function, so
"the scaffold works" is exactly the kind of unverified claim the guardrail
philosophy exists to prevent. Three always-on layers, all wired into this repo's
CI:

1. **Generation test** — files exist _with expected content_.
2. **Boot test** — each generated project actually installs and verifies.
3. **Guardrail-fires test** — the emitted guards actually _fire_, not just exist.

Plus a fourth, **opt-in** layer that needs a live Claude and so can't run in
keyless CI:

4. **Subagent smoke test** — a generated project loads the `claude-guardrails`
   plugin and its reviewer subagent is invokable by name and returns a review
   (design brief §7.3 / §11). Its always-on CI substitute is the structural
   **loadability + enablement-resolution proxies** in `plugin.test.js` (see
   below).

It is NOT responsible for what the templates contain (that's `project-files.js`)
or what the guardrails are (that's [[guardrails]]) — only for proving they work.

## Owning files

- `scripts/boot-test.mjs` — boot harness (registered for drift). Generates each
  template into a temp dir and runs `npm install && npm run verify`.
- `scripts/agent-smoke.mjs` — opt-in subagent smoke harness (registered for
  drift). Generates a project, enables the `claude-guardrails` plugin from this
  repo's working tree (a local `directory` marketplace source), and invokes the
  `claude` CLI as the `code-reviewer` subagent; SKIPs (exit 0) without a key or
  the CLI.
- `src/templates/guardrails.fires.test.js` — behavioral guardrail-fires tests
  (execute the real hooks, assert exit codes/output).
- `plugin.test.js` — structural **loadability proxies** (frontmatter parses,
  every tool is a real Claude Code tool, agent name matches filename, `/qc` only
  delegates to agents that ship) **plus enablement-resolution proxies** (the
  plugin manifest + marketplace are valid, and the `enabledPlugins` id the CLI
  emits resolves to a real marketplace entry and the manifest's plugin name) —
  the always-on stand-in for the opt-in runtime smoke test.
- `src/index.test.js` — generation test: file existence + content invariants.
- `.github/workflows/ci.yml` — the `test` job (generation + guardrail-fires +
  loadability via `npm test`), the `boot` job (one matrix leg per template),
  the `pack` job (M8: `npm run test:pack` proves the npm tarball is
  self-contained — its spec lands with the publish pipeline, M8 PR 3), and the
  opt-in `agent-smoke` job (`workflow_dispatch` only).

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

scripts/agent-smoke.mjs                // opt-in; needs ANTHROPIC_API_KEY + claude CLI
  // Generates the `none` template, seeds a tiny git diff, writes a minimal
  // settings.json that enables the claude-guardrails plugin from this repo's
  // working tree (local `directory` marketplace, no hooks), runs `claude -p`
  // AS the code-reviewer subagent (`--agent code-reviewer --output-format json`)
  // and asserts a non-empty review came back. SKIPs (exit 0) with no key / no CLI.
  // Exposed as `npm run test:agent-smoke` — NOT part of `npm test` / `verify` /
  // required CI; run by hand or via the workflow_dispatch `agent-smoke` job.
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

## Subagent invocation coverage (§7.3 / §11)

"Confirm the reviewer subagent loads and is invokable" splits across two layers
because keyless CI can't run a live model:

- **Always-on (CI):** structural **loadability + enablement-resolution proxies**
  in `plugin.test.js` — the failure modes that would stop Claude Code from
  loading or dispatching an agent at all: unparseable frontmatter, a tool name
  outside the known set (a typo Claude Code silently drops), an agent whose
  `name` ≠ its filename, or a `/qc` command that delegates to an agent that
  doesn't ship. Plus the plugin-specific failure modes: an invalid
  `plugin.json`/`marketplace.json`, components misplaced under `.claude-plugin/`,
  or an `enabledPlugins` id the CLI emits that doesn't resolve to a real
  marketplace entry + manifest name. Together this is the strongest "it would
  load and be enabled" signal available without a key.
- **Opt-in (live):** `scripts/agent-smoke.mjs` does the real thing — invokes the
  `code-reviewer` subagent by name via the `claude` CLI and asserts a non-empty
  review comes back (the structured Critical/Warning/Suggestion grouping is
  soft-checked — warned, not asserted — since exact phrasing is model-dependent).
  It runs least-privilege: `--permission-mode dontAsk` + a scoped read-only
  allowlist, so the agent can't run arbitrary Bash (closing an API-key-leak
  path). Run it before a release or after touching the plugin agents or the
  enablement wiring in `guardrails.js`:
  `ANTHROPIC_API_KEY=… npm run test:agent-smoke` (or trigger the `agent-smoke`
  workflow). It SKIPs cleanly where it can't run, so it's never a false red.

**Accepted residuals:** (1) The live layer is not gated on every PR (it costs
tokens and needs a secret CI lacks), so a regression that only manifests at
runtime could merge and be caught later by the manual/opt-in run. (2) The live
layer smoke-tests only `code-reviewer` as a representative; the other agents
(`spec-reviewer`, `security-reviewer`, `test-runner`) are proven loadable only by
the structural proxies, not invoked live. Both are deliberate trades — see the
2026-06-09 entry in `NOTES.md`.

## Open decisions

- _None outstanding._
