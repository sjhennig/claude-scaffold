# Task: Add Next.js + TypeScript and Node + TypeScript framework templates

Add two new framework options to claude-scaffold so users can choose between three templates:

1. React + Vite + TypeScript (already exists)
2. Next.js + TypeScript (new)
3. Node + TypeScript — no frontend (new)

Follow the extensibility pattern already established in the codebase: changes should be limited to prompts.js, claude-md.js, project-files.js, and the orchestrator's file list. Read the existing code first to understand the patterns before making changes.

---

## 1. Update src/prompts.js

Add the two new framework choices to the framework prompt:

- `{ name: 'Next.js + TypeScript', value: 'nextjs-ts' }`
- `{ name: 'Node + TypeScript (no frontend)', value: 'node-ts' }`

Update the dev port default to change dynamically based on framework selection. Use inquirer's `when` and `default` features, or handle it in the filter/default logic:

- react-vite-ts → default port 5173
- nextjs-ts → default port 3000
- node-ts → default port 3000

---

## 2. Update src/templates/claude-md.js

Add command sets for the two new frameworks in the commands lookup (the switch/case or map):

**nextjs-ts commands:**

```
npm run dev          # Start Next.js dev server
npm run build        # Production build
npm test             # Run tests once (Vitest)
npm run test:watch   # Run tests in watch mode
npm run lint         # ESLint (via next lint)
npm run typecheck    # TypeScript type checking
npm run format       # Prettier
```

**node-ts commands:**

```
npm run dev          # Run with tsx in watch mode
npm run build        # Compile TypeScript
npm test             # Run tests once (Vitest)
npm run test:watch   # Run tests in watch mode
npm run lint         # ESLint
npm run typecheck    # TypeScript type checking
npm run format       # Prettier
```

---

## 3. Update src/templates/project-files.js

This is the biggest change. Add framework-specific generators for package.json, config files, and starter source files.

### package.json for nextjs-ts

```json
{
  "name": "{projectName}",
  "private": true,
  "version": "0.0.1",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "next lint",
    "lint:fix": "next lint --fix",
    "typecheck": "npx tsc --noEmit",
    "format": "prettier --write 'src/**/*.{ts,tsx}' 'app/**/*.{ts,tsx}'"
  },
  "dependencies": {
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "typescript": "~5.7.0",
    "vitest": "^3.0.0",
    "@testing-library/react": "^16.0.0",
    "@testing-library/jest-dom": "^6.0.0",
    "@testing-library/user-event": "^14.0.0",
    "jsdom": "^25.0.0",
    "eslint": "^9.0.0",
    "eslint-config-next": "^15.0.0",
    "prettier": "^3.4.0",
    "@eslint/js": "^9.0.0"
  }
}
```

### package.json for node-ts

```json
{
  "name": "{projectName}",
  "private": true,
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint src/",
    "lint:fix": "eslint src/ --fix",
    "typecheck": "npx tsc --noEmit",
    "format": "prettier --write src/"
  },
  "dependencies": {},
  "devDependencies": {
    "typescript": "~5.7.0",
    "tsx": "^4.0.0",
    "vitest": "^3.0.0",
    "eslint": "^9.0.0",
    "@eslint/js": "^9.0.0",
    "typescript-eslint": "^8.0.0",
    "prettier": "^3.4.0",
    "globals": "^15.0.0",
    "@types/node": "^22.0.0"
  }
}
```

### Config files for nextjs-ts

**tsconfig.json (Next.js style):**

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

**next.config.ts:**

```typescript
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {};

export default nextConfig;
```

