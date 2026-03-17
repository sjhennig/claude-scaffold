import inquirer from 'inquirer';

const FRAMEWORKS = [
  { name: 'React + Vite + TypeScript', value: 'react-vite-ts' },
  { name: 'Next.js + TypeScript', value: 'nextjs-ts' },
  { name: 'Node + TypeScript (no frontend)', value: 'node-ts' },
];

const DEFAULT_PORTS = {
  'react-vite-ts': 5173,
  'nextjs-ts': 3000,
  'node-ts': 3000,
};

const questions = [
  {
    type: 'input',
    name: 'projectName',
    message: 'Project name (kebab-case):',
    validate: (input) => {
      if (!input) return 'Project name is required.';
      if (!/^[a-z][a-z0-9-]*$/.test(input))
        return 'Must be kebab-case (lowercase letters, numbers, hyphens).';
      return true;
    },
  },
  {
    type: 'input',
    name: 'description',
    message: 'One-line description:',
    default: 'A new Claude Code project',
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
    default: (answers) => DEFAULT_PORTS[answers.framework] ?? 3000,
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
    filter: (input) =>
      input
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean),
  },
  {
    type: 'confirm',
    name: 'initGit',
    message: 'Initialize git?',
    default: true,
  },
];

export async function gatherInput() {
  return inquirer.prompt(questions);
}
