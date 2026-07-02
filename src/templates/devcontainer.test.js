import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  generateDockerfile,
  generateDevcontainerJson,
  generateInitFirewallScript,
} from './devcontainer.js';

// True if the Dockerfile installs `tool` via its apt-get line. The tools sit on
// their own continuation lines, so a substring match is enough — and ignores
// ordering and the surrounding apt flags that legitimately differ between the
// repo's Dockerfile and the generated one.
function installsTool(dockerfile, tool) {
  return dockerfile.includes(tool);
}

const baseConfig = {
  projectName: 'test-project',
  description: 'A test project',
  framework: 'react-vite-ts',
  devPort: 5173,
  useAnthropicApi: false,
  additionalKeys: [],
  initGit: true,
};

function withConfig(overrides) {
  return { ...baseConfig, ...overrides };
}

describe('generateDockerfile', () => {
  it('uses node:20-bookworm-slim as the base image', () => {
    const dockerfile = generateDockerfile();
    expect(dockerfile).toContain('FROM node:20-bookworm-slim');
  });

  it('installs all expected system tools', () => {
    const dockerfile = generateDockerfile();
    const expectedTools = [
      'ca-certificates',
      'git',
      'curl',
      'ripgrep',
      'fd-find',
      'jq',
      'tree',
      'bat',
      'zsh',
      'python3',
      'bubblewrap',
      'socat',
    ];
    for (const tool of expectedTools) {
      expect(dockerfile).toContain(tool);
    }
  });

  it('installs Claude Code globally', () => {
    const dockerfile = generateDockerfile();
    expect(dockerfile).toContain('npm install -g @anthropic-ai/claude-code');
  });

  it('sets the non-root user to node', () => {
    const dockerfile = generateDockerfile();
    expect(dockerfile).toContain('USER node');
  });

  it('configures a node-owned global npm prefix', () => {
    const dockerfile = generateDockerfile();
    expect(dockerfile).toContain(
      'NPM_CONFIG_PREFIX=/usr/local/share/npm-global',
    );
    expect(dockerfile).toContain('PATH=$PATH:/usr/local/share/npm-global/bin');
  });

  it('installs Claude Code as node (so auto-update can write the prefix)', () => {
    const dockerfile = generateDockerfile();
    expect(dockerfile.indexOf('USER node')).toBeLessThan(
      dockerfile.indexOf('npm install -g @anthropic-ai/claude-code'),
    );
  });

  it('pre-creates a node-owned /home/node/.claude as root (so a fresh --isolated-creds volume is writable)', () => {
    const dockerfile = generateDockerfile();
    // The mount point must exist and be node-owned in the image: Docker seeds a
    // fresh named volume with the image dir's ownership, so without this the
    // isolated-creds volume is root-owned and node's postCreate plugin install
    // (which mkdir's ~/.claude/plugins) fails with EACCES.
    expect(dockerfile).toMatch(
      /mkdir -p \/home\/node\/\.claude[\s\S]*chown -R node:node \/home\/node\/\.claude/,
    );
    // Must run as root (before USER node) or the chown itself would fail.
    expect(
      dockerfile.indexOf('chown -R node:node /home/node/.claude'),
    ).toBeLessThan(dockerfile.indexOf('USER node'));
  });
});

