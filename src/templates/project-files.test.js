import { describe, it, expect } from 'vitest';
import {
  generateEslintConfig,
  generatePrettierRc,
  generatePrettierIgnore,
  getFrameworkFiles,
  generatePackageJson,
  generateTsConfig,
  generateGitignore,
  generateEnv,
  generateReadme,
  generateViteConfig,
  generateNextConfig,
  generateVitestConfig,
  generateIndexHtml,
  generateApp,
  generateMain,
  generateNextLayout,
  generateNextPage,
  generateNodeIndex,
  generateSetupTests,
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
    const react = generateEslintConfig(
      withConfig({ framework: 'react-vite-ts' }),
    );
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
      const eslintEntry = files.find(([path]) =>
        path.includes('eslint.config'),
      );
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
      const eslintEntry = files.find(([path]) =>
        path.includes('eslint.config'),
      );
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
    const output = generatePrettierIgnore(
      withConfig({ framework: 'nextjs-ts' }),
    );

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
    const output = generatePrettierIgnore(
      withConfig({ framework: 'react-vite-ts' }),
    );

    it('does not include .next', () => {
      expect(output).not.toContain('.next');
    });

    it('does not include out', () => {
      expect(output).not.toMatch(/^out$/m);
    });
  });

  describe('cross-framework isolation', () => {
    it('node-ts does not include .next or out', () => {
      const output = generatePrettierIgnore(
        withConfig({ framework: 'node-ts' }),
      );
      expect(output).not.toContain('.next');
      expect(output).not.toMatch(/^out$/m);
    });

    it('nextjs-ts prettierignore is different from react-vite-ts', () => {
      const next = generatePrettierIgnore(
        withConfig({ framework: 'nextjs-ts' }),
      );
      const react = generatePrettierIgnore(
        withConfig({ framework: 'react-vite-ts' }),
      );
      expect(next).not.toBe(react);
    });
  });
});

// ---------------------------------------------------------------------------
// generatePackageJson
// ---------------------------------------------------------------------------

describe('generatePackageJson', () => {
  const requiredScripts = [
    'dev',
    'build',
    'test',
    'test:watch',
    'lint',
    'lint:fix',
    'typecheck',
    'format',
  ];

  for (const framework of ['react-vite-ts', 'nextjs-ts', 'node-ts']) {
    describe(framework, () => {
      const output = generatePackageJson(withConfig({ framework }));
      const pkg = JSON.parse(output);

      it('returns valid JSON', () => {
        expect(() => JSON.parse(output)).not.toThrow();
      });

      it('has the correct project name', () => {
        expect(pkg.name).toBe('test-project');
      });

      it('has private: true', () => {
        expect(pkg.private).toBe(true);
      });

      it('has all required scripts', () => {
        for (const script of requiredScripts) {
          expect(pkg.scripts).toHaveProperty(script);
        }
      });
    });
  }

  describe('react-vite-ts specifics', () => {
    const pkg = JSON.parse(
      generatePackageJson(withConfig({ framework: 'react-vite-ts' })),
    );

    it('scripts.dev is vite', () => {
      expect(pkg.scripts.dev).toBe('vite');
    });

    it('devDependencies includes vite', () => {
      expect(pkg.devDependencies).toHaveProperty('vite');
    });

    it('devDependencies includes @vitejs/plugin-react', () => {
      expect(pkg.devDependencies).toHaveProperty('@vitejs/plugin-react');
    });
  });

  describe('nextjs-ts specifics', () => {
    const pkg = JSON.parse(
      generatePackageJson(withConfig({ framework: 'nextjs-ts' })),
    );

    it('scripts.dev is next dev', () => {
      expect(pkg.scripts.dev).toBe('next dev');
    });

    it('dependencies includes next', () => {
      expect(pkg.dependencies).toHaveProperty('next');
    });

    it('devDependencies includes @eslint/eslintrc', () => {
      expect(pkg.devDependencies).toHaveProperty('@eslint/eslintrc');
    });
  });

  describe('node-ts specifics', () => {
    const pkg = JSON.parse(
      generatePackageJson(withConfig({ framework: 'node-ts' })),
    );

    it('scripts.dev is tsx watch src/index.ts', () => {
      expect(pkg.scripts.dev).toBe('tsx watch src/index.ts');
    });

    it('devDependencies includes tsx', () => {
      expect(pkg.devDependencies).toHaveProperty('tsx');
    });
  });
});

