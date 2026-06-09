#!/usr/bin/env node
// Opt-in subagent runtime smoke test (design brief §7.3 / §11): confirm a
// generated project's reviewer subagent loads, is invokable by name, and
// returns a (non-empty) review — the one piece of self-verification that needs
// a live Claude and so can't run in keyless CI.
//
// Scope: it smoke-tests ONE representative reviewer (code-reviewer). The other
// agents (spec-reviewer, security-reviewer, test-runner) are covered by the
// always-on structural loadability proxies in plugin.test.js, not
// by this live run. The structured Critical/Warning/Suggestion grouping is
// soft-checked (warned, not asserted) because exact phrasing is model-dependent;
// the load-bearing assertion is "loaded + invokable + returned a non-empty
// review".
//
// It generates the `none` template into a temp dir, seeds a tiny staged git
// diff, then replaces the project's .claude/settings.json with a minimal one
// that enables the `claude-guardrails` plugin from this repo's working tree (a
// local `directory` marketplace source) and carries NO hooks — so the live run
// exercises the plugin load + the agent, not the Stop gate (which would
// `npm run verify` against an uninstalled project) or the SessionStart
// preflight (those are covered by guardrails.fires.test.js). It then runs the
// real `claude` CLI non-interactively AS the code-reviewer subagent. Because
// M6 ships the reviewers via the plugin (not committed .claude/agents files),
// this doubles as the one live "the plugin loads and its agent is invokable"
// check.
//
// Least privilege: `--permission-mode dontAsk` auto-denies (never prompts, never
// hangs in headless) any tool outside a scoped read-only allowlist, so the agent
// can run `git diff`/`git status` and read files but NOT arbitrary Bash — which
// closes the path where the model could `printenv` and leak ANTHROPIC_API_KEY
// into stdout/CI logs.
//
// Deliberately NOT part of `npm test` / `npm run verify` / required CI: it
// spends tokens and needs a key. Run it explicitly:
//   ANTHROPIC_API_KEY=... node scripts/agent-smoke.mjs
//   npm run test:agent-smoke
// With no key or no `claude` on PATH it SKIPs (exit 0) so it's never a false
// red where it cannot run. Structural loadability proxies in plugin.test.js are
// the always-on CI substitute.

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { generateProject } from '../src/index.js';
import { MARKETPLACE_NAME, PLUGIN_ID } from '../src/templates/guardrails.js';

// Absolute path to this repo's root — it holds .claude-plugin/marketplace.json,
// which the smoke run registers as a local `directory` marketplace so the
// plugin loads from the working tree (not the unmerged GitHub source).
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// The subagent we invoke by name, and the structured headers its definition
// (plugin/agents/code-reviewer.md) tells it to group findings under.
const AGENT = 'code-reviewer';
const STRUCTURE_MARKERS = ['Critical', 'Warning', 'Suggestion'];

function skip(reason) {
  console.log(`SKIP: ${reason}`);
  process.exit(0);
}

function haveClaude() {
  const { status } = spawnSync('claude', ['--version'], { stdio: 'ignore' });
  return status === 0;
}

if (!process.env.ANTHROPIC_API_KEY) {
  skip('ANTHROPIC_API_KEY is not set — cannot invoke a live Claude.');
}
if (!haveClaude()) {
  skip('`claude` CLI is not on PATH — install it to run the smoke test.');
}

const config = {
  projectName: 'agent-smoke',
  description: 'Subagent runtime smoke test fixture',
  framework: 'none',
  devPort: 3000,
  useAnthropicApi: false,
  additionalKeys: [],
  initGit: false,
};

