/**
 * Generates package.json, configs, starter source files, .gitignore,
 * .env, README, and index.html for the scaffolded project.
 */

// ---------------------------------------------------------------------------
// package.json
// ---------------------------------------------------------------------------

const packagesByFramework = {
  'react-vite-ts': {
    scripts: {
      dev: 'vite',
      build: 'tsc -b && vite build',
      preview: 'vite preview',
      test: 'vitest run',
      'test:watch': 'vitest',
      lint: 'eslint .',
      'lint:fix': 'eslint . --fix',
      typecheck: 'tsc -b',
      format: 'prettier --write "src/**/*.{ts,tsx,css}"',
    },
    dependencies: {
      react: '^19.0.0',
      'react-dom': '^19.0.0',
    },
    devDependencies: {
      '@eslint/js': '^9.17.0',
      '@testing-library/jest-dom': '^6.6.3',
      '@testing-library/react': '^16.1.0',
      '@testing-library/user-event': '^14.5.2',
      '@types/react': '^19.0.0',
      '@types/react-dom': '^19.0.0',
      '@vitejs/plugin-react': '^4.3.4',
      eslint: '^9.17.0',
      'eslint-plugin-react-hooks': '^5.0.0',
      'eslint-plugin-react-refresh': '^0.4.16',
      globals: '^15.14.0',
      jsdom: '^25.0.1',
      prettier: '^3.4.2',
      typescript: '~5.7.0',
      'typescript-eslint': '^8.18.0',
      vite: '^6.0.0',
      vitest: '^2.1.8',
    },
  },
  'nextjs-ts': {
    scripts: {
      dev: 'next dev',
      build: 'next build',
      start: 'next start',
      test: 'vitest run',
      'test:watch': 'vitest',
      lint: 'next lint',
      'lint:fix': 'next lint --fix',
      typecheck: 'npx tsc --noEmit',
      format: "prettier --write 'src/**/*.{ts,tsx}' 'app/**/*.{ts,tsx}'",
    },
    dependencies: {
      next: '^15.0.0',
      react: '^19.0.0',
      'react-dom': '^19.0.0',
    },
    devDependencies: {
      '@eslint/js': '^9.0.0',
      '@testing-library/jest-dom': '^6.0.0',
      '@testing-library/react': '^16.0.0',
      '@testing-library/user-event': '^14.0.0',
      '@types/react': '^19.0.0',
      '@types/react-dom': '^19.0.0',
      '@vitejs/plugin-react': '^4.3.4',
      eslint: '^9.0.0',
      'eslint-config-next': '^15.0.0',
      jsdom: '^25.0.0',
      prettier: '^3.4.0',
      typescript: '~5.7.0',
      vitest: '^3.0.0',
    },
  },
  'node-ts': {
    type: 'module',
    scripts: {
      dev: 'tsx watch src/index.ts',
      build: 'tsc',
      start: 'node dist/index.js',
      test: 'vitest run',
      'test:watch': 'vitest',
      lint: 'eslint src/',
      'lint:fix': 'eslint src/ --fix',
      typecheck: 'npx tsc --noEmit',
      format: 'prettier --write src/',
    },
    dependencies: {},
    devDependencies: {
      '@eslint/js': '^9.0.0',
      '@types/node': '^22.0.0',
      eslint: '^9.0.0',
      globals: '^15.0.0',
      prettier: '^3.4.0',
      tsx: '^4.0.0',
      typescript: '~5.7.0',
      'typescript-eslint': '^8.0.0',
      vitest: '^3.0.0',
    },
  },
};

export function generatePackageJson(config) {
  const fw = packagesByFramework[config.framework];

  const pkg = {
    name: config.projectName,
    private: true,
    version: '0.0.1',
    ...(fw.type ? { type: fw.type } : { type: 'module' }),
    scripts: fw.scripts,
    dependencies: fw.dependencies,
    devDependencies: fw.devDependencies,
  };

  return JSON.stringify(pkg, null, 2) + '\n';
}

// ---------------------------------------------------------------------------
// Vite / Vitest / TypeScript configs
// ---------------------------------------------------------------------------

