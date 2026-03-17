import { describe, it, expect } from 'vitest';
import { generateClaudeSettings, generateCommandsReadme } from './hooks.js';

describe('generateClaudeSettings', () => {
  it('returns valid JSON', () => {
    const result = generateClaudeSettings();
    expect(() => JSON.parse(result)).not.toThrow();
  });

  it('has a hooks key at the top level', () => {
    const settings = JSON.parse(generateClaudeSettings());
    expect(settings).toHaveProperty('hooks');
  });

  it('has a PostToolUse hook with matcher Edit|Write', () => {
    const settings = JSON.parse(generateClaudeSettings());
    const postToolUse = settings.hooks.PostToolUse;
    expect(postToolUse).toBeDefined();
    expect(postToolUse.some((entry) => entry.matcher === 'Edit|Write')).toBe(true);
  });

  it('PostToolUse hook command includes prettier --write', () => {
    const settings = JSON.parse(generateClaudeSettings());
    const entry = settings.hooks.PostToolUse.find((e) => e.matcher === 'Edit|Write');
    const command = entry.hooks[0].command;
    expect(command).toContain('prettier --write');
  });

  it('PostToolUse hook command ends with exit 0', () => {
    const settings = JSON.parse(generateClaudeSettings());
    const entry = settings.hooks.PostToolUse.find((e) => e.matcher === 'Edit|Write');
    const command = entry.hooks[0].command;
    expect(command.trimEnd()).toMatch(/exit 0$/);
  });

  it('has a Stop hook', () => {
    const settings = JSON.parse(generateClaudeSettings());
    expect(settings.hooks.Stop).toBeDefined();
    expect(settings.hooks.Stop.length).toBeGreaterThan(0);
  });

  it('Stop hook command includes both typecheck and test', () => {
    const settings = JSON.parse(generateClaudeSettings());
    const command = settings.hooks.Stop[0].hooks[0].command;
    expect(command).toContain('typecheck');
    expect(command).toContain('test');
  });

  it('Stop hook command ends with exit 0', () => {
    const settings = JSON.parse(generateClaudeSettings());
    const command = settings.hooks.Stop[0].hooks[0].command;
    expect(command.trimEnd()).toMatch(/exit 0$/);
  });

  it('Stop hook command uses tail to limit output length', () => {
    const settings = JSON.parse(generateClaudeSettings());
    const command = settings.hooks.Stop[0].hooks[0].command;
    expect(command).toContain('tail');
  });
});

describe('generateCommandsReadme', () => {
  it('contains "Slash Commands"', () => {
    const result = generateCommandsReadme();
    expect(result).toContain('Slash Commands');
  });

  it('contains instructions for creating commands', () => {
    const result = generateCommandsReadme();
    expect(result.toLowerCase()).toMatch(/creat(e|ing)\b.*commands?/);
  });
});
