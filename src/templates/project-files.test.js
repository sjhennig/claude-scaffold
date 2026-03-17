import { describe, it, expect } from 'vitest';
import {
  generateEslintConfig,
  generatePrettierRc,
  generatePrettierIgnore,
  getFrameworkFiles,
} from './project-files.js';

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

// ---------------------------------------------------------------------------
// generateEslintConfig
// ---------------------------------------------------------------------------

describe('generateEslintConfig', () => {
  it('returns different configs per framework', () => {
    const react = generateEslintConfig(withConfig({ framework: 'react-vite-ts' }));
    const next = generateEslintConfig(withConfig({ framework: 'nextjs-ts' }));
    const node = generateEslintConfig(withConfig({ framework: 'node-ts' }));

    expect(react).not.toBe(next);
    expect(react).not.toBe(node);
    expect(next).not.toBe(node);
  });

  describe('react-vite-ts', () => {
    const config = withConfig({ framework: 'react-vite-ts' });
    const output = generateEslintConfig(config);

    it('imports react-hooks plugin', () => {
      expect(output).toContain('eslint-plugin-react-hooks');
    });

    it('imports react-refresh plugin', () => {
      expect(output).toContain('eslint-plugin-react-refresh');
    });

    it('imports typescript-eslint', () => {
      expect(output).toContain('typescript-eslint');
    });

    it('uses browser globals', () => {
      expect(output).toContain('globals.browser');
    });

    it('ignores dist directory', () => {
      expect(output).toContain("ignores: ['dist']");
    });
  });

  describe('nextjs-ts', () => {
    const config = withConfig({ framework: 'nextjs-ts' });
    const output = generateEslintConfig(config);

    it('uses the FlatCompat layer for next config', () => {
      expect(output).toContain('FlatCompat');
      expect(output).toContain('@eslint/eslintrc');
    });

    it('extends next/core-web-vitals and next/typescript', () => {
      expect(output).toContain('next/core-web-vitals');
      expect(output).toContain('next/typescript');
    });

    it('is generated as .mjs in getFrameworkFiles', () => {
      const files = getFrameworkFiles(config);
      const eslintEntry = files.find(([path]) => path.includes('eslint.config'));
      expect(eslintEntry).toBeDefined();
      expect(eslintEntry[0]).toBe('eslint.config.mjs');
    });
  });

  describe('node-ts', () => {
    const config = withConfig({ framework: 'node-ts', devPort: 3000 });
    const output = generateEslintConfig(config);

    it('uses node globals', () => {
      expect(output).toContain('globals.node');
    });

    it('imports typescript-eslint', () => {
      expect(output).toContain('typescript-eslint');
    });

    it('does not reference React plugins', () => {
      expect(output).not.toContain('react-hooks');
      expect(output).not.toContain('react-refresh');
    });

    it('ignores dist directory', () => {
      expect(output).toContain("ignores: ['dist']");
    });

    it('is generated as .js (not .mjs) in getFrameworkFiles', () => {
      const files = getFrameworkFiles(config);
      const eslintEntry = files.find(([path]) => path.includes('eslint.config'));
      expect(eslintEntry[0]).toBe('eslint.config.js');
    });
  });
});

// ---------------------------------------------------------------------------
// generatePrettierRc
// ---------------------------------------------------------------------------

describe('generatePrettierRc', () => {
  const output = generatePrettierRc();

  it('returns valid JSON', () => {
    expect(() => JSON.parse(output)).not.toThrow();
  });

  it('sets singleQuote to true', () => {
    const config = JSON.parse(output);
    expect(config.singleQuote).toBe(true);
  });

  it('sets trailingComma to all', () => {
    const config = JSON.parse(output);
    expect(config.trailingComma).toBe('all');
  });

  it('sets tabWidth to 2', () => {
    const config = JSON.parse(output);
    expect(config.tabWidth).toBe(2);
  });

  it('sets semi to true', () => {
    const config = JSON.parse(output);
    expect(config.semi).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// generatePrettierIgnore
// ---------------------------------------------------------------------------

describe('generatePrettierIgnore', () => {
  it('includes node_modules for all frameworks', () => {
    for (const framework of ['react-vite-ts', 'nextjs-ts', 'node-ts']) {
      const output = generatePrettierIgnore(withConfig({ framework }));
      expect(output).toContain('node_modules');
    }
  });

  it('includes coverage for all frameworks', () => {
    for (const framework of ['react-vite-ts', 'nextjs-ts', 'node-ts']) {
      const output = generatePrettierIgnore(withConfig({ framework }));
      expect(output).toContain('coverage');
    }
  });

  describe('nextjs-ts', () => {
    const output = generatePrettierIgnore(withConfig({ framework: 'nextjs-ts' }));

    it('includes .next', () => {
      expect(output).toContain('.next');
    });

    it('includes out', () => {
      expect(output).toContain('out');
    });
  });

  describe('node-ts', () => {
    const output = generatePrettierIgnore(withConfig({ framework: 'node-ts' }));

    it('includes dist', () => {
      expect(output).toContain('dist');
    });
  });

  describe('react-vite-ts', () => {
    const output = generatePrettierIgnore(withConfig({ framework: 'react-vite-ts' }));

    it('does not include .next', () => {
      expect(output).not.toContain('.next');
    });

    it('does not include out', () => {
      expect(output).not.toMatch(/^out$/m);
    });
  });

  describe('cross-framework isolation', () => {
    it('node-ts does not include .next or out', () => {
      const output = generatePrettierIgnore(withConfig({ framework: 'node-ts' }));
      expect(output).not.toContain('.next');
      expect(output).not.toMatch(/^out$/m);
    });

    it('nextjs-ts prettierignore is different from react-vite-ts', () => {
      const next = generatePrettierIgnore(withConfig({ framework: 'nextjs-ts' }));
      const react = generatePrettierIgnore(withConfig({ framework: 'react-vite-ts' }));
      expect(next).not.toBe(react);
    });
  });
});
