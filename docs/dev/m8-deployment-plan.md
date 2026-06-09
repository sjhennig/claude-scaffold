# M8 Plan — Deployment: one-line project kickoff

**Status:** planned 2026-06-09 (decisions taken with the author). Not started.
**Goal:** kicking off a new guardrailed project requires nothing but Node 20+:

```bash
npx @sjhennig/claude-scaffold my-app --framework node-ts --yes
```

— or plain `npx @sjhennig/claude-scaffold` for the interactive flow. Today the
only path is clone + `npm install` + `npm link`, which is the least polished
part of the experience and the biggest barrier for the target audience.

## Decisions already made (with the author)

1. **Channel: scoped npm package `@sjhennig/claude-scaffold`.** The unscoped
   name `claude-scaffold` is taken on npm by an unrelated tool
   (pyramidheadshark's, v2.7.x), so the scope is both available and a
   disambiguator. The **binary stays `claude-scaffold`** — the command name
   comes from the `bin` field, not the package name; collision only occurs if
   someone globally installs both packages, which the README will note.
2. **Non-interactive mode ships in M8** — every prompt gets a flag, plus
   `--yes` to accept defaults for anything unspecified. This is what makes the
   one-liner real (and scriptable/CI-able).
3. **Publishing is CI-on-tag** — pushing `cli-vX.Y.Z` triggers a GitHub
   Actions publish. Mirrors the plugin's `guardrails-vX.Y.Z` ritual. The two
   version streams stay deliberately independent (M7 NOTES decision): npm
   semver / `cli-v*` tags for the CLI, `guardrails-v*` tags for the plugin.

## Workstreams (PR-sized, in order)

### PR 1 — Package the CLI for npm

- `package.json`: rename to `@sjhennig/claude-scaffold`,
  `publishConfig.access: public`, a `files` allowlist
  (`["bin/", "src/", "!src/**/*.test.js"]` — tests are colocated in `src/`,
  so the negation pattern is required to keep the ten test files out of the
  tarball), refreshed `description`/`keywords`.
- **Pack self-verification** (the §7 philosophy applied to distribution):
  a script that runs `npm pack`, installs the tarball into a temp prefix, and
  scaffolds + verifies a project from it — proving the published artifact is
  self-contained, not just the working tree. Also asserts no `*.test.js`
  landed in the tarball. Wire as a CI job (cheap: use the `none` template).
- First published version: keep `1.0.0`.

### PR 2 — Non-interactive mode

- `bin/claude-scaffold.js`: positional `<project-name>` + flags mapping 1:1 to
  the prompts (`--description`, `--framework`, `--port`, `--anthropic-api`,
  `--api-keys`, `--no-git`) plus `--yes` (defaults for the rest) and
  `--help`. No new dependency unless arg parsing demands it (`node:util`
  `parseArgs` should suffice).
- `src/prompts.js`: skip inquirer for any answer provided via flags; flag
  values get the prompts' validation AND normalization so the two paths can't
  diverge. Parity details that need explicit handling: the kebab-case name
  validator and framework enum exist today; a `--port` range check would be
  NEW validation (the `devPort` prompt has none — add it to both paths);
  `--port` must be rejected/ignored with `--framework none` (the prompt is
  skipped via a `when` clause there); `--api-keys` must replicate the prompt's
  normalization (split, trim, uppercase, underscores).
- Tests: pure flag-parsing/validation units + an orchestrator integration run
  with flags only.

### PR 3 — Publish pipeline

- `.github/workflows/publish.yml` on `cli-v*` tags: `npm ci` → full verify →
  pack test → `npm publish --provenance --access public`.
- **Auth: npm Trusted Publishing (OIDC)** preferred — no long-lived token;
  needs one-time configuration by the author on npmjs.com. Fallback:
  `NPM_TOKEN` repo secret.
- Guard step: workflow fails if the tag version ≠ `package.json` version
  (same three-way-agreement spirit as the plugin release tests).
- New `docs/specs/distribution.md` registered in the subsystem map, owning the
  packaging fields, the pack-test script, and the publish workflow; documents
  the CLI release ritual (bump → PR → merge → tag `cli-vX.Y.Z` → CI publishes).

### PR 4 — Kickoff UX + docs wrap

- README Quick Start becomes the npx one-liner (interactive and flag forms);
  clone + `npm link` moves under Development as the contributor path; a
  disambiguation note about the unrelated unscoped `claude-scaffold` package.
- Generated projects' docs unchanged (they never reference the CLI's
  distribution); `doctor` unaffected (it checks Claude Code + project config,
  not the scaffold install).
- project-brief M8 ✅ + NOTES entry; first `cli-v1.0.0` tag pushed after the
  pipeline PR merges. Bootstrap ordering matters here as it did for
  `guardrails-v1.0.0`, but the dependency runs the **other way**: the plugin
  tag had to exist before the pin merged (downstream references it), whereas
  the CLI tag must come after the workflow merges (the tag is what fires the
  publish).

## Acceptance criteria

1. On a machine with only Node 20+,
   `npx @sjhennig/claude-scaffold@latest my-app --framework none --yes`
   produces a project where `npm install && npm run verify` passes. With
   Claude Code also installed, `claude-scaffold doctor` reports no failures
   (without it, the missing-CLI **fail** is correct doctor behavior by the M7
   taxonomy — don't weaken doctor to make this criterion pass).
2. Interactive `npx @sjhennig/claude-scaffold` behaves exactly like today's
   linked CLI.
3. CI proves the tarball is self-contained on every PR (pack test).
4. A release is exactly: bump version → merge → push `cli-vX.Y.Z`; the
   workflow refuses a tag/version mismatch.
5. README leads with the one-liner; all docs claims still match functionality.

## Risks / notes

- **Name confusion** with the unscoped `claude-scaffold` package — mitigated
  by README note; revisit a distinct unscoped name only if it becomes a real
  support burden.
- The generated projects' plugin loading is **independent of npm** (GitHub
  marketplace, `guardrails-v*` pin) — publishing the CLI changes nothing
  downstream.
- Single runtime dep (inquirer) keeps `npx` cold-start acceptable; don't add
  heavyweight arg-parsing deps.
- Trusted Publishing requires the package to exist (first publish may need a
  manual `npm publish` or token-based CI run before OIDC binding applies —
  verify against current npm docs during PR 3).

## Out of scope

- Homebrew / single-binary packaging, CLI self-update, any plugin/marketplace
  changes, Windows-specific installers.
