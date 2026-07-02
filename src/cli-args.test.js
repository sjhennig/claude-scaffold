import { describe, it, expect } from 'vitest';
import { parseCliArgs, USAGE } from './cli-args.js';

describe('parseCliArgs', () => {
  it('routes the doctor subcommand', () => {
    expect(parseCliArgs(['doctor'])).toEqual({ command: 'doctor' });
  });

  it('rejects doctor with trailing arguments instead of ignoring them', () => {
    const { errors } = parseCliArgs(['doctor', '--json']);
    expect(errors.join(' ')).toContain('doctor takes no arguments');
  });

  it('routes --help and -h', () => {
    expect(parseCliArgs(['--help']).command).toBe('help');
    expect(parseCliArgs(['-h']).command).toBe('help');
  });

  it('no args means fully interactive scaffold', () => {
    expect(parseCliArgs([])).toEqual({
      command: 'scaffold',
      provided: {},
      yes: false,
      errors: [],
    });
  });

  it('maps every flag onto its prompt answer', () => {
    const { provided, yes, errors } = parseCliArgs([
      'my-app',
      '--description',
      'A thing',
      '--framework',
      'node-ts',
      '--port',
      '8080',
      '--anthropic-api',
      '--api-keys',
      'stripe key, github',
      '--isolated-creds',
      '--network-firewall',
      '--no-git',
      '--yes',
    ]);
    expect(errors).toEqual([]);
    expect(yes).toBe(true);
    expect(provided).toEqual({
      projectName: 'my-app',
      description: 'A thing',
      framework: 'node-ts',
      devPort: 8080,
      useAnthropicApi: true,
      additionalKeys: ['STRIPE_KEY', 'GITHUB'],
      isolatedCredentials: true,
      networkFirewall: true,
      initGit: false,
    });
  });

  it('omitted flags stay absent so the prompts can ask for them', () => {
    const { provided } = parseCliArgs(['my-app']);
    expect(provided).toEqual({ projectName: 'my-app' });
  });

  it('rejects an invalid project name with the prompt validator message', () => {
    const { errors } = parseCliArgs(['MyApp']);
    expect(errors.join(' ')).toContain('kebab-case');
  });

  it('rejects a description with template-literal/markup metacharacters', () => {
    const { errors } = parseCliArgs(['my-app', '--description', 'hi `whoami`']);
    expect(errors.join(' ')).toContain('--description');
    expect(errors.join(' ')).toContain('backticks');
  });

  it('accepts an ordinary description with apostrophes and parentheses', () => {
    const { provided, errors } = parseCliArgs([
      'my-app',
      '--description',
      "Steven's app (v2)",
    ]);
    expect(errors).toEqual([]);
    expect(provided.description).toBe("Steven's app (v2)");
  });

  it('rejects an unknown framework and names the valid ones', () => {
    const { errors } = parseCliArgs(['my-app', '--framework', 'rails']);
    expect(errors.join(' ')).toContain('rails');
    expect(errors.join(' ')).toContain('node-ts');
  });

  it('rejects an out-of-range port with the prompt validator message', () => {
    const { errors } = parseCliArgs(['my-app', '--port', '99999']);
    expect(errors.join(' ')).toContain('between 1 and 65535');
  });

  it('rejects --port with --framework none (the prompt is skipped there)', () => {
    const { errors } = parseCliArgs([
      'my-app',
      '--framework',
      'none',
      '--port',
      '3000',
    ]);
    expect(errors.join(' ')).toContain('--framework none');
  });

  it('requires a project name with --yes', () => {
    const { errors } = parseCliArgs(['--yes']);
    expect(errors.join(' ')).toContain('project name is required with --yes');
  });

  it('rejects unknown flags via parseArgs strict mode', () => {
    const { errors } = parseCliArgs(['my-app', '--bogus']);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.join(' ')).toContain('--bogus');
  });

  it('rejects multiple positionals', () => {
    const { errors } = parseCliArgs(['one', 'two']);
    expect(errors.join(' ')).toContain('at most one project name');
  });

  it('USAGE documents every flag and the doctor subcommand', () => {
    for (const piece of [
      '--here',
      '--force',
      '--description',
      '--framework',
      '--port',
      '--anthropic-api',
      '--api-keys',
      '--no-git',
      '--yes',
      '--help',
      'doctor',
    ]) {
      expect(USAGE).toContain(piece);
    }
  });

  describe('--here overlay mode', () => {
    it('maps --here (and --force) without needing a project name', () => {
      const { provided, errors } = parseCliArgs(['--here', '--force']);
      expect(errors).toEqual([]);
      expect(provided).toEqual({ here: true, force: true });
    });

    it('does not require a project name with --here --yes', () => {
      const { provided, yes, errors } = parseCliArgs(['--here', '--yes']);
      expect(errors).toEqual([]);
      expect(yes).toBe(true);
      expect(provided.here).toBe(true);
      expect(provided.projectName).toBeUndefined();
    });

    it('rejects a positional project name with --here', () => {
      const { errors } = parseCliArgs(['my-app', '--here']);
      expect(errors.join(' ')).toContain('overlays the current directory');
    });

    it('rejects --framework with --here (it is framework-agnostic)', () => {
      const { errors } = parseCliArgs(['--here', '--framework', 'node-ts']);
      expect(errors.join(' ')).toContain('not used with --here');
    });

    it('rejects --port with --here', () => {
      const { errors } = parseCliArgs(['--here', '--port', '3000']);
      expect(errors.join(' ')).toContain('--port is not valid with --here');
    });

    it('still allows devcontainer flags with --here', () => {
      const { provided, errors } = parseCliArgs([
        '--here',
        '--network-firewall',
        '--isolated-creds',
      ]);
      expect(errors).toEqual([]);
      expect(provided).toMatchObject({
        here: true,
        networkFirewall: true,
        isolatedCredentials: true,
      });
    });
  });
});
