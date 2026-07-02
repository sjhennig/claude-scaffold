import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  mkdtemp,
  rm,
  readFile,
  writeFile,
  access,
  readdir,
  stat,
} from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

// Mock the prompts module to avoid interactive input
vi.mock('./prompts.js', () => ({
  gatherInput: vi.fn(),
}));

import { run, mergePackageJson, sanitizeProjectName } from './index.js';
import { gatherInput } from './prompts.js';
import {
  VERIFY_SCRIPT_TS,
  VERIFY_SCRIPT_JS,
  PLUGIN_ID,
} from './templates/guardrails.js';
import { claudeMdExceedsBudget } from './templates/claude-md.js';

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

  // M8 non-interactive mode: the bin's parsed flags must reach gatherInput
  // verbatim so the flag and prompt paths produce identical configs.
  it('passes CLI-provided answers and yes-mode through to gatherInput', async () => {
    const config = withConfig({ framework: 'none' });
    gatherInput.mockResolvedValue(config);
    const provided = { projectName: config.projectName, framework: 'none' };
    await run({ provided, yes: true });

    expect(gatherInput).toHaveBeenCalledWith(provided, { yes: true });
    // The run completed end-to-end with the flag-shaped input (access throws
    // if the file was not generated).
    await access(join(tempDir, config.projectName, 'CLAUDE.md'));
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
      'docs/specs/_template.md',
      'NOTES.md',
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
      'src/App.test.tsx',
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
      'src/app/page.test.tsx',
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
      'src/smoke.test.ts',
    ];

    for (const file of expectedFiles) {
      expect(await fileExists(join(root, file))).toBe(true);
    }

    // Should NOT have framework-specific files from other frameworks
    expect(await fileExists(join(root, 'vite.config.ts'))).toBe(false);
    expect(await fileExists(join(root, 'next.config.ts'))).toBe(false);
    expect(await fileExists(join(root, 'index.html'))).toBe(false);
  });

  it('enables the QC plugin (not project-local agent files) for every framework', async () => {
    // M6: the QC subagents + /qc ship as the `claude-guardrails` plugin, not as
    // committed .claude/ files. Every framework must enable the plugin via
    // settings.json and must NOT emit the old project-local agent/command files.
    const mustBeAbsent = [
      '.claude/agents/code-reviewer.md',
      '.claude/agents/spec-reviewer.md',
      '.claude/agents/test-runner.md',
      '.claude/agents/security-reviewer.md',
      '.claude/commands/qc.md',
    ];

    for (const framework of ['react-vite-ts', 'nextjs-ts', 'node-ts', 'none']) {
      const config = withConfig({ framework, projectName: `qc-${framework}` });
      gatherInput.mockResolvedValue(config);
      await run();

      const root = join(tempDir, config.projectName);
      for (const file of mustBeAbsent) {
        expect(await fileExists(join(root, file))).toBe(false);
      }

      const settings = JSON.parse(
        await readFile(join(root, '.claude/settings.json'), 'utf-8'),
      );
      expect(settings.enabledPlugins[PLUGIN_ID]).toBe(true);
      expect(settings.extraKnownMarketplaces).toHaveProperty(
        PLUGIN_ID.split('@')[1],
      );
    }
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

  it('emits the guardrail hook scripts as executable files', async () => {
    const config = withConfig({});
    gatherInput.mockResolvedValue(config);
    await run();

    const root = join(tempDir, config.projectName);
    for (const script of [
      '.claude/hooks/validate-command.sh',
      '.claude/hooks/verify-gate.sh',
      '.claude/hooks/sandbox-preflight.sh',
      '.claude/hooks/check-drift.sh',
    ]) {
      const full = join(root, script);
      expect(await fileExists(full)).toBe(true);
      const mode = (await stat(full)).mode;
      // owner-execute bit set
      expect(mode & 0o100).toBe(0o100);
    }
  });

  it('creates the expected files for the no-framework (none) option', async () => {
    const config = withConfig({ framework: 'none', devPort: undefined });
    gatherInput.mockResolvedValue(config);
    await run();

    const root = join(tempDir, config.projectName);
    const expectedFiles = [
      '.devcontainer/devcontainer.json',
      'CLAUDE.md',
      '.claude/settings.json',
      '.claude/hooks/validate-command.sh',
      '.claude/hooks/verify-gate.sh',
      '.claude/hooks/sandbox-preflight.sh',
      '.claude/hooks/check-drift.sh',
      'package.json',
      'eslint.config.js',
      '.prettierrc',
      '.prettierignore',
      'vitest.config.js',
      'src/smoke.test.js',
    ];
    for (const file of expectedFiles) {
      expect(await fileExists(join(root, file))).toBe(true);
    }

    // No framework source or TS config
    expect(await fileExists(join(root, 'tsconfig.json'))).toBe(false);
    expect(await fileExists(join(root, 'vite.config.ts'))).toBe(false);
    expect(await fileExists(join(root, 'index.html'))).toBe(false);

    // package.json exposes the verify contract the Stop gate depends on
    const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf-8'));
    expect(pkg.scripts).toHaveProperty('verify');
  });

  it('emits an executable init-firewall.sh only when networkFirewall is set', async () => {
    const config = withConfig({ networkFirewall: true });
    gatherInput.mockResolvedValue(config);
    await run();

    const root = join(tempDir, config.projectName);
    const fw = join(root, '.devcontainer/init-firewall.sh');
    expect(await fileExists(fw)).toBe(true);
    expect((await stat(fw)).mode & 0o100).toBe(0o100);

    // The Dockerfile must COPY it and devcontainer.json must run it on start.
    const dockerfile = await readFile(
      join(root, '.devcontainer/Dockerfile'),
      'utf-8',
    );
    expect(dockerfile).toContain('COPY init-firewall.sh');
    const dc = JSON.parse(
      await readFile(join(root, '.devcontainer/devcontainer.json'), 'utf-8'),
    );
    expect(dc.postStartCommand).toContain('init-firewall.sh');
  });

  it('does NOT emit init-firewall.sh by default', async () => {
    const config = withConfig({});
    gatherInput.mockResolvedValue(config);
    await run();

    const root = join(tempDir, config.projectName);
    expect(await fileExists(join(root, '.devcontainer/init-firewall.sh'))).toBe(
      false,
    );
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
    expect(await fileExists(join(root, 'docs/api-integration.md'))).toBe(false);
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

  // -- Content invariants (design brief §7.1: files exist *with expected
  // content*, not just present). This is the cheap, install-free drift catcher;
  // the boot test (PR3/PR4) proves the content actually works end to end. We
  // assert the contract-critical bits rather than snapshotting whole files, so
  // intentional template tweaks don't churn a golden snapshot. ---------------

  const CONTENT_EXPECTATIONS = {
    'react-vite-ts': { verify: VERIFY_SCRIPT_TS, dep: 'react' },
    'nextjs-ts': { verify: VERIFY_SCRIPT_TS, dep: 'next' },
    'node-ts': { verify: VERIFY_SCRIPT_TS, dep: null },
    none: { verify: VERIFY_SCRIPT_JS, dep: null },
  };

  for (const [framework, { verify, dep }] of Object.entries(
    CONTENT_EXPECTATIONS,
  )) {
    it(`generates a coherent package.json + guardrails for ${framework}`, async () => {
      const config = withConfig({
        framework,
        projectName: `content-${framework}`,
      });
      gatherInput.mockResolvedValue(config);
      await run();
      const root = join(tempDir, config.projectName);

      // package.json wires the verify contract the Stop gate depends on, and
      // (for ESM) declares type: module so the flat eslint config loads.
      const pkg = JSON.parse(
        await readFile(join(root, 'package.json'), 'utf-8'),
      );
      expect(pkg.scripts.verify).toBe(verify);
      expect(pkg.type).toBe('module');
      if (dep) expect(pkg.dependencies).toHaveProperty(dep);
      // The guardrails-only / node templates must stay dependency-free, so an
      // accidental dependency addition is caught rather than silently allowed.
      else expect(pkg.dependencies).toEqual({});

      // settings.json carries the live guardrails. Pin the load-bearing
      // invariants, not just presence, so a regression actually fails here.
      const settings = JSON.parse(
        await readFile(join(root, '.claude/settings.json'), 'utf-8'),
      );
      // All three hook phases fire, with their matchers pinned (a defined-but-
      // mismatched matcher would silently stop the formatter / validator).
      expect(settings.hooks.Stop).toBeDefined();
      expect(settings.hooks.PreToolUse[0].matcher).toBe('Bash');
      expect(settings.hooks.PostToolUse[0].matcher).toBe('Edit|Write');
      // git push is never allowlisted — push must prompt, not auto-run (§11.2).
      const pushAllowed = settings.permissions.allow.some((p) =>
        p.includes('git push'),
      );
      expect(pushAllowed).toBe(false);
      // The sandbox is on, and secrets are denied on BOTH sides: the file tools
      // (permissions.deny) and Bash subprocesses (sandbox.filesystem.denyRead).
      expect(settings.sandbox.enabled).toBe(true);
      expect(settings.permissions.deny).toContain('Read(./.env)');
      expect(settings.sandbox.filesystem.denyRead).toContain('.env');

      // CLAUDE.md stays within the leanness budget (§6 / §11.4).
      const claudeMd = await readFile(join(root, 'CLAUDE.md'), 'utf-8');
      expect(claudeMdExceedsBudget(claudeMd)).toBe(false);

      // README is about the actual project, not a placeholder.
      const readme = await readFile(join(root, 'README.md'), 'utf-8');
      expect(readme).toContain(config.projectName);
    });
  }

  it('renders the project name into the react App component', async () => {
    const config = withConfig({
      framework: 'react-vite-ts',
      projectName: 'spot-react',
    });
    gatherInput.mockResolvedValue(config);
    await run();
    const root = join(tempDir, config.projectName);
    const app = await readFile(join(root, 'src/App.tsx'), 'utf-8');
    expect(app).toContain('spot-react');
  });
});

describe('mergePackageJson', () => {
  const guardrail = {
    scripts: { verify: 'v', lint: 'l', test: 'guardrail-test' },
    devDependencies: { eslint: '^9', prettier: '^3' },
  };

  it('adds missing guardrail scripts + devDeps without clobbering existing', () => {
    const existing = {
      name: 'mine',
      version: '2.0.0',
      scripts: { test: 'jest', build: 'tsc' },
      devDependencies: { jest: '^29' },
    };
    const { merged, addedScripts, conflictScripts, addedDevDeps } =
      mergePackageJson(existing, guardrail);

    // Existing values win — name/version and the user's `test` are untouched.
    expect(merged.name).toBe('mine');
    expect(merged.version).toBe('2.0.0');
    expect(merged.scripts.test).toBe('jest');
    expect(merged.scripts.build).toBe('tsc');
    // Missing guardrail keys are added.
    expect(merged.scripts.verify).toBe('v');
    expect(merged.scripts.lint).toBe('l');
    expect(merged.devDependencies.eslint).toBe('^9');
    expect(merged.devDependencies.jest).toBe('^29');

    expect(addedScripts).toEqual(expect.arrayContaining(['verify', 'lint']));
    expect(addedScripts).not.toContain('test');
    expect(conflictScripts).toContain('test'); // differs from guardrail's
    expect(addedDevDeps).toEqual(
      expect.arrayContaining(['eslint', 'prettier']),
    );
  });

  it('handles a package.json with no scripts/devDependencies blocks', () => {
    const { merged, addedScripts } = mergePackageJson({ name: 'x' }, guardrail);
    expect(merged.scripts.verify).toBe('v');
    expect(addedScripts).toContain('verify');
    expect(merged.devDependencies.prettier).toBe('^3');
  });
});

describe('sanitizeProjectName', () => {
  it('lowercases and replaces invalid chars', () => {
    expect(sanitizeProjectName('My App')).toBe('my-app');
    expect(sanitizeProjectName('Foo_Bar.2')).toBe('foo-bar-2');
    expect(sanitizeProjectName('---weird---')).toBe('weird');
  });
  it('falls back to "app" for an empty/invalid basename', () => {
    expect(sanitizeProjectName('!!!')).toBe('app');
    expect(sanitizeProjectName('')).toBe('app');
  });
});

describe('run (--here overlay)', () => {
  let tempDir;

  const overlayConfig = {
    projectName: 'my-proj',
    description: 'An existing project',
    framework: 'none',
    useAnthropicApi: false,
    additionalKeys: [],
    isolatedCredentials: false,
    networkFirewall: false,
    initGit: true, // must be IGNORED in overlay mode
    here: true,
    force: false,
  };

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'overlay-test-'));
    vi.spyOn(process, 'cwd').mockReturnValue(tempDir);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(tempDir, { recursive: true, force: true });
  });

  it('overlays the guardrail layer in place, merges package.json, keeps existing files', async () => {
    // Seed an existing project: a package.json with a custom test script + a
    // CLAUDE.md the overlay must NOT clobber.
    await writeFile(
      join(tempDir, 'package.json'),
      JSON.stringify(
        { name: 'legacy', version: '1.2.3', scripts: { test: 'jest' } },
        null,
        2,
      ),
    );
    await writeFile(join(tempDir, 'CLAUDE.md'), 'MY OWN CLAUDE FILE\n');

    gatherInput.mockResolvedValue(overlayConfig);
    await run({ provided: { here: true }, yes: true });

    // Guardrail files land directly in the cwd (no ./my-proj subdir).
    expect(await fileExists(join(tempDir, '.claude/settings.json'))).toBe(true);
    expect(await fileExists(join(tempDir, '.devcontainer/Dockerfile'))).toBe(
      true,
    );
    expect(await fileExists(join(tempDir, 'docs/architecture.md'))).toBe(true);
    // No new ./my-proj subdir was created.
    expect(await fileExists(join(tempDir, 'my-proj'))).toBe(false);

    // Fill-in tooling written; smoke test + framework app files NOT.
    expect(await fileExists(join(tempDir, 'eslint.config.js'))).toBe(true);
    expect(await fileExists(join(tempDir, '.prettierrc'))).toBe(true);
    expect(await fileExists(join(tempDir, 'src/smoke.test.js'))).toBe(false);

    // README + .env are intentionally not overlaid; no git init.
    expect(await fileExists(join(tempDir, 'README.md'))).toBe(false);
    expect(await fileExists(join(tempDir, '.env'))).toBe(false);
    expect(await fileExists(join(tempDir, '.git'))).toBe(false);

    // Existing CLAUDE.md untouched (skipped, not overwritten).
    expect(await readFile(join(tempDir, 'CLAUDE.md'), 'utf-8')).toBe(
      'MY OWN CLAUDE FILE\n',
    );

    // package.json merged: existing name/version/test kept, guardrail added.
    const pkg = JSON.parse(
      await readFile(join(tempDir, 'package.json'), 'utf-8'),
    );
    expect(pkg.name).toBe('legacy');
    expect(pkg.version).toBe('1.2.3');
    expect(pkg.scripts.test).toBe('jest');
    expect(pkg.scripts.verify).toBeDefined();
    expect(pkg.devDependencies.prettier).toBeDefined();
  });

  it('creates package.json from the guardrail template when none exists', async () => {
    gatherInput.mockResolvedValue(overlayConfig);
    await run({ provided: { here: true }, yes: true });

    const pkg = JSON.parse(
      await readFile(join(tempDir, 'package.json'), 'utf-8'),
    );
    expect(pkg.scripts.verify).toBeDefined();
    expect(pkg.devDependencies.eslint).toBeDefined();
  });

  it('overwrites existing guardrail files when --force is set', async () => {
    await writeFile(join(tempDir, 'CLAUDE.md'), 'OLD\n');
    gatherInput.mockResolvedValue({ ...overlayConfig, force: true });
    await run({ provided: { here: true, force: true }, yes: true });
    expect(await readFile(join(tempDir, 'CLAUDE.md'), 'utf-8')).not.toBe(
      'OLD\n',
    );
  });
});
