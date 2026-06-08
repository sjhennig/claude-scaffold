#!/usr/bin/env node
// Boot test (design brief §7.2): generate each template into a temp dir, then
// run `npm install && npm run verify` inside it and assert success. A generated
// project that doesn't boot is a failed build — this proves the scaffold's
// output actually works, not just that the expected files exist.
//
// Deliberately NOT a vitest test and NOT part of `npm test` / `npm run verify`:
// the heavy templates take minutes to install, and folding that into the unit
// suite would also make the dogfooded Stop gate (which runs verify) crawl.
// Run it explicitly via `npm run test:boot [template...]`; CI runs it in its
// own job (one leg per template).
//
// Usage:
//   node scripts/boot-test.mjs                 # all templates
//   node scripts/boot-test.mjs node-ts none    # a subset

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { generateProject } from '../src/index.js';

const ALL_TEMPLATES = ['none', 'node-ts', 'react-vite-ts', 'nextjs-ts'];

const requested = process.argv.slice(2);
const unknown = requested.filter((t) => !ALL_TEMPLATES.includes(t));
if (unknown.length) {
  console.error(
    `Unknown template(s): ${unknown.join(', ')}. Valid: ${ALL_TEMPLATES.join(', ')}`,
  );
  process.exit(2);
}
const templates = requested.length ? requested : ALL_TEMPLATES;

function configFor(framework) {
  return {
    projectName: `boot-${framework}`,
    description: `Boot test for the ${framework} template`,
    framework,
    devPort: 3000,
    useAnthropicApi: false,
    additionalKeys: [],
    initGit: false,
  };
}

// Run a command in `cwd`, streaming its output; return whether it succeeded.
function run(cmd, args, cwd) {
  const { status } = spawnSync(cmd, args, { cwd, stdio: 'inherit' });
  return status === 0;
}

async function boot(framework) {
  const parent = await mkdtemp(join(tmpdir(), `boot-${framework}-`));
  const root = join(parent, `boot-${framework}`);
  console.log(`\n=== Booting "${framework}" in ${root} ===`);
  try {
    await generateProject(configFor(framework), root);
    const installed = run('npm', ['install', '--no-audit', '--no-fund'], root);
    return installed && run('npm', ['run', 'verify'], root);
  } catch (err) {
    // A generation/spawn throw is a failed template, not a reason to abort the
    // whole run — log it and let the remaining templates still boot.
    console.error(`Boot threw for "${framework}": ${err.message}`);
    return false;
  } finally {
    // Never let a cleanup error mask the boot result.
    try {
      await rm(parent, { recursive: true, force: true });
    } catch (err) {
      console.warn(`Could not remove ${parent}: ${err.message}`);
    }
  }
}

const results = [];
for (const framework of templates) {
  // Sequential, not parallel: installs are I/O-heavy and the output would
  // interleave illegibly. CI parallelizes across templates at the job level.
  results.push([framework, await boot(framework)]);
}

console.log('\nBoot summary:');
for (const [framework, ok] of results) {
  console.log(`  ${ok ? '✓' : '✗'} ${framework}`);
}

const failed = results.filter(([, ok]) => !ok).map(([f]) => f);
if (failed.length) {
  console.error(`\nBoot test FAILED for: ${failed.join(', ')}`);
  process.exit(1);
}
console.log('\nAll templates booted (install + verify passed).');
