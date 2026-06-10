import { describe, it, expect } from 'vitest';
import {
  validateProjectName,
  validateDescription,
  validateDevPort,
  normalizeAdditionalKeys,
  defaultAnswers,
  DEFAULT_DESCRIPTION,
  DEFAULT_FRAMEWORK,
  DEFAULT_PORTS,
  FRAMEWORK_VALUES,
} from './prompts.js';

describe('validateProjectName', () => {
  it('rejects empty string', () => {
    expect(validateProjectName('')).toBe('Project name is required.');
  });

  it('rejects uppercase letters', () => {
    expect(validateProjectName('MyProject')).toBe(
      'Must be kebab-case (lowercase letters, numbers, hyphens).',
    );
  });

  it('rejects spaces', () => {
    expect(validateProjectName('my project')).toBe(
      'Must be kebab-case (lowercase letters, numbers, hyphens).',
    );
  });

  it('rejects underscores', () => {
    expect(validateProjectName('my_project')).toBe(
      'Must be kebab-case (lowercase letters, numbers, hyphens).',
    );
  });

  it('rejects special characters', () => {
    expect(validateProjectName('my@project')).toBe(
      'Must be kebab-case (lowercase letters, numbers, hyphens).',
    );
  });

  it('rejects names starting with a number', () => {
    expect(validateProjectName('1project')).toBe(
      'Must be kebab-case (lowercase letters, numbers, hyphens).',
    );
  });

  it('accepts valid kebab-case names', () => {
    expect(validateProjectName('my-project')).toBe(true);
    expect(validateProjectName('a')).toBe(true);
    expect(validateProjectName('my-cool-app-2')).toBe(true);
  });
});

describe('validateDescription', () => {
  const msg =
    'Description cannot contain backticks, ${, or angle brackets (they break generated files).';

  it('accepts ordinary prose, apostrophes, and parentheses', () => {
    expect(validateDescription('A new Claude Code project')).toBe(true);
    expect(validateDescription("Steven's app (v2)")).toBe(true);
    expect(validateDescription('Costs $5 per call')).toBe(true);
  });

  it('treats empty/undefined as valid (the prompt default fills it in)', () => {
    expect(validateDescription('')).toBe(true);
    expect(validateDescription(undefined)).toBe(true);
  });

  it('rejects template-literal breakouts (backtick and ${)', () => {
    expect(validateDescription('hi `whoami`')).toBe(msg);
    expect(validateDescription('hi ${process.env.SECRET}')).toBe(msg);
  });

  it('rejects angle brackets (HTML/markup injection)', () => {
    expect(validateDescription('</title><script>alert(1)</script>')).toBe(msg);
  });
});

describe('validateDevPort', () => {
  it('accepts common ports', () => {
    expect(validateDevPort(3000)).toBe(true);
    expect(validateDevPort('5173')).toBe(true);
    expect(validateDevPort(1)).toBe(true);
    expect(validateDevPort(65535)).toBe(true);
  });

  it('rejects out-of-range and non-integer values', () => {
    const msg = 'Port must be an integer between 1 and 65535.';
    expect(validateDevPort(0)).toBe(msg);
    expect(validateDevPort(65536)).toBe(msg);
    expect(validateDevPort(-1)).toBe(msg);
    expect(validateDevPort('30.5')).toBe(msg);
    expect(validateDevPort('abc')).toBe(msg);
    expect(validateDevPort('')).toBe(msg);
  });
});

describe('normalizeAdditionalKeys', () => {
  it('splits comma-separated input', () => {
    expect(normalizeAdditionalKeys('FOO,BAR')).toEqual(['FOO', 'BAR']);
  });

  it('converts to uppercase', () => {
    expect(normalizeAdditionalKeys('foo,bar')).toEqual(['FOO', 'BAR']);
  });

  it('replaces spaces with underscores', () => {
    expect(normalizeAdditionalKeys('my key,other key')).toEqual([
      'MY_KEY',
      'OTHER_KEY',
    ]);
  });

  it('trims whitespace', () => {
    expect(normalizeAdditionalKeys(' FOO , BAR ')).toEqual(['FOO', 'BAR']);
  });

  it('removes empty entries from trailing commas', () => {
    expect(normalizeAdditionalKeys('FOO,,BAR,')).toEqual(['FOO', 'BAR']);
  });

  it('returns empty array for empty string', () => {
    expect(normalizeAdditionalKeys('')).toEqual([]);
  });
});

describe('defaultAnswers (--yes semantics)', () => {
  it('fills every unanswered prompt with the interactive default', () => {
    const a = defaultAnswers({ projectName: 'my-app' });
    expect(a).toEqual({
      projectName: 'my-app',
      description: DEFAULT_DESCRIPTION,
      framework: DEFAULT_FRAMEWORK,
      devPort: DEFAULT_PORTS[DEFAULT_FRAMEWORK],
      useAnthropicApi: false,
      additionalKeys: [],
      initGit: true,
    });
  });

  it('provided answers win over defaults', () => {
    const a = defaultAnswers({
      projectName: 'my-app',
      framework: 'node-ts',
      useAnthropicApi: true,
      initGit: false,
    });
    expect(a.framework).toBe('node-ts');
    expect(a.devPort).toBe(DEFAULT_PORTS['node-ts']);
    expect(a.useAnthropicApi).toBe(true);
    expect(a.initGit).toBe(false);
  });

  it('omits devPort for the none framework, like the skipped prompt', () => {
    const a = defaultAnswers({ projectName: 'my-app', framework: 'none' });
    expect('devPort' in a).toBe(false);
  });

  it('drops even a provided devPort when the framework is none', () => {
    const a = defaultAnswers({
      projectName: 'my-app',
      framework: 'none',
      devPort: 4000,
    });
    expect('devPort' in a).toBe(false);
  });

  it('every framework value has a default port except none', () => {
    for (const f of FRAMEWORK_VALUES.filter((f) => f !== 'none')) {
      expect(DEFAULT_PORTS[f]).toBeGreaterThan(0);
    }
  });
});
