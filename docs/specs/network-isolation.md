# Network Isolation & Credential Handling — Findings Spec

<!--
FINDINGS / FUTURE-WORK doc, not yet a live subsystem. It captures two
divergences between this project's devcontainer and Anthropic's reference
devcontainer (anthropics/claude-code/.devcontainer), surfaced while fixing the
npm-prefix auto-update bug (NOTES.md 2026-06-30). Nothing here is implemented
yet — it exists so the author can evaluate and tackle these after confirming the
prefix fix. NOT registered in subsystem-map.json (no owning source files until
one of these is adopted). Promote the relevant section into a real subsystem
spec + NOTES decision if/when implemented.
-->

## Purpose

Compare the reference devcontainer's two network/credential choices against
ours, so adopting (or consciously rejecting) them is a deliberate decision
rather than drift. Scope: container-level network egress control and how Claude
Code's credentials reach the container. Out of scope: the per-command Claude
Code `sandbox` itself (covered by `docs/sandbox.md`) and the npm-prefix fix
(done; NOTES.md 2026-06-30).

## Background: what the reference does that we don't

Verified against `anthropics/claude-code/.devcontainer` (`Dockerfile` +
`devcontainer.json`):

1. **Network-egress firewall.** Installs `iptables ipset iproute2 dnsutils
aggregate`, copies an `init-firewall.sh` to `/usr/local/bin`, grants the
   `node` user passwordless sudo for **only** that script, and runs it on every
   start:
   - `devcontainer.json`: `"runArgs": ["--cap-add=NET_ADMIN", "--cap-add=NET_RAW"]`
     and `"postStartCommand": "sudo /usr/local/bin/init-firewall.sh"`.
   - The script builds an `ipset` allowlist (GitHub CIDR ranges fetched from
     `api.github.com/meta`, the npm registry, the Anthropic API, plus DNS and
     localhost), sets the default egress policy to **DROP**, and then _verifies_
     the policy (a blocked host fails, an allowed host succeeds — it `exit 1`s
     if either assertion is wrong).
2. **Credentials via a named volume.** Mounts
   `claude-code-config-${devcontainerId}` → `/home/node/.claude` as a
   `type=volume`. Host `~/.claude` is **never** exposed to the container; the
   container keeps its own persisted Claude config and you authenticate inside
   it once.

Our current equivalents:

- **Network:** we rely on Claude Code's `sandbox` (bubblewrap per-command
  allowlist) instead of a container firewall. Per `docs/sandbox.md` and the
  `SessionStart` preflight hook, that layer is **dormant on Docker Desktop's
  LinuxKit VM** (no unprivileged user namespaces), so on macOS/Windows there is
  currently **no enforced network boundary** below the VM.
- **Credentials:** `generateDevcontainerJson()` in
  `src/templates/devcontainer.js` **bind-mounts host `~/.claude`** read-write
  (`source=${localEnv:HOME}/.claude,target=/home/node/.claude,type=bind`), with
  a documented trade-off comment.

## Option A — Network-egress firewall

### What it would add

- **`src/templates/devcontainer.js`**
  - `generateDockerfile()`: add `iptables ipset iproute2 dnsutils` to the apt
    line; `COPY` an `init-firewall.sh` into the image (new template file or an
    emitted hook); narrow the sudoers grant to _just_ that script instead of the
    current blanket `NOPASSWD:ALL` (see Interaction below).
  - `generateDevcontainerJson()`: add `runArgs: ["--cap-add=NET_ADMIN",
"--cap-add=NET_RAW"]` and a `postStartCommand` (or fold into
    `postCreateCommand`) that runs the script.
- **A new `init-firewall.sh` generator** + colocated test, plus a behavioral
  test in the `*.fires.test.js` style if feasible (assert default-DROP and that
  the allowlist verification block is present).
- **`.devcontainer/`** (repo dogfood): mirror the above so the loose-invariant
  test in `devcontainer.test.js` stays satisfied.

### Findings & trade-offs

- **It works where the sandbox doesn't.** `NET_ADMIN`/`iptables` operate at the
  container's network namespace and do **not** need unprivileged user
  namespaces, so unlike the bubblewrap sandbox this _is_ enforced on Docker
  Desktop / LinuxKit. This is the strongest argument for adopting it: it closes
  the exact macOS/Windows gap the preflight currently just warns about.