**vitest.config.ts for nextjs-ts** (same as react-vite-ts but without the Vite React plugin — use a standalone vitest config):

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/setup-tests.ts'],
    reporters: ['verbose'],
  },
});
```

Note: For Next.js, add `@vitejs/plugin-react` to devDependencies so Vitest can handle JSX in tests. Next.js itself doesn't use Vite, but Vitest needs the plugin for test compilation.

**Starter files for nextjs-ts:**

`src/app/layout.tsx`:

```tsx
export const metadata = {
  title: '{projectName}',
  description: '{projectDescription}',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

`src/app/page.tsx`:

```tsx
export default function Home() {
  return (
    <div>
      <h1>{projectName}</h1>
      <p>{projectDescription}</p>
    </div>
  );
}
```

`next-env.d.ts`:

```typescript
/// <reference types="next" />
/// <reference types="next/image-types/global" />
```

`src/setup-tests.ts` — same as react-vite-ts.

### Config files for node-ts

**tsconfig.json (Node style — emits to dist/):**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

**vitest.config.ts for node-ts** (no React plugin, no jsdom):

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    reporters: ['verbose'],
  },
});
```

**Starter file for node-ts:**

`src/index.ts`:

```typescript
console.log('{projectName} is running');
```

`src/setup-tests.ts` is NOT needed for node-ts (no jest-dom). Do not generate it for this framework.

### Vite config

Only generate `vite.config.ts` for react-vite-ts. Do not generate it for nextjs-ts or node-ts.

### index.html

Only generate `index.html` for react-vite-ts. Do not generate it for nextjs-ts or node-ts.

### src/vite-env.d.ts

Only generate for react-vite-ts. nextjs-ts gets `next-env.d.ts` instead. node-ts gets neither.

### .gitignore updates

- nextjs-ts: also ignore `.next/` and `out/`
- node-ts: also ignore `dist/`

---

## 4. Update src/index.js (orchestrator)

The orchestrator needs to conditionally generate different files based on `config.framework`. Structure this cleanly:

1. Build an array of files that are common to ALL frameworks (CLAUDE.md, .claude/settings.json, docs/, .gitignore, .env, README.md, etc.)
2. Call a framework-specific function that returns the additional [path, content] pairs for that framework
3. Concatenate and write all files

The framework-specific function should handle:

- Which package.json to generate
- Which tsconfig.json to generate
- Which config files to generate (vite.config.ts vs next.config.ts vs nothing)
- Which starter source files to generate
- Which directories to create

### Directory structures by framework

**react-vite-ts** (unchanged):

- src/components/, src/hooks/, src/utils/, src/types/, src/assets/

**nextjs-ts:**

- src/app/, src/components/, src/hooks/, src/utils/, src/types/, src/assets/

**node-ts:**

- src/utils/, src/types/

---

## 5. Update src/templates/docs.js

The architecture.md template should vary the directory structure section by framework:

**react-vite-ts** (unchanged):

```
src/
├── components/
├── hooks/
├── utils/
├── types/
├── assets/
└── App.tsx
```

**nextjs-ts:**

```
src/
├── app/           — Next.js App Router (pages, layouts, API routes)
├── components/
├── hooks/
├── utils/
├── types/
└── assets/
```

**node-ts:**

```
src/
├── utils/
├── types/
└── index.ts       — Entry point
```

---

## 6. Update documentation

### README.md (the scaffold tool's own README, not the generated one)

Update to reflect that three frameworks are now supported. List them with a brief description of when to use each:

- React + Vite + TypeScript — client-side apps, dashboards, browser-based tools
- Next.js + TypeScript — full-stack web apps, anything needing SSR or API routes
- Node + TypeScript — CLI tools, APIs, backend services, automation, anything without a UI

### Generated README.md (in project-files.js)

The generated README already adapts to the project name, port, etc. Make sure it also adapts the dev server instructions to the framework:

- react-vite-ts: "Start the dev server: `npm run dev`, open http://localhost:{port}"
- nextjs-ts: "Start the dev server: `npm run dev`, open http://localhost:{port}"
- node-ts: "Start in watch mode: `npm run dev` (restarts on file changes)"

### Generated CLAUDE.md

Already handled by step 2 (framework-specific commands).

---

## 7. Testing

After making all changes, verify:

1. Run `node bin/claude-scaffold.js` and select each framework. Confirm all files are created.
2. For each generated project, verify:
   - `package.json` is valid JSON with the correct scripts and dependencies
   - `tsconfig.json` is valid JSON with framework-appropriate settings
   - `CLAUDE.md` is under 100 lines and has the right commands
   - `.gitignore` includes framework-specific ignores
   - The correct starter files exist (App.tsx for React, app/page.tsx for Next.js, index.ts for Node)
   - Files that don't belong are NOT generated (no vite.config.ts in Next.js, no index.html in Node, etc.)
3. Confirm the orchestrator's common files (CLAUDE.md, docs/, .claude/, .env) are identical across all three frameworks

---

## Design reminders

- Template functions must remain pure: config in, string out. No file I/O inside templates.
- All JSON must be generated with JSON.stringify, not hand-written strings.
- The framework selection should be the ONLY branching point. Don't add framework checks scattered throughout the codebase — keep them in the template functions and the orchestrator's file-list builder.
- Add comments explaining "why" in any new generated files, consistent with the existing style.
