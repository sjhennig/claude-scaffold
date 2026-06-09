/**
 * `claude-scaffold doctor` — config-health checks for a scaffolded project
 * (design brief §3). Run from a generated project's root, it verifies the
 * machine and the project agree with what the scaffold emitted: Claude Code
 * present, settings valid, hooks wired, plugin enablement resolvable, the
 * pinned release tag fetchable, and the sandbox honest about being active.
 *
 * Shape: `gather*` helpers do the I/O (injectable for tests); `evaluate*`
 * functions are pure (facts in, finding out) like the template generators.
 * Each finding: { name, status: 'pass'|'warn'|'fail', detail }.
 */

import { readFileSync, existsSync, accessSync, constants } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

export const NODE_MAJOR_REQUIRED = 20;

// The oldest Claude Code that supports everything the guardrails rely on
// (plugin marketplaces with pinned github refs, SessionStart hooks, sandbox
// settings). Older versions silently drop pieces of the config, so doctor
// warns below this.
export const CLAUDE_CODE_MIN_VERSION = '2.0.0';

// ---------- pure evaluators ----------

export function evaluateNodeVersion(versionString) {
  const major = Number(versionString.replace(/^v/, '').split('.')[0]);
  return major >= NODE_MAJOR_REQUIRED
    ? { status: 'pass', detail: `Node ${versionString}` }
    : {
        status: 'fail',
        detail: `Node ${versionString} — the scaffold and its templates need >= ${NODE_MAJOR_REQUIRED}`,
      };
}

export function evaluateClaudeCli(versionOutput) {
  if (versionOutput === null) {
    return {
      status: 'fail',
      detail:
        'Claude Code CLI not found on PATH — install with: npm install -g @anthropic-ai/claude-code',
    };
  }
  const found = versionOutput.match(/(\d+)\.(\d+)\.(\d+)/);
  if (found) {
    const [major, minor, patch] = found.slice(1).map(Number);
    const [minMajor, minMinor, minPatch] =
      CLAUDE_CODE_MIN_VERSION.split('.').map(Number);
    const below =
      major !== minMajor
        ? major < minMajor
        : minor !== minMinor
          ? minor < minMinor
          : patch < minPatch;
    if (below) {
      return {
        status: 'warn',
        detail: `Claude Code ${found[0]} is older than the tested minimum ${CLAUDE_CODE_MIN_VERSION} — parts of the guardrail config may be silently ignored; update with: npm update -g @anthropic-ai/claude-code`,
      };
    }
  }
  return { status: 'pass', detail: `Claude Code ${versionOutput.trim()}` };
}

export function evaluateSettings(rawSettings) {
  if (rawSettings === null) {
    return {
      status: 'fail',
      detail:
        '.claude/settings.json not found — is this a scaffolded project root?',
    };
  }
  try {
    JSON.parse(rawSettings);
  } catch (err) {
    return {
      status: 'fail',
      detail: `.claude/settings.json is not valid JSON (${err.message}) — a broken settings file silently disables ALL of its hooks and permissions`,
    };
  }
  return { status: 'pass', detail: '.claude/settings.json parses' };
}

// hookStates: [{ script, exists, executable }] for every .claude/hooks/*.sh
// path referenced by the settings' hooks blocks.
export function evaluateHooks(hookStates) {
  if (hookStates.length === 0) {
    return {
      status: 'warn',
      detail:
        'settings.json wires no hook scripts — the deterministic gates (validator, verify gate, preflight) are not installed',
    };
  }
  const broken = hookStates.filter((h) => !h.exists || !h.executable);
  if (broken.length > 0) {
    const detail = broken
      .map(
        (h) => `${h.script} ${h.exists ? 'is not executable' : 'is missing'}`,
      )
      .join('; ');
    return { status: 'fail', detail };
  }
  return {
    status: 'pass',
    detail: `${hookStates.length} hook scripts present and executable`,
  };
}

export function evaluatePluginEnablement(settings) {
  const marketplaces = settings?.extraKnownMarketplaces ?? {};
  const enabled = Object.entries(settings?.enabledPlugins ?? {}).filter(
    ([, on]) => on === true,
  );
  if (enabled.length === 0) {
    return {
      status: 'warn',
      detail:
        'no plugin enabled in settings.json — the QC reviewers (/qc) will not load',
    };
  }
  const unresolved = enabled
    .map(([id]) => id)
    .filter((id) => !Object.hasOwn(marketplaces, id.split('@')[1] ?? ''));
  if (unresolved.length > 0) {
    return {
      status: 'fail',
      detail: `enabledPlugins reference marketplaces missing from extraKnownMarketplaces: ${unresolved.join(', ')}`,
    };
  }
  return {
    status: 'pass',
    detail: `plugin enablement resolves (${enabled.map(([id]) => id).join(', ')})`,
  };
}

// source: the marketplace source object; lsRemoteOutput: stdout of
// `git ls-remote <repo-url> <ref>` (null = command failed, '' = ref absent).
export function evaluatePinnedTag(source, lsRemoteOutput) {
  if (source?.source !== 'github') {
    return {
      status: 'pass',
      detail: `marketplace source is ${source?.source ?? 'unset'} (no tag pin to check)`,
    };
  }
  if (!source.ref) {
    return {
      status: 'warn',
      detail:
        'GitHub marketplace source has no ref — the plugin floats to the repo HEAD instead of a tested release',
    };
  }
  if (lsRemoteOutput === null) {
    return {
      status: 'warn',
      detail: `could not reach github.com to verify tag ${source.ref} (offline?) — the plugin cannot be fetched until the marketplace is reachable`,
    };
  }
  if (lsRemoteOutput.trim() === '') {
    return {
      status: 'fail',
      detail: `pinned ref ${source.ref} does not exist on ${source.repo} — plugin loading will fail; was the release tag pushed?`,
    };
  }
  return {
    status: 'pass',
    detail: `pinned ref ${source.ref} exists on ${source.repo}`,
  };
}