export function generateViteConfig(config) {
  return `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // Port forwarded by the devcontainer
    port: ${config.devPort},
    // Required for devcontainer port forwarding to work
    host: true,
  },
});
`;
}

const vitestConfigByFramework = {
  'react-vite-ts': () => `import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    // Use jsdom so React components can render in tests
    environment: 'jsdom',
    // Run setup file to extend expect with DOM matchers
    setupFiles: ['./src/setup-tests.ts'],
    reporters: ['verbose'],
  },
});
`,
  'nextjs-ts': () => `import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    // Use jsdom so React components can render in tests
    environment: 'jsdom',
    // Run setup file to extend expect with DOM matchers
    setupFiles: ['./src/setup-tests.ts'],
    reporters: ['verbose'],
  },
});
`,
  'node-ts': () => `import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    reporters: ['verbose'],
  },
});
`,
};

export function generateVitestConfig(config) {
  return vitestConfigByFramework[config.framework]();
}

const tsconfigByFramework = {
  'react-vite-ts': () => {
    const tsconfig = {
      compilerOptions: {
        target: 'ES2020',
        useDefineForClassFields: true,
        lib: ['ES2020', 'DOM', 'DOM.Iterable'],
        module: 'ESNext',
        skipLibCheck: true,

        /* Bundler mode */
        moduleResolution: 'bundler',
        allowImportingTsExtensions: true,
        isolatedModules: true,
        moduleDetection: 'force',
        noEmit: true,
        jsx: 'react-jsx',

        /* Linting */
        strict: true,
        noUnusedLocals: true,
        noUnusedParameters: true,
        noUncheckedIndexedAccess: true,
        noFallthroughCasesInSwitch: true,
      },
      include: ['src'],
    };
    return JSON.stringify(tsconfig, null, 2) + '\n';
  },
  'nextjs-ts': () => {
    const tsconfig = {
      compilerOptions: {
        target: 'ES2017',
        lib: ['dom', 'dom.iterable', 'esnext'],
        allowJs: true,
        skipLibCheck: true,
        strict: true,
        noEmit: true,
        esModuleInterop: true,
        module: 'esnext',
        moduleResolution: 'bundler',
        resolveJsonModule: true,
        isolatedModules: true,
        jsx: 'preserve',
        incremental: true,
        noUnusedLocals: true,
        noUnusedParameters: true,
        plugins: [{ name: 'next' }],
        paths: { '@/*': ['./src/*'] },
      },
      include: [
        'next-env.d.ts',
        '**/*.ts',
        '**/*.tsx',
        '.next/types/**/*.ts',
      ],
      exclude: ['node_modules'],
    };
    return JSON.stringify(tsconfig, null, 2) + '\n';
  },
  'node-ts': () => {
    const tsconfig = {
      compilerOptions: {
        target: 'ES2022',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        outDir: './dist',
        rootDir: './src',
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
        resolveJsonModule: true,
        declaration: true,
        declarationMap: true,
        sourceMap: true,
        noUnusedLocals: true,
        noUnusedParameters: true,
        noFallthroughCasesInSwitch: true,
        noUncheckedIndexedAccess: true,
      },
      include: ['src'],
      exclude: ['node_modules', 'dist'],
    };
    return JSON.stringify(tsconfig, null, 2) + '\n';
  },
};

export function generateTsConfig(config) {
  return tsconfigByFramework[config.framework]();
}

// ---------------------------------------------------------------------------
// Next.js config
// ---------------------------------------------------------------------------

export function generateNextConfig() {
  return `import type { NextConfig } from 'next';

const nextConfig: NextConfig = {};

export default nextConfig;
`;
}

// ---------------------------------------------------------------------------
// Source files — React + Vite
// ---------------------------------------------------------------------------

export function generateSetupTests() {
  return `import '@testing-library/jest-dom';
`;
}

export function generateApp(config) {
  return `function App() {
  return (
    <main>
      <h1>${config.projectName}</h1>
      <p>${config.description}</p>
    </main>
  );
}

export default App;
`;
}

