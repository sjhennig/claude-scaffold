# Project Brief — claude-scaffold

## What It Does

A single CLI command that stands up a fresh project pre-configured for safe, high-autonomy Claude Code development. The generated project includes a devcontainer, five-layer guardrail system (sandbox, verification harness, deterministic hooks, scoped permissions, independent review), quality-control subagents, and a starter context network.

## Who It's For

Builders who use Claude Code as their primary development interface and want maximum autonomy without sacrificing safety. The defaults protect relatively new builders; experienced users can progressively relax constraints.

## Current State (v1)

- Scaffolds three framework templates: React+Vite+TS, Next.js+TS, Node+TS
- Generates devcontainer, basic Claude Code hooks, permissions, and context docs
- Interactive CLI via inquirer
- Tested with Vitest

## V2 Goals

1. **Five-layer guardrail system** installed by default in every generated project
2. **Versioned plugin** carrying subagents, skills, and slash commands (updateable independently of the scaffold)
3. **Self-verification suite** — the scaffold proves its own output works (generation, boot, and guardrail-fires tests)
4. **Framework-agnostic core** — guardrail layer is independent of framework templates
5. **Dogfooding** — this repo runs the same guardrails it emits

## Milestones

- **M0** ✅: Dogfood guardrails on this repo (devcontainer, hooks, permissions, sandbox, lint, CLAUDE.md)
- **M1** ✅: Core scaffold (framework-agnostic guardrail emission)
- **M2** ✅: Plugin with subagents (code-reviewer, spec-reviewer, test-runner, security-reviewer)
- **M3** ✅: Context network (docs templates, drift detection, NOTES.md convention)
- **M4** ✅: Self-verification suite in CI (generation content + boot-all-four + guardrail-fires; see `docs/specs/self-verification.md`)
- **M5** ✅: Closed the self-verification open decisions — migrated `nextjs-ts` off deprecated `next lint`, and split subagent-invocation coverage into always-on loadability proxies + an opt-in live smoke harness. (The four framework templates themselves shipped earlier and already boot in CI.)
- **M6** ✅: Versioned plugin (V2 goal #2) — the QC subagents + `/qc` now ship as the `claude-guardrails` plugin (repo-root marketplace; CLI emits only the `extraKnownMarketplaces`+`enabledPlugins` enablement), updateable independently of the scaffold. This repo dogfoods it via a local marketplace source. Self-verification extended with plugin loadability + enablement-resolution proxies. See `docs/specs/qc-agents.md`.
- **M7** ✅: Plugin distribution + skills — generated projects pin the marketplace to a `guardrails-v<version>` release tag (three-way version agreement enforced by tests; release ritual in `docs/specs/qc-agents.md` § Releasing); the plugin's `skills/` slot seeded with `guardrails-help` (on-demand guardrail explainer); `claude-scaffold doctor` checks Claude Code version, settings/hook/plugin health, pinned-tag existence, and sandbox honesty. Live agent-smoke proven in CI with the repo's `ANTHROPIC_API_KEY` secret. First releases: `guardrails-v1.0.0` (bootstrap pin), `guardrails-v1.1.0` (ships the skill).
- **M8** ✅: Deployment — kickoff is now `npx @sjhennig/claude-scaffold my-app --framework node-ts --yes` (scoped npm package, the unscoped name being taken by an unrelated tool; binary stays `claude-scaffold`). Non-interactive flag mode shares the prompts' validators so the two paths can't drift; a per-PR pack test proves the npm artifact itself scaffolds a verifying project by driving the installed bin; publishing is a `cli-vX.Y.Z` tag push (guards: tag = package.json version AND tagged commit on main), independent of the plugin's `guardrails-v*` stream. See `docs/specs/distribution.md`. First release: `cli-v1.0.0`.
- **M9** ✅: Devcontainer hardening — (1) fixed the node-owned npm-prefix bug so Claude Code can auto-update in-container (PR #40: both Dockerfiles install as `node` into `/usr/local/share/npm-global`, guarded by an ordering invariant + a `doctor` npm-prefix check); (2) adopted both divergences from Anthropic's reference devcontainer as opt-ins, complementary defenses against a malicious dependency postinstall. **Option B** — `--isolated-creds` / prompt swaps the host `~/.claude` bind-mount for a container-local named volume (default stays bind-mount). **Option A** — `--network-firewall` / prompt emits an `iptables`/`ipset` default-deny egress allowlist (`init-firewall.sh`, `NET_ADMIN`/`NET_RAW`, run on start, fails closed); it enforces even on Docker Desktop's LinuxKit VM where the bwrap sandbox is dormant, and the `SessionStart` preflight is firewall-aware. Neither is an unconditional default (re-auth friction / allowlist-breakage risk). `network-isolation` is now a registered subsystem; see `docs/specs/network-isolation.md` and `docs/sandbox.md`.

## Out of Scope

- Languages beyond JavaScript/TypeScript
- Enterprise/managed-settings deployment
- Agent-teams orchestration
- GUI or web interface
