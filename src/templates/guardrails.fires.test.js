import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  generateValidateCommandScript,
  generateVerifyGateScript,
  generateClaudeSettings,
} from './guardrails.js';

// Behavioral "guardrail-fires" tests (design brief §7.3): prove the emitted
// guards actually *fire* — block, release, format — not merely that the
// generator source contains the right strings (which guardrails.test.js already
// covers). We run the real bash hooks against throwaway temp dirs, exactly like
// the check-drift.sh behavioral suite. bash + npm + jq only, so skip on Windows.
//
// Subagent loading / structured-shape / read-only tools are verified in
// plugin.test.js (frontmatter parse, loadability proxies, manifest + enablement
// resolution against the committed plugin/ files).
// True *runtime* invocation needs a live Claude, so it is not faked here — it
// lives in the opt-in scripts/agent-smoke.mjs harness (see [[self-verification]]).

// Run a command, capturing exit code + both streams whether it succeeds or not.
// (spawnSync — not execFileSync — so stderr is captured even on a zero exit, e.g.
// the gate's MAX_ATTEMPTS release message which it prints to stderr before exit 0.)
function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf-8', ...opts });
  return { code: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

describe.skipIf(process.platform === 'win32')(
  'verify-gate.sh behavior (Stop gate)',
  () => {
    let dir;
    let hook;

    // A throwaway project whose `npm run verify` we control via the script body.
    function seedProject(verifyScript) {
      writeFileSync(
        join(dir, 'package.json'),
        JSON.stringify({
          name: 'gate-fixture',
          version: '0.0.0',
          scripts: { verify: verifyScript },
        }),
      );
      hook = join(dir, 'verify-gate.sh');
      writeFileSync(hook, generateVerifyGateScript());
      chmodSync(hook, 0o755);
    }

    // Run the gate in the project dir. TMPDIR is pinned to dir so the attempts
    // marker stays isolated to this fixture (it lives at $TMPDIR/claude-verify-
    // gate-$SESSION) and never collides with another test or the real /tmp.
    function runGate(sessionId = 's1') {
      return run('bash', [hook], {
        cwd: dir,
        input: JSON.stringify({ session_id: sessionId }),
        env: { ...process.env, TMPDIR: dir },
      });
    }

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'gate-'));
    });

    afterEach(() => {
      rmSync(dir, { recursive: true, force: true });
    });

    it('releases (exit 0) when verify passes — having actually run verify', () => {
      // The verify script drops a sentinel so a real pass is distinguishable
      // from the jq-missing fail-open path (which also exits 0, but without ever
      // running verify). Asserting the sentinel proves the gate took the real
      // path, not the skip.
      seedProject('touch ran');
      expect(runGate().code).toBe(0);
      expect(existsSync(join(dir, 'ran'))).toBe(true);
    });

    it('blocks (exit 2) and reports the failure when verify fails', () => {
      seedProject('exit 1');
      const { code, stderr } = runGate();
      expect(code).toBe(2);
      expect(stderr).toContain('Verification gate failed');
    });

    it('releases after MAX_ATTEMPTS so it cannot deadlock', () => {
      seedProject('exit 1');
      expect(runGate('stuck').code).toBe(2); // attempt 1
      expect(runGate('stuck').code).toBe(2); // attempt 2
      const third = runGate('stuck'); // attempt 3 → release
      expect(third.code).toBe(0);
      expect(third.stderr).toMatch(/releasing the Stop gate/i);
    });
  },
);

describe.skipIf(process.platform === 'win32')(
  'validate-command.sh behavior (PreToolUse)',
  () => {
    let dir;
    let hook;

    function runValidate(command) {
      return run('bash', [hook], {
        input: JSON.stringify({ tool_input: { command } }),
      });
    }

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'validate-'));
      hook = join(dir, 'validate-command.sh');
      writeFileSync(hook, generateValidateCommandScript());
      chmodSync(hook, 0o755);
    });

    afterEach(() => {
      rmSync(dir, { recursive: true, force: true });
    });

    it('allows a benign command (exit 0)', () => {
      expect(runValidate('ls -la').code).toBe(0);
    });

    it('blocks recursive root delete (exit 2)', () => {
      const { code, stderr } = runValidate('rm -rf /');
      expect(code).toBe(2);
      expect(stderr).toContain('BLOCKED');
    });

    it('blocks force-push regardless of flag ordering (exit 2)', () => {
      expect(runValidate('git push --force origin main').code).toBe(2);
      const short = runValidate('git push -f origin main');
      expect(short.code).toBe(2);
      expect(short.stderr).toContain('BLOCKED'); // blocked by the guard, not by chance
    });

    it('allows deleting a scoped subpath (no false positive)', () => {
      expect(runValidate('rm -rf /tmp/scratch').code).toBe(0);
    });

    // NOTE: this suite proves the denylist *fires* on the patterns it claims to
    // match — it does not (and a denylist on free-form shell cannot) prove the
    // list is exhaustive. The validator is defense-in-depth behind the sandbox +
    // devcontainer, not the sole boundary. Known unmatched-but-destructive forms
    // (e.g. `rm --recursive --force /`, `dd of=/dev/sda`, `curl … | bash`) are a
    // denylist-hardening follow-up tracked separately, not a gap in these tests.
  },
);

describe.skipIf(process.platform === 'win32')(
  'PostToolUse formatter behavior',
  () => {
    let dir;

    // The formatter is an inline command in settings.json, not a script file —
    // pull the exact string the harness would run and exercise that.
    const command = JSON.parse(generateClaudeSettings()).hooks.PostToolUse.find(
      (e) => e.matcher === 'Edit|Write',
    ).hooks[0].command;

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'format-'));
    });

    afterEach(() => {
      rmSync(dir, { recursive: true, force: true });
    });

    it('reformats the edited file (and never blocks the edit)', () => {
      const file = join(dir, 'messy.js');
      writeFileSync(file, 'const  x=1\n'); // deliberately unformatted
      // cwd is the repo root only so `npx` resolves the local prettier binary;
      // prettier discovers config from the *edited file's* dir (the system
      // tmpdir, no .prettierrc), so it formats with defaults. The whitespace +
      // semicolon rewrite below is the real proof the formatter ran — the exit
      // code is asserted separately only to pin the never-block contract (the
      // emitted command ends in `; exit 0`, so it can never fail an edit).
      const { code } = run('bash', ['-c', command], {
        cwd: process.cwd(),
        input: JSON.stringify({ tool_input: { file_path: file } }),
      });
      expect(readFileSync(file, 'utf-8')).toBe('const x = 1;\n');
      expect(code).toBe(0);
    });
  },
);