- **It's a second, overlapping boundary, not a replacement.** The firewall is
  coarse (per-container egress CIDR allowlist, evaluated once at start); the
  Claude Code sandbox is fine (per-command, host-aware). They're complementary —
  adopting the firewall doesn't let us drop the sandbox config, and we'd need to
  reconcile the honesty message in the preflight hook so it doesn't imply "no
  boundary" when a firewall is actually active.
- **Allowlist maintenance is real.** The reference fetches GitHub ranges at
  runtime and hardcodes npm/Anthropic endpoints. Our generated projects pull
  from additional hosts (the plugin marketplace via GitHub, framework
  registries). A too-tight default would break `npm install` /
  plugin-resolution inside the container; the allowlist must cover at minimum:
  the npm registry, `github.com` + the GitHub API/CDN ranges, and the Anthropic
  API. This is a default that protects only if it's kept current — otherwise it
  becomes either a footgun (blocks legit traffic) or wallpaper (widened until
  meaningless).
- **`--cap-add` is a host/runtime concession.** `NET_ADMIN`/`NET_RAW` raise the
  container's capabilities; acceptable for a dev container, but worth stating
  explicitly in the trust-model docs (`docs/sandbox.md` § trust model).
- **Interaction with sudo.** Our Dockerfile currently grants `node` blanket
  passwordless sudo (with `Bash(sudo:*)` denied to the agent in settings). The
  reference narrows sudo to _only_ `init-firewall.sh`. If we adopt the firewall
  we should consider narrowing too — but note that today's blanket grant exists
  for human dev convenience (ad-hoc `apt-get`), so this is a separate trade-off,
  not a freebie.

### Recommendation

Worth adopting **as an opt-in**, not an unconditional default — gated behind a
prompt/flag (e.g. `--network-firewall`) or emitted-but-documented, mirroring how
the sandbox advanced opt-in is handled. Rationale: it's the only option that
restores a real network boundary on the most common host (Docker Desktop), but a
mis-scoped allowlist breaks installs, so it should be a conscious choice with the
allowlist surfaced for editing. If adopted, update `docs/sandbox.md` (it becomes
part of the layer model) and the preflight message.

## Option B — Credentials via named volume instead of host bind-mount

### What it would change

- **`src/templates/devcontainer.js`** `generateDevcontainerJson()`: replace the
  host bind-mount
  `source=${localEnv:HOME}/.claude,target=/home/node/.claude,type=bind`
  with a named volume
  `source=claude-config-${devcontainerId},target=/home/node/.claude,type=volume`.
- Update the accompanying mount comment and `devcontainer.test.js`'s
  "includes the Claude auth bind mount" assertion (it currently asserts the bind
  shape explicitly).

### Findings & trade-offs

- **Security win:** dependency install scripts / any code in the container can no
  longer read or write the **host's** `~/.claude` credentials — the blast radius
  of a malicious postinstall shrinks to a container-local volume. This directly
  addresses the residual risk our own Dockerfile comment and `docs/sandbox.md`
  call out.
- **UX cost:** you must authenticate Claude Code **inside** the container the
  first time (and once per fresh `devcontainerId`). The current bind-mount's
  whole appeal is zero re-auth. For users who live in one rebuilt-often
  container this is mild; for throwaway containers it's friction.
- **Not a clean swap for everyone.** Some workflows rely on host-side `~/.claude`
  (settings, history, MCP config) being the single source of truth. A named
  volume forks that. Consider whether to persist _config_ but not _credentials_,
  or to offer both as a prompt.

### Recommendation

Offer as a **prompt/flag choice** (`host-bind` vs `isolated-volume`) defaulting
to the current bind-mount for continuity, with the isolated volume documented as
the higher-security option. The two are a clean either/or in the same mount
slot, so this is the cheaper of the two options to implement and the easiest to
make a user decision rather than a hardcoded one.

## Open decisions

- Firewall as opt-in flag vs. always-on default — leaning opt-in (allowlist
  breakage risk). Decide the flag/prompt surface alongside the existing sandbox
  opt-in.
- Whether adopting the firewall should also narrow the `node` sudoers grant to
  just the firewall script (couples to the human-dev-sudo convenience trade-off).
- Allowlist contents + refresh strategy (runtime fetch of GitHub ranges vs.
  pinned CIDRs) — must cover npm registry, GitHub (incl. plugin marketplace),
  and the Anthropic API or it breaks generated-project bootstrap.
- Credentials: bind-mount default with volume opt-in, vs. splitting persisted
  _config_ from _credentials_.
- If either ships, fold it into `docs/sandbox.md`'s layer model, add a NOTES.md
  decision entry, and register the new owning files in
  `docs/specs/subsystem-map.json`.
