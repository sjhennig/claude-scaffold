import { mkdir, writeFile, chmod, readFile, stat } from 'node:fs/promises';
import { join, dirname, basename } from 'node:path';
import { execSync } from 'node:child_process';
import { gatherInput } from './prompts.js';
import {
  generateDockerfile,
  generateDevcontainerJson,
  generateInitFirewallScript,
} from './templates/devcontainer.js';
import {
  generateClaudeMd,
  claudeMdExceedsBudget,
  CLAUDE_MD_LINE_BUDGET,
} from './templates/claude-md.js';
import { generateCommandsReadme } from './templates/hooks.js';
import {
  generateClaudeSettings,
  generateValidateCommandScript,
  generateVerifyGateScript,
  generateSandboxPreflightScript,
  generateCheckDriftScript,
  PLUGIN_ID,
  GITHUB_MARKETPLACE_SOURCE,
  PINNED_PLUGIN_REF,
} from './templates/guardrails.js';
import {
  generateProjectBrief,
  generateArchitecture,
  generateApiIntegration,
  generateSpecsReadme,
  generateSubsystemSpecTemplate,
  generateNotesLog,
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

async function pathExists(fullPath) {
  try {
    await stat(fullPath);
    return true;
  } catch {
    return false;
  }
}

// The hook scripts that must be executable, plus the firewall script when on.
function executableScriptsFor(config) {
  return [
    '.claude/hooks/validate-command.sh',
    '.claude/hooks/verify-gate.sh',
    '.claude/hooks/sandbox-preflight.sh',
    '.claude/hooks/check-drift.sh',
    ...(config.networkFirewall ? ['.devcontainer/init-firewall.sh'] : []),
  ];
}

// The framework-agnostic guardrail layer, shared by full generation
// (`generateProject`) and the in-place overlay (`overlayProject`) so the two
// can't drift. `claudeMd` is passed in so the caller controls the one budget
// warning. Returns an array of [relativePath, content].
function buildCommonFiles(config, claudeMd) {
  const commonFiles = [
    // Devcontainer
    ['.devcontainer/Dockerfile', generateDockerfile(config)],
    ['.devcontainer/devcontainer.json', generateDevcontainerJson(config)],

    // Claude Code — guardrail core (framework-agnostic)
    ['CLAUDE.md', claudeMd],
    ['.claude/settings.json', generateClaudeSettings()],
    ['.claude/hooks/validate-command.sh', generateValidateCommandScript()],
    ['.claude/hooks/verify-gate.sh', generateVerifyGateScript()],
    [
      '.claude/hooks/sandbox-preflight.sh',
      generateSandboxPreflightScript(config),
    ],
    ['.claude/hooks/check-drift.sh', generateCheckDriftScript()],
    ['.claude/commands/README.md', generateCommandsReadme()],

    // Docs
    ['docs/project-brief.md', generateProjectBrief(config)],
    ['docs/architecture.md', generateArchitecture(config)],
    ['docs/specs/README.md', generateSpecsReadme()],
    ['docs/specs/_template.md', generateSubsystemSpecTemplate()],
    ['NOTES.md', generateNotesLog()],

    // Shared project config
    ['.gitignore', generateGitignore(config)],
    ['.env', generateEnv(config)],
    ['.env.example', generateEnv(config)],
    ['README.md', generateReadme(config)],
  ];

  if (config.useAnthropicApi) {
    commonFiles.push(['docs/api-integration.md', generateApiIntegration()]);
  }

  // Opt-in network-egress firewall (M9 Option A): the allowlist script the
  // Dockerfile COPYs and postStartCommand runs.
  if (config.networkFirewall) {
    commonFiles.push([
      '.devcontainer/init-firewall.sh',
      generateInitFirewallScript(),
    ]);
  }

  return commonFiles;
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

// Generate a project's full file tree into `root`. Pure of prompts and git —
// it only computes template strings and writes them — so both the interactive
// CLI (`run`) and the self-verification boot harness (scripts/boot-test.mjs)
// can drive generation the same way. Returns the written file list + created
// dirs so callers can print a summary. Does NOT create `root`'s parent; each
// file write mkdir's its own subtree.
export async function generateProject(config, root) {
  // Leanness budget (design brief §6): warn if CLAUDE.md outgrows its cap, since
  // every line competes for the model's attention at session start.
  const claudeMd = generateClaudeMd(config);
  if (claudeMdExceedsBudget(claudeMd)) {
    console.warn(
      `Warning: CLAUDE.md is ${claudeMd.split('\n').length} lines, over the ${CLAUDE_MD_LINE_BUDGET}-line budget. Trim it — move detail into docs/ and @-import it.`,
    );
  }

  // -- Common (framework-agnostic guardrail) + framework-specific files ----

  const commonFiles = buildCommonFiles(config, claudeMd);
  const frameworkFiles = getFrameworkFiles(config);
  const files = [...commonFiles, ...frameworkFiles];

  // -- Write files ---------------------------------------------------------

  for (const [relativePath, content] of files) {
    await writeProjectFile(root, relativePath, content);
  }

  // Hook scripts must be executable. (Hooks invoke them via `bash`, so this is
  // ergonomics, not a hard requirement — and a no-op on Windows.)
  for (const script of executableScriptsFor(config)) {
    await chmod(join(root, script), 0o755);
  }

  // -- Create empty directories (with .gitkeep so git tracks them) ---------

  const emptyDirs = getFrameworkDirs(config);

  for (const dir of emptyDirs) {
    await ensureDir(root, dir);
    await writeFile(join(root, dir, '.gitkeep'), '', 'utf-8');
  }

  return { files, emptyDirs };
}

// ---------------------------------------------------------------------------
// Overlay — add the guardrail layer to an EXISTING project (--here)
// ---------------------------------------------------------------------------

// The current dir's basename → a valid project name (kebab, [a-z0-9-]). Used for
// the CLAUDE.md/devcontainer name in overlay mode where there's no prompt.
export function sanitizeProjectName(raw) {
  const s = String(raw)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || 'app';
}

// The fill-in JS tooling the overlay writes (only when absent) so `verify`'s
// lint/format/test steps have configs. package.json is merged separately; the
// smoke test and framework app files are deliberately NOT overlaid.
const OVERLAY_TOOLING_FILES = [
  'eslint.config.js',
  '.prettierrc',
  '.prettierignore',
  'vitest.config.js',
];

// Pure merge: layer the guardrail package.json's scripts + devDependencies onto
// an existing one WITHOUT clobbering. Existing keys always win. Returns the
// merged object plus what changed, so the caller can report it. `verify` and its
// script family are added only where missing; a same-named script with a
// different value is reported as a conflict (the user's `verify` may need their
// own lint/format/test).
export function mergePackageJson(existing, guardrail) {
  const merged = { ...existing };
  const addedScripts = [];
  const conflictScripts = [];
  const addedDevDeps = [];

  merged.scripts = { ...(existing.scripts || {}) };
  for (const [name, cmd] of Object.entries(guardrail.scripts || {})) {
    if (merged.scripts[name] === undefined) {
      merged.scripts[name] = cmd;
      addedScripts.push(name);
    } else if (merged.scripts[name] !== cmd) {
      conflictScripts.push(name);
    }
  }

  merged.devDependencies = { ...(existing.devDependencies || {}) };
  for (const [dep, ver] of Object.entries(guardrail.devDependencies || {})) {
    if (merged.devDependencies[dep] === undefined) {
      merged.devDependencies[dep] = ver;
      addedDevDeps.push(dep);
    }
  }

  return { merged, addedScripts, conflictScripts, addedDevDeps };
}

// Overlay the framework-agnostic guardrail layer into `root` (an existing
// project). Never overwrites existing files (unless `force`); merges an existing
// package.json rather than replacing it. Returns a report of what changed.
export async function overlayProject(config, root, { force = false } = {}) {
  const claudeMd = generateClaudeMd(config);
  if (claudeMdExceedsBudget(claudeMd)) {
    console.warn(
      `Warning: CLAUDE.md is ${claudeMd.split('\n').length} lines, over the ${CLAUDE_MD_LINE_BUDGET}-line budget.`,
    );
  }

  // Guardrail core minus files that would intrude on an existing project
  // (README stays theirs; never create a secrets .env), plus the fill-in JS
  // tooling. package.json is handled by the merge below, not written here.
  const noneFiles = getFrameworkFiles({ ...config, framework: 'none' });
  const tooling = noneFiles.filter(([p]) => OVERLAY_TOOLING_FILES.includes(p));
  const overlayFiles = [
    ...buildCommonFiles(config, claudeMd).filter(
      ([p]) => p !== 'README.md' && p !== '.env',
    ),
    ...tooling,
  ];

  const created = [];
  const skipped = [];
  for (const [relativePath, content] of overlayFiles) {
    if (!force && (await pathExists(join(root, relativePath)))) {
      skipped.push(relativePath);
      continue;
    }
    await writeProjectFile(root, relativePath, content);
    created.push(relativePath);
  }

  // Make the hook scripts we actually wrote executable.
  for (const script of executableScriptsFor(config)) {
    if (created.includes(script)) await chmod(join(root, script), 0o755);
  }

  // package.json: merge into the existing one, or create it from the guardrail
  // template if the project has none.
  const guardrailPkgStr = noneFiles.find(([p]) => p === 'package.json')[1];
  const pkgPath = join(root, 'package.json');
  let pkg;
  if (await pathExists(pkgPath)) {
    const existing = JSON.parse(await readFile(pkgPath, 'utf-8'));
    const result = mergePackageJson(existing, JSON.parse(guardrailPkgStr));
    await writeFile(pkgPath, JSON.stringify(result.merged, null, 2) + '\n');
    pkg = { action: 'merged', ...result };
  } else {
    await writeFile(pkgPath, guardrailPkgStr);
    pkg = {
      action: 'created',
      addedScripts: [],
      conflictScripts: [],
      addedDevDeps: [],
    };
  }

  return { created, skipped, pkg };
}

// ---------------------------------------------------------------------------
// Main — interactive CLI entry point
// ---------------------------------------------------------------------------

export async function run({ provided = {}, yes = false } = {}) {
  console.log('\n🏗️  claude-scaffold — Generate a Claude Code project\n');

  // Overlay mode: derive the name from the cwd and force framework-agnostic
  // generation BEFORE gathering input, so the projectName/framework/devPort
  // prompts are skipped while the devcontainer/API prompts still run.
  if (provided.here) {
    provided = {
      ...provided,
      projectName: sanitizeProjectName(basename(process.cwd())),
      framework: 'none',
    };
  }

  const config = await gatherInput(provided, { yes });

  if (config.here) {
    await runOverlay(config);
    return;
  }

  const root = join(process.cwd(), config.projectName);

  console.log(`\nCreating project at ./${config.projectName} ...\n`);

  const { files, emptyDirs } = await generateProject(config, root);

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

// Drive + report the in-place overlay (--here). Separate from `run`'s success
// message because the steps differ (no `cd`, package.json merge, skipped files).
async function runOverlay(config) {
  const root = process.cwd();
  console.log(`\nAdding the guardrail layer to ${root} ...\n`);

  const { created, skipped, pkg } = await overlayProject(config, root, {
    force: config.force,
  });

  const list = (items) => items.map((p) => `   ${p}`).join('\n');
  console.log(`✅ Guardrails overlaid onto "${config.projectName}".\n`);
  if (created.length) console.log(`📁 Created:\n${list(created)}\n`);
  if (skipped.length)
    console.log(
      `⏭️  Skipped (already exist — left untouched; re-run with --force to overwrite):\n${list(skipped)}\n`,
    );

  if (pkg.action === 'merged') {
    console.log(
      pkg.addedScripts.length || pkg.addedDevDeps.length
        ? `📦 package.json merged — added scripts: ${pkg.addedScripts.join(', ') || 'none'}; devDeps: ${pkg.addedDevDeps.join(', ') || 'none'}.`
        : '📦 package.json already had the guardrail scripts + devDeps (unchanged).',
    );
    if (pkg.conflictScripts.length) {
      console.log(
        `   ⚠️  Kept your existing scripts: ${pkg.conflictScripts.join(', ')}. \`verify\` runs \`format:check\`, \`lint\`, \`test\` — make sure those do what you expect.`,
      );
    }
  } else {
    console.log('📦 package.json created (none existed).');
  }

  const marketplaceUrl = `https://github.com/${GITHUB_MARKETPLACE_SOURCE.repo}.git#${PINNED_PLUGIN_REF}`;
  console.log(`
🚀 Next steps:
   1. npm install
   2. Install the QC plugin (or just open the devcontainer, which does this
      automatically):
      claude plugin marketplace add ${marketplaceUrl}
      claude plugin install ${PLUGIN_ID}
   3. Verify the guardrails are healthy: npx @sjhennig/claude-scaffold doctor
   4. Review the overlaid CLAUDE.md / docs and tailor them to your project.
`);
}