export function generateMain() {
  return `import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
`;
}

export function generateViteEnvDts() {
  return `/// <reference types="vite/client" />
`;
}

// ---------------------------------------------------------------------------
// Source files — Next.js
// ---------------------------------------------------------------------------

export function generateNextLayout(config) {
  return `export const metadata = {
  title: '${config.projectName}',
  description: '${config.description}',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
`;
}

export function generateNextPage(config) {
  return `export default function Home() {
  return (
    <div>
      <h1>${config.projectName}</h1>
      <p>${config.description}</p>
    </div>
  );
}
`;
}

export function generateNextEnvDts() {
  return `/// <reference types="next" />
/// <reference types="next/image-types/global" />
`;
}

// ---------------------------------------------------------------------------
// Source files — Node
// ---------------------------------------------------------------------------

export function generateNodeIndex(config) {
  return `console.log('${config.projectName} is running');
`;
}

// ---------------------------------------------------------------------------
// index.html (React + Vite only)
// ---------------------------------------------------------------------------

export function generateIndexHtml(config) {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${config.projectName}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;
}

// ---------------------------------------------------------------------------
// .gitignore
// ---------------------------------------------------------------------------

const gitignoreByFramework = {
  'react-vite-ts': `node_modules
dist
.env
.env.local
.env.*.local
.DS_Store
Thumbs.db
.vscode/*
!.vscode/extensions.json
*.swp
*.swo
.claude.json
coverage/
`,
  'nextjs-ts': `node_modules
.next/
out/
dist
.env
.env.local
.env.*.local
.DS_Store
Thumbs.db
.vscode/*
!.vscode/extensions.json
*.swp
*.swo
.claude.json
coverage/
`,
  'node-ts': `node_modules
dist/
.env
.env.local
.env.*.local
.DS_Store
Thumbs.db
.vscode/*
!.vscode/extensions.json
*.swp
*.swo
.claude.json
coverage/
`,
};

export function generateGitignore(config) {
  return gitignoreByFramework[config.framework];
}

// ---------------------------------------------------------------------------
// .env / .env.example
// ---------------------------------------------------------------------------

