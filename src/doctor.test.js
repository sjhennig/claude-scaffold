import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  evaluateNodeVersion,
  evaluateClaudeCli,
  evaluateSettings,
  evaluateHooks,
  evaluatePluginEnablement,
  evaluatePinnedTag,
  evaluateNpmPrefix,
  evaluateSandbox,
  gatherHookStates,
  runDoctor,
  formatReport,
} from './doctor.js';
import {
  generateClaudeSettings,
  PINNED_PLUGIN_REF,
  PLUGIN_ID,
} from './templates/guardrails.js';

describe('evaluateNodeVersion', () => {
  it('passes a supported version', () => {
    expect(evaluateNodeVersion('v22.1.0').status).toBe('pass');
  });

  it('fails below the required major', () => {
    const f = evaluateNodeVersion('v18.19.0');
    expect(f.status).toBe('fail');
    expect(f.detail).toContain('>= 20');
  });
});

describe('evaluateClaudeCli', () => {
  it('fails with an install hint when the CLI is absent', () => {
    const f = evaluateClaudeCli(null);
    expect(f.status).toBe('fail');
    expect(f.detail).toContain('npm install -g @anthropic-ai/claude-code');
  });

  it('passes and reports the version when present', () => {
    const f = evaluateClaudeCli('2.1.0 (Claude Code)\n');
    expect(f.status).toBe('pass');
    expect(f.detail).toContain('2.1.0');
  });

  it('warns below the tested minimum version', () => {
    const f = evaluateClaudeCli('1.0.42 (Claude Code)\n');
    expect(f.status).toBe('warn');
    expect(f.detail).toContain('1.0.42');
    expect(f.detail).toContain('npm update -g');
  });
});

describe('evaluateSettings', () => {
  it('fails when the file is missing', () => {
    expect(evaluateSettings(null).status).toBe('fail');
  });

  it('fails on invalid JSON and explains the blast radius', () => {
    const f = evaluateSettings('{ nope');
    expect(f.status).toBe('fail');
    expect(f.detail).toContain('silently disables');
  });

  it('passes on the settings the scaffold actually emits', () => {
    expect(evaluateSettings(generateClaudeSettings()).status).toBe('pass');
  });
});

describe('evaluateHooks', () => {
  it('warns when no hook scripts are wired at all', () => {
    expect(evaluateHooks([]).status).toBe('warn');
  });

  it('fails and names the missing or non-executable script', () => {
    const f = evaluateHooks([
      {
        script: '.claude/hooks/verify-gate.sh',
        exists: false,
        executable: false,
      },
      {
        script: '.claude/hooks/check-drift.sh',
        exists: true,
        executable: false,
      },
    ]);
    expect(f.status).toBe('fail');
    expect(f.detail).toContain('verify-gate.sh is missing');
    expect(f.detail).toContain('check-drift.sh is not executable');
  });

  it('passes when everything is present and executable', () => {
    const f = evaluateHooks([
      {
        script: '.claude/hooks/verify-gate.sh',
        exists: true,
        executable: true,
      },
    ]);
    expect(f.status).toBe('pass');
  });
});

describe('evaluatePluginEnablement', () => {
  const settings = () => JSON.parse(generateClaudeSettings());

  it('passes on emitted settings (id resolves to a known marketplace)', () => {
    const f = evaluatePluginEnablement(settings());
    expect(f.status).toBe('pass');
    expect(f.detail).toContain(PLUGIN_ID);
  });

  it('warns when nothing is enabled', () => {
    expect(evaluatePluginEnablement({}).status).toBe('warn');
  });

  it('fails when the enabled id references an unknown marketplace', () => {
    const s = settings();
    s.extraKnownMarketplaces = {};
    const f = evaluatePluginEnablement(s);
    expect(f.status).toBe('fail');
    expect(f.detail).toContain(PLUGIN_ID);
  });
});

describe('evaluatePinnedTag', () => {
  const githubSource = () =>
    JSON.parse(generateClaudeSettings()).extraKnownMarketplaces[
      'claude-scaffold'
    ].source;

  it('passes for non-github sources (nothing to pin)', () => {
    const f = evaluatePinnedTag({ source: 'directory', path: '.' }, null);
    expect(f.status).toBe('pass');
  });

  it('warns when a github source has no ref', () => {
    const f = evaluatePinnedTag({ source: 'github', repo: 'x/y' }, null);
    expect(f.status).toBe('warn');
    expect(f.detail).toContain('no ref');
  });

  it('warns (not fails) when github is unreachable', () => {
    const f = evaluatePinnedTag(githubSource(), null);
    expect(f.status).toBe('warn');
    expect(f.detail).toContain('offline');
  });

  it('fails when the pinned tag does not exist on the remote', () => {
    const f = evaluatePinnedTag(githubSource(), '');
    expect(f.status).toBe('fail');
    expect(f.detail).toContain(PINNED_PLUGIN_REF);
  });

  it('passes when ls-remote finds the tag', () => {
    const f = evaluatePinnedTag(
      githubSource(),
      `984ab3d\trefs/tags/${PINNED_PLUGIN_REF}\n`,
    );
    expect(f.status).toBe('pass');
  });
});

