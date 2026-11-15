import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { initStarter } from '../../support/project';
import { compileBlazonData } from '../../../src/core/index.js';
import { DevChecks } from '../../../src/plugins/roles/dev.js';
import { LOCK_FILE, recordPin } from '../../../src/plugins/pins/lock.js';
import type { Finding, BlazonData } from '../../../src/types/index.js';
import { answer, cleanup, dirs, install, script, type Installed } from '../support/fixtures.js';

// blazon dev runs the check plugins after each compile (RFC 0002 of blazon, section 2): one call at a time, a call made
// stale by a newer compile is dropped, and a plugin that breaks rests for 30 seconds in place of the run's breaker.
// Every test runs real fixture plugins through DevChecks with a clock the test moves.

afterEach(cleanup);

const FOUND = { code: 'acme.a/x', severity: 'warning', path: 'brand.primary', message: 'found' };
const marker = (): string => {
  const file = path.join(os.tmpdir(), `blazon-dev-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  dirs.push(file);
  return file;
};
const lines = (file: string): string[] => (fs.existsSync(file) ? fs.readFileSync(file, 'utf-8').trim().split('\n').filter(Boolean) : []);

/** The starter project with the plugins installed, and its compiled data. */
async function project(plugins: Parameters<typeof install>[0]): Promise<{ installed: Installed; data: BlazonData }> {
  const installed = install(plugins);
  await initStarter(installed.cwd);
  return { installed, data: await compileBlazonData(installed.config, installed.cwd) };
}
const clock = () => {
  const time = { now: 0 };
  return { time, now: () => time.now };
};
const text = (found: Finding[] | undefined): string => (found ?? []).map((f) => f.message).join('\n');

describe('DevChecks', () => {
  it('returns what the check plugins find, and leaves the core\'s findings alone', async () => {
    const { installed, data } = await project({ 'acme.a': { script: script({ v: 2, roles: ['check'] }, answer([FOUND])) } });
    const before = [...data.findings];
    const found = await new DevChecks(installed.cwd).check(data, installed.config);
    expect(found).toEqual([FOUND]);
    expect(data.findings).toEqual(before);
  });

  it('says whether the project allows any plugin, and returns nothing for a project that allows none', async () => {
    const { installed, data } = await project({});
    const checks = new DevChecks(installed.cwd);
    expect(checks.has(installed.config)).toBe(false);
    expect(await checks.check(data, installed.config)).toEqual([]);
    const withPlugin = await project({ 'acme.a': { script: script({ v: 2, roles: ['check'] }, answer([])) } });
    expect(new DevChecks(withPlugin.installed.cwd).has(withPlugin.installed.config)).toBe(true);
  });

  it('does not run a plugin that is only a build plugin', async () => {
    const log = marker();
    const { installed, data } = await project({ 'acme.a': { script: script({ v: 2, roles: ['build'] }, `echo ran >> ${log}\n${answer([FOUND])}`) } });
    expect(await new DevChecks(installed.cwd).check(data, installed.config)).toEqual([]);
    expect(lines(log)).toEqual([]);
  });

  describe('a compile made stale by a newer one', () => {
    const slow = (log: string) => script({ v: 2, roles: ['check'] }, `echo start >> ${log}\nsleep 0.6\necho end >> ${log}\n${answer([FOUND])}`);

    it('has its result dropped, and only the newest compile runs next', async () => {
      const log = marker();
      const { installed, data } = await project({ 'acme.a': { script: slow(log) } });
      const checks = new DevChecks(installed.cwd);
      const first = checks.check(data, installed.config);
      const second = checks.check(data, installed.config);
      const third = checks.check(data, installed.config);
      expect(await Promise.all([first, second, third])).toEqual([undefined, undefined, [FOUND]]);
      expect(lines(log)).toEqual(['start', 'end', 'start', 'end']);
    }, 30_000);

    it('has its result dropped when a change replaces it without asking for a check, as when plugins are switched off', async () => {
      const log = marker();
      const { installed, data } = await project({ 'acme.a': { script: slow(log) } });
      const checks = new DevChecks(installed.cwd);
      const running = checks.check(data, installed.config);
      await new Promise((done) => setTimeout(done, 150));
      checks.supersede();
      expect(await running).toBeUndefined();
      // The next check is not dropped for it
      expect(await checks.check(data, installed.config)).toEqual([FOUND]);
    }, 30_000);

    it('has a waiting compile dropped too, and supersede with nothing in flight is harmless', async () => {
      const log = marker();
      const { installed, data } = await project({ 'acme.a': { script: slow(log) } });
      const checks = new DevChecks(installed.cwd);
      checks.supersede();
      const first = checks.check(data, installed.config);
      const second = checks.check(data, installed.config);
      checks.supersede();
      expect(await Promise.all([first, second])).toEqual([undefined, undefined]);
    }, 30_000);

    it('lets the only compile in flight finish and return', async () => {
      const log = marker();
      const { installed, data } = await project({ 'acme.a': { script: slow(log) } });
      expect(await new DevChecks(installed.cwd).check(data, installed.config)).toEqual([FOUND]);
      expect(lines(log)).toEqual(['start', 'end']);
    }, 30_000);

    it('runs calls one at a time: a second compile does not start a plugin while one runs', async () => {
      const log = marker();
      const { installed, data } = await project({ 'acme.a': { script: slow(log) }, 'acme.b': { script: slow(log) } });
      const checks = new DevChecks(installed.cwd);
      const first = checks.check(data, installed.config);
      const second = checks.check(data, installed.config);
      await Promise.all([first, second]);
      // Four calls in all, and never two started before one ended
      const open = lines(log).reduce((most, line, i, all) => {
        const depth = all.slice(0, i + 1).filter((l) => l === 'start').length - all.slice(0, i + 1).filter((l) => l === 'end').length;
        return Math.max(most, depth);
      }, 0);
      expect(open).toBe(1);
    }, 60_000);

    it('goes on to the next compile after one that failed to run', async () => {
      const { installed, data } = await project({ 'acme.a': { script: script({ v: 2, roles: ['check'] }, answer([FOUND])) } });
      const checks = new DevChecks(installed.cwd);
      expect(await checks.check(data, installed.config)).toEqual([FOUND]);
      expect(await checks.check(data, installed.config)).toEqual([FOUND]);
    });
  });

  describe('the cooldown, in place of the breaker', () => {
    const breaking = (log: string) => script({ v: 2, roles: ['check'] }, `echo x >> ${log}\nexit 3`);

    it('does not start a plugin that broke for 30 seconds, and says how long is left', async () => {
      const log = marker();
      const { time, now } = clock();
      const { installed, data } = await project({ 'acme.a': { script: breaking(log) } });
      const checks = new DevChecks(installed.cwd, { now });
      expect(text(await checks.check(data, installed.config))).toContain('exited with 3');
      time.now = 10_000;
      const resting = await checks.check(data, installed.config);
      expect(resting).toHaveLength(1);
      expect(resting![0]).toMatchObject({ code: 'plugin-failed', severity: 'error', path: 'acme.a' });
      expect(resting![0]!.message).toBe('stopped after a break, and runs again in 20 seconds');
      expect(lines(log)).toHaveLength(1);
    });

    it('starts it again once the 30 seconds are over, to the millisecond', async () => {
      const log = marker();
      const { time, now } = clock();
      const { installed, data } = await project({ 'acme.a': { script: breaking(log) } });
      const checks = new DevChecks(installed.cwd, { now });
      await checks.check(data, installed.config);
      time.now = 29_999;
      expect(text(await checks.check(data, installed.config))).toBe('stopped after a break, and runs again in 1 second');
      expect(lines(log)).toHaveLength(1);
      time.now = 30_000;
      expect(text(await checks.check(data, installed.config))).toContain('exited with 3');
      expect(lines(log)).toHaveLength(2);
    });

    it('starts the rest again at 30 seconds after the latest break, not the first', async () => {
      const log = marker();
      const { time, now } = clock();
      const { installed, data } = await project({ 'acme.a': { script: breaking(log) } });
      const checks = new DevChecks(installed.cwd, { now });
      await checks.check(data, installed.config);
      time.now = 31_000;
      await checks.check(data, installed.config);
      time.now = 50_000;
      expect(text(await checks.check(data, installed.config))).toContain('runs again in 11 seconds');
      expect(lines(log)).toHaveLength(2);
    });

    it('does not rest a plugin for saying it cannot judge: the cooldown takes exit 2 as a change to wait for, not a break', async () => {
      const log = marker();
      const { installed, data } = await project({ 'acme.a': { script: script({ v: 2, roles: ['check'] }, `echo x >> ${log}\necho "no rules"\nexit 2`) } });
      const checks = new DevChecks(installed.cwd, { now: () => 0 });
      for (let i = 0; i < 4; i++) expect(text(await checks.check(data, installed.config))).toContain('could not answer: no rules');
      expect(lines(log)).toHaveLength(4);
    });

    it('rests only the plugin that broke', async () => {
      const log = marker();
      const { installed, data } = await project({
        'acme.a': { script: breaking(log) },
        'acme.b': { script: script({ v: 2, roles: ['check'] }, answer([{ ...FOUND, code: 'acme.b/x' }])) },
      });
      const checks = new DevChecks(installed.cwd, { now: () => 0 });
      await checks.check(data, installed.config);
      const second = await checks.check(data, installed.config);
      expect(second!.map((f) => f.code)).toEqual(['plugin-failed', 'acme.b/x']);
      expect(lines(log)).toHaveLength(1);
    });

    it('does not start the program at all while it rests, not even for its manifest', async () => {
      const log = marker();
      const { installed, data } = await project({
        'acme.a': { script: `#!/bin/sh\necho any >> ${log}\ncase "$1" in\n  --blazon-manifest) printf '%s' '{"v":2,"roles":["check"]}'; exit 0;;\nesac\ncat > /dev/null\nexit 3\n` },
      });
      const checks = new DevChecks(installed.cwd, { now: () => 0 });
      await checks.check(data, installed.config);
      const started = lines(log).length;
      await checks.check(data, installed.config);
      expect(lines(log)).toHaveLength(started);
    });

    it('rests a plugin whose manifest call broke, so a plugin that cannot even start is not started at every save', async () => {
      const log = marker();
      const { time, now } = clock();
      const { installed, data } = await project({ 'acme.a': { script: `#!/bin/sh\necho x >> ${log}\nexit 7\n` } });
      const checks = new DevChecks(installed.cwd, { now });
      expect(text(await checks.check(data, installed.config))).toContain('the manifest call did not exit 0');
      time.now = 1_000;
      expect(text(await checks.check(data, installed.config))).toContain('stopped after a break');
      expect(lines(log)).toHaveLength(1);
    });

    it('can be set to another length', async () => {
      const log = marker();
      const { time, now } = clock();
      const { installed, data } = await project({ 'acme.a': { script: breaking(log) } });
      const checks = new DevChecks(installed.cwd, { now, cooldownMs: 5_000 });
      await checks.check(data, installed.config);
      time.now = 5_000;
      await checks.check(data, installed.config);
      expect(lines(log)).toHaveLength(2);
    });
  });

  describe('each run reads the project again', () => {
    it('picks up a pin made after the first run', async () => {
      const { installed, data } = await project({ 'acme.a': { script: script({ v: 2, roles: ['check'] }, answer([FOUND])) } });
      const where = path.join(installed.cwd, 'plugins', 'acme.a');
      fs.rmSync(path.join(installed.cwd, LOCK_FILE));
      const checks = new DevChecks(installed.cwd);
      expect(text(await checks.check(data, installed.config))).toContain('is not pinned');
      recordPin(installed.cwd, 'acme.a', where);
      expect(await checks.check(data, installed.config)).toEqual([FOUND]);
    });

    it('picks up a change to the plugin\'s options, given with the new config', async () => {
      const copy = marker();
      const { installed, data } = await project({ 'acme.a': { script: script({ v: 2, roles: ['check'], env: ['REQUEST_COPY'] }, answer([])), options: { headingFont: 'Inter' } } });
      const checks = new DevChecks(installed.cwd, { env: { ...process.env, REQUEST_COPY: copy } });
      await checks.check(data, installed.config);
      expect(JSON.parse(fs.readFileSync(copy, 'utf-8')).options).toEqual({ headingFont: 'Inter' });
      await checks.check(data, { ...installed.config, plugins: [{ name: 'acme.a', options: { headingFont: 'Lora' } }] });
      expect(JSON.parse(fs.readFileSync(copy, 'utf-8')).options).toEqual({ headingFont: 'Lora' });
    });

    it('stops calling a plugin the config no longer allows', async () => {
      const log = marker();
      const { installed, data } = await project({ 'acme.a': { script: script({ v: 2, roles: ['check'] }, `echo x >> ${log}\n${answer([FOUND])}`) } });
      const checks = new DevChecks(installed.cwd);
      await checks.check(data, installed.config);
      expect(await checks.check(data, { ...installed.config, plugins: [] })).toEqual([]);
      expect(lines(log)).toHaveLength(1);
    });
  });

  it('sends the plugin the brand as the compile left it, as brand.json would hold it', async () => {
    const copy = marker();
    const { installed, data } = await project({ 'acme.a': { script: script({ v: 2, roles: ['check'], env: ['REQUEST_COPY'] }, answer([])) } });
    await new DevChecks(installed.cwd, { env: { ...process.env, REQUEST_COPY: copy } }).check(data, installed.config);
    const request = JSON.parse(fs.readFileSync(copy, 'utf-8'));
    expect(request.brand.format).toBe('blazon-brand');
    expect(request.brand.tokens.length).toBe(data.tokens.items.length);
  });
});
