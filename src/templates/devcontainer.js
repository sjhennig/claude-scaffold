/**
 * Generates .devcontainer/Dockerfile and .devcontainer/devcontainer.json
 */

import { PLUGIN_ID } from './guardrails.js';

export function generateDockerfile(config = {}) {
  // Opt-in network-egress firewall (M9 Option A; docs/specs/network-isolation.md):
  // extra packages for the iptables/ipset allowlist, plus the script copied into
  // the image and run on start via devcontainer.json's postStartCommand.
  const firewallPackages = config.networkFirewall
    ? `    iptables \\
    ipset \\
    iproute2 \\
    dnsutils \\
    aggregate \\
`
    : '';
  const firewallCopy = config.networkFirewall
    ? `
# Network-egress firewall (opt-in): the allowlist script, run via sudo on every
# container start (see devcontainer.json postStartCommand). Owned by root and not
# writable by node, so a compromised dependency can't edit it — and node's sudo
# is narrowed to ONLY this script (below) so that dependency can't flush the
# allowlist either.
COPY init-firewall.sh /usr/local/bin/init-firewall.sh
RUN chmod 0755 /usr/local/bin/init-firewall.sh
`
    : '';

  // Sudo for the node user. Default is blanket passwordless sudo (dev
  // convenience). With the firewall on we NARROW it to just the firewall script:
  // otherwise a dependency postinstall running as node could \`sudo iptables -F\`
  // and tear down the very egress allowlist the firewall exists to enforce.
  // Claude itself is denied sudo via \`Bash(sudo:*)\` in settings either way.
  const sudoersBlock = config.networkFirewall
    ? `# Network firewall enabled: node's sudo is narrowed to ONLY the firewall script,
# so in-container code (e.g. a malicious dependency postinstall running as node)
# cannot flush the egress allowlist. This intentionally drops blanket dev sudo;
# re-add "node ALL=(ALL) NOPASSWD:ALL" if you need ad-hoc apt-get, accepting that
# it also lets in-container code disable the firewall.
RUN echo "node ALL=(ALL) NOPASSWD: /usr/local/bin/init-firewall.sh" > /etc/sudoers.d/node`
    : `# Passwordless sudo for the human developer (e.g. ad-hoc apt-get installs while
# iterating in the container). Claude itself cannot escalate: \`Bash(sudo:*)\` is
# in the permissions deny-list in .claude/settings.json, so the agent is blocked
# from sudo regardless. Residual risk: dependency code — an \`npm install\`
# postinstall script (run by postCreateCommand) executes as the node user and
# can use this grant to reach root *inside the container*. The container is not a
# boundary against malicious deps; pin/vet dependencies and rely on CI's
# dependency review. Remove this line if you don't need dev sudo.
RUN echo "node ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers.d/node`;

  return `FROM node:20-bookworm-slim

# Core dev tools for CLI productivity inside the container.
# ca-certificates first: the slim base omits it, which breaks HTTPS for git,
# curl, and the github-cli devcontainer feature's keyring fetch.
RUN apt-get update && apt-get install -y \\
    ca-certificates \\
    git \\
    curl \\
    ripgrep \\
    fd-find \\
    jq \\
    tree \\
    bat \\
    zsh \\
    python3 \\
    sudo \\
    bubblewrap \\
    socat \\
${firewallPackages}    && rm -rf /var/lib/apt/lists/*
${firewallCopy}
${sudoersBlock}

# Give the node user a writable global npm prefix. The default prefix in this
# image is the root-owned /usr/local, so a root-level \`npm install -g\` leaves
# Claude Code's files unwritable by the node user — and its in-container
# auto-updater (which runs as node) then fails with "no write permission to npm
# prefix". A node-owned prefix lets the first install and every self-update write.
RUN mkdir -p /usr/local/share/npm-global \\
    && chown -R node:node /usr/local/share
ENV NPM_CONFIG_PREFIX=/usr/local/share/npm-global
ENV PATH=$PATH:/usr/local/share/npm-global/bin

# Persist bash history across container rebuilds via a named volume
RUN mkdir -p /home/node/.bash_history_dir && chown node:node /home/node/.bash_history_dir

USER node

# Pre-install Claude Code as node (into the node-owned prefix above) so it's
# available immediately on container start AND can auto-update in place.
RUN npm install -g @anthropic-ai/claude-code

WORKDIR /workspace
`;
}

