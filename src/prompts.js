import inquirer from 'inquirer';

const FRAMEWORKS = [
  { name: 'React + Vite + TypeScript', value: 'react-vite-ts' },
  { name: 'Next.js + TypeScript', value: 'nextjs-ts' },
  { name: 'Node + TypeScript (no frontend)', value: 'node-ts' },
  { name: 'Guardrails only (no framework)', value: 'none' },
];

export const FRAMEWORK_VALUES = FRAMEWORKS.map((f) => f.value);

export const DEFAULT_PORTS = {
  'react-vite-ts': 5173,
  'nextjs-ts': 3000,
  'node-ts': 3000,
};

export const DEFAULT_DESCRIPTION = 'A new Claude Code project';
// The interactive list defaults to its first choice; --yes mirrors that.
export const DEFAULT_FRAMEWORK = FRAMEWORK_VALUES[0];

// Validation + normalization shared between the interactive prompts and the
// non-interactive flags (src/cli-args.js), so the two paths cannot diverge.
// Return true or an error string, inquirer-style.

export function validateProjectName(input) {
  if (!input) return 'Project name is required.';
  if (!/^[a-z][a-z0-9-]*$/.test(input))
    return 'Must be kebab-case (lowercase letters, numbers, hyphens).';
  return true;
}

// The description is interpolated verbatim into generated source and HTML
// (CLAUDE.md, README, .tsx/.ts files, index.html <title>, Next.js metadata), so
// characters that are special in those contexts would break or inject into the
// user's own scaffolded output. Reject the few that matter — backtick and `${`
// (JS template-literal breakouts) and angle brackets (HTML/markup) — while still
// allowing ordinary prose, apostrophes, and parentheses. Empty is fine: the
// prompt default fills it in.
export function validateDescription(input) {
  if (!input) return true;
  if (/[`<>]/.test(input) || input.includes('${'))
    return 'Description cannot contain backticks, ${, or angle brackets (they break generated files).';
  return true;
}

export function validateDevPort(input) {
  const port = Number(input);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    return 'Port must be an integer between 1 and 65535.';
  return true;
}

export function normalizeAdditionalKeys(input) {
  return input
    .split(',')
    .map((k) => k.trim().toUpperCase().replace(/\s+/g, '_'))
    .filter(Boolean);
}

const questions = [
  {
    type: 'input',
    name: 'projectName',
    message: 'Project name (kebab-case):',
    validate: validateProjectName,
  },
  {
    type: 'input',
    name: 'description',
    message: 'One-line description:',
    default: DEFAULT_DESCRIPTION,
    validate: validateDescription,
  },
  {
    type: 'list',
    name: 'framework',
    message: 'Framework:',
    choices: FRAMEWORKS,
  },
  {
    type: 'number',
    name: 'devPort',
    message: 'Dev server port:',
    // The no-framework option has no dev server.
    when: (answers) => answers.framework !== 'none',
    default: (answers) => DEFAULT_PORTS[answers.framework] ?? 3000,
    validate: validateDevPort,
    // Coerce like the flag path does, so devPort is always a number.
    filter: (input) => Number(input),
  },
  {
    type: 'confirm',
    name: 'useAnthropicApi',
    message: 'Uses Anthropic API directly?',
    default: false,
  },
  {
    type: 'input',
    name: 'additionalKeys',
    message: 'Additional API key names (comma-separated, optional):',
    default: '',
    filter: normalizeAdditionalKeys,
  },
  {
    type: 'confirm',
    name: 'initGit',
    message: 'Initialize git?',
    default: true,
  },
];

// The defaults --yes applies to anything not provided. projectName has no
// default on purpose: it must always come from the user.
export function defaultAnswers(provided = {}) {
  const framework = provided.framework ?? DEFAULT_FRAMEWORK;
  const answers = {
    description: DEFAULT_DESCRIPTION,
    framework,
    ...(framework === 'none'
      ? {}
      : { devPort: DEFAULT_PORTS[framework] ?? 3000 }),
    useAnthropicApi: false,
    additionalKeys: [],
    initGit: true,
    ...provided,
  };
  // A none project has no dev server — never let a provided port through
  // (e.g. --port given before framework resolved to none).
  if (answers.framework === 'none') delete answers.devPort;
  return answers;
}

// Gather the project config. `provided` holds answers already supplied via
// CLI flags (assumed validated by src/cli-args.js); inquirer skips those and
// asks only the rest. With `yes`, nothing is asked — missing answers get the
// same defaults the prompts would offer.
export async function gatherInput(provided = {}, { yes = false } = {}) {
  if (yes) return defaultAnswers(provided);
  // inquirer.prompt(questions, answers) skips already-answered questions and
  // feeds them to `when`/`default` callbacks, so e.g. --framework none still
  // suppresses the port question.
  const answers = await inquirer.prompt(questions, provided);
  // The skip check runs before `when`, so a --port flag would survive an
  // interactively-chosen none framework — a config the prompts alone can
  // never produce. Enforce the invariant on the way out.
  if (answers.framework === 'none') delete answers.devPort;
  return answers;
}