// ---------------------------------------------------------------------------
// generateTsConfig
// ---------------------------------------------------------------------------

describe('generateTsConfig', () => {
  for (const framework of ['react-vite-ts', 'nextjs-ts', 'node-ts']) {
    it(`${framework}: returns valid JSON`, () => {
      const output = generateTsConfig(withConfig({ framework }));
      expect(() => JSON.parse(output)).not.toThrow();
    });
  }

  describe('react-vite-ts', () => {
    const tsconfig = JSON.parse(
      generateTsConfig(withConfig({ framework: 'react-vite-ts' })),
    );

    it('has jsx set to react-jsx', () => {
      expect(tsconfig.compilerOptions.jsx).toBe('react-jsx');
    });

    it('has noEmit set to true', () => {
      expect(tsconfig.compilerOptions.noEmit).toBe(true);
    });
  });

  describe('nextjs-ts', () => {
    const tsconfig = JSON.parse(
      generateTsConfig(withConfig({ framework: 'nextjs-ts' })),
    );

    it('has jsx set to preserve', () => {
      expect(tsconfig.compilerOptions.jsx).toBe('preserve');
    });

    it('has plugins array with next plugin', () => {
      expect(tsconfig.compilerOptions.plugins).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: 'next' })]),
      );
    });

    it('has paths alias', () => {
      expect(tsconfig.compilerOptions.paths).toBeDefined();
      expect(tsconfig.compilerOptions.paths['@/*']).toBeDefined();
    });
  });

  describe('node-ts', () => {
    const tsconfig = JSON.parse(
      generateTsConfig(withConfig({ framework: 'node-ts' })),
    );

    it('has outDir set to ./dist', () => {
      expect(tsconfig.compilerOptions.outDir).toBe('./dist');
    });

    it('has module set to NodeNext', () => {
      expect(tsconfig.compilerOptions.module).toBe('NodeNext');
    });

    it('does not have jsx property', () => {
      expect(tsconfig.compilerOptions.jsx).toBeUndefined();
    });
  });
});

// ---------------------------------------------------------------------------
// generateGitignore
// ---------------------------------------------------------------------------

describe('generateGitignore', () => {
  for (const framework of ['react-vite-ts', 'nextjs-ts', 'node-ts']) {
    describe(`${framework}: common entries`, () => {
      const output = generateGitignore(withConfig({ framework }));

      it('includes node_modules', () => {
        expect(output).toContain('node_modules');
      });

      it('includes .env', () => {
        expect(output).toContain('.env');
      });

      it('includes .DS_Store', () => {
        expect(output).toContain('.DS_Store');
      });

      it('includes .claude.json', () => {
        expect(output).toContain('.claude.json');
      });
    });
  }

  it('nextjs-ts includes .next/', () => {
    const output = generateGitignore(withConfig({ framework: 'nextjs-ts' }));
    expect(output).toContain('.next/');
  });

  it('node-ts includes dist/', () => {
    const output = generateGitignore(withConfig({ framework: 'node-ts' }));
    expect(output).toContain('dist/');
  });

  it('react-vite-ts does NOT include .next/', () => {
    const output = generateGitignore(
      withConfig({ framework: 'react-vite-ts' }),
    );
    expect(output).not.toContain('.next/');
  });
});

// ---------------------------------------------------------------------------
// generateEnv
// ---------------------------------------------------------------------------

