/**
 * Non-interactive CLI argument parsing (M8): one flag per prompt plus --yes,
 * so a project can be kicked off in one line. Pure — argv in, a parsed
 * command out — so the mapping and validation are unit-testable; the bin
 * layer owns printing and exit codes.
 *
 * Validation and normalization are imported from prompts.js, the same
 * functions the interactive path uses, so the two paths cannot drift.
 */

import { parseArgs } from 'node:util';
import {
  FRAMEWORK_VALUES,
  validateProjectName,
  validateDescription,
  validateDevPort,
  normalizeAdditionalKeys,
} from './prompts.js';

export const USAGE = `Usage:
  claude-scaffold                      scaffold a project (interactive prompts)
  claude-scaffold <name> [flags]       scaffold non-interactively
  claude-scaffold doctor               check Claude Code + guardrail config health

Flags (each replaces one prompt; anything omitted is asked interactively,
or defaulted with --yes):
  --description <text>     one-line project description
  --framework <id>         ${FRAMEWORK_VALUES.join(' | ')}
  --port <n>               dev server port (invalid with --framework none)
  --anthropic-api          project calls the Anthropic API directly
  --api-keys <a,b>         extra API key names for .env
  --isolated-creds         keep Claude credentials in a container-local volume
                           (host ~/.claude not exposed; re-auth inside container)
  --no-git                 skip git init
  -y, --yes                accept defaults for every unanswered prompt
  -h, --help               show this help`;

// argv = process.argv.slice(2). Returns one of:
//   { command: 'doctor' } | { command: 'help' }
//   { command: 'scaffold', provided, yes, errors }
// `provided` only contains keys the user actually set; `errors` non-empty
// means the bin should print them + USAGE and exit 1.
export function parseCliArgs(argv) {
  if (argv[0] === 'doctor') {
    if (argv.length > 1) {
      return {
        command: 'scaffold',
        provided: {},
        yes: false,
        errors: [`doctor takes no arguments (got: ${argv.slice(1).join(' ')})`],
      };
    }
    return { command: 'doctor' };
  }

  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        description: { type: 'string' },
        framework: { type: 'string' },
        port: { type: 'string' },
        'anthropic-api': { type: 'boolean' },
        'api-keys': { type: 'string' },
        'isolated-creds': { type: 'boolean' },
        'no-git': { type: 'boolean' },
        yes: { type: 'boolean', short: 'y' },
        help: { type: 'boolean', short: 'h' },
      },
    });
  } catch (err) {
    return {
      command: 'scaffold',
      provided: {},
      yes: false,
      errors: [err.message],
    };
  }

  const { values, positionals } = parsed;
  if (values.help) return { command: 'help' };

  const errors = [];
  const provided = {};

  if (positionals.length > 1) {
    errors.push(
      `Expected at most one project name, got: ${positionals.join(' ')}`,
    );
  }
  if (positionals.length === 1) {
    const valid = validateProjectName(positionals[0]);
    if (valid !== true) errors.push(`Project name: ${valid}`);
    else provided.projectName = positionals[0];
  }

  if (values.description !== undefined) {
    const valid = validateDescription(values.description);
    if (valid !== true) errors.push(`--description: ${valid}`);
    else provided.description = values.description;
  }

  if (values.framework !== undefined) {
    if (!FRAMEWORK_VALUES.includes(values.framework)) {
      errors.push(
        `Unknown framework "${values.framework}". Valid: ${FRAMEWORK_VALUES.join(', ')}`,
      );
    } else {
      provided.framework = values.framework;
    }
  }

  if (values.port !== undefined) {
    if (provided.framework === 'none') {
      errors.push('--port is not valid with --framework none (no dev server).');
    } else {
      const valid = validateDevPort(values.port);
      if (valid !== true) errors.push(`--port: ${valid}`);
      else provided.devPort = Number(values.port);
    }
  }

  if (values['anthropic-api']) provided.useAnthropicApi = true;
  if (values['api-keys'] !== undefined)
    provided.additionalKeys = normalizeAdditionalKeys(values['api-keys']);
  if (values['isolated-creds']) provided.isolatedCredentials = true;
  if (values['no-git']) provided.initGit = false;

  // --yes is for scripts/CI: it must never fall back to a prompt, and the one
  // answer without a default is the name.
  if (values.yes && provided.projectName === undefined) {
    errors.push('A project name is required with --yes (nothing to prompt).');
  }

  return { command: 'scaffold', provided, yes: Boolean(values.yes), errors };
}