describe('generateDevcontainerJson', () => {
  it('returns valid JSON', () => {
    const result = generateDevcontainerJson(baseConfig);
    expect(() => JSON.parse(result)).not.toThrow();
  });

  it('uses the correct project name', () => {
    const result = JSON.parse(generateDevcontainerJson(baseConfig));
    expect(result.name).toBe('test-project');
  });

  it('forwards the correct port', () => {
    const result = JSON.parse(generateDevcontainerJson(baseConfig));
    expect(result.forwardPorts).toEqual([5173]);
  });

  it('forwards a different port when configured', () => {
    const result = JSON.parse(
      generateDevcontainerJson(withConfig({ devPort: 3000 })),
    );
    expect(result.forwardPorts).toEqual([3000]);
  });

  it('includes all four VS Code extensions', () => {
    const result = JSON.parse(generateDevcontainerJson(baseConfig));
    const extensions = result.customizations.vscode.extensions;
    expect(extensions).toContain('anthropic.claude-code');
    expect(extensions).toContain('dbaeumer.vscode-eslint');
    expect(extensions).toContain('esbenp.prettier-vscode');
    expect(extensions).toContain('eamodio.gitlens');
    expect(extensions).toHaveLength(4);
  });

  it('defaults to the Claude auth host bind mount', () => {
    const result = JSON.parse(generateDevcontainerJson(baseConfig));
    const claudeMount = result.mounts.find((m) => m.includes('.claude'));
    expect(claudeMount).toBeDefined();
    expect(claudeMount).toContain('source=${localEnv:HOME}/.claude');
    expect(claudeMount).toContain('target=/home/node/.claude');
    expect(claudeMount).toContain('type=bind');
  });

  it('uses a container-local named volume when credentials are isolated', () => {
    const result = JSON.parse(
      generateDevcontainerJson(withConfig({ isolatedCredentials: true })),
    );
    const claudeMount = result.mounts.find((m) =>
      m.includes('/home/node/.claude'),
    );
    expect(claudeMount).toBeDefined();
    expect(claudeMount).toContain('source=claude-config-${devcontainerId}');
    expect(claudeMount).toContain('type=volume');
    // The host home directory must NOT appear in the isolated variant.
    expect(claudeMount).not.toContain('localEnv:HOME');
  });

  it('includes the bash history volume', () => {
    const result = JSON.parse(generateDevcontainerJson(baseConfig));
    const historyMount = result.mounts.find((m) => m.includes('bash_history'));
    expect(historyMount).toBeDefined();
    expect(historyMount).toContain('type=volume');
  });

  it('installs deps then auto-installs the guardrails plugin in postCreate', () => {
    const cmd = JSON.parse(
      generateDevcontainerJson(baseConfig),
    ).postCreateCommand;
    // npm install → marketplace add (settings.json enablement isn't honored
    // headlessly without folder-trust) → plugin install (v2.1.195+ needs an
    // explicit install). The marketplace add is pinned to the release tag.
    expect(cmd).toContain('npm install');
    expect(cmd).toContain(
      'claude plugin marketplace add https://github.com/sjhennig/claude-scaffold.git#guardrails-v',
    );
    expect(cmd).toContain(
      'claude plugin install claude-guardrails@claude-scaffold',
    );
    expect(cmd.indexOf('npm install')).toBeLessThan(
      cmd.indexOf('claude plugin marketplace add'),
    );
    expect(cmd.indexOf('claude plugin marketplace add')).toBeLessThan(
      cmd.indexOf('claude plugin install'),
    );
    // Non-fatal: a failed plugin install must not fail postCreate.
    expect(cmd).toContain('|| echo');
  });

  it('heals ~/.claude ownership before writing to it (pre-existing root-owned volume)', () => {
    const cmd = JSON.parse(
      generateDevcontainerJson(baseConfig),
    ).postCreateCommand;
    // A named volume created by a build predating the Dockerfile chown stays
    // root-owned on rebuild (Docker only seeds ownership on a FRESH volume), so
    // /login can't write .credentials.json. Best-effort self-heal, and it must
    // run before the plugin install (the first thing that writes ~/.claude).
    expect(cmd).toContain('chown -R node:node /home/node/.claude');
    // `|| true` so it can't fail postCreate where node's sudo is narrowed
    // (--network-firewall) or the dir is already node-owned.
    expect(cmd).toMatch(
      /chown -R node:node \/home\/node\/\.claude[^&]*\|\| true/,
    );
    expect(cmd.indexOf('chown -R node:node /home/node/.claude')).toBeLessThan(
      cmd.indexOf('claude plugin install'),
    );
  });

  it('installs the GitHub CLI via a devcontainer feature', () => {
    const result = JSON.parse(generateDevcontainerJson(baseConfig));
    expect(result.features).toHaveProperty(
      'ghcr.io/devcontainers/features/github-cli:1',
    );
  });
});

