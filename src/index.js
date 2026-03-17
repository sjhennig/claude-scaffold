import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { execSync } from 'node:child_process';
import { gatherInput } from './prompts.js';
import {
  generateDockerfile,
  generateDevcontainerJson,
} from './templates/devcontainer.js';
import { generateClaudeMd } from './templates/claude-md.js';
import {
  generateClaudeSettings,
  generateCommandsReadme,
} from './templates/hooks.js';
import {
  generateProjectBrief,
  generateArchitecture,
  generateApiIntegration,
  generateSpecsReadme,
} from './templates/docs.js';
import {
  generateGitignore,
  generateEnv,
  generateReadme,
  getFrameworkFiles,
  getFrameworkDirs,
} from './templates/project-files.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function writeProjectFile(root, relativePath, content) {
  const fullPath = join(root, relativePath);
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, content, 'utf-8');
}

async function ensureDir(root, relativePath) {
  await mkdir(join(root, relativePath), { recursive: true });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function run() {
  console.log('\n🏗️  claude-scaffold — Generate a Claude Code project\n');

  const config = await gatherInput();
  const root = join(process.cwd(), config.projectName);

  console.log(`\nCreating project at ./${config.projectName} ...\n`);

  // -- Common files (same for all frameworks) ------------------------------

  const commonFiles = [
    // Devcontainer
    ['.devcontainer/Dockerfile', generateDockerfile()],
    ['.devcontainer/devcontainer.json', generateDevcontainerJson(config)],

    // Claude Code
    ['CLAUDE.md', generateClaudeMd(config)],
    ['.claude/settings.json', generateClaudeSettings()],
    ['.claude/commands/README.md', generateCommandsReadme()],

    // Docs
    ['docs/project-brief.md', generateProjectBrief(config)],
    ['docs/architecture.md', generateArchitecture(config)],
    ['docs/specs/README.md', generateSpecsReadme()],

    // Shared project config
    ['.gitignore', generateGitignore(config)],
    ['.env', generateEnv(config)],
    ['.env.example', generateEnv(config)],
    ['README.md', generateReadme(config)],
  ];

  // Conditionally add API integration doc
  if (config.useAnthropicApi) {
    commonFiles.push(['docs/api-integration.md', generateApiIntegration()]);
  }

  // -- Framework-specific files --------------------------------------------

  const frameworkFiles = getFrameworkFiles(config);
  const files = [...commonFiles, ...frameworkFiles];

  // -- Write files ---------------------------------------------------------

  for (const [relativePath, content] of files) {
    await writeProjectFile(root, relativePath, content);
  }

  // -- Create empty directories (with .gitkeep so git tracks them) ---------

  const emptyDirs = getFrameworkDirs(config);

  for (const dir of emptyDirs) {
    await ensureDir(root, dir);
    await writeFile(join(root, dir, '.gitkeep'), '', 'utf-8');
  }

  // -- Git init ------------------------------------------------------------

  if (config.initGit) {
    try {
      execSync('git init', { cwd: root, stdio: 'pipe' });
      console.log('Initialized git repository.');
    } catch {
      console.warn(
        'Warning: Could not initialize git (is git installed?). Skipping.',
      );
    }
  }

  // -- Print summary -------------------------------------------------------

  console.log(`
✅ Project "${config.projectName}" created!

📁 Files generated:
${files.map(([p]) => `   ${p}`).join('\n')}
${emptyDirs.map((d) => `   ${d}/`).join('\n')}

🚀 Next steps:
   1. cd ${config.projectName}
   2. Open in VS Code: code .
   3. Click "Reopen in Container" when prompted
   4. Fill in docs/project-brief.md with your project details
   5. Start building with Claude Code!
`);
}
