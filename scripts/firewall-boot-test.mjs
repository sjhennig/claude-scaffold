#!/usr/bin/env node
// Opt-in runtime smoke for the network-egress firewall (M9 Option A). The
// generated init-firewall.sh is a fail-closed security control whose failure
// mode is "no egress / bricked container", yet it was previously only
// substring-asserted, never executed. This actually BUILDS a firewalled image
// and RUNS the script with NET_ADMIN/NET_RAW, proving the two things static
// checks can't:
//   - the reset does not break Docker's embedded DNS (dig still resolves), and
//   - the default-DROP allowlist holds (example.com blocked, github/npm allowed).
// init-firewall.sh's own tail-verification already asserts example.com is
// blocked and api.github.com is reachable, so a clean exit 0 is itself the core
// proof; we add explicit DNS + npm-registry checks on top.
//
// Gating mirrors scripts/agent-smoke.mjs: if docker is absent or its daemon is
// unreachable, it SKIPs (exit 0) so it's never a false red where it cannot run
// (e.g. this devcontainer has no docker). It is network-dependent (apt-get,
// api.github.com/meta, npm, example.com), so CI runs it only on demand — a
// workflow_dispatch-gated job — never on every PR. Run it explicitly:
//   node scripts/firewall-boot-test.mjs
//   npm run test:firewall-boot

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { generateProject } from '../src/index.js';

// Per-run tag so overlapping runs (or a leftover image from a killed run) don't
// share a name and have one run's `docker rmi` yank the other's image.
const IMAGE = `claude-scaffold-fw-smoke-${process.pid}`;

function skip(reason) {
  console.log(`SKIP: ${reason}`);
  process.exit(0);
}

function haveDocker() {
  if (spawnSync('docker', ['--version'], { stdio: 'ignore' }).status !== 0) {
    return false;
  }
  // `--version` works without a daemon; `info` needs a reachable one.
  return spawnSync('docker', ['info'], { stdio: 'ignore' }).status === 0;
}

if (!haveDocker()) {
  skip('docker is not available (or its daemon is unreachable) — cannot boot.');
}

const config = {
  projectName: 'fw-smoke',
  description: 'Network-firewall boot smoke fixture',
  framework: 'none',
  devPort: 3000,
  useAnthropicApi: false,
  additionalKeys: [],
  networkFirewall: true,
  initGit: false,
};

// Assertions run INSIDE the firewalled container, as the node user. init-firewall
// exits non-zero if its own verification (example.com blocked / github reachable)
// fails, so `set -e` propagates that. The extra checks make the DNS-survives (#2)
// and allowlist-works claims explicit.
const inContainer = [
  'set -euo pipefail',
  'sudo /usr/local/bin/init-firewall.sh',
  // Run it a SECOND time: iptables policy is DROP after the first run, so a
  // re-run must restore ACCEPT for its own setup traffic or it fails closed on
  // itself (regression guard for that bug, and the documented refresh remedy).
  'sudo /usr/local/bin/init-firewall.sh',
  // DNS must still resolve — the whole point of not flushing the nat table.
  "dig +short registry.npmjs.org | grep -qE '^[0-9]+\\.' || { echo 'FAIL: DNS did not resolve'; exit 1; }",
  // An allowlisted registry must be reachable.
  "curl -fsS --connect-timeout 8 https://registry.npmjs.org/ >/dev/null || { echo 'FAIL: npm registry blocked'; exit 1; }",
  // A non-allowlisted host must be blocked.
  "if curl -fsS --connect-timeout 8 https://example.com >/dev/null 2>&1; then echo 'FAIL: example.com reachable'; exit 1; fi",
  'echo FIREWALL_SMOKE_OK',
].join('\n');

const parent = await mkdtemp(join(tmpdir(), 'fw-smoke-'));
const root = join(parent, 'fw-smoke');
const ctx = join(root, '.devcontainer');
let ok = false;
try {
  await generateProject(config, root);

  console.log('firewall-boot: building image...');
  const build = spawnSync(
    'docker',
    ['build', '-t', IMAGE, '-f', join(ctx, 'Dockerfile'), ctx],
    { stdio: 'inherit' },
  );
  if (build.status !== 0) throw new Error('docker build failed');

  console.log('firewall-boot: running init-firewall.sh under NET_ADMIN...');
  const run = spawnSync(
    'docker',
    [
      'run',
      '--rm',
      '--cap-add=NET_ADMIN',
      '--cap-add=NET_RAW',
      IMAGE,
      'bash',
      '-c',
      inContainer,
    ],
    { stdio: 'inherit' },
  );
  if (run.status !== 0) throw new Error('firewall smoke assertions failed');
  ok = true;
} finally {
  spawnSync('docker', ['rmi', '-f', IMAGE], { stdio: 'ignore' });
  await rm(parent, { recursive: true, force: true });
}

if (!ok) process.exit(1);
console.log('firewall-boot: OK — DNS survived, allowlist enforced.');