describe('network-egress firewall (opt-in, M9 Option A)', () => {
  it('omits all firewall machinery by default', () => {
    const dockerfile = generateDockerfile(baseConfig);
    expect(dockerfile).not.toContain('iptables');
    expect(dockerfile).not.toContain('init-firewall.sh');

    const dc = JSON.parse(generateDevcontainerJson(baseConfig));
    expect(dc.runArgs).toBeUndefined();
    expect(dc.postStartCommand).toBeUndefined();
  });

  it('adds firewall packages and copies the script when enabled', () => {
    const dockerfile = generateDockerfile(
      withConfig({ networkFirewall: true }),
    );
    for (const pkg of ['iptables', 'ipset', 'iproute2', 'dnsutils']) {
      expect(dockerfile).toContain(pkg);
    }
    expect(dockerfile).toContain(
      'COPY init-firewall.sh /usr/local/bin/init-firewall.sh',
    );
  });

  it('narrows node sudo to only the firewall script when enabled', () => {
    // With the firewall on, blanket NOPASSWD:ALL would let a malicious dependency
    // (running as node) flush the allowlist via sudo — so the grant must narrow.
    const dockerfile = generateDockerfile(
      withConfig({ networkFirewall: true }),
    );
    expect(dockerfile).toContain('NOPASSWD: /usr/local/bin/init-firewall.sh');
    // The active grant must not be the blanket rule (a comment may still mention
    // it as the re-add hint — assert on the RUN line, not a bare substring).
    expect(dockerfile).not.toContain('RUN echo "node ALL=(ALL) NOPASSWD:ALL"');
  });

  it('keeps blanket dev sudo when the firewall is off (default)', () => {
    expect(generateDockerfile(baseConfig)).toContain(
      'RUN echo "node ALL=(ALL) NOPASSWD:ALL"',
    );
  });

  it('grants NET_ADMIN/NET_RAW and runs the script on start when enabled', () => {
    const dc = JSON.parse(
      generateDevcontainerJson(withConfig({ networkFirewall: true })),
    );
    expect(dc.runArgs).toContain('--cap-add=NET_ADMIN');
    expect(dc.runArgs).toContain('--cap-add=NET_RAW');
    expect(dc.postStartCommand).toBe('sudo /usr/local/bin/init-firewall.sh');
  });

  it('brings the firewall up before the initial npm install', () => {
    const dc = JSON.parse(
      generateDevcontainerJson(withConfig({ networkFirewall: true })),
    );
    // The prime spot for a malicious postinstall is the first dependency
    // install, so the firewall must run ahead of it in postCreateCommand — and
    // ahead of the plugin install too, which needs GitHub egress (allowlisted).
    const cmd = dc.postCreateCommand;
    // The firewall runs ahead of npm install; only the ~/.claude ownership heal
    // (which executes no untrusted code) precedes it.
    expect(cmd).toContain('sudo /usr/local/bin/init-firewall.sh');
    expect(cmd.indexOf('chown -R node:node /home/node/.claude')).toBeLessThan(
      cmd.indexOf('init-firewall.sh'),
    );
    expect(cmd.indexOf('init-firewall.sh')).toBeLessThan(
      cmd.indexOf('npm install'),
    );
    expect(cmd.indexOf('npm install')).toBeLessThan(
      cmd.indexOf('claude plugin install'),
    );
  });
});

describe('generateInitFirewallScript', () => {
  const script = generateInitFirewallScript();

  it('sets a default-DROP egress policy', () => {
    expect(script).toContain('iptables -P OUTPUT DROP');
    expect(script).toContain('iptables -P INPUT DROP');
  });

  it('allowlists the registries Claude Code + npm + the plugin marketplace need', () => {
    expect(script).toContain('registry.npmjs.org');
    expect(script).toContain('api.anthropic.com');
    // GitHub ranges (covers github.com, the API/CDN, and the marketplace tarball)
    expect(script).toContain('api.github.com/meta');
    expect(script).toContain('allowed-domains');
  });

  it('fails closed: verifies a blocked host is blocked and an allowed host reachable', () => {
    // A blocked host that still resolves => exit 1; an allowed host that fails => exit 1.
    expect(script).toContain('https://example.com');
    expect(script).toContain('api.github.com/zen');
    expect(script).toContain('exit 1');
    expect(script).toContain('set -euo pipefail');
  });

  it('fails closed on setup error via an EXIT trap that forces DROP', () => {
    // A failed GitHub fetch / DNS miss aborts under set -e BEFORE the final DROP;
    // the trap must force a default-DROP so a setup failure leaves no egress.
    expect(script).toContain('trap firewall_fail_closed EXIT');
    expect(script).toContain('forcing default-DROP');
  });

  it('locks down IPv6 (the allowlist is IPv4-only)', () => {
    expect(script).toContain('ip6tables -P OUTPUT DROP');
    expect(script).toContain('command -v ip6tables');
  });

  it('scopes DNS to the configured resolvers, not the whole internet', () => {
    // A blanket "port 53 anywhere" rule is a DNS-tunnel exfil channel.
    expect(script).toContain('/etc/resolv.conf');
    expect(script).toContain('--dport 53');
  });

  it('degrades gracefully when the aggregate tool is absent', () => {
    expect(script).toContain('command -v aggregate');
  });

  it('does NOT flush the nat/mangle tables (preserves Docker embedded DNS)', () => {
    // Flushing nat destroys Docker's 127.0.0.11:53 redirect, breaking every dig
    // and failing the whole script closed. Regression guard for that bug.
    expect(script).not.toContain('iptables -t nat -F');
    expect(script).not.toContain('iptables -t mangle -F');
    // The reset must still clear our own (filter-table) rules and the ipset.
    expect(script).toContain('iptables -F');
    expect(script).toContain('ipset destroy allowed-domains');
  });

  it('treats a single unresolvable allowlist domain as warn-and-skip, not fatal', () => {
    // A transiently-unresolvable (or IPv6-only/telemetry) domain must not fail
    // the whole firewall closed and brick egress — the boot smoke caught this
    // with statsig.anthropic.com. The per-domain miss warns and `continue`s;
    // only the GitHub-meta fetch and the final verify are fatal.
    const resolveBlock = script.slice(
      script.indexOf('Resolve each allowed domain'),
      script.indexOf('Default DROP'),
    );
    expect(resolveBlock).toContain('could not resolve');
    expect(resolveBlock).toContain('continue');
    expect(resolveBlock).not.toContain('exit 1');
  });

  it('restores ACCEPT policies during setup so a re-run is not self-blocked', () => {
    // iptables -F clears rules but not chain policies; on a re-run (or the
    // postStart pass after postCreate) the policy is already DROP, which would
    // drop the script's own setup traffic. The reset must precede the fetch.
    expect(script).toContain('iptables -P OUTPUT ACCEPT');
    expect(script.indexOf('iptables -P OUTPUT ACCEPT')).toBeLessThan(
      script.indexOf('api.github.com/meta'),
    );
    // ...and DROP is still (re-)established after the allowlist is built. Use
    // lastIndexOf: the first `-P OUTPUT DROP` is the fail-closed trap (defined
    // up top), the happy-path one is last.
    expect(script.lastIndexOf('iptables -P OUTPUT DROP')).toBeGreaterThan(
      script.indexOf('api.github.com/meta'),
    );
  });

  it('installs the host/LAN ACCEPT rule before the network-dependent steps', () => {
    // If the GitHub fetch aborts, the fail-closed trap must not sever the
    // developer's host connection — so host/LAN egress is allowlisted first.
    expect(script.indexOf('ip route show default')).toBeGreaterThan(-1);
    expect(script.indexOf('ip route show default')).toBeLessThan(
      script.indexOf('api.github.com/meta'),
    );
  });
});

