# QC Subagents Spec

<!--
Living doc — update this whenever the plugin's emitted subagents, the /qc
command, or the enablement wiring change. Registered in
docs/specs/subsystem-map.json so the drift hook watches the plugin files +
manifests.
-->

## Purpose

Layer 5 of the guardrail model (independent review): the quality-control
subagents and the `/qc` checkpoint command every scaffolded project receives.

As of M6 these ship as a **versioned Claude Code plugin**, `claude-guardrails`,
rather than as CLI-emitted `.claude/agents/` files — so the reviewers can be
fixed and improved independently of the scaffold (design brief §3). The plugin
markdown is the **source of truth**, edited directly. The CLI emits only the
_enablement_ (an `extraKnownMarketplaces` + `enabledPlugins` block in
`.claude/settings.json`, owned by [[guardrails]]). This repo dogfoods the same
plugin via a local marketplace source — see "Dogfooding" below.

## Owning files

- `plugin/.claude-plugin/plugin.json` — the plugin manifest (`name`, `version`,
  `description`, author, …). `name: claude-guardrails`.
- `.claude-plugin/marketplace.json` (repo root) — the `claude-scaffold`
  marketplace listing the plugin with `source: ./plugin`.
- `plugin/agents/{code-reviewer,spec-reviewer,test-runner,security-reviewer}.md`
  — the four read-only QC subagents.
- `plugin/commands/qc.md` — the `/qc` checkpoint command.
- `plugin/skills/guardrails-help/SKILL.md` — starter skill (M7): explains the
  five guardrail layers, diagnoses hook/sandbox/plugin events, and gives a
  relax-safely ladder. Loaded on demand via its `description` (leanness budget:
  nothing preloaded).

The enablement (which marketplace, which plugin id, GitHub source for generated
projects vs. local source for this repo) lives in
`src/templates/guardrails.js::generateClaudeSettings` — see [[guardrails]].

## Layout (Claude Code plugin format)

```
plugin/
  .claude-plugin/
    plugin.json          # manifest — ONLY this goes under .claude-plugin/
  agents/                # subagents at the plugin ROOT, not under .claude-plugin/
  commands/              # /qc lives here
  skills/                # skills/<name>/SKILL.md — also at the plugin ROOT
.claude-plugin/
  marketplace.json       # repo-root marketplace; source: "./plugin"
```

Enablement the CLI emits (generated projects get the GitHub source; this repo
uses a local `directory` source):

```json
"extraKnownMarketplaces": {
  "claude-scaffold": { "source": { "source": "github", "repo": "sjhennig/claude-scaffold" } }
},
"enabledPlugins": { "claude-guardrails@claude-scaffold": true }
```

## Invariants & constraints

- **Reviewers are READ-ONLY.** No `Write`/`Edit`/`MultiEdit` in any reviewer's
  `tools` frontmatter. Tool allowlists stay narrow (`Read, Grep, Glob, Bash`).
- **One job each**, a precise `description` containing "use proactively", and a
  **structured return shape** so the main thread can act on the summary alone.
- `model: inherit` on every agent; the cost note in `/qc` (and CLAUDE.md) steers
  heavy use to checkpoints, not every turn.
- **No `hooks`/`mcpServers`/`permissionMode` frontmatter** — these are _ignored_
  for plugin-loaded agents, so that behavior must live in `.claude/settings.json`
  (the [[guardrails]] layer), never in the plugin.
- **Components live at the plugin root** (`agents/`, `commands/`, `skills/`),
  never under `.claude-plugin/` (only `plugin.json` goes there) — a
  misplacement makes Claude Code silently skip them.
- **Enablement must resolve:** the `enabledPlugins` id the CLI emits
  (`claude-guardrails@claude-scaffold`) must split into a marketplace name
  present in `extraKnownMarketplaces` and a plugin name equal to the marketplace
  entry's name and the manifest's `name`. `plugin.test.js` asserts this.

## Dogfooding

This repo hosts the plugin, so its committed `.claude/settings.json` enables it
via a local `directory` marketplace source (`{ source: "directory", path: "." }`)
— pointing Claude Code at the working-tree `plugin/`, so `/qc` here exercises the
in-development plugin. Generated projects instead get the default GitHub source.
The only difference between the two is the marketplace _address_; the plugin
content is identical. `guardrails.test.js` asserts this repo's settings match
`generateClaudeSettings({ marketplaceSource: LOCAL_MARKETPLACE_SOURCE })`.

## Edge cases

- **No governing spec:** the spec-reviewer must say so and stop — it must not
  invent requirements.
- **Living-docs drift:** the spec-reviewer also checks `docs/specs/subsystem-map.json`
  — if a changed file is owned by a mapped subsystem whose spec did not change,
  it reports the stale spec as a gap (complements the SessionStart drift hook by
  catching drift at review time, before the change lands).
- **No changes in the diff:** `/qc` reports that and stops.
- **Marketplace unreachable:** generated projects load reviewers from the
  marketplace, so an offline/air-gapped clone without the marketplace cached
  won't have `/qc` until it can fetch the plugin. Accepted trade for
  update-independence (design brief §3); the repo's own local source sidesteps
  it for dogfooding.

## Known gaps (tracked for M7)

- **The GitHub marketplace source is unpinned** (`GITHUB_MARKETPLACE_SOURCE` has
  no `ref`). Generated projects therefore float to the repo's default-branch
  HEAD: anyone who can push to `main` ships new subagent instructions and tool
  grants into every downstream project on its next plugin sync. M6 ships it this
  way on purpose — there is no release tag yet, and pinning to a non-existent tag
  would break plugin loading. M7 (marketplace publish/pin) must add a `ref`
  pinned to a tag matching the plugin's `version`, so updates become a deliberate
  bump rather than an implicit HEAD-follow. Until then, the trust boundary is the
  scaffold repo's push access.

## Open decisions

- _None outstanding._ (M6 resolved "ship as a plugin vs. committed files" — it
  ships as the `claude-guardrails` plugin.)
