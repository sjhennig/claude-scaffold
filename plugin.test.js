import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  generateClaudeSettings,
  GITHUB_MARKETPLACE_SOURCE,
  MARKETPLACE_NAME,
  PLUGIN_NAME,
  PLUGIN_ID,
} from './src/templates/guardrails.js';

// M6: the QC subagents and /qc command now ship as the versioned
// `claude-guardrails` plugin instead of CLI-emitted .claude/ files. The plugin
// markdown is the source of truth (edited directly), so these tests read the
// committed plugin/ files rather than a generator. They preserve every
// invariant the retired agents.test.js asserted, and add structural proxies
// that the plugin manifest, marketplace, and settings enablement all line up —
// the closest keyless CI can get to "the plugin loads and its reviewers are
// invokable" (design brief §7.3). True runtime load is covered by the opt-in
// scripts/agent-smoke.mjs harness.

const repoRoot = process.cwd();
const PLUGIN_DIR = join(repoRoot, 'plugin');

const read = (rel) => readFileSync(join(repoRoot, rel), 'utf-8');

// Pull the YAML frontmatter block out of an agent markdown file.
function frontmatter(md) {
  const match = md.match(/^---\n([\s\S]*?)\n---\n/);
  expect(match, 'agent file must start with a YAML frontmatter block').not.toBe(
    null,
  );
  return match[1];
}