export function generateDevcontainerJson(config) {
  const devcontainer = {
    name: config.projectName,
    build: {
      dockerfile: 'Dockerfile',
    },
    // No dev server (e.g. the no-framework option) → nothing to forward.
    ...(config.devPort ? { forwardPorts: [config.devPort] } : {}),
    customizations: {
      vscode: {
        extensions: [
          'anthropic.claude-code',
          'dbaeumer.vscode-eslint',
          'esbenp.prettier-vscode',
          'eamodio.gitlens',
        ],
        settings: {
          'editor.formatOnSave': true,
          'editor.defaultFormatter': 'esbenp.prettier-vscode',
          'editor.tabSize': 2,
        },
      },
    },
    mounts: [
      // Claude credentials/config mount (M9 Option B; see
      // docs/specs/network-isolation.md).
      config.isolatedCredentials
        ? // Isolated: a container-local named volume (keyed by devcontainerId)
          // holds Claude's config + auth. The host ~/.claude is NEVER exposed, so
          // a malicious dependency postinstall can't read or write your real
          // credentials — at the cost of authenticating inside the container once
          // per devcontainerId.
          'source=claude-config-${devcontainerId},target=/home/node/.claude,type=volume'
        : // Shared host auth (default): bind-mount host ~/.claude so you don't
          // re-authenticate inside the container. NOTE: this exposes your host
          // credentials (read-write) to anything in the container, including
          // dependency install scripts. Scaffold with --isolated-creds (or pick
          // the prompt) for the higher-security named-volume option above.
          'source=${localEnv:HOME}/.claude,target=/home/node/.claude,type=bind',
      // Persist bash history across container rebuilds
      'source=claude-scaffold-bashhistory,target=/home/node/.bash_history_dir,type=volume',
    ],
    // Network-egress firewall (opt-in; M9 Option A). NET_ADMIN/NET_RAW let the
    // container manage its own iptables/ipset rules — these work even where the
    // bwrap sandbox can't (no unprivileged user namespaces, e.g. Docker
    // Desktop's LinuxKit VM), so this restores a real egress boundary there.
    // The script fails closed: a too-tight allowlist surfaces at container start
    // rather than silently. It runs on every start (postStartCommand) AND ahead
    // of the initial `npm install` (postCreateCommand below), so even the first
    // dependency install — the prime spot for a malicious postinstall — is
    // firewalled. (The allowlist already permits the npm registry.)
    ...(config.networkFirewall
      ? {
          runArgs: ['--cap-add=NET_ADMIN', '--cap-add=NET_RAW'],
          postStartCommand: 'sudo /usr/local/bin/init-firewall.sh',
        }
      : {}),
    features: {
      'ghcr.io/devcontainers/features/github-cli:1': {},
    },
    // Ordered postCreate: (firewall up first, if enabled) → install deps →
    // install the guardrails plugin. As of Claude Code v2.1.195 a plugin merely
    // *enabled* in settings.json from an external marketplace no longer
    // auto-loads — it must be installed — so we do it here to keep the
    // devcontainer's /qc + QC reviewers working without a manual step. The
    // install is NON-FATAL (`|| echo …`): a transient network/trust hiccup must
    // not fail postCreate and brick the container; the README documents the
    // manual `claude plugin install` as the fallback.
    postCreateCommand: [
      config.networkFirewall ? 'sudo /usr/local/bin/init-firewall.sh' : null,
      'npm install',
      `(claude plugin install ${PLUGIN_ID} || echo 'guardrails plugin auto-install failed — see README for the manual claude plugin install step')`,
    ]
      .filter(Boolean)
      .join(' && '),
    remoteUser: 'node',
  };

  return JSON.stringify(devcontainer, null, 2) + '\n';
}

