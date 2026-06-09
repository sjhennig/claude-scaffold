---
name: guardrails-help
description: Use when the user asks how this project's guardrails work, why a command or edit was blocked, why a sandbox warning appeared at session start, why the session will not end (verify gate), how to safely relax or tighten a guardrail, or why /qc and the QC reviewers are missing.
---

# Guardrails Help

This project was scaffolded with a five-layer guardrail system. This skill
explains what each layer does, how to diagnose it when it fires, and how to
relax it deliberately instead of disabling it in frustration.

## The five layers

| #   | Layer               | Where it lives                                         | What it does                                                         |
| --- | ------------------- | ------------------------------------------------------ | -------------------------------------------------------------------- |
| 1   | Sandbox/container   | `.claude/settings.json` `sandbox` + devcontainer       | OS-level filesystem/network allowlist around every Bash command      |
| 2   | Verification        | `npm run verify` (package.json)                        | format check + lint (+ typecheck) + tests — the project's truth test |
| 3   | Deterministic hooks | `.claude/settings.json` `hooks` + `.claude/hooks/*.sh` | Block dangerous commands, auto-format edits, gate turn-end on verify |
| 4   | Scoped permissions  | `.claude/settings.json` `permissions`                  | Allowlist of safe commands; secrets and `sudo` denied; push prompted |
| 5   | Independent review  | `claude-guardrails` plugin (`/qc`, QC subagents)       | Fresh-context reviewers check diffs at checkpoints                   |

The layers are independent on purpose: relaxing one does not silently weaken
the others.

## Diagnosing common events

**"Sandbox preflight" warning at session start.** The settings enable Claude
Code's bubblewrap sandbox, but the kernel can't create unprivileged user
namespaces (typical on Docker Desktop's LinuxKit VM). The sandbox is dormant;
the devcontainer is the real boundary. Either enable user namespaces for the
container, or set `sandbox.enabled: false` so config matches reality. Don't
ignore it indefinitely — an enabled-but-inert sandbox breeds false confidence.

**A Bash command was blocked with a reason (exit 2).** The `PreToolUse` hook
(`.claude/hooks/validate-command.sh`) keeps a short, legible denylist —
recursive root deletes, force-push, and similar. Read the script before
changing it; if a legitimate command is caught, narrow the pattern rather than
deleting the rule.

**The session won't end / Claude keeps working.** The `Stop` hook
(`.claude/hooks/verify-gate.sh`) blocks turn-end until `npm run verify`
passes. That is the core guarantee: work isn't "done" until the project's own
checks say so. Fix the failure it reports. It releases itself on the
`MAX_ATTEMPTS`th consecutive failed verify run, so it can never deadlock a
session.

**Files get reformatted right after an edit.** The `PostToolUse` hook runs
Prettier on every written file. It never blocks the edit; it only normalizes
formatting so diffs stay clean.

**`/qc` or the QC reviewers are missing.** They ship in the
`claude-guardrails` plugin, fetched from the marketplace pinned in
`.claude/settings.json` (`extraKnownMarketplaces`, pinned to a
`guardrails-v<version>` release tag). First load needs network access to fetch
it; run `/plugin` to inspect marketplace and plugin state. If the pinned tag
can't be fetched, check that the machine can reach github.com and that the
`enabledPlugins` entry is still `"claude-guardrails@claude-scaffold": true`.

## Relaxing guardrails safely

Work down this ladder; stop at the first rung that solves the problem.

1. **Add a narrow allow rule** — `Bash(npm run e2e:*)` beats `Bash(npm *)`,
   which beats allowing all Bash. Put it in `permissions.allow`.
2. **Widen the sandbox, not the permissions** — if a tool needs a new domain,
   add it to `sandbox.network.allowedDomains` instead of disabling the sandbox.
3. **Tune a hook before removing it** — the validator's denylist and the
   verify gate's attempt cap are plain variables at the top of each script.
4. **Never** set `bypassPermissions`, allowlist `git push`/deploy commands, or
   grant access to `~/.ssh`, `~/.aws`, or `.env*` files. Outbound and
   irreversible actions stay prompted by design; secrets stay unreadable.

Tightening goes the same way in reverse: move commands from allow to ask,
add deny rules, or register subsystems in the drift map so spec rot warns at
session start.

## Cost note

The `/qc` reviewers run in fresh contexts and can cost several times a normal
turn. Use them at checkpoints (pre-commit, end of a feature), not on every
change — that is also when their fresh perspective is most valuable.
