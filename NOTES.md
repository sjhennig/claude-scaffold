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

## 2026-06-30 — Devcontainer installs Claude Code as node into a node-owned npm prefix

**Context** — Every devcontainer this scaffold stands up hit "auto-update failed
— no write permission to npm prefix" in the VS Code Claude Code extension. Both
the generated Dockerfile (`generateDockerfile()`) and this repo's
`.devcontainer/Dockerfile` ran `npm install -g @anthropic-ai/claude-code` as
**root**, before `USER node`. The default prefix in `node:20-bookworm-slim` is
the root-owned `/usr/local`, so the in-container auto-updater (running as the
unprivileged `node` user) cannot write it.

**Decision** — Adopt Anthropic's reference-devcontainer approach: create a
node-owned global prefix (`NPM_CONFIG_PREFIX=/usr/local/share/npm-global`, on
`PATH`) and move the install to **after** `USER node`. Applied identically to
both Dockerfiles. Added a dogfood ordering invariant in `devcontainer.test.js`
(`USER node` index < `npm install -g …` index, plus the prefix string) so the
two can't silently diverge again. Added a `doctor` "npm global prefix" check
(warn, not fail — the CLI still works, only self-update is blocked).

**Consequences** — Auto-update works in-session; every new Dockerfile must keep
the install after `USER node`. Deliberately did **not** adopt the reference's
other divergences (network-egress firewall via `init-firewall.sh` +
`NET_ADMIN`/`NET_RAW`; named-volume `~/.claude` instead of our documented host
bind-mount) — the firewall overlaps the existing sandbox layer and is a separate
architectural call (see [[sandbox-preflight-and-macos-vm]]); the bind-mount is a
documented trade-off.

---

## 2026-06-10 — Security audit: dispositions for the five findings

**Context** — Full hands-on security pass before going public. No critical/high
issues, no committed secrets. Five findings; three resolved with changes
(description input validation; honest documentation of the devcontainer trust
model; softened denylist framing), two consciously **accepted** and recorded here
so they aren't re-litigated.

**Decision** — (4, accepted) The Dockerfile floats its base image tag
(`node:20-bookworm-slim`) and the global Claude Code version rather than pinning
by digest/version. For a security tool, auto-picking-up upstream fixes is worth
more than byte-reproducible builds; CI runs `npm audit` + dependency-review and
the lockfile is committed. (5, accepted) `verify-gate.sh`'s marker path
`${TMPDIR:-/tmp}/claude-verify-gate-${SESSION}` is predictable by prefix, but
`session_id` is an unguessable harness UUID and is always double-quoted (no
injection), so the theoretical `/tmp` symlink/TOCTOU vector isn't worth `mktemp`
complexity. The central residual risk — the devcontainer shares host `~/.claude`
credentials and grants `node` passwordless root, so it's no boundary against a
malicious dependency — is a deliberate ergonomics tradeoff, now documented in
`docs/sandbox.md § Trust model & residual risk`.

**Consequences** — Revisit (4) if a reproducible-build requirement appears (pin by
digest then). Revisit (5) only if marker state ever carries something sensitive.
The trust-model doc is the canonical place to point users asking "what actually
isolates Claude here?"

## 2026-06-09 — M8 shipped: npx kickoff, flag mode, tag-fired publishing

