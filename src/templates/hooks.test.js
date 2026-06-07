import { describe, it, expect } from 'vitest';
import { generateCommandsReadme, generateClaudeSettings } from './hooks.js';

describe('hooks.js re-exports', () => {
  it('re-exports generateClaudeSettings from the guardrail core', () => {
    expect(typeof generateClaudeSettings).toBe('function');
    expect(() => JSON.parse(generateClaudeSettings())).not.toThrow();
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