describe('generateEnv', () => {
  it('includes ANTHROPIC_API_KEY when useAnthropicApi is true', () => {
    const output = generateEnv(withConfig({ useAnthropicApi: true }));
    expect(output).toContain('ANTHROPIC_API_KEY');
  });

  it('does NOT include ANTHROPIC_API_KEY when useAnthropicApi is false', () => {
    const output = generateEnv(withConfig({ useAnthropicApi: false }));
    expect(output).not.toContain('ANTHROPIC_API_KEY');
  });

  it('includes additional keys from additionalKeys', () => {
    const output = generateEnv(
      withConfig({ additionalKeys: ['MY_KEY', 'OTHER_KEY'] }),
    );
    expect(output).toContain('MY_KEY=');
    expect(output).toContain('OTHER_KEY=');
  });

  it('handles empty additionalKeys array', () => {
    const output = generateEnv(withConfig({ additionalKeys: [] }));
    // Should still produce output (at least the warning comment)
    expect(output.length).toBeGreaterThan(0);
  });

  it('includes the never commit warning comment', () => {
    const output = generateEnv(withConfig({}));
    expect(output).toContain('never commit');
  });
});

// ---------------------------------------------------------------------------
// generateReadme
// ---------------------------------------------------------------------------

describe('generateReadme', () => {
  const output = generateReadme(baseConfig);

  it('includes the project name', () => {
    expect(output).toContain('test-project');
  });

  it('includes devcontainer setup instructions', () => {
    expect(output).toContain('Reopen in Container');
  });

  it('includes the correct dev server port', () => {
    expect(output).toContain('5173');
  });

  it('mentions CLAUDE.md', () => {
    expect(output).toContain('CLAUDE.md');
  });

  it('mentions docs/', () => {
    expect(output).toContain('docs/');
  });
});

// ---------------------------------------------------------------------------
// getFrameworkFiles — config file presence
// ---------------------------------------------------------------------------

describe('getFrameworkFiles config file presence', () => {
  it('react-vite-ts generates vite.config.ts', () => {
    const files = getFrameworkFiles(withConfig({ framework: 'react-vite-ts' }));
    const paths = files.map(([p]) => p);
    expect(paths).toContain('vite.config.ts');
  });

  it('nextjs-ts generates next.config.ts but NOT vite.config.ts', () => {
    const files = getFrameworkFiles(withConfig({ framework: 'nextjs-ts' }));
    const paths = files.map(([p]) => p);
    expect(paths).toContain('next.config.ts');
    expect(paths).not.toContain('vite.config.ts');
  });

  it('node-ts generates neither vite.config.ts nor next.config.ts', () => {
    const files = getFrameworkFiles(withConfig({ framework: 'node-ts' }));
    const paths = files.map(([p]) => p);
    expect(paths).not.toContain('vite.config.ts');
    expect(paths).not.toContain('next.config.ts');
  });

  it('react-vite-ts generates index.html', () => {
    const files = getFrameworkFiles(withConfig({ framework: 'react-vite-ts' }));
    const paths = files.map(([p]) => p);
    expect(paths).toContain('index.html');
  });

  it('nextjs-ts does NOT generate index.html', () => {
    const files = getFrameworkFiles(withConfig({ framework: 'nextjs-ts' }));
    const paths = files.map(([p]) => p);
    expect(paths).not.toContain('index.html');
  });

  it('node-ts does NOT generate index.html', () => {
    const files = getFrameworkFiles(withConfig({ framework: 'node-ts' }));
    const paths = files.map(([p]) => p);
    expect(paths).not.toContain('index.html');
  });
});

// ---------------------------------------------------------------------------
// Starter file tests
// ---------------------------------------------------------------------------

describe('starter files', () => {
  describe('react-vite-ts', () => {
    const config = withConfig({ framework: 'react-vite-ts' });

    it('generateApp returns content with project name', () => {
      const output = generateApp(config);
      expect(output).toContain('test-project');
    });

    it('generateMain returns content with StrictMode', () => {
      const output = generateMain();
      expect(output).toContain('StrictMode');
    });
  });

  describe('nextjs-ts', () => {
    const config = withConfig({ framework: 'nextjs-ts' });

    it('generateNextLayout returns content with project name', () => {
      const output = generateNextLayout(config);
      expect(output).toContain('test-project');
    });

    it('generateNextPage returns content with project name', () => {
      const output = generateNextPage(config);
      expect(output).toContain('test-project');
    });
  });

  describe('node-ts', () => {
    const config = withConfig({ framework: 'node-ts' });

    it('generateNodeIndex returns content with project name', () => {
      const output = generateNodeIndex(config);
      expect(output).toContain('test-project');
    });
  });
});
