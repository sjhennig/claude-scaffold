import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  generateDockerfile,
  generateDevcontainerJson,
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

  it('includes the Claude auth bind mount', () => {
    const result = JSON.parse(generateDevcontainerJson(baseConfig));
    const claudeMount = result.mounts.find((m) => m.includes('.claude'));
    expect(claudeMount).toBeDefined();
    expect(claudeMount).toContain('source=${localEnv:HOME}/.claude');
    expect(claudeMount).toContain('target=/home/node/.claude');
    expect(claudeMount).toContain('type=bind');
  });

  it('includes the bash history volume', () => {
    const result = JSON.parse(generateDevcontainerJson(baseConfig));
    const historyMount = result.mounts.find((m) => m.includes('bash_history'));
    expect(historyMount).toBeDefined();
    expect(historyMount).toContain('type=volume');
  });

  it('has postCreateCommand set to npm install', () => {
    const result = JSON.parse(generateDevcontainerJson(baseConfig));
    expect(result.postCreateCommand).toBe('npm install');
  });

  it('installs the GitHub CLI via a devcontainer feature', () => {
    const result = JSON.parse(generateDevcontainerJson(baseConfig));
    expect(result.features).toHaveProperty(
      'ghcr.io/devcontainers/features/github-cli:1',
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
});
