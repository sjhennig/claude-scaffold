/**
 * Generates .claude/settings.json and .claude/commands/README.md
 */

export function generateClaudeSettings() {
  const settings = {
    permissions: {
      allow: [
        // File operations (core coding loop)
        'Read',
        'Edit',
        'MultiEdit',
        'Write',

        // File discovery (non-destructive)
        'Glob',
        'Grep',
        'LS',

        // Task tracking
        'TodoWrite',

        // Web access (read-only, useful for looking up docs)
        'WebFetch',
        'WebSearch',

        // Local git commands (no pushing)
        'Bash(git status:*)',
        'Bash(git diff:*)',
        'Bash(git log:*)',
        'Bash(git add:*)',
        'Bash(git commit:*)',
        'Bash(git branch:*)',
        'Bash(git checkout:*)',
        'Bash(git stash:*)',

        // Project scripts and dev tools
        'Bash(npm run:*)',
        'Bash(npm test:*)',
        'Bash(npx:*)',
        'Bash(node:*)',

        // Read-only shell utilities
        'Bash(cat:*)',
        'Bash(head:*)',
        'Bash(tail:*)',
        'Bash(wc:*)',
        'Bash(tree:*)',
        'Bash(ls:*)',
        'Bash(echo:*)',
        'Bash(find:*)',
        'Bash(grep:*)',
        'Bash(sort:*)',
      ],
      deny: ['Bash(sudo:*)'],
    },
    hooks: {
      PostToolUse: [
        {
          matcher: 'Edit|Write',
          hooks: [
            {
              type: 'command',
              // Auto-format any file Claude edits so style stays consistent
              command:
                "jq -r '.tool_input.file_path // empty' | xargs npx prettier --write 2>/dev/null; exit 0",
            },
          ],
        },
      ],
      Stop: [
        {
          hooks: [
            {
              type: 'command',
              // Run typecheck + tests whenever Claude finishes a task to catch regressions early
              command:
                'npm run typecheck 2>&1 | tail -20; npm test 2>&1 | tail -30; exit 0',
            },
          ],
        },
      ],
    },
  };

  return JSON.stringify(settings, null, 2) + '\n';
}

export function generateCommandsReadme() {
  return `# Claude Code Slash Commands

This directory contains custom slash commands for Claude Code.

## How to Create a Command

1. Add a \`.md\` file to this directory (e.g., \`review.md\`)
2. Write the prompt template inside the file
3. Use it in Claude Code by typing \`/review\`

Each file becomes a slash command named after the filename.

See the [Claude Code docs](https://docs.anthropic.com/en/docs/claude-code) for more details.
`;
}