// sandboxEnabled: from settings; bwrapWorks: true/false/null (null = not Linux
// or bwrap missing, i.e. nothing to probe).
export function evaluateSandbox(sandboxEnabled, bwrapWorks) {
  if (!sandboxEnabled) {
    return {
      status: 'warn',
      detail:
        'sandbox.enabled is false — Bash commands run with only the container/OS as the boundary',
    };
  }
  if (bwrapWorks === false) {
    return {
      status: 'warn',
      detail:
        'sandbox.enabled is true but bubblewrap cannot create a user namespace here (common on Docker Desktop) — the sandbox is dormant and the devcontainer is the real boundary',
    };
  }
  if (bwrapWorks === null) {
    return {
      status: 'warn',
      detail:
        'sandbox.enabled is true but bubblewrap is not available to probe — the sandbox may be inactive on this platform',
    };
  }
  return { status: 'pass', detail: 'sandbox enabled and bubblewrap works' };
}

// ---------- I/O gathering ----------

// Shell-free runner: settings.json is untrusted input (doctor runs in any
// cloned project), so values from it must never reach a shell parser. argv
// goes straight to execvp; returns null on any failure (missing binary,
// non-zero exit).
function tryExec(file, args) {
  try {
    return execFileSync(file, args, {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null;
  }
}

// Pull every $CLAUDE_PROJECT_DIR/.claude/hooks/*.sh path out of the settings'
// hook commands and stat each one.
export function gatherHookStates(settings, root) {
  const scripts = new Set();
  for (const event of Object.values(settings?.hooks ?? {})) {
    for (const matcher of event) {
      for (const hook of matcher.hooks ?? []) {
        const found = hook.command?.match(
          /\$CLAUDE_PROJECT_DIR\/(\.claude\/hooks\/[\w-]+\.sh)/,
        );
        if (found) scripts.add(found[1]);
      }
    }
  }
  return [...scripts].map((script) => {
    const path = join(root, script);
    const exists = existsSync(path);
    let executable = false;
    if (exists) {
      try {
        accessSync(path, constants.X_OK);
        executable = true;
      } catch {
        executable = false;
      }
    }
    return { script, exists, executable };
  });
}

export function runDoctor({ root = process.cwd(), exec = tryExec } = {}) {
  const settingsPath = join(root, '.claude', 'settings.json');
  const rawSettings = existsSync(settingsPath)
    ? readFileSync(settingsPath, 'utf-8')
    : null;

  const findings = [
    { name: 'Node.js version', ...evaluateNodeVersion(process.version) },
    {
      name: 'Claude Code CLI',
      ...evaluateClaudeCli(exec('claude', ['--version'])),
    },
    { name: 'Claude settings', ...evaluateSettings(rawSettings) },
  ];

  let settings = null;
  try {
    settings = rawSettings === null ? null : JSON.parse(rawSettings);
  } catch {
    settings = null;
  }

  if (settings) {
    findings.push({
      name: 'Hook scripts',
      ...evaluateHooks(gatherHookStates(settings, root)),
    });
    findings.push({
      name: 'Plugin enablement',
      ...evaluatePluginEnablement(settings),
    });

    // Check the marketplace that actually backs the first enabled plugin (the
    // [0] fallback covers settings with marketplaces but nothing enabled).
    const marketplaces = settings.extraKnownMarketplaces ?? {};
    const enabledMarket = Object.entries(settings.enabledPlugins ?? {})
      .filter(([, on]) => on === true)
      .map(([id]) => id.split('@')[1])
      .find((name) => Object.hasOwn(marketplaces, name ?? ''));
    const source = (
      enabledMarket
        ? marketplaces[enabledMarket]
        : Object.values(marketplaces)[0]
    )?.source;
    // execFile keeps repo/ref out of any shell; both are embedded after a
    // fixed prefix (https://…, refs/tags/…) so they can't be parsed as flags.
    const lsRemote =
      source?.source === 'github' && source.ref
        ? exec('git', [
            'ls-remote',
            `https://github.com/${source.repo}`,
            `refs/tags/${source.ref}`,
          ])
        : null;
    findings.push({
      name: 'Plugin release pin',
      ...evaluatePinnedTag(source, lsRemote),
    });

    const bwrapWorks =
      process.platform === 'linux' && exec('bwrap', ['--version']) !== null
        ? exec('bwrap', ['--ro-bind', '/', '/', 'true']) !== null
        : null;
    findings.push({
      name: 'Sandbox',
      ...evaluateSandbox(settings.sandbox?.enabled === true, bwrapWorks),
    });
  }

  return findings;
}

const ICONS = { pass: '✓', warn: '⚠', fail: '✖' };

export function formatReport(findings) {
  const lines = findings.map(
    (f) => `${ICONS[f.status]} ${f.name}: ${f.detail}`,
  );
  const fails = findings.filter((f) => f.status === 'fail').length;
  const warns = findings.filter((f) => f.status === 'warn').length;
  lines.push(
    '',
    fails > 0
      ? `${fails} check(s) failed, ${warns} warning(s) — fix the failures above before relying on the guardrails.`
      : warns > 0
        ? `All checks passed with ${warns} warning(s).`
        : 'All checks passed.',
  );
  return lines.join('\n');
}