const parent = await mkdtemp(join(tmpdir(), 'agent-smoke-'));
const root = join(parent, 'agent-smoke');
let ok = false;
try {
  await generateProject(config, root);

  // Replace the generated settings with a minimal one: enable the plugin from
  // this repo's working tree (local `directory` source) and carry NO hooks, so
  // the live run only exercises the plugin load + the agent — not the Stop gate
  // (which would `npm run verify` against an uninstalled project) or the
  // SessionStart preflight. `--agent code-reviewer` then resolves from the
  // plugin instead of a project-local .claude/agents file.
  await writeFile(
    join(root, '.claude', 'settings.json'),
    JSON.stringify(
      {
        extraKnownMarketplaces: {
          [MARKETPLACE_NAME]: {
            source: { source: 'directory', path: REPO_ROOT },
          },
        },
        enabledPlugins: { [PLUGIN_ID]: true },
      },
      null,
      2,
    ),
    'utf-8',
  );

  // Seed a real staged diff for the reviewer to look at: a git repo with one
  // file carrying an obvious correctness bug. Bail loudly if any setup step
  // fails — an empty diff would make the reviewer say "no changes" (a non-empty
  // reply), which would otherwise pass the smoke test having verified nothing.
  const git = (...args) => spawnSync('git', args, { cwd: root });
  const mustGit = (...args) => {
    const { status, stderr } = git(...args);
    if (status !== 0) {
      throw new Error(
        `git ${args.join(' ')} failed: ${stderr || `exit ${status}`}`,
      );
    }
  };
  mustGit('init', '-q');
  mustGit('config', 'user.email', 'smoke@example.com');
  mustGit('config', 'user.name', 'smoke');
  await writeFile(
    join(root, 'src', 'add.js'),
    // Bug on purpose: subtracts instead of adds.
    'export function add(a, b) {\n  return a - b;\n}\n',
    'utf-8',
  );
  mustGit('add', '-A');
  // `git diff --staged --quiet` exits non-zero IFF there are staged changes.
  if (git('diff', '--staged', '--quiet').status === 0) {
    throw new Error('seeding produced no staged diff — nothing to review');
  }

  console.log(`\n=== Invoking "${AGENT}" subagent in ${root} ===`);
  const { status, stdout, stderr } = spawnSync(
    'claude',
    [
      '-p',
      'Review the current staged changes (run `git diff --staged`). Report findings.',
      '--agent',
      AGENT,
      '--output-format',
      'json',
      // Headless least privilege: auto-deny anything outside the allowlist
      // instead of prompting (which would hang in CI).
      '--permission-mode',
      'dontAsk',
      '--allowedTools',
      'Bash(git diff:*),Bash(git status:*),Read,Glob,Grep',
      // Defense in depth: deny network/write even if a future allow widens.
      '--disallowedTools',
      'WebFetch,WebSearch,Write,Edit',
      // Pin a cheap model for a smoke test (the agent's frontmatter is
      // `model: inherit`, which has no session model to inherit in headless).
      '--model',
      'sonnet',
    ],
    { cwd: root, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 },
  );

  if (status !== 0) {
    console.error(`claude exited ${status}\n${stderr || ''}`);
  } else {
    let result;
    try {
      result = JSON.parse(stdout);
    } catch {
      console.error(
        `Could not parse claude --output-format json output:\n${stdout}`,
      );
    }
    const text = result && (result.result ?? '');
    if (result?.is_error) {
      console.error(`Claude reported an error result:\n${text}`);
    } else if (!text || !text.trim()) {
      console.error('Subagent returned an empty result.');
    } else {
      ok = true;
      console.log(text);
      // Soft signal only: the agent loaded and ran (a non-empty result above is
      // the hard proof). Whether it echoed the Critical/Warning/Suggestion
      // grouping is model-dependent, so warn rather than fail.
      const grouped = STRUCTURE_MARKERS.some((m) => text.includes(m));
      if (!grouped) {
        console.warn(
          `\nNote: result did not mention any of ${STRUCTURE_MARKERS.join('/')} — ` +
            'the subagent ran but may not have used its structured shape.',
        );
      }
    }
  }
} catch (err) {
  console.error(`Smoke test threw: ${err.message}`);
} finally {
  try {
    await rm(parent, { recursive: true, force: true });
  } catch (err) {
    console.warn(`Could not remove ${parent}: ${err.message}`);
  }
}

if (ok) {
  console.log(
    `\n✓ ${AGENT} subagent loaded, was invokable by name, and returned a review.`,
  );
  process.exit(0);
}
console.error(`\n✗ ${AGENT} subagent smoke test FAILED.`);
process.exit(1);
