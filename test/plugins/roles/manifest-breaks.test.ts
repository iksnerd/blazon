import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PluginRun } from '../../../src/plugins/roles/roles.js';
import { Cooldown } from '../../../src/plugins/roles/gate.js';
import { BRAND, cleanup, dirs, install } from '../support/fixtures.js';

// RFC 0002 section 2: exit 1 is a break for both roles, and exit 2 counts for a run's breaker and not for the dev cooldown.
// The manifest call is a call like any other: a manifest call that ends that way, or prints a manifest blazon cannot load,
// is recorded, so a plugin that crashes at start is stopped like one that crashes on a request.

afterEach(cleanup);

const STOPPED = 'stopped for the rest of this run after 3 breaks in a row';
const starts = () => {
  const marker = path.join(os.tmpdir(), `blazon-manifest-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  dirs.push(marker);
  return marker;
};
const counted = (marker: string) => fs.existsSync(marker) ? fs.readFileSync(marker, 'utf-8').trim().split('\n').length : 0;
const crashing = (marker: string, manifestBody: string) => install({ 'acme.a': { script: `#!/bin/sh\necho x >> ${marker}\n${manifestBody}\n` } });

describe('a manifest call that does not answer', () => {
  it.each([
    ['exits 1', 'exit 1', 'exit 1'],
    ['exits 2', "echo 'cannot start'; exit 2", 'exit 2'],
    ['prints a manifest that is not JSON', "echo 'not json'", 'exit 0'],
  ])('that %s trips the run breaker after three', async (_name, body) => {
    const marker = starts();
    const installed = crashing(marker, body);
    const run = new PluginRun(installed.config, installed.cwd);
    for (let i = 0; i < 3; i++) expect((await run.check(BRAND))[0]!.message).not.toContain(STOPPED);
    expect((await run.check(BRAND))[0]!.message).toContain(STOPPED);
    expect(counted(marker)).toBe(3);
  });

  it('that exits 1 starts the dev cooldown', async () => {
    const marker = starts();
    const installed = crashing(marker, 'exit 1');
    const gate = new Cooldown(() => 0, 30_000);
    const run = new PluginRun(installed.config, installed.cwd, { gate });
    expect((await run.check(BRAND))[0]!.message).toContain('manifest call did not exit 0');
    expect((await run.check(BRAND))[0]!.message).toBe('stopped after a break, and runs again in 30 seconds');
    expect(counted(marker)).toBe(1);
  });

  it('that prints a manifest blazon cannot load starts the dev cooldown', async () => {
    const marker = starts();
    const installed = crashing(marker, "echo 'not json'");
    const run = new PluginRun(installed.config, installed.cwd, { gate: new Cooldown(() => 0, 30_000) });
    await run.check(BRAND);
    expect((await run.check(BRAND))[0]!.message).toBe('stopped after a break, and runs again in 30 seconds');
  });

  it('that exits 2 does not start the dev cooldown', async () => {
    const marker = starts();
    const installed = crashing(marker, "echo 'cannot start'; exit 2");
    const run = new PluginRun(installed.config, installed.cwd, { gate: new Cooldown(() => 0, 30_000) });
    await run.check(BRAND);
    await run.check(BRAND);
    expect(counted(marker)).toBe(2);
  });
});
