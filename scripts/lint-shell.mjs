#!/usr/bin/env node
// Static lint for the generated shell scripts — currently the opt-in
// network-egress firewall (`init-firewall.sh`, from generateInitFirewallScript).
// That script is emitted as a string and, until now, was only substring-asserted
// in vitest — never parsed by a shell linter. This runs `shellcheck` over the
// actual generated output so quoting/globbing/word-splitting regressions surface
// in CI rather than at container start.
//
// Gating mirrors scripts/agent-smoke.mjs: if `shellcheck` is not on PATH, it
// SKIPs (exit 0) so it's never a false red locally; CI (ubuntu runners ship
// shellcheck) actually executes it. Deliberately standalone — NOT folded into
// `npm run verify` — matching how test:boot / test:agent-smoke are standalone.
//   npm run lint:shell

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { generateInitFirewallScript } from '../src/templates/devcontainer.js';

function skip(reason) {
  console.log(`SKIP: ${reason}`);
  process.exit(0);
}

function haveShellcheck() {
  const { status } = spawnSync('shellcheck', ['--version'], {
    stdio: 'ignore',
  });
  return status === 0;
}

if (!haveShellcheck()) {
  skip('`shellcheck` is not on PATH — install it to lint the generated shell.');
}

// One entry per generated shell script we want linted.
const SCRIPTS = [['init-firewall.sh', generateInitFirewallScript()]];

const dir = await mkdtemp(join(tmpdir(), 'lint-shell-'));
let failed = false;
try {
  for (const [name, contents] of SCRIPTS) {
    const path = join(dir, name);
    await writeFile(path, contents);
    console.log(`shellcheck: ${name}`);
    // -S warning: report warnings and errors (skip style/info noise); it's a
    // gate on real problems, not a formatter.
    const { status } = spawnSync('shellcheck', ['-S', 'warning', path], {
      stdio: 'inherit',
    });
    if (status !== 0) failed = true;
  }
} finally {
  await rm(dir, { recursive: true, force: true });
}

if (failed) {
  console.error('lint-shell: shellcheck reported issues (see above).');
  process.exit(1);
}
console.log('lint-shell: OK');