describe('evaluateSandbox', () => {
  it('warns when the sandbox is disabled', () => {
    expect(evaluateSandbox(false, null).status).toBe('warn');
  });

  it('warns when enabled but bubblewrap cannot namespace (dormant)', () => {
    const f = evaluateSandbox(true, false);
    expect(f.status).toBe('warn');
    expect(f.detail).toContain('dormant');
  });

  it('warns when enabled but nothing to probe (non-Linux / no bwrap)', () => {
    expect(evaluateSandbox(true, null).status).toBe('warn');
  });

  it('passes when enabled and working', () => {
    expect(evaluateSandbox(true, true).status).toBe('pass');
  });
});

describe('evaluateNpmPrefix', () => {
  it('passes when the global prefix is writable', () => {
    const f = evaluateNpmPrefix({
      prefix: '/usr/local/share/npm-global',
      writable: true,
    });
    expect(f.status).toBe('pass');
    expect(f.detail).toContain('/usr/local/share/npm-global');
  });

  it('warns (with the real error string) when the prefix is not writable', () => {
    const f = evaluateNpmPrefix({ prefix: '/usr/local', writable: false });
    expect(f.status).toBe('warn');
    expect(f.detail).toContain('no write permission to npm prefix');
  });

  it('warns when the prefix cannot be resolved', () => {
    expect(evaluateNpmPrefix({ prefix: null, writable: false }).status).toBe(
      'warn',
    );
  });
});

describe('gatherHookStates + runDoctor against a generated project', () => {
  // Build the .claude/ tree exactly as the orchestrator would.
  function generatedProject({ executable = true } = {}) {
    const root = mkdtempSync(join(tmpdir(), 'doctor-'));
    mkdirSync(join(root, '.claude', 'hooks'), { recursive: true });
    writeFileSync(
      join(root, '.claude', 'settings.json'),
      generateClaudeSettings(),
    );
    for (const script of [
      'validate-command.sh',
      'verify-gate.sh',
      'sandbox-preflight.sh',
      'check-drift.sh',
    ]) {
      const p = join(root, '.claude', 'hooks', script);
      writeFileSync(p, '#!/usr/bin/env bash\n');
      chmodSync(p, executable ? 0o755 : 0o644);
    }
    return root;
  }

  it('finds all four emitted hook scripts in the settings', () => {
    const root = generatedProject();
    const states = gatherHookStates(JSON.parse(generateClaudeSettings()), root);
    expect(states.map((s) => s.script).sort()).toEqual([
      '.claude/hooks/check-drift.sh',
      '.claude/hooks/sandbox-preflight.sh',
      '.claude/hooks/validate-command.sh',
      '.claude/hooks/verify-gate.sh',
    ]);
    expect(states.every((s) => s.exists && s.executable)).toBe(true);
  });

  it('runDoctor reports healthy on a faithful generated project', () => {
    const root = generatedProject();
    // Stubbed exec: CLI present, tag exists on origin, bwrap installed but the
    // namespace probe fails (matching this container) — warn, not fail. Also
    // assert the ls-remote argv embeds repo/ref behind fixed prefixes (the
    // injection-safe shape) rather than a shell string.
    const exec = (file, args) => {
      if (file === 'claude') return '2.1.0 (Claude Code)\n';
      if (file === 'git') {
        expect(args[0]).toBe('ls-remote');
        expect(args[1]).toMatch(/^https:\/\/github\.com\//);
        expect(args[2]).toBe(`refs/tags/${PINNED_PLUGIN_REF}`);
        return `984ab3d\trefs/tags/${PINNED_PLUGIN_REF}\n`;
      }
      if (file === 'bwrap' && args[0] === '--version') return 'bubblewrap\n';
      return null; // bwrap namespace probe fails
    };
    const findings = runDoctor({ root, exec });
    expect(findings.some((f) => f.status === 'fail')).toBe(false);
    const byName = Object.fromEntries(findings.map((f) => [f.name, f]));
    expect(byName['Claude settings'].status).toBe('pass');
    expect(byName['Hook scripts'].status).toBe('pass');
    expect(byName['Plugin enablement'].status).toBe('pass');
    expect(byName['Plugin release pin'].status).toBe('pass');
  });

  it('runDoctor fails when hook scripts lost their executable bit', () => {
    const root = generatedProject({ executable: false });
    const exec = () => null;
    const findings = runDoctor({ root, exec });
    const hooks = findings.find((f) => f.name === 'Hook scripts');
    expect(hooks.status).toBe('fail');
  });

  it('bin dispatch: doctor exits 1 outside a scaffolded project', () => {
    const empty = mkdtempSync(join(tmpdir(), 'doctor-bin-'));
    const result = spawnSync(
      process.execPath,
      [join(process.cwd(), 'bin', 'claude-scaffold.js'), 'doctor'],
      { cwd: empty, encoding: 'utf-8' },
    );
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('settings.json not found');
  });

  // (A bare positional like `claude-scaffold bogus` is a PROJECT NAME since
  // the M8 flag mode — the error path for bad input is an unknown flag.)
  it('bin dispatch: unknown flag exits 1 with usage', () => {
    const result = spawnSync(
      process.execPath,
      [join(process.cwd(), 'bin', 'claude-scaffold.js'), '--bogus'],
      { encoding: 'utf-8' },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('--bogus');
    expect(result.stderr).toContain('Usage:');
    expect(result.stderr).toContain('doctor');
  });

  it('formatReport renders one line per finding plus a verdict', () => {
    const report = formatReport([
      { name: 'A', status: 'pass', detail: 'ok' },
      { name: 'B', status: 'fail', detail: 'broken' },
    ]);
    expect(report).toContain('✓ A: ok');
    expect(report).toContain('✖ B: broken');
    expect(report).toContain('1 check(s) failed');
  });
});
