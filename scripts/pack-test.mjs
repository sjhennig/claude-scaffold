#!/usr/bin/env node
// Pack test (M8): the self-verification philosophy applied to distribution.
// `npm pack` the working tree, assert the tarball's contents, install the
// tarball into a clean prefix, and prove the INSTALLED package works — the bin
// executes and a generated project verifies. The unit suite proves the source;
// this proves the artifact users actually download (a missing file in the
// `files` allowlist breaks npx users while every other test stays green).
//
// Cheap by design (the `none` template), so it runs as a per-PR CI job and is
// reused by the publish workflow as the last gate before `npm publish`.
//
// Usage: node scripts/pack-test.mjs   (exposed as `npm run test:pack`)

import { mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = process.cwd();
const fail = (msg) => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};

// Run a command, capturing stdout; null on non-zero exit unless allowFail.
function run(cmd, args, { cwd = repoRoot, allowFail = false } = {}) {
  const res = spawnSync(cmd, args, { cwd, encoding: 'utf-8' });
  if (res.status !== 0 && !allowFail) {
    console.error(res.stdout);
    console.error(res.stderr);
    fail(`${cmd} ${args.join(' ')} exited ${res.status}`);
  }
  return res;
}

const work = await mkdtemp(join(tmpdir(), 'pack-test-'));
try {
  // 1. Pack the working tree.
  const packed = run('npm', ['pack', '--json', '--pack-destination', work]);
  const tarball = join(work, JSON.parse(packed.stdout)[0].filename);
  console.log(`✓ packed ${tarball}`);

  // 2. Tarball contents: the runtime files in, the colocated tests out.
  const listing = run('tar', ['-tzf', tarball]).stdout.split('\n');
  for (const required of [
    'package/package.json',
    'package/bin/claude-scaffold.js',
    'package/src/index.js',
    'package/src/doctor.js',
    'package/src/templates/guardrails.js',
  ]) {
    if (!listing.includes(required)) fail(`tarball is missing ${required}`);
  }
  const tests = listing.filter((f) => f.endsWith('.test.js'));
  if (tests.length) fail(`tests leaked into the tarball: ${tests.join(', ')}`);
  console.log(
    `✓ tarball contents correct (${listing.filter(Boolean).length} files, 0 tests)`,
  );

  // 3. Install the tarball into a clean prefix.
  const prefix = join(work, 'install');
  run('npm', [
    'install',
    '--prefix',
    prefix,
    '--no-audit',
    '--no-fund',
    tarball,
  ]);
  const installedBin = join(prefix, 'node_modules', '.bin', 'claude-scaffold');
  if (!existsSync(installedBin))
    fail('installed package exposes no claude-scaffold bin');
  console.log('✓ tarball installs and exposes the claude-scaffold bin');

  // 4. The installed bin executes end-to-end: `doctor` in an empty dir must
  // report the missing settings (exit 1) — proving the bin resolves all of its
  // imports from the installed tree, not the repo.
  const emptyDir = await mkdtemp(join(work, 'empty-'));
  const doctor = run(installedBin, ['doctor'], {
    cwd: emptyDir,
    allowFail: true,
  });
  // Match loosely (exit code + the path it must mention) so a doctor message
  // reword doesn't masquerade as a packaging failure.
  if (doctor.status !== 1 || !doctor.stdout.includes('.claude/settings.json')) {
    console.error(doctor.stdout, doctor.stderr);
    fail('installed bin did not run doctor correctly');
  }
  console.log(
    '✓ installed bin runs (doctor reports correctly in an empty dir)',
  );

  // 5. Scaffold a project by DRIVING THE INSTALLED BIN with the M8 flag mode
  // — the exact path an npx user takes — and prove the result verifies.
  const scaffold = run(
    installedBin,
    ['pack-none', '--framework', 'none', '--no-git', '--yes'],
    { cwd: work },
  );
  if (!scaffold.stdout.includes('created')) {
    console.error(scaffold.stdout, scaffold.stderr);
    fail('installed bin did not report the project as created');
  }
  const projectRoot = join(work, 'pack-none');
  const install = spawnSync('npm', ['install', '--no-audit', '--no-fund'], {
    cwd: projectRoot,
    stdio: 'inherit',
  });
  if (install.status !== 0) fail('generated project failed npm install');
  const verify = spawnSync('npm', ['run', 'verify'], {
    cwd: projectRoot,
    stdio: 'inherit',
  });
  if (verify.status !== 0) fail('generated project failed npm run verify');
  console.log('✓ project scaffolded via the installed bin (flags) verifies');

  console.log('\nPack test passed: the published artifact is self-contained.');
} finally {
  try {
    await rm(work, { recursive: true, force: true });
  } catch (err) {
    console.warn(`Could not remove ${work}: ${err.message}`);
  }
}
