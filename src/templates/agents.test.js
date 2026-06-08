import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  generateCodeReviewerAgent,
  generateSpecReviewerAgent,
  generateTestRunnerAgent,
  generateSecurityReviewerAgent,
  generateQcCommand,
  getAgentFiles,
} from './agents.js';

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

const REVIEWERS = {
  'code-reviewer': generateCodeReviewerAgent,
  'spec-reviewer': generateSpecReviewerAgent,
  'security-reviewer': generateSecurityReviewerAgent,
};

const ALL_AGENTS = {
  ...REVIEWERS,
  'test-runner': generateTestRunnerAgent,
};

describe('subagent frontmatter', () => {
  for (const [name, generate] of Object.entries(ALL_AGENTS)) {
    describe(name, () => {
      const md = generate();
      const fm = frontmatter(md);

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
        const body = md.split(/\n---\n/)[1];
        expect(body.trim().length).toBeGreaterThan(0);
      });
    });
  }
});

describe('reviewers are read-only', () => {
  for (const [name, generate] of Object.entries(REVIEWERS)) {
    it(`${name} grants no write tools`, () => {
      const t = tools(generate());
      expect(t.length).toBeGreaterThan(0);
      for (const writeTool of ['Write', 'Edit', 'MultiEdit']) {
        expect(t).not.toContain(writeTool);
      }
    });
  }

  it('code-reviewer can read the diff (Read, Grep, Glob, Bash)', () => {
    expect(tools(generateCodeReviewerAgent())).toEqual([
      'Read',
      'Grep',
      'Glob',
      'Bash',
    ]);
  });
});

describe('structured return shapes', () => {
  it('code-reviewer groups findings Critical/Warning/Suggestion', () => {
    const md = generateCodeReviewerAgent();
    expect(md).toContain('## Critical');
    expect(md).toContain('## Warning');
    expect(md).toContain('## Suggestion');
  });

  it('code-reviewer is scoped to correctness, not style', () => {
    const md = generateCodeReviewerAgent().toLowerCase();
    expect(md).toContain('correctness or');
    expect(md).toContain('not style');
  });

  it('code-reviewer uses project memory', () => {
    expect(frontmatter(generateCodeReviewerAgent())).toContain(
      'memory: project',
    );
  });

  it('spec-reviewer reports gaps against a spec', () => {
    const md = generateSpecReviewerAgent();
    expect(md).toContain('## Unmet requirements');
    expect(md).toContain('docs/specs');
  });

  it('spec-reviewer flags specs left stale via the subsystem map', () => {
    const md = generateSpecReviewerAgent();
    expect(md).toContain('subsystem-map.json');
    expect(md).toContain('## Stale specs');
  });

  it('test-runner returns only failing tests', () => {
    const md = generateTestRunnerAgent();
    expect(md).toContain('## Failing tests');
    expect(md.toLowerCase()).toContain('npm test');
  });

  it('security-reviewer cites injection and secrets', () => {
    const md = generateSecurityReviewerAgent().toLowerCase();
    expect(md).toContain('injection');
    expect(md).toContain('secret');
  });
});

describe('generateQcCommand', () => {
  const cmd = generateQcCommand();

  it('has a command description', () => {
    expect(cmd.startsWith('---\ndescription:')).toBe(true);
  });

  it('delegates to the reviewer subagents', () => {
    expect(cmd).toContain('code-reviewer');
    expect(cmd).toContain('spec-reviewer');
    expect(cmd).toContain('security-reviewer');
  });

  it('routes subsystem-map changes through the spec-reviewer', () => {
    expect(cmd).toContain('subsystem-map.json');
  });

  it('warns about subagent token cost / checkpoints', () => {
    expect(cmd.toLowerCase()).toContain('checkpoint');
    expect(cmd.toLowerCase()).toContain('cost');
  });
});

describe('getAgentFiles', () => {
  const files = getAgentFiles();

  it('emits the four agents under .claude/agents/', () => {
    const paths = files.map(([p]) => p);
    expect(paths).toContain('.claude/agents/code-reviewer.md');
    expect(paths).toContain('.claude/agents/spec-reviewer.md');
    expect(paths).toContain('.claude/agents/test-runner.md');
    expect(paths).toContain('.claude/agents/security-reviewer.md');
  });

  it('emits the /qc command under .claude/commands/', () => {
    const paths = files.map(([p]) => p);
    expect(paths).toContain('.claude/commands/qc.md');
  });
});

// If these fail, the committed .claude/ has drifted from the generator —
// regenerate it from the generators in src/templates/agents.js.
describe('dogfood: committed .claude/ matches generated output', () => {
  const repoRoot = process.cwd();

  for (const [relativePath, content] of getAgentFiles()) {
    it(`${relativePath} matches its generator`, () => {
      const committed = readFileSync(join(repoRoot, relativePath), 'utf-8');
      expect(committed).toBe(content);
    });
  }
});
