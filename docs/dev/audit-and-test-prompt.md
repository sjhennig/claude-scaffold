# Task: Audit codebase and add comprehensive test coverage

This project is being prepared for a public GitHub release. Audit the entire codebase for quality, then add thorough test coverage using Vitest. Follow the TDD discipline documented in this project's own CLAUDE.md — but since we're retrofitting tests onto existing code, the cycle is: write tests that express the correct behavior, run them, fix any code that fails.

Read every file in the project before starting. Understand the full picture before writing anything.

---

## Phase 1: Code audit

Review every file in the project and fix the following categories of issues. Commit each category as a separate commit with a clear message.

### 1.1 Correctness

- Do all template generators actually produce valid output? Run each one with a sample config and verify:
  - All JSON output parses without errors (package.json, devcontainer.json, settings.json, tsconfig.json)
  - All generated Markdown is well-formed (no unclosed code fences, no broken headings)
  - Template string interpolation never produces `undefined` or `[object Object]` in output
- Does the orchestrator handle edge cases?
  - What happens if the target directory already exists?
  - What happens if git isn't installed and the user chose to init git?
  - What happens if additionalEnvKeys is empty vs populated?

### 1.2 Consistency

- Are all template functions truly pure? (config in, string out, no side effects, no file I/O)
- Do all functions follow the same signature pattern?
- Is error handling consistent across the orchestrator?
- Are all comments accurate and up to date?

### 1.3 Code quality for public release

- Remove any dead code, commented-out blocks, or TODO comments that won't be addressed
- Ensure consistent formatting (the project uses Prettier — run `npx prettier --write .` across all source files)
- Verify every function has a clear, single responsibility
- Check for hardcoded values that should be configurable or extracted into constants
- Make sure all user-facing strings (console output, error messages) are clear and typo-free
- Confirm the README accurately describes the current state of the tool (supported frameworks, usage instructions, prerequisites)

### 1.4 Robustness

- Validate that the kebab-case check in prompts.js catches realistic bad input (spaces, uppercase, special characters)
- Confirm the additionalEnvKeys filter handles messy input gracefully (extra commas, whitespace, empty strings)
- Make sure `exit 0` is present at the end of every hook command in the generated settings.json (prevents hooks from blocking Claude Code)
- Verify the devcontainer.json mount paths use the correct variable syntax for cross-platform compatibility

---

## Phase 2: Set up the test framework

### 2.1 Install Vitest as a dev dependency for this tool

```bash
npm install --save-dev vitest
```

### 2.2 Add test scripts to this project's package.json

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

### 2.3 Create a vitest.config.js in the project root

```javascript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    reporters: ['verbose'],
  },
});
```

### 2.4 File convention

Tests live next to the code they test:

- `src/prompts.js` → `src/prompts.test.js`
- `src/index.js` → `src/index.test.js`
- `src/templates/devcontainer.js` → `src/templates/devcontainer.test.js`
- etc.

---

## Phase 3: Write tests

For each test file, follow this cycle:

1. Write the tests first
2. Run them (`npm test`)
3. If any fail because of a genuine bug in the source code, fix the source code — do not change the test
4. If a test fails because the test itself has the wrong expectation, correct the test — but be honest about which case this is
5. Commit the tests and any fixes together per file

### 3.1 Template tests (highest priority — these are the core of the tool)

Each template file needs tests that verify the generated output is correct. The pattern for every template test:

```javascript
import { describe, it, expect } from 'vitest';

// Create a standard test config that covers all options
const baseConfig = {
  projectName: 'test-project',
  projectDescription: 'A test project for unit testing',
  framework: 'react-vite-ts',
  devPort: 5173,
  useAnthropicApi: false,
  additionalEnvKeys: [],
  initGit: true,
};

// Helper to create config variations
function withConfig(overrides) {
  return { ...baseConfig, ...overrides };
}
```

**src/templates/devcontainer.test.js** — Test the Dockerfile and devcontainer.json generators:

