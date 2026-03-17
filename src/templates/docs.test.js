import { describe, it, expect } from 'vitest';
import {
  generateProjectBrief,
  generateArchitecture,
  generateApiIntegration,
  generateSpecsReadme,
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
    const result = generateArchitecture(withConfig({ framework: 'react-vite-ts' }));
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
});