// .devcontainer/init-firewall.sh — the opt-in network-egress allowlist (M9
// Option A; emitted only when config.networkFirewall, run as root by
// postStartCommand). Default egress policy is DROP; only DNS, localhost, the
// host/LAN, the GitHub IP ranges (covers github.com, the API/CDN, and the
// plugin marketplace), the npm registry, and the Anthropic endpoints Claude
// Code needs are allowed out. It FAILS CLOSED: a misbuilt allowlist makes the
// verification block exit non-zero, surfacing the breakage at container start
// instead of letting an inert firewall look active.
//
// Maintaining the allowlist is real work — too tight and `npm install` /
// plugin-resolution break; widen the ALLOWED_DOMAINS list below for registries
// or CDNs your project pulls from.
export function generateInitFirewallScript() {
  return `#!/usr/bin/env bash
# Network-egress firewall — build an iptables/ipset allowlist and default-DROP
# everything else. Run as root on container start (devcontainer.json
# postStartCommand: "sudo /usr/local/bin/init-firewall.sh"). Requires the
# NET_ADMIN/NET_RAW caps the devcontainer adds via runArgs.
#
# Unlike the bwrap sandbox, this operates in the container's *network* namespace
# and needs no unprivileged user namespaces, so it enforces even on Docker
# Desktop's LinuxKit VM. See docs/specs/network-isolation.md and docs/sandbox.md.
set -euo pipefail
IFS=$'\\n\\t'

# Fail closed: if anything below aborts (a failed GitHub fetch, a DNS miss, or
# any other error under \`set -e\`), force a default-DROP so a setup failure leaves
# the container with essentially NO egress rather than wide open. ("Closed" here
# means the DROP policy plus whatever ACCEPT rules were already installed before
# the abort — loopback, DNS to the resolver, and the host/LAN /24 — not an
# absolute blackhole; those keep the dev session alive.) The DROP policies are
# applied only at the very end on the happy path, so without this an early exit
# would leave OUTPUT at its default ACCEPT. On success (exit 0) this is a no-op.
firewall_fail_closed() {
  local rc=$?
  [ "$rc" -eq 0 ] && return 0
  echo "init-firewall: setup failed (exit $rc) — forcing default-DROP, no egress" >&2
  iptables -P INPUT DROP 2>/dev/null || true
  iptables -P OUTPUT DROP 2>/dev/null || true
  iptables -P FORWARD DROP 2>/dev/null || true
  if command -v ip6tables >/dev/null 2>&1; then
    ip6tables -P INPUT DROP 2>/dev/null || true
    ip6tables -P OUTPUT DROP 2>/dev/null || true
    ip6tables -P FORWARD DROP 2>/dev/null || true
  fi
}
trap firewall_fail_closed EXIT

# Domains allowed out (besides the GitHub IP ranges fetched below). Add the
# registries/CDNs your project needs here — too tight and installs break.
#
# NOTE: each domain is resolved to its A records ONCE, here at container start,
# and those specific IPs are pinned into the ipset. For CDN-fronted hosts
# (registry.npmjs.org, api.anthropic.com, sentry.io) the published IPs rotate on
# short TTLs, so a long-running session can see later egress to an already
# "allowlisted" domain get dropped once its IP changes. The remedy is to re-run
# the script:  sudo /usr/local/bin/init-firewall.sh
ALLOWED_DOMAINS=(
  registry.npmjs.org
  api.anthropic.com
  statsig.anthropic.com
  sentry.io            # Claude Code error reporting
)

echo "init-firewall: resetting rules..."
iptables -F
iptables -X
# Restore default-ACCEPT policies for the setup phase. \`iptables -F\` clears the
# RULES but NOT the chain policies, so on any run where the policy is already
# DROP — a re-run inside a live container (the documented remedy for CDN IP
# rotation) OR the postStartCommand pass that runs right after postCreateCommand
# on first creation — this script's own DNS/GitHub setup traffic would be dropped
# and it would fail closed on itself. Reset to ACCEPT here; the fail-closed trap
# and the happy-path end both re-establish DROP. (Tradeoff: during an explicit
# mid-session re-run egress is briefly open while the allowlist is rebuilt — the
# pragmatic alternative to an atomic temp-chain swap.)
iptables -P INPUT ACCEPT
iptables -P OUTPUT ACCEPT
iptables -P FORWARD ACCEPT
if command -v ip6tables >/dev/null 2>&1; then
  ip6tables -P INPUT ACCEPT 2>/dev/null || true
  ip6tables -P OUTPUT ACCEPT 2>/dev/null || true
  ip6tables -P FORWARD ACCEPT 2>/dev/null || true
fi
# Deliberately do NOT flush the nat/mangle tables. This script only ever adds
# *filter*-table rules and an ipset, so there is nothing of ours to reset there
# — and flushing nat would destroy Docker's embedded-DNS redirect (127.0.0.11:53
# -> the resolver's ephemeral port), after which every \`dig\` below fails and the
# whole script fails closed. \`iptables -F\` (no -t) touches only the filter table,
# which is exactly what we want.
ipset destroy allowed-domains 2>/dev/null || true

# Loopback first (covers Docker's embedded DNS at 127.0.0.11).
iptables -A INPUT -i lo -j ACCEPT
iptables -A OUTPUT -o lo -j ACCEPT

# DNS only to the configured resolver(s), not the whole internet — a blanket
# "allow port 53 anywhere" is an open DNS-tunnel exfiltration channel. Fall back
# to broad DNS only if no IPv4 nameserver is listed (e.g. embedded DNS, already
# covered by loopback above).
resolvers="$(awk '/^nameserver/ {print $2}' /etc/resolv.conf 2>/dev/null | grep -E '^[0-9]+\\.' || true)"
if [ -n "$resolvers" ]; then
  while read -r ns; do
    [ -z "$ns" ] && continue
    iptables -A OUTPUT -p udp -d "$ns" --dport 53 -j ACCEPT
    iptables -A OUTPUT -p tcp -d "$ns" --dport 53 -j ACCEPT
  done <<< "$resolvers"
else
  iptables -A OUTPUT -p udp --dport 53 -j ACCEPT
  iptables -A OUTPUT -p tcp --dport 53 -j ACCEPT
fi

# Allow the host/LAN (default-route subnet) so the VS Code server, port
# forwarding, and devcontainer tooling keep working. Installed BEFORE the
# network-dependent GitHub/allowlist steps below, so that if one of those aborts
# the fail-closed trap won't also sever the developer's connection to the
# container. /24 is a pragmatic assumption for the Docker bridge gateway subnet.
host_ip="$(ip route show default | awk '/default/ {print $3; exit}')"
if [ -n "\${host_ip:-}" ]; then
  host_net="$(echo "$host_ip" | sed 's/\\.[0-9]*$/.0\\/24/')"
  iptables -A INPUT -s "$host_net" -j ACCEPT
  iptables -A OUTPUT -d "$host_net" -j ACCEPT
fi

ipset create allowed-domains hash:net

# GitHub publishes its IP ranges; allow web+api+git (covers github.com, the API,
# codeload, and the plugin marketplace's release tarballs). \`aggregate\` merges
# the CIDRs when present; fall back to the raw list if it isn't installed.
echo "init-firewall: fetching GitHub IP ranges..."
gh_ranges="$(curl -fsSL --connect-timeout 10 https://api.github.com/meta)"
if [ -z "$gh_ranges" ] || ! echo "$gh_ranges" | jq -e '.web and .api and .git' >/dev/null 2>&1; then
  echo "init-firewall: ERROR — could not fetch a valid GitHub meta response" >&2
  exit 1
fi
if command -v aggregate >/dev/null 2>&1; then
  gh_cidrs="$(echo "$gh_ranges" | jq -r '(.web + .api + .git)[]' | grep -E '^[0-9]+\\.' | aggregate -q)"
else
  gh_cidrs="$(echo "$gh_ranges" | jq -r '(.web + .api + .git)[]' | grep -E '^[0-9]+\\.' | sort -u)"
fi
while read -r cidr; do
  [ -z "$cidr" ] && continue
  ipset add allowed-domains "$cidr" 2>/dev/null || true
done <<< "$gh_cidrs"

# Resolve each allowed domain to its current A records and allow them. A domain
# that doesn't resolve is a WARNING, not fatal: one transiently-unresolvable (or
# IPv6-only, or telemetry) entry must not fail the whole firewall closed and
# brick every egress — the container would lose the VS Code session over a single
# flaky optional host. We allowlist what resolves and deny the rest; egress to a
# skipped domain simply gets the default-DROP (surfacing as a normal connection
# error for that one service). Core integrity is still guarded by the GitHub-meta
# fetch above (fatal) and the example.com/api.github.com verify below (fatal).
for domain in "\${ALLOWED_DOMAINS[@]}"; do
  echo "init-firewall: resolving $domain..."
  ips="$(dig +short A "$domain" | grep -E '^[0-9]+\\.' || true)"
  if [ -z "$ips" ]; then
    echo "init-firewall: WARNING — could not resolve $domain; skipping (egress to it will be denied)" >&2
    continue
  fi
  while read -r ip; do
    [ -z "$ip" ] && continue
    ipset add allowed-domains "$ip" 2>/dev/null || true
  done <<< "$ips"
done

# Default DROP, then allow established/related and the allowlist set.
iptables -P INPUT DROP
iptables -P FORWARD DROP
iptables -P OUTPUT DROP
iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
iptables -A OUTPUT -m set --match-set allowed-domains dst -j ACCEPT

# Lock down IPv6 entirely: the allowlist (ipset hash:net) is IPv4-only, so any
# permitted IPv6 egress would be an un-allowlisted hole (many hosts publish AAAA
# records). Drop all IPv6 except loopback and established/related. Best-effort —
# skip if ip6tables is unavailable.
if command -v ip6tables >/dev/null 2>&1; then
  ip6tables -F 2>/dev/null || true
  ip6tables -P INPUT DROP 2>/dev/null || true
  ip6tables -P FORWARD DROP 2>/dev/null || true
  ip6tables -P OUTPUT DROP 2>/dev/null || true
  ip6tables -A INPUT -i lo -j ACCEPT 2>/dev/null || true
  ip6tables -A OUTPUT -o lo -j ACCEPT 2>/dev/null || true
  ip6tables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT 2>/dev/null || true
  ip6tables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT 2>/dev/null || true
fi

# Verify the policy actually holds — fail closed if either assertion is wrong,
# so a broken allowlist shows up at start rather than masquerading as active.
echo "init-firewall: verifying..."
if curl --connect-timeout 5 -fsS https://example.com >/dev/null 2>&1; then
  echo "init-firewall: ERROR — reached example.com, but it is not allowlisted (DROP not enforced)" >&2
  exit 1
fi
if ! curl --connect-timeout 5 -fsS https://api.github.com/zen >/dev/null 2>&1; then
  echo "init-firewall: ERROR — could not reach api.github.com, which should be allowed" >&2
  exit 1
fi
echo "init-firewall: allowlist active (default-DROP, GitHub + npm + Anthropic permitted)."
`;
}
