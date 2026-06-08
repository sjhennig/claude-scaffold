import { describe, it, expect } from 'vitest';
import {
  generateProjectBrief,
  generateArchitecture,
  generateApiIntegration,
  generateSpecsReadme,
  generateSubsystemSpecTemplate,
  generateNotesLog,
} from './docs.js';

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

describe('generateProjectBrief', () => {
  it('includes the project name', () => {
    const result = generateProjectBrief(baseConfig);
    expect(result).toContain('test-project');
  });

  it('contains all required template sections', () => {
    const result = generateProjectBrief(baseConfig);
    const lower = result.toLowerCase();

    expect(lower).toMatch(/what is this project/);
    expect(lower).toMatch(/who is it for/);
    expect(lower).toMatch(/scope|what's the scope/);
    expect(lower).toMatch(/out of scope|what's explicitly out of scope/);
    expect(lower).toMatch(/key technical decisions/);
    expect(lower).toMatch(/open questions/);
  });
});

describe('generateArchitecture', () => {
  it('includes components/ directory for react-vite-ts framework', () => {
    const result = generateArchitecture(
      withConfig({ framework: 'react-vite-ts' }),
    );
    expect(result).toContain('components/');
  });

  it('includes app/ directory for nextjs-ts framework', () => {
    const result = generateArchitecture(withConfig({ framework: 'nextjs-ts' }));
    expect(result).toContain('app/');
  });

  it('includes index.ts for node-ts framework', () => {
    const result = generateArchitecture(withConfig({ framework: 'node-ts' }));
    expect(result).toContain('index.ts');
  });

  it('mentions api-integration.md when useAnthropicApi is true', () => {
    const result = generateArchitecture(withConfig({ useAnthropicApi: true }));
    expect(result).toContain('api-integration.md');
  });

  it('does not mention api-integration.md when useAnthropicApi is false', () => {
    const result = generateArchitecture(withConfig({ useAnthropicApi: false }));
    expect(result).not.toContain('api-integration.md');
  });
});

describe('generateSpecsReadme', () => {
  it('explains the spec-driven workflow', () => {
    const result = generateSpecsReadme();
    const lower = result.toLowerCase();
    expect(lower).toMatch(/spec/);
    expect(lower).toMatch(/workflow/);
  });

  it('explains the per-subsystem convention (one spec per subsystem, living)', () => {
    const lower = generateSpecsReadme().toLowerCase();
    expect(lower).toMatch(/one spec per subsystem/);
    expect(lower).toMatch(/living document/);
    expect(lower).toContain('_template.md');
  });

  it('documents the subsystem-map.json format used by drift detection', () => {
    const result = generateSpecsReadme();
    expect(result).toContain('docs/specs/subsystem-map.json');
    expect(result).toContain('check-drift.sh');
    // The documented shape must be valid, parseable JSON.
    const json = result.match(/```json\n([\s\S]*?)```/);
    expect(json).not.toBeNull();
    expect(() => JSON.parse(json[1])).not.toThrow();
    expect(JSON.parse(json[1])).toHaveProperty('subsystems');
  });
});

describe('generateNotesLog', () => {
  const notes = generateNotesLog();

  it('documents the dated decision-entry format', () => {
    expect(notes).toContain('YYYY-MM-DD');
    expect(notes).toContain('**Context**');
    expect(notes).toContain('**Decision**');
    expect(notes).toContain('**Consequences**');
  });

  it('frames it as cross-session memory, not a task list', () => {
    const lower = notes.toLowerCase();
    expect(lower).toMatch(/context resets|survives|long-horizon/);
    expect(lower).toMatch(/not a task list/);
  });
});

describe('generateSubsystemSpecTemplate', () => {
  const template = generateSubsystemSpecTemplate();

  it('includes the explicit-files and interface sections', () => {
    expect(template).toMatch(/## Owning files/);
    expect(template).toMatch(/## Public interface/);
    expect(template).toMatch(/## Open decisions/);
  });

  it('frames the spec as a living, one-per-subsystem document', () => {
    const lower = template.toLowerCase();
    expect(lower).toMatch(/living doc/);
    expect(lower).toMatch(/one spec per subsystem/);
  });

  it('points at the subsystem map so drift detection can watch it', () => {
    expect(template).toContain('subsystem-map.json');
  });
});
