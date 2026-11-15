import { describe, it, expect, afterEach } from 'vitest';
import path from 'node:path';
import { PluginRun } from '../../../src/plugins/roles/roles.js';
import { fixOf } from '../../../src/core/checker/fixes.js';
import type { Finding } from '../../../src/types/index.js';
import { BRAND, answer, cleanup, install, script, type Installed } from '../support/fixtures.js';

// What a person reads when a plugin fails: each cause of plugin-failed carries the fix for that cause, and a plugin that
// broke shows the end of what it wrote to stderr, scrubbed and capped. A plugin that answered shows none of it.

afterEach(cleanup);

const make = (installed: Installed) => new PluginRun(installed.config, installed.cwd);
const failing = (body: string, manifest: object = { v: 2, roles: ['check'] }) => install({ 'acme.a': { script: script(manifest, body) } });
const only = async (installed: Installed): Promise<Finding> => {
  const found = await make(installed).check(BRAND);
  expect(found).toHaveLength(1);
  expect(found[0]).toMatchObject({ code: 'plugin-failed', path: 'acme.a' });
  return found[0]!;
};

describe('the fix a plugin-failed finding carries', () => {
  it('names the program to pin, for a check plugin that is not pinned', async () => {
    const installed = install({ 'acme.a': { script: script({ v: 2, roles: ['check'] }, answer([])), pinned: false } });
    const found = await only(installed);
    expect(found.fix).toBe(`Pin it: blazon plugin pin ${path.join(installed.cwd, '.blazon', 'plugins', 'blazon-acme.a')} --name acme.a, then commit blazon.plugins.lock.`);
  });

  it('says where blazon looked, for a plugin it cannot find', async () => {
    const found = await only(install({}, { plugins: [{ name: 'acme.a' }] } as never));
    expect(found.fix).toContain('blazon plugin pin <path> --name acme.a');
    expect(found.fix).toContain('blazon-acme.a in .blazon/plugins or on PATH');
  });

  it('points at the plugin, not at pinning, for a plugin that exited with a code that is not an answer', async () => {
    const found = await only(failing('exit 3'));
    expect(found.fix).not.toContain('blazon plugin pin');
    expect(found.fix).toContain("plugin's author");
  });

  it('names the timeout to raise, for a plugin that ran out of time', async () => {
    const found = await only(failing('sleep 30', { v: 2, roles: ['check'], timeout_ms: 300 }));
    expect(found.fix).toContain('timeout_ms');
  }, 20_000);

  it('points at the protocol chapter, for an answer that is not JSON', async () => {
    const found = await only(failing("echo 'not json'"));
    expect(found.fix).toContain('13-writing-a-plugin');
  });

  it('is what the output, the JSON document and the dev server read: the finding\'s own fix ahead of the catalogue\'s', async () => {
    const found = await only(failing('exit 3'));
    expect(fixOf(found)).toBe(found.fix);
    expect(fixOf({ code: 'plugin-failed' })).toMatch(/manual/);
  });
});

describe('the end of a broken plugin\'s stderr', () => {
  it('is shown after the reason the call broke', async () => {
    const found = await only(failing("echo 'boom: cannot find thing' >&2; exit 3"));
    expect(found.message).toBe('exited with 3; stderr: boom: cannot find thing');
  });

  it('is shown for a manifest call that broke too', async () => {
    const installed = install({ 'acme.a': { script: "#!/bin/sh\necho 'boom: no manifest' >&2\nexit 3\n" } });
    expect((await only(installed)).message).toBe('the manifest call did not exit 0 (exited with 3); stderr: boom: no manifest');
  });

  it('is at most the last 5 lines, on one line, with what a terminal would act on taken out', async () => {
    const found = await only(failing("for i in 1 2 3 4 5 6 7; do printf 'line %s\\033[31m\\n' $i >&2; done; exit 3"));
    expect(found.message).toBe('exited with 3; stderr: line 3[31m | line 4[31m | line 5[31m | line 6[31m | line 7[31m');
  });

  it('is at most 500 characters, keeping the end', async () => {
    const found = await only(failing(`printf 'start%.0s' $(seq 1 300) >&2; printf 'the end' >&2; exit 3`));
    const shown = found.message.slice('exited with 3; stderr: '.length);
    expect(shown.length).toBeLessThanOrEqual(500);
    expect(shown.endsWith('the end')).toBe(true);
    expect(shown.startsWith('…')).toBe(true);
  });

  it('never holds a labelled secret', async () => {
    const SECRET = 'sk_live_Zm9v+/bar=baz';
    const installed = failing('echo "token $BLAZON_SECRET_TOKEN refused" >&2; exit 3', { v: 2, roles: ['check'], env: ['BLAZON_SECRET_TOKEN'], secret_env: ['BLAZON_SECRET_TOKEN'] });
    process.env.BLAZON_SECRET_TOKEN = SECRET;
    try {
      const found = await only(installed);
      expect(found.message).toBe('exited with 3; stderr: token [REDACTED] refused');
    } finally {
      delete process.env.BLAZON_SECRET_TOKEN;
    }
  });

  it('is not shown for a plugin that answered, even with an answer blazon refuses', async () => {
    expect((await only(failing("echo 'a note' >&2; echo 'cannot judge'; exit 2"))).message).toBe('could not answer: cannot judge');
    expect((await only(failing("echo 'a note' >&2; echo 'not json'"))).message).not.toContain('a note');
    const fine = install({ 'acme.a': { script: script({ v: 2, roles: ['check'] }, `echo 'a note' >&2\n${answer([])}`) } });
    expect(await make(fine).check(BRAND)).toEqual([]);
  });

  it('adds nothing when the plugin wrote nothing to stderr', async () => {
    expect((await only(failing('exit 3'))).message).toBe('exited with 3');
  });
});
