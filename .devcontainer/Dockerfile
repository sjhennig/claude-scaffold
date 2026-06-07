FROM node:20-bookworm-slim

# Install dev tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    ripgrep \
    fd-find \
    jq \
    tree \
    bat \
    zsh \
    sudo \
    && rm -rf /var/lib/apt/lists/*

# Allow node user to use sudo without password
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
WORKDIR /workspace
