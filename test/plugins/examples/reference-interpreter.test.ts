import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from '../../support/spawn';
import fs from 'node:fs';
import path from 'node:path';
import { chainProblem } from '../../../src/plugins/pins/interpreter.js';
import { ROOT_DIR } from '../support/spec.js';
import { blazon, blazonWith, dirs, output, python, starter } from '../../support/plugin-reference';

// The reference plugin, examples/plugins/acme.house-style, and the interpreter named on its first line: the part of reference.test.ts
// that checks where blazon looks for it (RFC 0005 section 3.4).

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe.skipIf(!python)('the reference plugin', () => {
  // The interpreter is found where blazon says, not where the host's PATH says (RFC 0005 section 3.4)
  describe('its interpreter', () => {
    const python3 = spawnSync('/usr/bin/python3', ['--version']).status === 0 ? '/usr/bin/python3' : undefined;
    const aliasDir = (): string | undefined => {
      const cache = path.join(ROOT_DIR, 'node_modules/.cache');
      fs.mkdirSync(cache, { recursive: true });
      const dir = fs.realpathSync(fs.mkdtempSync(path.join(cache, 'blazon-alias-')));
      dirs.push(dir);
      // A launcher and not a link: Apple's python3 works out what to run from the name it was started by
      if (python3) fs.writeFileSync(path.join(dir, 'pyalias'), `#!/bin/sh\nexec ${python3} "$@"\n`, { mode: 0o755 });
      // Clean all the way up: a checkout under a folder others can write (/tmp) has no place the host would trust
      return python3 && chainProblem(dir, { final: 'dir' }) === undefined ? dir : undefined;
    };

    it('is refused, with what to change, when it is in none of the directories blazon trusts', async () => {
      const root = await starter({ headingFont: 'Big Shoulders Display' }, '#!/usr/bin/env pyalias');
      const result = blazon(root, 'check');
      expect(result.status, output(result)).toBe(1);
      expect(output(result)).toContain('[plugin-failed]');
      expect(output(result)).toContain('pyalias is not in the directories blazon trusts for a pinned plugin');
      expect(output(result)).toContain('add the directory that holds it to BLAZON_PLUGIN_PATH');
    }, 120_000);

    it('is found in a directory the operator names in BLAZON_PLUGIN_PATH, and the plugin then runs', async () => {
      const dir = aliasDir();
      if (!dir) return; // no clean place to put the alias on this machine
      const root = await starter({ headingFont: 'Big Shoulders Display' }, '#!/usr/bin/env pyalias');
      const result = blazonWith({ BLAZON_PLUGIN_PATH: dir }, root, 'check');
      expect(result.status, output(result)).toBe(0);
      const build = blazonWith({ BLAZON_PLUGIN_PATH: dir }, root, 'build');
      expect(build.status, output(build)).toBe(0);
    }, 120_000);

    it('is refused when the directory the operator names can be written by others, and says so', async () => {
      const dir = aliasDir();
      if (!dir) return;
      fs.chmodSync(dir, 0o775);
      const root = await starter({ headingFont: 'Big Shoulders Display' }, '#!/usr/bin/env pyalias');
      const result = blazonWith({ BLAZON_PLUGIN_PATH: dir }, root, 'check');
      expect(result.status, output(result)).toBe(1);
      expect(output(result)).toContain(`${dir}: ${dir} can be written by group or others`);
    }, 120_000);

    it('is not looked for on the PATH of the host', async () => {
      const dir = aliasDir();
      if (!dir) return;
      const root = await starter({ headingFont: 'Big Shoulders Display' }, '#!/usr/bin/env pyalias');
      const result = blazonWith({ PATH: `${dir}:${process.env.PATH}` }, root, 'check');
      expect(result.status, output(result)).toBe(1);
      expect(output(result)).toContain('pyalias is not in the directories blazon trusts');
    }, 120_000);
  });
});
