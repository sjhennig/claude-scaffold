import { describe, it, expect } from 'vitest';
import {
  generateDockerfile,
  generateDevcontainerJson,
} from './devcontainer.js';

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
      'git',
      'curl',
      'ripgrep',
      'fd-find',
      'jq',
      'tree',
      'bat',
      'zsh',
      'python3',
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
});
