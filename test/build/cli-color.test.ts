import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { spawnSync } from '../support/spawn';
import { REPO } from '../support/paths';
import { tempDir } from '../support/project';
import { colorWanted } from '../../src/core/colors.js';
// The init tests below run `init` in a child process, which `vitest related` cannot follow. This import keeps the test selected when init changes.
import '../../src/cli/commands/init.js';

// Color is for a terminal. A piped run is plain unless FORCE_COLOR asks, and the `--color <hex>` of `init` is a color for the brand: a
// color library that reads any `--color` as "force color" once made `blazon init --color 26e | cat` print escape codes.

describe('colorWanted', () => {
  const on = { env: {}, tty: true, argv: [] as string[] };
  it('is on for a terminal and off for a pipe', () => {
    expect(colorWanted(on.env, true, on.argv)).toBe(true);
    expect(colorWanted(on.env, false, on.argv)).toBe(false);
  });

  it('is turned on by FORCE_COLOR, but not by 0 or an empty one', () => {
    expect(colorWanted({ FORCE_COLOR: '1' }, false, [])).toBe(true);
    expect(colorWanted({ FORCE_COLOR: '0' }, false, [])).toBe(false);
    expect(colorWanted({ FORCE_COLOR: '' }, false, [])).toBe(false);
  });

  it('is turned off by NO_COLOR (which beats FORCE_COLOR), TERM=dumb and --no-color', () => {
    expect(colorWanted({ NO_COLOR: '1' }, true, [])).toBe(false);
    expect(colorWanted({ NO_COLOR: '1', FORCE_COLOR: '1' }, true, [])).toBe(false);
    expect(colorWanted({ TERM: 'dumb' }, true, [])).toBe(false);
    expect(colorWanted({}, true, ['--no-color'])).toBe(false);
  });

  it('does not read a --color argument as a request for color', () => {
    expect(colorWanted({}, false, ['init', '--color', '26e'])).toBe(false);
  });
});

describe('blazon init piped', () => {
  const run = (args: string[], env: Record<string, string | undefined> = {}) => {
    const { NO_COLOR: _n, FORCE_COLOR: _f, ...rest } = process.env;
    return spawnSync(process.execPath, ['--import', 'tsx', path.join(REPO, 'scripts/blazon-src.ts'), 'init', tempDir('blazon-color-'), ...args], {
      encoding: 'utf-8',
      cwd: REPO,
      env: { ...rest, ...env },
      input: '',
    });
  };

  it('prints no escape codes with --color <hex>', () => {
    const result = run(['--yes', '--color', '26e']);
    expect(result.status).toBe(0);
    expect(result.stdout + result.stderr).not.toContain('\u001b[');
  }, 60_000);

  it('prints escape codes when FORCE_COLOR asks', () => {
    expect(run(['--yes'], { FORCE_COLOR: '1' }).stdout).toContain('\u001b[');
  }, 60_000);
});
