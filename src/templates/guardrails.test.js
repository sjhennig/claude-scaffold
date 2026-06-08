import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  generateClaudeSettings,
  generateValidateCommandScript,
  generateVerifyGateScript,
  generateSandboxPreflightScript,
  generateCheckDriftScript,
} from './guardrails.js';

describe('generateClaudeSettings', () => {
  const settings = JSON.parse(generateClaudeSettings());

  it('returns valid JSON', () => {
    expect(() => JSON.parse(generateClaudeSettings())).not.toThrow();
  });

  it('allows the core coding loop and read-only tools', () => {
    expect(settings.permissions.allow).toContain('Read');
    expect(settings.permissions.allow).toContain('Bash(npm run:*)');
  });

  it('does not allowlist git push (push is prompted, not auto-approved)', () => {
    const pushAllowed = settings.permissions.allow.some((p) =>
      p.includes('git push'),
    );
    expect(pushAllowed).toBe(false);
  });

  it('denies sudo and reads of secret files', () => {
    expect(settings.permissions.deny).toContain('Bash(sudo:*)');
    expect(settings.permissions.deny).toContain('Read(./.env)');
    expect(settings.permissions.deny).toContain('Read(~/.ssh/**)');
  });

  it('nests allowUnixSockets under sandbox.network (valid schema)', () => {
    expect(settings.sandbox.network).toHaveProperty('allowUnixSockets');
    expect(settings.sandbox).not.toHaveProperty('allowUnixSockets');
  });

  it('sandbox denies reads of secrets', () => {
    expect(settings.sandbox.filesystem.denyRead).toContain('.env');
    expect(settings.sandbox.filesystem.denyRead).toContain('~/.ssh');
  });

  it('PreToolUse validates Bash via a project-dir-rooted script', () => {
    const entry = settings.hooks.PreToolUse.find((e) => e.matcher === 'Bash');
    const command = entry.hooks[0].command;
    expect(command).toContain('$CLAUDE_PROJECT_DIR');
    expect(command).toContain('validate-command.sh');
  });

  it('PostToolUse auto-formats edited files with prettier', () => {
    const entry = settings.hooks.PostToolUse.find(
      (e) => e.matcher === 'Edit|Write',
    );
    expect(entry.hooks[0].command).toContain('prettier --write');
  });

  it('Stop hook is the project-dir-rooted verify gate (not inline tail)', () => {
    const command = settings.hooks.Stop[0].hooks[0].command;
    expect(command).toContain('$CLAUDE_PROJECT_DIR');
    expect(command).toContain('verify-gate.sh');
  });

  it('SessionStart runs the project-dir-rooted sandbox preflight', () => {
    const command = settings.hooks.SessionStart[0].hooks[0].command;
    expect(command).toContain('$CLAUDE_PROJECT_DIR');
    expect(command).toContain('sandbox-preflight.sh');
  });

  it('SessionStart also runs the project-dir-rooted drift check', () => {
    const commands = settings.hooks.SessionStart.map((e) => e.hooks[0].command);
    expect(commands).toHaveLength(2);
    const drift = commands.find((c) => c.includes('check-drift.sh'));
    expect(drift).toBeDefined();
    expect(drift).toContain('$CLAUDE_PROJECT_DIR');
  });
});

describe('generateValidateCommandScript', () => {
  const script = generateValidateCommandScript();

  it('is a bash script', () => {
    expect(script.startsWith('#!/usr/bin/env bash')).toBe(true);
  });

  it('fails open when jq is missing', () => {
    expect(script).toContain('command -v jq');
  });

  it('blocks dangerous commands with exit 2', () => {
    expect(script).toContain('exit 2');
    expect(script).toContain('DENY_PATTERNS');
  });
});

describe('generateVerifyGateScript', () => {
  const script = generateVerifyGateScript();

  it('runs the verify contract', () => {
    expect(script).toContain('npm run verify');
  });

  it('blocks turn-end with exit 2 on failure', () => {
    expect(script).toContain('exit 2');
  });

  it('has a re-entrancy guard so it cannot deadlock', () => {
    expect(script).toContain('MAX_ATTEMPTS');
    expect(script).toContain('session_id');
  });

  it('fails open when jq is missing', () => {
    expect(script).toContain('command -v jq');
  });
});

describe('generateSandboxPreflightScript', () => {
  const script = generateSandboxPreflightScript();

  it('is a bash script', () => {
    expect(script.startsWith('#!/usr/bin/env bash')).toBe(true);
  });

  it('only warns when the sandbox is actually enabled', () => {
    expect(script).toContain('.sandbox.enabled');
  });

  it('checks that bwrap can create a namespace, not just that it exists', () => {
    expect(script).toContain('command -v bwrap');
    expect(script).toContain('bwrap --ro-bind / / true');
  });

  it('is advisory only — never blocks (no exit 2)', () => {
    expect(script).not.toContain('exit 2');
  });

  it('stays silent when it cannot tell (no jq / no settings file)', () => {
    expect(script).toContain('command -v jq');
  });
});