- Dockerfile includes `node:20-bookworm-slim` base image
- Dockerfile installs all expected system tools (git, curl, ripgrep, fd-find, jq, tree, bat, zsh, python3)
- Dockerfile installs Claude Code globally
- Dockerfile sets the non-root user to `node`
- devcontainer.json is valid JSON
- devcontainer.json uses the correct project name
- devcontainer.json forwards the correct port (test with different port values)
- devcontainer.json includes all four VS Code extensions
- devcontainer.json includes the Claude auth bind mount with correct path
- devcontainer.json includes the bash history volume
- devcontainer.json has `postCreateCommand` set to `npm install`

**src/templates/claude-md.test.js** — Test the CLAUDE.md generator:

- Output is under 100 lines (this is a hard requirement from the project methodology)
- Contains the project name as an H1 heading
- Contains the project description
- Contains the correct commands for each framework (test all supported frameworks)
- Contains the "IMPORTANT: Before starting any task" instruction pointing to docs/
- Contains the full 7-step TDD cycle
- Contains the test file convention (`foo.ts` → `foo.test.ts`)
- Contains git workflow conventions (feature branches, conventional commits)
- Does NOT contain code style rules (those are handled by linters)
- Does NOT contain architecture details (those belong in docs/)

**src/templates/hooks.test.js** — Test the hooks/settings.json generator:

- Output is valid JSON
- Has a `hooks` key at the top level
- Has a `PostToolUse` hook with matcher `Edit|Write`
- PostToolUse hook command includes `prettier --write`
- PostToolUse hook command ends with `exit 0`
- Has a `Stop` hook
- Stop hook command includes both `typecheck` and `test`
- Stop hook command ends with `exit 0`
- Stop hook command uses `tail` to limit output length

**src/templates/docs.test.js** — Test the context document generators:

- project-brief.md includes the project name
- project-brief.md contains all required template sections (What is this project, Who is it for, Scope of v1, Out of scope, Key technical decisions, Open questions)
- architecture.md includes the correct directory structure for each framework
- architecture.md mentions api-integration.md when useAnthropicApi is true
- architecture.md does NOT mention api-integration.md when useAnthropicApi is false
- api-integration.md is only generated when useAnthropicApi is true (test in orchestrator tests)
- specs README explains the spec-driven workflow

**src/templates/project-files.test.js** — Test ALL generated project files:

package.json tests (per framework):

- Output is valid JSON
- Has the correct project name
- Has `private: true`
- Has all required scripts: dev, build, test, test:watch, lint, lint:fix, typecheck, format
- Has the correct dependencies for the framework
- Has the correct devDependencies for the framework
- Scripts use the right commands for the framework (e.g., `vite` for react-vite-ts, `next dev` for nextjs-ts, `tsx watch` for node-ts)

.gitignore tests:

- Includes node_modules/
- Includes .env
- Includes .DS_Store
- Includes .claude.json
- Includes framework-specific entries (.next/ for Next.js, dist/ for Node)

.env tests:

- Includes ANTHROPIC_API_KEY when useAnthropicApi is true
- Does NOT include ANTHROPIC_API_KEY when useAnthropicApi is false
- Includes additional keys from additionalEnvKeys
- Handles empty additionalEnvKeys array
- Includes the "never commit" warning comment

README tests:

- Includes the project name
- Includes devcontainer setup instructions
- Includes the correct dev server port
- Includes the correct dev command for the framework
- Mentions Claude Code workflow (CLAUDE.md, docs/, specs)

tsconfig.json tests (per framework):

- Output is valid JSON
- react-vite-ts: has `jsx: "react-jsx"`, `noEmit: true`
- nextjs-ts: has `jsx: "preserve"`, Next.js plugin, path alias
- node-ts: has `outDir: "./dist"`, `module: "NodeNext"`, no JSX

Config file presence tests:

- react-vite-ts generates vite.config.ts
- nextjs-ts generates next.config.ts but NOT vite.config.ts
- node-ts generates neither vite.config.ts nor next.config.ts
- react-vite-ts generates index.html
- nextjs-ts and node-ts do NOT generate index.html

