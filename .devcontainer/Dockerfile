FROM node:20-bookworm-slim

# Install dev tools.
# ca-certificates first: the slim base omits it, which breaks HTTPS for git,
# curl, and the github-cli devcontainer feature's keyring fetch.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    git \
    curl \
    ripgrep \
    fd-find \
    jq \
    tree \
    bat \
    zsh \
    sudo \
    bubblewrap \
    socat \
    && rm -rf /var/lib/apt/lists/*

# Allow the human developer to use sudo without a password (e.g. ad-hoc
# apt-get installs while iterating in the container). Claude itself cannot
# escalate: `Bash(sudo:*)` is in the permissions deny-list in
# .claude/settings.json, so the agent is blocked from sudo regardless. The
# residual risk is dependency code (an npm postinstall reaching root inside the
# container); see docs/sandbox.md § Trust model & residual risk.
RUN echo "node ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers.d/node

# Install Claude Code CLI globally
RUN npm install -g @anthropic-ai/claude-code

# Persist bash history
RUN SNIPPET="export PROMPT_COMMAND='history -a' && export HISTFILE=/commandhistory/.bash_history" \
    && mkdir /commandhistory \
    && touch /commandhistory/.bash_history \
    && chown -R node /commandhistory \
    && echo "$SNIPPET" >> /home/node/.bashrc

USER node
WORKDIR /workspaces/claude-scaffold
