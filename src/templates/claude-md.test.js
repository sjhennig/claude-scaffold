import { describe, it, expect } from 'vitest';
import { generateClaudeMd } from './claude-md.js';

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

describe('generateClaudeMd', () => {
  it('produces output under 100 lines', () => {
    const output = generateClaudeMd(baseConfig);
    const lineCount = output.split('\n').length;
    expect(lineCount).toBeLessThan(100);
  });

  it('contains the project name as an H1 heading', () => {
    const output = generateClaudeMd(baseConfig);
    expect(output).toContain('# test-project');
  });

  it('contains the project description', () => {
    const output = generateClaudeMd(baseConfig);
    expect(output).toContain('A test project');
  });

  describe('framework commands', () => {
    it.each(['react-vite-ts', 'nextjs-ts', 'node-ts'])(
      'contains the command table for %s',
      (framework) => {
        const output = generateClaudeMd(withConfig({ framework }));
        expect(output).toContain('## Commands');
        expect(output).toContain('| Action');
        expect(output).toContain('`npm run dev`');
        expect(output).toContain('`npm run build`');
        expect(output).toContain('`npm test`');
        expect(output).toContain('`npm run test:watch`');
        expect(output).toContain('`npm run lint`');
        expect(output).toContain('`npm run lint:fix`');
        expect(output).toContain('`npm run typecheck`');
        expect(output).toContain('`npm run format`');
      },
    );
  });

  it('contains the instruction to read docs/ before starting tasks', () => {
    const output = generateClaudeMd(baseConfig);
    expect(output).toContain('IMPORTANT: Before starting any task');
    expect(output).toContain('docs/');
  });

  describe('TDD cycle', () => {
    it('contains the full 7-step TDD cycle', () => {
      const output = generateClaudeMd(baseConfig);
      expect(output).toContain('Write failing tests FIRST');
      expect(output).toContain('Confirm they fail');
      expect(output).toContain('Commit the failing tests');
      expect(output).toContain('minimum implementation');
      expect(output).toContain('fix the implementation, not the tests');
      expect(output).toContain('Refactor if needed');
      expect(output).toContain('Commit passing implementation');
    });
  });

  it('contains the test file naming convention', () => {
    const output = generateClaudeMd(baseConfig);
    expect(output).toMatch(/foo\.ts.*foo\.test\.ts/);
  });

  describe('git workflow conventions', () => {
    it('mentions feature branches', () => {
      const output = generateClaudeMd(baseConfig);
      expect(output).toContain('Feature branches');
    });

    it('mentions conventional commits', () => {
      const output = generateClaudeMd(baseConfig);
      expect(output).toContain('Conventional commits');
    });
  });

  describe('exclusions — keeps CLAUDE.md focused', () => {
    it('does not contain code style rules', () => {
      const output = generateClaudeMd(baseConfig);
      const lower = output.toLowerCase();
      expect(lower).not.toContain('indent');
      expect(lower).not.toContain('semicolons');
      expect(lower).not.toContain('tabs vs spaces');
    });

    it('does not contain architecture detail section headers', () => {
      const output = generateClaudeMd(baseConfig);
      expect(output).not.toMatch(/^## .*database/im);
      expect(output).not.toMatch(/^## .*API routes/im);
    });
  });
});
