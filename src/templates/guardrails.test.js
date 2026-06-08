import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
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
