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

\`/qc\` ships in the \`claude-guardrails\` plugin (enabled in
\`.claude/settings.json\`) — type \`/qc\` to run a quality-control checkpoint on
the current diff using the plugin's read-only review subagents. Commands you
add to this directory work the same way as that one.

## How to Create a Command

1. Add a \`.md\` file to this directory (e.g., \`summarize.md\`)
2. Write the prompt template inside the file
3. Use it in Claude Code by typing \`/summarize\`

Each file becomes a slash command named after the filename. Avoid names that
collide with Claude Code built-ins (e.g. \`review\`).

See the [Claude Code docs](https://docs.anthropic.com/en/docs/claude-code) for more details.
`;
}
