/**
 * Generates .devcontainer/Dockerfile and .devcontainer/devcontainer.json
 */

export function generateDockerfile() {
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
    && rm -rf /var/lib/apt/lists/*

# Passwordless sudo for the human developer (e.g. ad-hoc apt-get installs while
# iterating in the container). Claude itself cannot escalate: \`Bash(sudo:*)\` is
# in the permissions deny-list in .claude/settings.json, so the agent is blocked
# from sudo regardless. Residual risk: dependency code — an \`npm install\`
# postinstall script (run by postCreateCommand) executes as the node user and
# can use this grant to reach root *inside the container*. The container is not a
# boundary against malicious deps; pin/vet dependencies and rely on CI's
# dependency review. Remove this line if you don't need dev sudo.
RUN echo "node ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers.d/node

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
    features: {
      'ghcr.io/devcontainers/features/github-cli:1': {},
    },
    postCreateCommand: 'npm install',
    remoteUser: 'node',
  };

  return JSON.stringify(devcontainer, null, 2) + '\n';
}