export function generateEnv(config) {
  const lines = ['# This file is in .gitignore — never commit API keys.'];

  if (config.useAnthropicApi) {
    lines.push('ANTHROPIC_API_KEY=');
  }

  for (const key of config.additionalKeys) {
    lines.push(`${key}=`);
  }

  return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// README.md
// ---------------------------------------------------------------------------

const devInstructionsByFramework = {
  'react-vite-ts': (config) =>
    `Start the dev server: \`npm run dev\`, open http://localhost:${config.devPort}`,
  'nextjs-ts': (config) =>
    `Start the dev server: \`npm run dev\`, open http://localhost:${config.devPort}`,
  'node-ts': () =>
    'Start in watch mode: `npm run dev` (restarts on file changes)',
};

const projectTreeByFramework = {
  'react-vite-ts': (name) => `${name}/
├── .claude/            ← Claude Code settings and hooks
├── .devcontainer/      ← Docker devcontainer config
├── docs/               ← Project context documents
│   └── specs/          ← Feature specifications
├── src/
│   ├── components/     ← Reusable UI components
│   ├── hooks/          ← Custom React hooks
│   ├── utils/          ← Pure utility functions
│   ├── types/          ← Shared TypeScript interfaces
│   ├── assets/         ← Static assets
│   ├── App.tsx         ← Root component
│   └── main.tsx        ← Entry point
├── CLAUDE.md           ← Claude Code instructions
├── index.html          ← Vite HTML shell
└── package.json`,
  'nextjs-ts': (name) => `${name}/
├── .claude/            ← Claude Code settings and hooks
├── .devcontainer/      ← Docker devcontainer config
├── docs/               ← Project context documents
│   └── specs/          ← Feature specifications
├── src/
│   ├── app/            ← Next.js App Router (pages, layouts)
│   ├── components/     ← Reusable UI components
│   ├── hooks/          ← Custom React hooks
│   ├── utils/          ← Pure utility functions
│   ├── types/          ← Shared TypeScript interfaces
│   └── assets/         ← Static assets
├── CLAUDE.md           ← Claude Code instructions
└── package.json`,
  'node-ts': (name) => `${name}/
├── .claude/            ← Claude Code settings and hooks
├── .devcontainer/      ← Docker devcontainer config
├── docs/               ← Project context documents
│   └── specs/          ← Feature specifications
├── src/
│   ├── utils/          ← Pure utility functions
│   ├── types/          ← Shared TypeScript interfaces
│   └── index.ts        ← Entry point
├── CLAUDE.md           ← Claude Code instructions
└── package.json`,
};

export function generateReadme(config) {
  const devStep = devInstructionsByFramework[config.framework](config);
  const tree = projectTreeByFramework[config.framework](config.projectName);

  return `# ${config.projectName}

${config.description}

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- [VS Code](https://code.visualstudio.com/) with the [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) authenticated on your host machine

## Setup

1. Clone this repo
2. Copy \`.env.example\` to \`.env\` and fill in your API keys
3. Open the project in VS Code
4. When prompted, click **"Reopen in Container"** (or run the command palette: \`Dev Containers: Reopen in Container\`)
5. ${devStep}

## Claude Code Workflow

This project is set up for AI-first development with Claude Code:

- **\`CLAUDE.md\`** — Quick-reference card Claude reads every session (commands, workflow, conventions)
- **\`docs/\`** — Detailed context documents Claude reads as needed
- **\`docs/specs/\`** — Feature specs written before implementation
- **\`.claude/settings.json\`** — Sensible default permissions and hooks. Safe operations (file edits, local git, running tests) are auto-approved. Destructive or external-facing actions (rm, git push, npm install) still require manual approval. Hooks auto-format edited files and run typecheck + tests when Claude finishes a task.

## Project Structure

\`\`\`
${tree}
\`\`\`
`;
}

// ---------------------------------------------------------------------------
// Framework-specific file lists (used by the orchestrator)
// ---------------------------------------------------------------------------

export function getFrameworkFiles(config) {
  switch (config.framework) {
    case 'react-vite-ts':
      return [
        ['package.json', generatePackageJson(config)],
        ['vite.config.ts', generateViteConfig(config)],
        ['vitest.config.ts', generateVitestConfig(config)],
        ['tsconfig.json', generateTsConfig(config)],
        ['index.html', generateIndexHtml(config)],
        ['src/setup-tests.ts', generateSetupTests()],
        ['src/App.tsx', generateApp(config)],
        ['src/main.tsx', generateMain()],
        ['src/vite-env.d.ts', generateViteEnvDts()],
      ];

    case 'nextjs-ts':
      return [
        ['package.json', generatePackageJson(config)],
        ['next.config.ts', generateNextConfig()],
        ['vitest.config.ts', generateVitestConfig(config)],
        ['tsconfig.json', generateTsConfig(config)],
        ['next-env.d.ts', generateNextEnvDts()],
        ['src/setup-tests.ts', generateSetupTests()],
        ['src/app/layout.tsx', generateNextLayout(config)],
        ['src/app/page.tsx', generateNextPage(config)],
      ];

    case 'node-ts':
      return [
        ['package.json', generatePackageJson(config)],
        ['vitest.config.ts', generateVitestConfig(config)],
        ['tsconfig.json', generateTsConfig(config)],
        ['src/index.ts', generateNodeIndex(config)],
      ];

    default:
      throw new Error(`Unknown framework: ${config.framework}`);
  }
}

export function getFrameworkDirs(config) {
  switch (config.framework) {
    case 'react-vite-ts':
      return [
        'src/components',
        'src/hooks',
        'src/utils',
        'src/types',
        'src/assets',
      ];
    case 'nextjs-ts':
      return [
        'src/app',
        'src/components',
        'src/hooks',
        'src/utils',
        'src/types',
        'src/assets',
      ];
    case 'node-ts':
      return ['src/utils', 'src/types'];
    default:
      throw new Error(`Unknown framework: ${config.framework}`);
  }
}
