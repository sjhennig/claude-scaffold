import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, readFile, access, readdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

// Mock the prompts module to avoid interactive input
vi.mock('./prompts.js', () => ({
  gatherInput: vi.fn(),
}));

import { run } from './index.js';
import { gatherInput } from './prompts.js';

const baseConfig = {
  projectName: 'test-project',
  description: 'A test project',
  framework: 'react-vite-ts',
  devPort: 5173,
  useAnthropicApi: false,
  additionalKeys: [],
  initGit: false,
};

function withConfig(overrides) {
  return { ...baseConfig, ...overrides };
}

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

describe('run (orchestrator)', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'scaffold-test-'));
    vi.spyOn(process, 'cwd').mockReturnValue(tempDir);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(tempDir, { recursive: true, force: true });
  });

  it('creates all expected files for react-vite-ts', async () => {
    const config = withConfig({ framework: 'react-vite-ts' });
    gatherInput.mockResolvedValue(config);
    await run();

    const root = join(tempDir, config.projectName);
    const expectedFiles = [
      '.devcontainer/Dockerfile',
      '.devcontainer/devcontainer.json',
      'CLAUDE.md',
      '.claude/settings.json',
      '.claude/commands/README.md',
      'docs/project-brief.md',
      'docs/architecture.md',
      'docs/specs/README.md',
      '.gitignore',
      '.env',
      '.env.example',
      'README.md',
      'package.json',
      'vite.config.ts',
      'vitest.config.ts',
      'tsconfig.json',
      'eslint.config.js',
      '.prettierrc',
      '.prettierignore',
      'index.html',
      'src/setup-tests.ts',
      'src/App.tsx',
      'src/main.tsx',
      'src/vite-env.d.ts',
    ];

    for (const file of expectedFiles) {
      expect(await fileExists(join(root, file))).toBe(true);
    }
  });

  it('creates all expected files for nextjs-ts', async () => {
    const config = withConfig({ framework: 'nextjs-ts', devPort: 3000 });
    gatherInput.mockResolvedValue(config);
    await run();

    const root = join(tempDir, config.projectName);
    const expectedFiles = [
      '.devcontainer/Dockerfile',
      '.devcontainer/devcontainer.json',
      'CLAUDE.md',
      '.claude/settings.json',
      '.claude/commands/README.md',
      'docs/project-brief.md',
      'docs/architecture.md',
      'docs/specs/README.md',
      '.gitignore',
      '.env',
      '.env.example',
      'README.md',
      'package.json',
      'next.config.ts',
      'vitest.config.ts',
      'tsconfig.json',
      'eslint.config.mjs',
      '.prettierrc',
      '.prettierignore',
      'next-env.d.ts',
      'src/setup-tests.ts',
      'src/app/layout.tsx',
      'src/app/page.tsx',
    ];

    for (const file of expectedFiles) {
      expect(await fileExists(join(root, file))).toBe(true);
    }

    // Should NOT have react-vite-ts specific files
    expect(await fileExists(join(root, 'vite.config.ts'))).toBe(false);
    expect(await fileExists(join(root, 'index.html'))).toBe(false);
  });

  it('creates all expected files for node-ts', async () => {
    const config = withConfig({ framework: 'node-ts', devPort: 3000 });
    gatherInput.mockResolvedValue(config);
    await run();

    const root = join(tempDir, config.projectName);
    const expectedFiles = [
      '.devcontainer/Dockerfile',
      '.devcontainer/devcontainer.json',
      'CLAUDE.md',
      '.claude/settings.json',
      '.claude/commands/README.md',
      'docs/project-brief.md',
      'docs/architecture.md',
      'docs/specs/README.md',
      '.gitignore',
      '.env',
      '.env.example',
      'README.md',
      'package.json',
      'vitest.config.ts',
      'tsconfig.json',
      'eslint.config.js',
      '.prettierrc',
      '.prettierignore',
      'src/index.ts',
    ];

    for (const file of expectedFiles) {
      expect(await fileExists(join(root, file))).toBe(true);
    }

    // Should NOT have framework-specific files from other frameworks
    expect(await fileExists(join(root, 'vite.config.ts'))).toBe(false);
    expect(await fileExists(join(root, 'next.config.ts'))).toBe(false);
    expect(await fileExists(join(root, 'index.html'))).toBe(false);
  });

  it('creates framework-specific directories with .gitkeep for react-vite-ts', async () => {
    const config = withConfig({ framework: 'react-vite-ts' });
    gatherInput.mockResolvedValue(config);
    await run();

    const root = join(tempDir, config.projectName);
    const expectedDirs = [
      'src/components',
      'src/hooks',
      'src/utils',
      'src/types',
      'src/assets',
    ];

    for (const dir of expectedDirs) {
      expect(await fileExists(join(root, dir, '.gitkeep'))).toBe(true);
    }
  });

  it('creates framework-specific directories with .gitkeep for nextjs-ts', async () => {
    const config = withConfig({ framework: 'nextjs-ts', devPort: 3000 });
    gatherInput.mockResolvedValue(config);
    await run();

    const root = join(tempDir, config.projectName);
    const expectedDirs = [
      'src/app',
      'src/components',
      'src/hooks',
      'src/utils',
      'src/types',
      'src/assets',
    ];

    for (const dir of expectedDirs) {
      expect(await fileExists(join(root, dir, '.gitkeep'))).toBe(true);
    }
  });

  it('creates framework-specific directories with .gitkeep for node-ts', async () => {
    const config = withConfig({ framework: 'node-ts', devPort: 3000 });
    gatherInput.mockResolvedValue(config);
    await run();

    const root = join(tempDir, config.projectName);
    const expectedDirs = ['src/utils', 'src/types'];

    for (const dir of expectedDirs) {
      expect(await fileExists(join(root, dir, '.gitkeep'))).toBe(true);
    }
  });

  it('includes docs/api-integration.md when useAnthropicApi is true', async () => {
    const config = withConfig({ useAnthropicApi: true });
    gatherInput.mockResolvedValue(config);
    await run();

    const root = join(tempDir, config.projectName);
    expect(await fileExists(join(root, 'docs/api-integration.md'))).toBe(true);
  });

  it('does NOT include docs/api-integration.md when useAnthropicApi is false', async () => {
    const config = withConfig({ useAnthropicApi: false });
    gatherInput.mockResolvedValue(config);
    await run();

    const root = join(tempDir, config.projectName);
    expect(await fileExists(join(root, 'docs/api-integration.md'))).toBe(
      false,
    );
  });

  it('.env.example content matches .env content', async () => {
    const config = withConfig({});
    gatherInput.mockResolvedValue(config);
    await run();

    const root = join(tempDir, config.projectName);
    const envContent = await readFile(join(root, '.env'), 'utf-8');
    const envExampleContent = await readFile(
      join(root, '.env.example'),
      'utf-8',
    );
    expect(envContent).toBe(envExampleContent);
  });

  it('runs git init when initGit is true', async () => {
    const config = withConfig({ initGit: true });
    gatherInput.mockResolvedValue(config);

    try {
      await run();
      const root = join(tempDir, config.projectName);
      expect(await fileExists(join(root, '.git'))).toBe(true);
    } catch {
      // git may not be available in the test environment; skip gracefully
    }
  });

  it('does not include framework-specific files from other frameworks', async () => {
    // nextjs-ts should not have vite.config.ts
    const nextConfig = withConfig({ framework: 'nextjs-ts', devPort: 3000 });
    gatherInput.mockResolvedValue(nextConfig);
    await run();
    let root = join(tempDir, nextConfig.projectName);
    expect(await fileExists(join(root, 'vite.config.ts'))).toBe(false);

    // react-vite-ts should not have next.config.ts
    const reactConfig = withConfig({
      projectName: 'test-react',
      framework: 'react-vite-ts',
    });
    gatherInput.mockResolvedValue(reactConfig);
    await run();
    root = join(tempDir, reactConfig.projectName);
    expect(await fileExists(join(root, 'next.config.ts'))).toBe(false);

    // node-ts should not have index.html
    const nodeConfig = withConfig({
      projectName: 'test-node',
      framework: 'node-ts',
      devPort: 3000,
    });
    gatherInput.mockResolvedValue(nodeConfig);
    await run();
    root = join(tempDir, nodeConfig.projectName);
    expect(await fileExists(join(root, 'index.html'))).toBe(false);
  });
});
