/**
 * Generates CLAUDE.md — the quick-reference card Claude Code reads every session.
 * Must stay under 100 lines. Details belong in docs/.
 */

// Commands are identical across the TypeScript frameworks; the only variation
// is that the no-framework option has no dev server, build step, or typecheck.
function commandRows(framework) {
  const appRows =
    framework === 'none'
      ? []
      : [
          ['Dev server', 'npm run dev'],
          ['Build', 'npm run build'],
        ];

  const typecheckRow =
    framework === 'none' ? [] : [['Typecheck', 'npm run typecheck']];
  const lintFixRow =
    framework === 'none' ? [] : [['Lint fix', 'npm run lint:fix']];

  return [
    ['Verify (gate)', 'npm run verify'],
    ...appRows,
    ['Test', 'npm test'],
    ['Test watch', 'npm run test:watch'],
    ['Lint', 'npm run lint'],
    ...lintFixRow,
    ...typecheckRow,
    ['Format', 'npm run format'],
  ];
}

export function generateClaudeMd(config) {
  const rows = commandRows(config.framework)
    .map(([action, cmd]) => `| ${action.padEnd(13)} | \`${cmd}\` |`)
    .join('\n');

  return `# ${config.projectName}

${config.description}

## Commands

| Action        | Command |
| ------------- | ------- |
${rows}

\`npm run verify\` runs the same gate the Stop hook enforces (format + lint + tests). The hook blocks turn-end until it passes.

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

## Rules

- **Evidence before claims**: run \`npm run verify\` and show the output before asserting a change works. Do not claim success you have not observed.

## Quality Review

Read-only QC subagents live in \`.claude/agents/\` (\`code-reviewer\`,
\`spec-reviewer\`, \`test-runner\`, \`security-reviewer\`). Run \`/qc\` at a
checkpoint — pre-commit or end of a feature — to review the current diff.
Subagent review costs several times the tokens of a normal turn, so use it at
checkpoints, not every turn.

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

## On Compaction

When compacting, always preserve: the list of modified files, the test/verify commands and their last output, and any open decisions or unresolved issues.
`;
}
