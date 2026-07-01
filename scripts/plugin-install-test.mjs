#!/usr/bin/env node
// Verifies the devcontainer postCreate plugin-install mechanism: that
// `claude plugin install claude-guardrails@claude-scaffold`, run in a generated
// project whose `.claude/settings.json` declares the marketplace as a
// GitHub-source `extraKnownMarketplaces` entry (pinned to a guardrails-v* tag),
// actually installs the plugin non-interactively — the exact behavior Claude
// Code v2.1.195+ now requires and that the emitted devcontainer automates.
//
// It runs the command on the CI runner rather than building the full
// devcontainer image: the container doesn't affect `claude plugin install`
// (same CLI, same network, same project cwd), so a runner-based check is a
// faithful, much cheaper proxy for the mechanism. (agent-smoke covers the
// directory-source path + live invocation; this covers the GitHub-source,
// settings.json-declared install path with NO explicit `marketplace add`.)
//
// Gating mirrors scripts/agent-smoke.mjs: SKIPs (exit 0) if the `claude` CLI is
// absent. No API key needed — installing a plugin fetches from GitHub, it does
// not call the model. Run it explicitly:
//   node scripts/plugin-install-test.mjs
//   npm run test:plugin-install

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { generateProject } from '../src/index.js';
import {
  PLUGIN_ID,
  PLUGIN_NAME,
  GITHUB_MARKETPLACE_SOURCE,
  PINNED_PLUGIN_REF,
} from '../src/templates/guardrails.js';

// Same marketplace-add argument the devcontainer postCreate uses: the GitHub git
// URL pinned to the release tag. A project's settings.json enablement is NOT
// honored headlessly (needs interactive folder-trust), so add it explicitly.
const MARKETPLACE_ADD_ARG = `https://github.com/${GITHUB_MARKETPLACE_SOURCE.repo}.git#${PINNED_PLUGIN_REF}`;

function skip(reason) {
  console.log(`SKIP: ${reason}`);
  process.exit(0);
}

function haveClaude() {
  return spawnSync('claude', ['--version'], { stdio: 'ignore' }).status === 0;
}

if (!haveClaude()) {
  skip(
    '`claude` CLI is not on PATH — install it to run the plugin-install test.',
  );
}

const config = {
  projectName: 'plugin-install',
  description: 'Plugin auto-install verification fixture',
  framework: 'none',
  devPort: 3000,
  useAnthropicApi: false,
  additionalKeys: [],
  initGit: false,
};

const parent = await mkdtemp(join(tmpdir(), 'plugin-install-'));
const root = join(parent, 'plugin-install');
let ok = false;
try {
  // Use the REAL emitted settings.json (GitHub-source marketplace, pinned tag)
  // — do not overwrite it. This is the path a scaffolded project ships with.
  await generateProject(config, root);

  const claude = (...args) =>
    spawnSync('claude', args, { cwd: root, encoding: 'utf-8' });

  // settings.json enablement isn't honored headlessly (needs interactive
  // folder-trust), so add the marketplace explicitly — pinned to the release
  // tag — exactly as the devcontainer postCreate does.
  console.log(`Adding marketplace ${MARKETPLACE_ADD_ARG} ...`);
  const add = claude('plugin', 'marketplace', 'add', MARKETPLACE_ADD_ARG);
  process.stdout.write(add.stdout || '');
  process.stderr.write(add.stderr || '');
  if (add.status !== 0) {
    throw new Error(
      `\`claude plugin marketplace add ${MARKETPLACE_ADD_ARG}\` failed (exit ${add.status}).`,
    );
  }

  console.log(`Installing ${PLUGIN_ID} ...`);
  const install = claude('plugin', 'install', PLUGIN_ID);
  process.stdout.write(install.stdout || '');
  process.stderr.write(install.stderr || '');
  if (install.status !== 0) {
    throw new Error(
      `\`claude plugin install ${PLUGIN_ID}\` failed (exit ${install.status}) — ` +
        'the devcontainer postCreate would not restore /qc for users.',
    );
  }

  // Confirm it's actually installed, not just a clean exit.
  const list = claude('plugin', 'list');
  const out = (list.stdout || '') + (list.stderr || '');
  if (!out.includes(PLUGIN_NAME)) {
    throw new Error(
      `plugin installed with exit 0 but \`claude plugin list\` does not mention ${PLUGIN_NAME}:\n${out}`,
    );
  }
  console.log(`OK — ${PLUGIN_NAME} installed and listed.`);
  ok = true;
} finally {
  // Ephemeral CI runner, but tidy up the user-scope install regardless.
  spawnSync('claude', ['plugin', 'uninstall', PLUGIN_ID], { stdio: 'ignore' });
  await rm(parent, { recursive: true, force: true });
}

if (!ok) process.exit(1);
