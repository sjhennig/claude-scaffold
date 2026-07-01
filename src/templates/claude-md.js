/**
 * Generates CLAUDE.md — the quick-reference card Claude Code reads every session.
 * Must stay under CLAUDE_MD_LINE_BUDGET lines. Details belong in docs/.
 */

// The leanness budget (design brief §6): every line in CLAUDE.md competes for
// the model's attention at session start. The generator warns when output
// exceeds this, and claude-md.test.js gates it as a hard cap.
export const CLAUDE_MD_LINE_BUDGET = 100;

// Pure predicate so the warn path is unit-testable without an over-budget
// config (the built-in templates are always well under the budget).
export function claudeMdExceedsBudget(content) {
  return content.split('\n').length > CLAUDE_MD_LINE_BUDGET;
}

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
docs/specs/   ← Feature & subsystem specs (living docs)
NOTES.md      ← Decisions log (long-horizon memory)
.claude/      ← Claude Code settings and hooks
\`\`\`

## Context Docs

IMPORTANT: Before starting any task, identify which docs below are relevant and read them first.

- \`docs/project-brief.md\` — What this project is, who it's for, v1 scope
- \`docs/architecture.md\` — System design, directory layout, key patterns
- \`docs/specs/\` — Feature & subsystem specs; read the relevant one before implementing, and update it when you change what it describes
- \`NOTES.md\` — Decisions log; read before long-horizon work, append a dated entry when a non-obvious decision is made

## Rules

- **Evidence before claims**: run \`npm run verify\` and show the output before asserting a change works. Do not claim success you have not observed.

## Quality Review

Read-only QC subagents ship via the \`claude-guardrails\` plugin (enabled in
\`.claude/settings.json\`): \`code-reviewer\`, \`spec-reviewer\`, \`test-runner\`,
\`security-reviewer\`. Run \`/qc\` at a checkpoint — pre-commit or end of a
feature — to review the current diff. Subagent review costs several times the
tokens of a normal turn, so use it at checkpoints, not every turn.

> **One-time install (Claude Code v2.1.195+):** enabling the plugin in
> \`.claude/settings.json\` no longer auto-loads it — Claude Code now installs
> plugins from an external marketplace explicitly. When you open this project and
> trust the folder, accept the prompt to install \`claude-guardrails\`, or run
> \`claude plugin install claude-guardrails@claude-scaffold\` once. Until then
> \`/qc\` and the reviewers won't appear. Invoke a reviewer by its scoped name,
> e.g. \`--agent claude-guardrails:code-reviewer\`.

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

When compacting, always preserve: the list of modified files, the test/verify commands and their last output, and any open decisions or unresolved issues (record settled ones in \`NOTES.md\`).
`;
}