ESLint config tests (generateEslintConfig):

- Returns different configs per framework
- react-vite-ts: imports react-hooks and react-refresh plugins, imports typescript-eslint, uses browser globals, ignores dist/
- nextjs-ts: uses FlatCompat layer from @eslint/eslintrc, extends next/core-web-vitals and next/typescript, is generated as eslint.config.mjs (not .js) so next lint discovers it correctly
- node-ts: imports typescript-eslint, uses node globals, does NOT reference React plugins, ignores dist/, is generated as eslint.config.js
- nextjs-ts package.json includes @eslint/eslintrc in devDependencies (required for the compat layer)

Prettier config tests (generatePrettierRc):

- Output is valid JSON
- Sets singleQuote to true
- Sets trailingComma to "all"
- Sets tabWidth to 2
- Sets semi to true

.prettierignore tests (generatePrettierIgnore):

- Includes node_modules for all frameworks
- Includes coverage for all frameworks
- nextjs-ts: includes .next and out
- node-ts: includes dist
- react-vite-ts: does NOT include .next or out
- node-ts: does NOT include .next or out
- nextjs-ts output is different from react-vite-ts output (cross-framework isolation)

Starter file tests:

- react-vite-ts: App.tsx and main.tsx exist with correct content
- nextjs-ts: app/layout.tsx and app/page.tsx exist with correct content
- node-ts: index.ts exists with correct content

### 3.2 Orchestrator tests (src/index.test.js)

These are integration-style tests. Use a temp directory for output and clean up after each test.

```javascript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, access } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
```

Test the file generation pipeline (mock the prompts, call the generator directly):

- All expected files exist for react-vite-ts
- All expected files exist for nextjs-ts
- All expected files exist for node-ts
- All expected directories exist (src/components/, docs/specs/, .claude/commands/, etc.)
- Framework-specific files are NOT present in other frameworks (no vite.config.ts in nextjs-ts project)
- docs/api-integration.md exists when useAnthropicApi is true
- docs/api-integration.md does NOT exist when useAnthropicApi is false
- .env.example content matches .env content
- git init runs when initGit is true (check for .git directory)
- git init failure doesn't crash the tool when initGit is true but git is unavailable

### 3.3 Prompt validation tests (src/prompts.test.js)

You can't easily test the interactive inquirer flow, but you CAN test the validation and filter functions. Extract them if they aren't already exported separately:

- Project name validation rejects empty string
- Project name validation rejects uppercase letters
- Project name validation rejects spaces
- Project name validation rejects special characters (except hyphens)
- Project name validation accepts valid kebab-case names
- Project name filter trims whitespace
- additionalEnvKeys filter splits comma-separated input correctly
- additionalEnvKeys filter converts to uppercase
- additionalEnvKeys filter replaces spaces with underscores
- additionalEnvKeys filter removes empty entries from trailing commas

---

## Phase 4: Coverage check

After all tests are written and passing:

1. Run `npx vitest run --coverage` (install `@vitest/coverage-v8` if needed)
2. Review the coverage report
3. If any template function or significant code path has zero coverage, add tests for it
4. The goal is not 100% line coverage — it's that every user-facing behavior is tested. Focus on:
   - Every framework variant produces correct output
   - Every conditional path (useAnthropicApi, additionalEnvKeys, framework-specific files) is exercised
   - Edge cases in input handling are covered

---

## Phase 5: Final verification

1. Run the full test suite one last time: `npm test`
2. Run the tool end-to-end for each framework: `node bin/claude-scaffold.js` — select each framework and verify the output manually
3. Run Prettier across the entire codebase: `npx prettier --write .`
4. Make a final commit: `test: add comprehensive test suite for public release`

---

## Commit strategy

Make atomic, well-labeled commits throughout this process:

- `fix: [description]` for any bugs found during the audit
- `refactor: [description]` for code quality improvements
- `chore: add vitest and test infrastructure`
- `test: add template tests for [filename]`
- `test: add orchestrator integration tests`
- `test: add prompt validation tests`
- `style: run prettier across codebase`
