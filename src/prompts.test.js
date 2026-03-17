import { describe, it, expect } from 'vitest';

// The validate and filter functions are embedded in the questions array.
// We recreate them here to test the logic directly.
// If these functions are ever refactored to be exported, update the imports.

const validateProjectName = (input) => {
  if (!input) return 'Project name is required.';
  if (!/^[a-z][a-z0-9-]*$/.test(input))
    return 'Must be kebab-case (lowercase letters, numbers, hyphens).';
  return true;
};

const filterAdditionalKeys = (input) =>
  input
    .split(',')
    .map((k) => k.trim().toUpperCase().replace(/\s+/g, '_'))
    .filter(Boolean);

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

describe('filterAdditionalKeys', () => {
  it('splits comma-separated input', () => {
    expect(filterAdditionalKeys('FOO,BAR')).toEqual(['FOO', 'BAR']);
  });

  it('converts to uppercase', () => {
    expect(filterAdditionalKeys('foo,bar')).toEqual(['FOO', 'BAR']);
  });

  it('replaces spaces with underscores', () => {
    expect(filterAdditionalKeys('my key,other key')).toEqual([
      'MY_KEY',
      'OTHER_KEY',
    ]);
  });

  it('trims whitespace', () => {
    expect(filterAdditionalKeys(' FOO , BAR ')).toEqual(['FOO', 'BAR']);
  });

  it('removes empty entries from trailing commas', () => {
    expect(filterAdditionalKeys('FOO,,BAR,')).toEqual(['FOO', 'BAR']);
  });

  it('returns empty array for empty string', () => {
    expect(filterAdditionalKeys('')).toEqual([]);
  });
});
