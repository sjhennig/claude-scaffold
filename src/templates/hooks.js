/**
 * Generates .claude/commands/README.md
 *
 * The guardrail core (.claude/settings.json + hook scripts) lives in
 * guardrails.js. generateClaudeSettings is re-exported here for backwards
 * compatibility with existing imports.
 */

export { generateClaudeSettings } from './guardrails.js';

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