**Context** — Executing the M8 plan (entry below). Three implementation PRs
(#32 packaging + pack test, #33 flag mode, #34 publish pipeline) plus the docs
wrap. Everything in the plan held; two things were learned the hard way.

**Decision/outcome** — (1) The pack test drives the **installed bin with the
flag mode** — the literal npx-user path — not the library API; it gates every
PR and every publish. (2) The publish workflow gained a second guard beyond
tag=version: the tagged commit must be an **ancestor of main** (QC: otherwise
any write-access tag publishes unreviewed code with provenance), and both
guards run before `npm ci` so a bad tag never executes third-party install
scripts. (3) Flag/prompt parity is enforced by sharing the literal validator
functions, plus an exit-cleanup for the one config flags could produce that
prompts can't (`--port` surviving an interactively-chosen `none`).

**Consequences** — Kickoff is `npx @sjhennig/claude-scaffold <name> …`; clone
and `npm link` is the contributor path only. CLI releases: bump → merge → push
`cli-v<version>`. Process lessons, both now load-bearing: (a) **mapped files
must exist on the same branch** — the subsystem-map dogfood test fails a
branch that maps a file landing in a sibling PR (split the map entry across
the PRs); (b) **never judge a gate through a pipe** — `npm run verify | tail`
returns tail's exit code, which masked a real failure until the repo's own
Stop gate caught it. Check `$?` of the unpiped command.

## 2026-06-09 — M8 planned: CLI ships as a scoped npm package

**Context** — Kickoff currently requires clone + `npm install` + `npm link` —
the weakest part of the UX for the protected-new-builder audience. Planning
M8 surfaced that the unscoped npm name `claude-scaffold` is **already taken**
by an unrelated Claude Code tool (pyramidheadshark's, v2.7.x).

**Decision** — Three calls taken with the author: (1) publish as the scoped
**`@sjhennig/claude-scaffold`** — the binary stays `claude-scaffold` (bin
field ≠ package name); rejected: GitHub-only npx (slow, unversioned) and
hunting for a fresh unscoped name. (2) **Non-interactive mode is in scope** —
flags for every prompt + `--yes`, since the one-liner is the milestone's whole
point. (3) **CI-publish on `cli-vX.Y.Z` tags** (npm Trusted Publishing
preferred over a long-lived token), keeping the CLI version stream independent
of the plugin's `guardrails-v*` tags per the M7 decision. Plan with
workstreams and acceptance criteria: `docs/dev/m8-deployment-plan.md`.

**Consequences** — Users will see two similarly-named packages on npm; the
README must disambiguate. A pack test joins CI (the self-verification
philosophy applied to the tarball: prove the published artifact scaffolds, not
just the working tree). Bootstrap ordering matters as it did for
`guardrails-v1.0.0`, but reversed: that tag had to exist _before_ the pin
merged (downstream references it); the CLI tag comes _after_ the publish
workflow merges, because the tag is what fires it.

## 2026-06-09 — M7: tag-pinned plugin releases, starter skill, doctor

**Context** — M7 (design brief §3): distribute the plugin so generated projects
get a _tested_ version, seed the `skills/` slot, ship `doctor`. Two decisions
taken with the author; one merge-order trap discovered.

**Decision** — (1) **Tag scheme: `guardrails-vX.Y.Z`** (plugin-scoped), not
repo-wide `vX.Y.Z` — plugin releases stay independent of any future CLI/npm
versioning, which is the point of the CLI/plugin split. Generated projects pin
`ref: guardrails-v<version>`; the dogfood source stays unpinned (working tree).
(2) **Starter skill: `guardrails-help`** (chosen over spec-maintenance and
checkpoint candidates) — explains the five layers, diagnoses
hook/sandbox/plugin events, gives a relax-safely ladder; serves the protected
new-builder audience. (3) Release ritual + first-tag bootstrap (tag _before_
merging the pin — QC caught that pinning a nonexistent tag strands fresh
scaffolds) documented in `docs/specs/qc-agents.md` § Releasing.

**Consequences** — Plugin changes now reach downstream only via a release:
bump plugin.json + marketplace.json + `PINNED_PLUGIN_REF` (tests force
agreement), agent-smoke live, merge, tag the merge commit. The skill shipped
in `guardrails-v1.1.0` — content merged to main is invisible downstream until
tagged. Process lesson: **stacked PRs retarget to main only if the base branch
is deleted at merge** — #27 silently merged into its base branch and had to be
cherry-picked to main (#28); avoid stacking, or delete branches on merge.

## 2026-06-09 — `doctor`: warn/fail taxonomy and the side-effect exception

**Context** — M7's `claude-scaffold doctor` (design brief §3) checks machine +
config health in a scaffolded project. Two non-obvious calls needed making:
what counts as a _failure_ vs a _warning_, and how a command that inherently
probes the system squares with "side effects only in `src/index.js`".

**Decision** — (1) **Fail = the guardrails cannot work as configured** (no
Claude CLI, broken/missing settings.json, missing or non-executable hook
scripts, enablement that doesn't resolve, pinned tag absent from origin).
**Warn = degraded or unverifiable** (dormant sandbox, sandbox disabled,
offline so the tag can't be checked, Claude Code older than the tested
minimum). Offline is a warn because doctor must be honest without punishing
air-gapped use; a missing tag is a fail because plugin loading _will_ break.
(2) `src/doctor.js` keeps the repo's pure/impure split at a different joint:
`evaluate*` functions are pure (facts in, finding out — unit-testable like
template generators); I/O lives in `gatherHookStates`/`runDoctor` with an
**injectable, shell-free exec** (`execFileSync` argv arrays only — QC flagged
that interpolating settings.json values into a shell string was a command
injection, since doctor runs in untrusted clones). CLAUDE.md's convention line
now names the exception.

**Consequences** — Doctor exit codes are CI-usable (1 only on real breakage).
The shell-free rule is load-bearing: any future doctor check that shells out
must take argv arrays, never interpolated strings. The Claude Code minimum
(`CLAUDE_CODE_MIN_VERSION`) is a warn, not a fail, until a version range is
actually tested against — tightening it is future work, not config.

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
