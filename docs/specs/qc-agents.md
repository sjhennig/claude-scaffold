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
  "claude-scaffold": {
    "source": {
      "source": "github",
      "repo": "sjhennig/claude-scaffold",
      "ref": "guardrails-v1.1.0"
    }
  }
},
"enabledPlugins": { "claude-guardrails@claude-scaffold": true }
```

## Invariants & constraints

- **Reviewers are READ-ONLY.** No `Write`/`Edit`/`MultiEdit` in any reviewer's
  `tools` frontmatter. Tool allowlists stay narrow (`Read, Grep, Glob, Bash`).
- **One job each**, a precise `description` containing "use proactively", and a
  **structured return shape** so the main thread can act on the summary alone.
- **Model is chosen per agent by cost/reasoning profile**, not uniform. `/qc`
  fans out only the three reviewers (`code-reviewer`, `spec-reviewer`,
  `security-reviewer`); `test-runner` is invoked independently (proactively,
  to run the suite), never via `/qc`. The two deep reviewers (`code-reviewer`,
  `security-reviewer`) use `model: inherit` so they ride the session's frontier
  model at milestone reviews; the structured `spec-reviewer` is pinned to
  `sonnet` so a `/qc` on a frontier session doesn't burn it on the lighter
  reviewer, and the mechanical `test-runner` is pinned to `haiku` because it
  never needs frontier reasoning regardless of how it's invoked.
  `plugin.test.js` asserts each agent's expected model. The `/qc` cost note
  still steers heavy use to checkpoints, not every turn.
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
- **Enablement is necessary but no longer sufficient (Claude Code v2.1.195+):** a
  plugin enabled only via a project's `.claude/settings.json` from an external
  source (GitHub — what generated projects use — and empirically `directory`)
  **does not auto-load**; it must be installed (trust-time prompt, or
  `claude plugin install claude-guardrails@claude-scaffold`), and plugin agents
  are referenced by their **scoped** name (`claude-guardrails:code-reviewer`).
  So: the **devcontainer installs it automatically** (a non-fatal `claude plugin
install` in `postCreate`, owned by [[network-isolation]]); generated projects
  document the manual step for non-devcontainer users (README + CLAUDE.md); the
  `plugin-install` CI job (`plugin-install-test.mjs`) proves that install works
  headlessly against a generated project's GitHub-source settings; and
  `scripts/agent-smoke.mjs` installs the plugin + uses the scoped name before
  invoking. See [[cli-plugin-install-required]] and
  https://code.claude.com/docs/en/discover-plugins.md. (The dogfood below still
  loads because this repo's folder is already trusted/installed.)

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

## Releasing

Generated projects pin the marketplace to a **release tag** (M7): the GitHub
source carries `ref: PINNED_PLUGIN_REF` (`guardrails-v<version>`), so plugin
changes reach downstream projects only when a release is cut — never by merely
landing on `main`. The dogfood source stays unpinned (working tree) so this repo
always exercises the in-development plugin.

Three version strings must agree, enforced by `plugin.test.js`:
`plugin/.claude-plugin/plugin.json` `version`, the marketplace entry's
`version`, and `PINNED_PLUGIN_REF` in `src/templates/guardrails.js`. Bumping any
one forces the others in the same change.

To cut a release:

1. Bump `version` in `plugin.json` + `marketplace.json` and `PINNED_PLUGIN_REF`
   (one PR; tests fail until all three agree).
2. Get CI green **and** run the manual `agent-smoke` workflow_dispatch job (live
   subagent invocation) before merging.
3. Merge, then tag that merge commit:
   `git tag guardrails-v<version> && git push origin guardrails-v<version>`.
   The tag must point at a commit whose `plugin.json` carries the same version.

Until the tag is pushed, freshly generated projects reference a missing ref and
can't fetch the plugin — push the tag immediately after merging a version bump.

**Bootstrap caveat:** the ritual above triggers on a version _bump_, so the very
first pin (`guardrails-v1.0.0`, whose version already shipped unpinned in M6)
had no bumping PR to force tag creation. The tag was therefore created and
pushed _before_ merging the pin change, pointing at the M6 merge commit that
already carried `version: 1.0.0`. If the pin is ever rebuilt from scratch,
repeat that order: tag first, merge the pin second — QC caught this as the one
gap the version-agreement tests cannot see (they compare strings across files;
nothing keyless can check a tag exists on origin — `claude-scaffold doctor`
covers it at runtime instead).

## Open decisions

- _None outstanding._ (M6 resolved "ship as a plugin vs. committed files" — it
  ships as the `claude-guardrails` plugin.)
