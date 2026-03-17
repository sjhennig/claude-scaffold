/**
 * Generates CLAUDE.md — the quick-reference card Claude Code reads every session.
 * Must stay under 100 lines. Details belong in docs/.
 */

const commandsByFramework = {
  'react-vite-ts': {
    dev: 'npm run dev',
    build: 'npm run build',
    test: 'npm test',
    testWatch: 'npm run test:watch',
    lint: 'npm run lint',
    lintFix: 'npm run lint:fix',
    typecheck: 'npm run typecheck',
    format: 'npm run format',
  },
  'nextjs-ts': {
    dev: 'npm run dev',
    build: 'npm run build',
    test: 'npm test',
    testWatch: 'npm run test:watch',
    lint: 'npm run lint',
    lintFix: 'npm run lint:fix',
    typecheck: 'npm run typecheck',
    format: 'npm run format',
  },
  'node-ts': {
    dev: 'npm run dev',
    build: 'npm run build',
    test: 'npm test',
    testWatch: 'npm run test:watch',
    lint: 'npm run lint',
    lintFix: 'npm run lint:fix',
    typecheck: 'npm run typecheck',
    format: 'npm run format',
  },
};

export function generateClaudeMd(config) {
  const cmds = commandsByFramework[config.framework];

  return `# ${config.projectName}

${config.description}

## Commands

| Action     | Command             |
|------------|---------------------|
| Dev server | \`${cmds.dev}\`       |
| Build      | \`${cmds.build}\`     |
| Test       | \`${cmds.test}\`      |
| Test watch | \`${cmds.testWatch}\` |
| Lint       | \`${cmds.lint}\`      |
| Lint fix   | \`${cmds.lintFix}\`   |
| Typecheck  | \`${cmds.typecheck}\` |
| Format     | \`${cmds.format}\`    |

## Project Structure

\`\`\`
src/          ← Application source code
docs/         ← Context documents (project brief, architecture)
docs/specs/   ← Feature specs (spec-driven development)
.claude/      ← Claude Code settings and hooks
\`\`\`

## Context Docs

IMPORTANT: Before starting any task, identify which docs below are relevant and read them first.

- \`docs/project-brief.md\` — What this project is, who it's for, v1 scope
- \`docs/architecture.md\` — System design, directory layout, key patterns
- \`docs/specs/\` — Feature specs; read the relevant spec before implementing

## Git Workflow

- Feature branches off \`main\`
- Conventional commits: \`feat:\`, \`fix:\`, \`refactor:\`, \`test:\`, \`docs:\`
- Small, focused commits — one concern per commit

## Testing (TDD)

1. Write failing tests FIRST. Do not write implementation yet.
2. Run tests. Confirm they fail.
3. Commit the failing tests.
4. Write minimum implementation to make tests pass. Do NOT modify the tests.
5. Run tests. If any fail, fix the implementation, not the tests.
6. Refactor if needed. Run tests after each change.
7. Commit passing implementation.

Tests live next to the code they test: \`foo.ts\` → \`foo.test.ts\`
`;
}
