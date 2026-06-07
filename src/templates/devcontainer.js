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
    && rm -rf /var/lib/apt/lists/*

# Let the node user run privileged commands when needed
RUN echo "node ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

# Pre-install Claude Code so it's available immediately on container start
RUN npm install -g @anthropic-ai/claude-code

# Persist bash history across container rebuilds via a named volume
RUN mkdir -p /home/node/.bash_history_dir && chown node:node /home/node/.bash_history_dir

USER node
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
      // Share host Claude auth so you don't have to re-authenticate inside the container
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
