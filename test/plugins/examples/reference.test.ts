import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from '../../support/spawn';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT_DIR } from '../support/spec.js';
import { PLUGIN, blazon, dirs, output, python, starter } from '../../support/plugin-reference';


// The reference plugin, examples/plugins/acme.house-style: one Python file with no dependency. It passes the check
// command, and it works in a real `blazon check` and `blazon build`, pinned by the real `blazon plugin pin`.

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe.skipIf(!python)('the reference plugin', () => {
  it('passes `blazon plugin check`', () => {
    const result = blazon(ROOT_DIR, 'plugin', 'check', path.join(PLUGIN, 'blazon-acme.house-style'));
    expect(result.status, output(result)).toBe(0);
    expect(result.stdout).toContain('Passed');
  }, 60_000);

  it('says it cannot judge a brand that is not a version 2 blazon brand', () => {
    const run = (brand: object) =>
      spawnSync('python3', [path.join(PLUGIN, 'blazon-acme.house-style')], { input: JSON.stringify({ v: 1, type: 'check', options: { headingFont: 'Inter' }, brand }), encoding: 'utf-8' });
    const wrongFormat = run({ format: 'nope', version: 2, tokens: [] });
    expect(wrongFormat.status).toBe(2);
    expect(wrongFormat.stdout.split('\n')[0]).toBe('the brand in the request is not a blazon brand: its format is "nope", not "blazon-brand"');
    const wrongVersion = run({ format: 'blazon-brand', version: 9, tokens: [] });
    expect(wrongVersion.status).toBe(2);
    expect(wrongVersion.stdout.split('\n')[0]).toBe('the brand in the request is version 9; this reader understands version 2');
    expect(run({ format: 'blazon-brand', version: 2, tokens: [] }).status).toBe(0);
  });

  it('fails `blazon check` for a heading in another font than the one the options name', async () => {
    const root = await starter({ headingFont: 'Inter' });
    const result = blazon(root, 'check');
    expect(result.status, output(result)).toBe(1);
    expect(output(result)).toContain('type.h1 is set in Big Shoulders Display, not Inter');
    expect(output(result)).toContain('[acme.house-style/heading-font]');
  }, 120_000);

  it('passes `blazon check` and `blazon build` when the heading is in the named font, and the site is built', async () => {
    const root = await starter({ headingFont: 'Big Shoulders Display' });
    expect(blazon(root, 'check').status).toBe(0);
    const build = blazon(root, 'build');
    expect(build.status, output(build)).toBe(0);
    expect(fs.existsSync(path.join(root, 'dist/site/index.html'))).toBe(true);
  }, 120_000);

  it('says it cannot judge, and does not pass, when the options do not name a font', async () => {
    const root = await starter(undefined);
    const result = blazon(root, 'check');
    expect(result.status).toBe(1);
    expect(output(result)).toContain('could not answer: options.headingFont is required');
  }, 120_000);

  it('is not run once its bytes change, whatever the pin once said', async () => {
    const root = await starter({ headingFont: 'Big Shoulders Display' });
    fs.appendFileSync(path.join(root, 'plugins/acme.house-style/blazon-acme.house-style'), '\n# edited after pinning\n');
    const result = blazon(root, 'check');
    expect(result.status).toBe(1);
    expect(output(result)).toContain('pin mismatch');
  }, 120_000);

});