// Dogfooding guard: this repo's .devcontainer/Dockerfile is maintained by hand
// and legitimately differs in *structure* from generateDockerfile() (apt flags,
// sudoers path, bash-history mechanism, WORKDIR, python3). But the two must
// never silently diverge on the security/tooling *invariants* — the real bug
// class is dropping a sandbox-critical tool (e.g. bubblewrap) from one but not
// the other. This asserts only those shared invariants, not byte equality.
describe('dogfood: repo Dockerfile shares the generated security invariants', () => {
  const repoDockerfile = readFileSync(
    join(process.cwd(), '.devcontainer/Dockerfile'),
    'utf-8',
  );
  const generated = generateDockerfile();
  const dockerfiles = [
    ['repo .devcontainer/Dockerfile', repoDockerfile],
    ['generateDockerfile()', generated],
  ];

  it.each(dockerfiles)('%s uses the node:20-bookworm-slim base', (_, df) => {
    expect(df).toContain('FROM node:20-bookworm-slim');
  });

  // bubblewrap + socat power the sandbox layer; jq/git/ripgrep/ca-certificates
  // are relied on by the hooks and CLI. None may be dropped from either image.
  const sharedTools = [
    'bubblewrap',
    'socat',
    'jq',
    'git',
    'ca-certificates',
    'ripgrep',
  ];
  it.each(dockerfiles)('%s installs the shared toolchain', (_, df) => {
    for (const tool of sharedTools) {
      expect(installsTool(df, tool)).toBe(true);
    }
  });

  it.each(dockerfiles)('%s installs Claude Code globally', (_, df) => {
    expect(df).toContain('npm install -g @anthropic-ai/claude-code');
  });

  it.each(dockerfiles)('%s drops to the non-root node user', (_, df) => {
    expect(df).toContain('USER node');
  });

  // The real bug this guards: a root-level `npm install -g` leaves Claude Code
  // unwritable by the node user, so its auto-updater fails with "no write
  // permission to npm prefix". Both images must give node a writable prefix AND
  // install as node — assert the prefix is set and `USER node` precedes the install.
  it.each(dockerfiles)('%s gives node a writable npm prefix', (_, df) => {
    expect(df).toContain('NPM_CONFIG_PREFIX=/usr/local/share/npm-global');
  });

  it.each(dockerfiles)('%s installs Claude Code as node', (_, df) => {
    expect(df.indexOf('USER node')).toBeLessThan(
      df.indexOf('npm install -g @anthropic-ai/claude-code'),
    );
  });
});