// Parse the comma-separated `tools:` line into an array.
function tools(md) {
  const line = frontmatter(md)
    .split('\n')
    .find((l) => l.startsWith('tools:'));
  if (!line) return [];
  return line
    .replace('tools:', '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

const REVIEWERS = ['code-reviewer', 'spec-reviewer', 'security-reviewer'];
const ALL_AGENTS = [...REVIEWERS, 'test-runner'];

const agentMd = (name) => read(`plugin/agents/${name}.md`);
const qcMd = () => read('plugin/commands/qc.md');
const manifest = () => JSON.parse(read('plugin/.claude-plugin/plugin.json'));
const marketplace = () => JSON.parse(read('.claude-plugin/marketplace.json'));

describe('subagent frontmatter', () => {
  for (const name of ALL_AGENTS) {
    describe(name, () => {
      const fm = frontmatter(agentMd(name));

      it('declares the matching name', () => {
        expect(fm).toContain(`name: ${name}`);
      });

      it('has a description that encourages proactive delegation', () => {
        const desc = fm.split('\n').find((l) => l.startsWith('description:'));
        expect(desc).toBeTruthy();
        expect(desc.toLowerCase()).toContain('use proactively');
      });

      it('pins the model to inherit', () => {
        expect(fm).toContain('model: inherit');
      });

      it('has a non-empty system prompt body', () => {
        const body = agentMd(name).split(/\n---\n/)[1];
        expect(body.trim().length).toBeGreaterThan(0);
      });
    });
  }
});

describe('reviewers are read-only', () => {
  for (const name of REVIEWERS) {
    it(`${name} grants no write tools`, () => {
      const t = tools(agentMd(name));
      expect(t.length).toBeGreaterThan(0);
      for (const writeTool of ['Write', 'Edit', 'MultiEdit']) {
        expect(t).not.toContain(writeTool);
      }
    });
  }

  it('code-reviewer can read the diff (Read, Grep, Glob, Bash)', () => {
    expect(tools(agentMd('code-reviewer'))).toEqual([
      'Read',
      'Grep',
      'Glob',
      'Bash',
    ]);
  });
});

describe('structured return shapes', () => {
  it('code-reviewer groups findings Critical/Warning/Suggestion', () => {
    const md = agentMd('code-reviewer');
    expect(md).toContain('## Critical');
    expect(md).toContain('## Warning');
    expect(md).toContain('## Suggestion');
  });

  it('code-reviewer is scoped to correctness, not style', () => {
    const md = agentMd('code-reviewer').toLowerCase();
    expect(md).toContain('correctness or');
    expect(md).toContain('not style');
  });

  it('code-reviewer uses project memory', () => {
    expect(frontmatter(agentMd('code-reviewer'))).toContain('memory: project');
  });

  it('spec-reviewer reports gaps against a spec', () => {
    const md = agentMd('spec-reviewer');
    expect(md).toContain('## Unmet requirements');
    expect(md).toContain('docs/specs');
  });

  it('spec-reviewer flags specs left stale via the subsystem map', () => {
    const md = agentMd('spec-reviewer');
    expect(md).toContain('subsystem-map.json');
    expect(md).toContain('## Stale specs');
  });

  it('test-runner returns only failing tests', () => {
    const md = agentMd('test-runner');
    expect(md).toContain('## Failing tests');
    expect(md.toLowerCase()).toContain('npm test');
  });

  it('security-reviewer cites injection and secrets', () => {
    const md = agentMd('security-reviewer').toLowerCase();
    expect(md).toContain('injection');
    expect(md).toContain('secret');
  });
});

describe('/qc command', () => {
  it('has a command description', () => {
    expect(qcMd().startsWith('---\ndescription:')).toBe(true);
  });

  it('delegates to the reviewer subagents', () => {
    const cmd = qcMd();
    expect(cmd).toContain('code-reviewer');
    expect(cmd).toContain('spec-reviewer');
    expect(cmd).toContain('security-reviewer');
  });

  it('routes subsystem-map changes through the spec-reviewer', () => {
    expect(qcMd()).toContain('subsystem-map.json');
  });

  it('warns about subagent token cost / checkpoints', () => {
    const cmd = qcMd().toLowerCase();
    expect(cmd).toContain('checkpoint');
    expect(cmd).toContain('cost');
  });
});

// Loadability proxies: the closest keyless CI gets to "the subagent loads and
// is invokable" without a live Claude. A typo'd tool, unparseable frontmatter,
// a name mismatching the filename, or a /qc that delegates to a non-existent
// agent would all break runtime dispatch — these assert none of that ships.
describe('loadability: agents are well-formed enough to load', () => {
  // Every tool Claude Code currently exposes to a subagent. A name outside this
  // set is a typo Claude Code silently drops. Hand-maintained.
  const KNOWN_TOOLS = [
    'Read',
    'Grep',
    'Glob',
    'Bash',
    'Write',
    'Edit',
    'MultiEdit',
    'WebFetch',
    'WebSearch',
    'NotebookEdit',
    'Task',
    'TodoWrite',
  ];

  for (const name of ALL_AGENTS) {
    describe(name, () => {
      const md = agentMd(name);
      const fm = frontmatter(md);

      it('has a non-empty name and description', () => {
        const nameLine = fm.split('\n').find((l) => l.startsWith('name:'));
        const descLine = fm
          .split('\n')
          .find((l) => l.startsWith('description:'));
        expect(nameLine?.replace('name:', '').trim()).toBeTruthy();
        expect(descLine?.replace('description:', '').trim()).toBeTruthy();
      });

      it('lists only tools Claude Code recognizes', () => {
        for (const t of tools(md)) {
          expect(KNOWN_TOOLS).toContain(t);
        }
      });

      it('frontmatter name matches the filename', () => {
        expect(fm).toContain(`name: ${name}`);
      });
    });
  }

  it('/qc only delegates to agents that actually ship', () => {
    const shipped = new Set(ALL_AGENTS);
    const referenced = [
      ...qcMd().matchAll(/\*\*([a-z]+-(?:reviewer|runner))\*\*/g),
    ].map((m) => m[1]);
    expect(referenced.length).toBeGreaterThan(0);
    for (const ref of referenced) {
      expect(shipped).toContain(ref);
    }
  });
});

// The plugin layout: agents/ and commands/ live at the plugin ROOT, never under
// .claude-plugin/ (a common mistake that makes Claude Code silently skip them).
describe('plugin layout + manifest', () => {
  it('places agents and commands at the plugin root', () => {
    for (const name of ALL_AGENTS) {
      expect(existsSync(join(PLUGIN_DIR, 'agents', `${name}.md`))).toBe(true);
    }
    expect(existsSync(join(PLUGIN_DIR, 'commands', 'qc.md'))).toBe(true);
    // Nothing component-shaped hiding under .claude-plugin/ except the manifest.
    expect(existsSync(join(PLUGIN_DIR, '.claude-plugin', 'agents'))).toBe(
      false,
    );
    expect(existsSync(join(PLUGIN_DIR, '.claude-plugin', 'commands'))).toBe(
      false,
    );
  });

  it('plugin.json is valid and names the plugin', () => {
    const m = manifest();
    expect(m.name).toBe(PLUGIN_NAME);
    expect(m.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(typeof m.description).toBe('string');
    expect(m.description.length).toBeGreaterThan(0);
  });
});

describe('marketplace + enablement resolve', () => {
  it('marketplace.json is valid and lists the plugin', () => {
    const mk = marketplace();
    expect(mk.name).toBe(MARKETPLACE_NAME);
    expect(mk.owner?.name).toBeTruthy();
    expect(Array.isArray(mk.plugins)).toBe(true);
  });

  it('the marketplace entry points at ./plugin and matches the manifest name', () => {
    const entry = marketplace().plugins.find((p) => p.name === PLUGIN_NAME);
    expect(entry, 'marketplace must list the plugin by name').toBeTruthy();
    expect(entry.source).toBe('./plugin');
    expect(entry.name).toBe(manifest().name);
  });

  // The whole point: the enablement the CLI emits must resolve to a real
  // marketplace entry. Split the enabledPlugins id and trace both halves.
  it('emitted enabledPlugins id resolves to the marketplace + plugin', () => {
    const settings = JSON.parse(generateClaudeSettings());
    expect(settings.enabledPlugins[PLUGIN_ID]).toBe(true);

    const [pluginHalf, marketHalf] = PLUGIN_ID.split('@');
    expect(Object.keys(settings.extraKnownMarketplaces)).toContain(marketHalf);
    expect(marketHalf).toBe(marketplace().name);
    expect(pluginHalf).toBe(
      marketplace().plugins.find((p) => p.name === pluginHalf)?.name,
    );
    expect(pluginHalf).toBe(manifest().name);
  });

  it('generated projects get the GitHub marketplace source', () => {
    const settings = JSON.parse(generateClaudeSettings());
    expect(settings.extraKnownMarketplaces[MARKETPLACE_NAME].source).toEqual(
      GITHUB_MARKETPLACE_SOURCE,
    );
  });
});

// Dogfood: this repo consumes the same plugin via a local-path source (asserted
// in guardrails.test.js) and no longer commits the agents as .claude/ files.
describe('dogfood: repo self-hosts the plugin', () => {
  it('no longer ships project-local QC agents or /qc command', () => {
    const agentsDir = join(repoRoot, '.claude', 'agents');
    const agentFilesPresent =
      existsSync(agentsDir) &&
      readdirSync(agentsDir).some((f) => f.endsWith('.md'));
    expect(agentFilesPresent).toBe(false);
    expect(existsSync(join(repoRoot, '.claude', 'commands', 'qc.md'))).toBe(
      false,
    );
  });
});