describe('generateCheckDriftScript', () => {
  const script = generateCheckDriftScript();

  it('is a bash script', () => {
    expect(script.startsWith('#!/usr/bin/env bash')).toBe(true);
  });

  it('fails open when jq or git is missing', () => {
    expect(script).toContain('command -v jq');
    expect(script).toContain('command -v git');
  });

  it('no-ops when the subsystem map is absent (fresh-project case)', () => {
    expect(script).toContain('docs/specs/subsystem-map.json');
    expect(script).toContain('[ -f "$MAP" ] || exit 0');
  });

  it('no-ops when the map is empty or malformed', () => {
    expect(script).toContain('.subsystems | length > 0');
  });

  it('inspects recent committed history, not the working tree', () => {
    expect(script).toContain('git -C "$ROOT" rev-list');
    expect(script).toContain('git -C "$ROOT" diff --name-only');
    expect(script).toContain('LOOKBACK=');
  });

  it('is advisory only — never blocks (no exit 2)', () => {
    expect(script).not.toContain('exit 2');
  });
});

// Dogfooding guard: this repo must run the very guardrails it emits.
// If these fail, the committed .claude/ has drifted from the generator —
// regenerate it (see scripts in src/templates/guardrails.js).
describe('dogfood: committed .claude/ matches generated output', () => {
  const repoRoot = process.cwd();

  it('settings.json matches generateClaudeSettings (semantically)', () => {
    const committed = JSON.parse(
      readFileSync(join(repoRoot, '.claude/settings.json'), 'utf-8'),
    );
    expect(committed).toEqual(JSON.parse(generateClaudeSettings()));
  });

  it('validate-command.sh matches generateValidateCommandScript', () => {
    const committed = readFileSync(
      join(repoRoot, '.claude/hooks/validate-command.sh'),
      'utf-8',
    );
    expect(committed).toBe(generateValidateCommandScript());
  });

  it('verify-gate.sh matches generateVerifyGateScript', () => {
    const committed = readFileSync(
      join(repoRoot, '.claude/hooks/verify-gate.sh'),
      'utf-8',
    );
    expect(committed).toBe(generateVerifyGateScript());
  });

  it('sandbox-preflight.sh matches generateSandboxPreflightScript', () => {
    const committed = readFileSync(
      join(repoRoot, '.claude/hooks/sandbox-preflight.sh'),
      'utf-8',
    );
    expect(committed).toBe(generateSandboxPreflightScript());
  });

  it('check-drift.sh matches generateCheckDriftScript', () => {
    const committed = readFileSync(
      join(repoRoot, '.claude/hooks/check-drift.sh'),
      'utf-8',
    );
    expect(committed).toBe(generateCheckDriftScript());
  });
});

// Behavioral test: exercise the emitted check-drift.sh against real throwaway
// git repos. Everything lives under tmpdir() — the real repo is never touched
// (the whole point: it replaces the risky manual scratch-repo testing). bash +
// git only, so skip on Windows.
describe.skipIf(process.platform === 'win32')('check-drift.sh behavior', () => {
  let dir;

  // Build a fresh young git repo with the hook installed and one seed commit
  // containing the map, a source file, and its spec.
  function git(args) {
    execFileSync('git', ['-C', dir, ...args], { stdio: 'pipe' });
  }

  function seedRepo(map) {
    mkdirSync(join(dir, '.claude/hooks'), { recursive: true });
    mkdirSync(join(dir, 'docs/specs'), { recursive: true });
    mkdirSync(join(dir, 'src'), { recursive: true });
    const hook = join(dir, '.claude/hooks/check-drift.sh');
    writeFileSync(hook, generateCheckDriftScript());
    chmodSync(hook, 0o755);
    if (map !== null) {
      writeFileSync(join(dir, 'docs/specs/subsystem-map.json'), map);
    }
    writeFileSync(join(dir, 'src/auth.js'), 'v0\n');
    writeFileSync(join(dir, 'docs/specs/auth.md'), '# auth spec\n');
    git(['init', '-q']);
    git(['config', 'user.email', 't@t.t']);
    git(['config', 'user.name', 't']);
    git(['add', '-A']);
    git(['commit', '-qm', 'seed']);
  }

  const AUTH_MAP = JSON.stringify({
    subsystems: [
      { name: 'auth', files: ['src/auth.js'], spec: 'docs/specs/auth.md' },
    ],
  });

  function runHook() {
    return execFileSync('bash', ['.claude/hooks/check-drift.sh'], {
      cwd: dir,
      env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
      encoding: 'utf-8',
    });
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'drift-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('stays silent when there is no subsystem map', () => {
    seedRepo(null);
    expect(runHook()).toBe('');
  });

  it('warns when source changed but its spec did not', () => {
    seedRepo(AUTH_MAP);
    writeFileSync(join(dir, 'src/auth.js'), 'v1\n');
    git(['commit', '-qam', 'change auth source']);
    const out = runHook();
    expect(out).toMatch(/drift/i);
    expect(out).toContain('auth');
    expect(out).toContain('docs/specs/auth.md');
  });

  it('stays silent when source and spec change together', () => {
    seedRepo(AUTH_MAP);
    writeFileSync(join(dir, 'src/auth.js'), 'v1\n');
    writeFileSync(join(dir, 'docs/specs/auth.md'), '# auth spec v2\n');
    git(['commit', '-qam', 'change auth source + spec']);
    expect(runHook()).toBe('');
  });

  it('stays silent when the map has no subsystems', () => {
    seedRepo(JSON.stringify({ subsystems: [] }));
    writeFileSync(join(dir, 'src/auth.js'), 'v1\n');
    git(['commit', '-qam', 'change auth source']);
    expect(runHook()).toBe('');
  });
});
