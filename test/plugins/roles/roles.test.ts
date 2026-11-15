import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PluginRun } from '../../../src/plugins/roles/roles.js';
import type { Finding } from '../../../src/types/index.js';
import { BRAND, answer, cleanup, dirs, install, script, type Installed } from '../support/fixtures.js';

// The check and build roles (RFC 0002 section 2; RFC 0005). Every test runs a real fixture plugin
// through PluginRun, the unit of work: a run of one blazon command, with its own breaker for each plugin.

afterEach(cleanup);

const codes = (findings: Finding[]) => findings.map((f) => f.code);
const make = (installed: Installed, options: ConstructorParameters<typeof PluginRun>[2] = {}) => new PluginRun(installed.config, installed.cwd, options);

describe('the check role', () => {
  it('returns the findings a pinned plugin answers with', async () => {
    const found = [{ code: 'acme.house-style/heading-font', severity: 'error', path: 'type.heading', message: 'Headings must use the display font' }];
    const installed = install({ 'acme.house-style': { script: script({ v: 2, roles: ['check'] }, answer(found)) } });
    expect(await make(installed).check(BRAND)).toEqual(found);
  });

  it('sends the request: its version, its type, the options from the config and the brand, and nothing else', async () => {
    const copy = path.join(os.tmpdir(), `blazon-request-${process.pid}-${Date.now()}`);
    dirs.push(copy);
    const installed = install({
      'acme.a': { script: script({ v: 2, roles: ['check'], env: ['REQUEST_COPY'] }, answer([])), options: { headingFont: 'Inter' }, approve: ['REQUEST_COPY'] },
    });
    process.env.REQUEST_COPY = copy;
    try {
      expect(await make(installed).check(BRAND)).toEqual([]);
    } finally {
      delete process.env.REQUEST_COPY;
    }
    expect(JSON.parse(fs.readFileSync(copy, 'utf-8'))).toEqual({ v: 1, type: 'check', options: { headingFont: 'Inter' }, brand: BRAND });
  });

  it('passes options as an empty object when the config has none', async () => {
    const copy = path.join(os.tmpdir(), `blazon-request-${process.pid}-${Date.now()}-b`);
    dirs.push(copy);
    const installed = install({ 'acme.a': { script: script({ v: 2, roles: ['check'], env: ['REQUEST_COPY'] }, answer([])), approve: ['REQUEST_COPY'] } });
    process.env.REQUEST_COPY = copy;
    try {
      await make(installed).check(BRAND);
    } finally {
      delete process.env.REQUEST_COPY;
    }
    expect(JSON.parse(fs.readFileSync(copy, 'utf-8')).options).toEqual({});
  });

  it('lists the findings of plugins in the order of the config, one plugin at a time', async () => {
    const one = (name: string) => [{ code: `${name}/x`, severity: 'warning', path: 'p', message: `from ${name}` }];
    const installed = install({
      'acme.b': { script: script({ v: 2, roles: ['check'] }, answer(one('acme.b'))) },
      'acme.a': { script: script({ v: 2, roles: ['check'] }, answer(one('acme.a'))) },
    });
    expect((await make(installed).check(BRAND)).map((f) => f.code)).toEqual(['acme.b/x', 'acme.a/x']);
  });

  it('skips a plugin whose manifest does not list the role, without an error', async () => {
    const installed = install({ 'acme.a': { script: script({ v: 2, roles: ['build'] }, 'exit 1') } });
    expect(await make(installed).check(BRAND)).toEqual([]);
  });

  describe('what must be pinned', () => {
    const unpinned = () => install({ 'acme.a': { script: script({ v: 2, roles: ['check'] }, answer([])), pinned: false } });

    it('refuses an unpinned check plugin, and says how to pin it', async () => {
      const found = await make(unpinned()).check(BRAND);
      expect(found).toHaveLength(1);
      expect(found[0]).toMatchObject({ code: 'plugin-failed', severity: 'error', path: 'acme.a' });
      expect(found[0]!.message).toContain('is not pinned, and a check plugin must be: run blazon plugin pin <path> --name acme.a');
    });

    it('runs an unpinned plugin the operator named on the command line, with a warning', async () => {
      const installed = unpinned();
      const warnings: string[] = [];
      const run = make(installed, { named: [path.join(installed.cwd, '.blazon', 'plugins', 'blazon-acme.a')], log: (line) => warnings.push(line) });
      expect(await run.check(BRAND)).toEqual([]);
      expect(warnings.join('\n')).toContain('acme.a runs unpinned');
    });

    it('does not run a plugin it was not told about: only the config and the command line allow one', async () => {
      const installed = install({ 'acme.a': { script: script({ v: 2, roles: ['check'] }, answer([{ code: 'acme.a/x', severity: 'error', path: 'p', message: 'm' }])), pinned: false } }, { plugins: [] });
      expect(await make(installed).check(BRAND)).toEqual([]);
    });
  });

  describe('a plugin that is not available', () => {
    it('is plugin-failed when no program is found, and says where it looked', async () => {
      const installed = install({}, { plugins: [{ name: 'acme.missing' }] });
      const found = await make(installed).check(BRAND);
      expect(found).toHaveLength(1);
      expect(found[0]).toMatchObject({ code: 'plugin-failed', path: 'acme.missing' });
      expect(found[0]!.message).toContain('blazon-acme.missing');
      expect(found[0]!.message).toContain('.blazon/plugins');
    });

    it('is plugin-failed when the pin no longer matches, naming both digests, and the plugin does not run', async () => {
      const marker = path.join(os.tmpdir(), `blazon-ran-${process.pid}-${Date.now()}`);
      dirs.push(marker);
      const installed = install({ 'acme.a': { script: script({ v: 2, roles: ['check'] }, `touch ${marker}\n${answer([])}`) } });
      const file = path.join(installed.cwd, 'plugins', 'acme.a', 'blazon-acme.a');
      fs.appendFileSync(file, '# changed after pinning\n');
      const found = await make(installed).check(BRAND);
      expect(found).toHaveLength(1);
      expect(found[0]!.message).toMatch(/pin mismatch: pinned t1:[0-9a-f]{64}, found t1:[0-9a-f]{64}/);
      expect(fs.existsSync(marker)).toBe(false);
    });

    it('is plugin-failed when the manifest is not one the host loads, and says why', async () => {
      const installed = install({ 'acme.a': { script: script({ v: 3, roles: ['check'] }, 'exit 0') } });
      const found = await make(installed).check(BRAND);
      expect(found[0]).toMatchObject({ code: 'plugin-failed', path: 'acme.a' });
      expect(found[0]!.message).toContain('manifest');
      expect(found[0]!.message).toContain('v must be the integer 2');
    });

    it('is plugin-failed when the lock cannot be read, and the lock problem is reported with it', async () => {
      const installed = install({ 'acme.a': { script: script({ v: 2, roles: ['check'] }, answer([])) } });
      fs.writeFileSync(path.join(installed.cwd, 'blazon.plugins.lock'), 'not json');
      fs.chmodSync(path.join(installed.cwd, 'blazon.plugins.lock'), 0o644);
      expect(codes(await make(installed).check(BRAND))).toEqual(['plugin-lock-invalid', 'plugin-failed']);
    });
  });

  describe('how a call ends', () => {
    const failing = (body: string, manifest: object = { v: 2, roles: ['check'] }) => install({ 'acme.a': { script: script(manifest, body) } });

    it('exit 2 is "cannot answer", with the plugin\'s first line as the reason, cleaned', async () => {
      const found = await make(failing("printf 'cannot judge: \\033[31minput missing\\nsecond line\\n'; exit 2")).check(BRAND);
      expect(found).toHaveLength(1);
      expect(found[0]).toMatchObject({ code: 'plugin-failed', path: 'acme.a' });
      expect(found[0]!.message).toBe('could not answer: cannot judge: [31minput missing');
      expect(found[0]!.message).not.toContain('second line');
    });

    it.each([
      ['exit 1, which is not an answer for this role', 'exit 1', 'exited with 1'],
      ['exit 3', 'exit 3', 'exited with 3'],
      ['a kill by a signal', 'kill -9 $$', 'killed by signal'],
    ])('%s is a break that names the plugin and quotes nothing it printed', async (_name, body, reason) => {
      const found = await make(failing(`echo 'a secret the plugin printed'\n${body}`)).check(BRAND);
      expect(found).toHaveLength(1);
      expect(found[0]!.message).toContain(reason);
      expect(found[0]!.message).not.toContain('a secret the plugin printed');
    });

    it('a timeout is a break', async () => {
      const found = await make(failing('sleep 30', { v: 2, roles: ['check'], timeout_ms: 300 })).check(BRAND);
      expect(found[0]!.message).toContain('timed out after 0.3s');
    }, 20_000);

    it.each([
      ['output that is not JSON', "echo 'not json'", 'is not JSON'],
      ['JSON that is not an object', 'echo "[]"', 'must be a JSON object'],
      ['no findings list', 'echo \'{}\'', 'findings must be a list'],
      ['findings that are not a list', 'echo \'{"findings":"none"}\'', 'findings must be a list'],
    ])('answers with %s: plugin-failed', async (_name, body, reason) => {
      const found = await make(failing(body)).check(BRAND);
      expect(found).toHaveLength(1);
      expect(found[0]!.code).toBe('plugin-failed');
      expect(found[0]!.message).toContain(reason);
    });
  });

  describe('the rules for a finding', () => {
    const one = (finding: object) => install({ 'acme.a': { script: script({ v: 2, roles: ['check'] }, answer([finding])) } });
    const good = { code: 'acme.a/x', severity: 'warning', path: 'p', message: 'm' };

    it.each([
      ['a code without the plugin\'s name', { ...good, code: 'x' }, 'code must start with "acme.a/"'],
      ['a code with another plugin\'s name', { ...good, code: 'acme.b/x' }, 'code must start with "acme.a/"'],
      ['a core code, which a plugin may not report under', { ...good, code: 'contrast-insufficient' }, 'code must start with "acme.a/"'],
      ['a code with a bad ending', { ...good, code: 'acme.a/Bad Code' }, 'code must be "acme.a/" followed by lowercase letters, digits and hyphens'],
      ['an unknown severity', { ...good, severity: 'fatal' }, 'severity must be error, warning or info'],
      ['a path that is not a string', { ...good, path: 5 }, 'path must be a non-empty string'],
      ['an empty message', { ...good, message: '' }, 'message must be a non-empty string'],
      ['a finding that is not an object', 'x', 'must be an object'],
    ])('refuses %s, as plugin-failed naming the finding', async (_name, finding, reason) => {
      const found = await make(one(finding as object)).check(BRAND);
      expect(found).toHaveLength(1);
      expect(found[0]).toMatchObject({ code: 'plugin-failed', path: 'acme.a' });
      expect(found[0]!.message).toContain('finding 1');
      expect(found[0]!.message).toContain(reason);
    });

    it('keeps the four fields and ignores the rest, so a plugin cannot set `context`', async () => {
      const found = await make(one({ ...good, context: 'locale=ja', extra: 1 })).check(BRAND);
      expect(found).toEqual([good]);
    });

    it('shows text as plain text: no control or format character, and no more than 1000 characters', async () => {
      const found = await make(one({ ...good, message: `a\u001b[31mb‮c${'x'.repeat(2000)}`, path: 'p\u0007q' })).check(BRAND);
      expect(found[0]!.path).toBe('pq');
      expect(found[0]!.message.startsWith('a[31mbc')).toBe(true);
      expect(found[0]!.message.length).toBe(1000);
    });

    it('accepts 500 findings and refuses 501', async () => {
      const many = (n: number) => install({ 'acme.a': { script: script({ v: 2, roles: ['check'] }, answer(Array.from({ length: n }, () => good))) } });
      expect(await make(many(500)).check(BRAND)).toHaveLength(500);
      const refused = await make(many(501)).check(BRAND);
      expect(refused).toHaveLength(1);
      expect(refused[0]!.message).toContain('more than 500 findings');
    });
  });

  describe('the breaker, for the unit of work', () => {
    const counted = () => {
      const marker = path.join(os.tmpdir(), `blazon-count-${process.pid}-${Date.now()}`);
      dirs.push(marker);
      return { marker, installed: install({ 'acme.a': { script: script({ v: 2, roles: ['check'] }, `echo x >> ${marker}\nexit 3`) } }) };
    };

    it('stops calling a plugin after three breaks in a row, without starting it, and says so', async () => {
      const { marker, installed } = counted();
      const run = make(installed);
      for (let i = 0; i < 3; i++) expect((await run.check(BRAND))[0]!.message).toContain('exited with 3');
      const stopped = await run.check(BRAND);
      expect(stopped[0]).toMatchObject({ code: 'plugin-failed', path: 'acme.a' });
      expect(stopped[0]!.message).toContain('stopped for the rest of this run after 3 breaks in a row');
      expect(fs.readFileSync(marker, 'utf-8').trim().split('\n')).toHaveLength(3);
    });

    it('counts exit 2 as a break: three calls that cannot answer stop the plugin, and an earlier break counts with them', async () => {
      const marker = path.join(os.tmpdir(), `blazon-exit2-${process.pid}-${Date.now()}`);
      dirs.push(marker);
      const body = `echo x >> ${marker}\nif [ "$(wc -l < ${marker})" -le 2 ]; then exit 3; fi\necho 'cannot judge'; exit 2`;
      const run = make(install({ 'acme.a': { script: script({ v: 2, roles: ['check'] }, body) } }));
      expect((await run.check(BRAND))[0]!.message).toContain('exited with 3');
      expect((await run.check(BRAND))[0]!.message).toContain('exited with 3');
      expect((await run.check(BRAND))[0]!.message).toBe('could not answer: cannot judge');
      expect((await run.check(BRAND))[0]!.message).toContain('stopped for the rest of this run after 3 breaks in a row');
      expect(fs.readFileSync(marker, 'utf-8').trim().split('\n')).toHaveLength(3);
    });

    it('stops on the third exit 2 and not before, and an answer between them starts the count again', async () => {
      const marker = path.join(os.tmpdir(), `blazon-exit2-reset-${process.pid}-${Date.now()}`);
      dirs.push(marker);
      const body = `echo x >> ${marker}\nif [ "$(wc -l < ${marker})" -eq 3 ]; then\n${answer([])}\nexit 0\nfi\necho 'cannot judge'; exit 2`;
      const run = make(install({ 'acme.a': { script: script({ v: 2, roles: ['check'] }, body) } }));
      expect((await run.check(BRAND))[0]!.message).toBe('could not answer: cannot judge');
      expect((await run.check(BRAND))[0]!.message).toBe('could not answer: cannot judge');
      expect(await run.check(BRAND)).toEqual([]);
      for (let i = 0; i < 3; i++) expect((await run.check(BRAND))[0]!.message).toBe('could not answer: cannot judge');
      expect((await run.check(BRAND))[0]!.message).toContain('stopped for the rest of this run after 3 breaks in a row');
      expect(fs.readFileSync(marker, 'utf-8').trim().split('\n')).toHaveLength(6);
    });

    it('counts exit 2 of a build plugin as a break too', async () => {
      const marker = path.join(os.tmpdir(), `blazon-exit2-build-${process.pid}-${Date.now()}`);
      dirs.push(marker);
      const run = make(install({ 'acme.deck': { script: script({ v: 2, roles: ['build'] }, `echo x >> ${marker}\necho 'no site'; exit 2`) } }));
      for (let i = 0; i < 3; i++) expect((await run.build(BRAND, '/site'))[0]!.message).toBe('could not answer: no site');
      expect((await run.build(BRAND, '/site'))[0]!.message).toContain('stopped for the rest of this run after 3 breaks in a row');
      expect(fs.readFileSync(marker, 'utf-8').trim().split('\n')).toHaveLength(3);
    });

    it('keeps one count for both roles in a run, as blazon build does: exit 2 of the check role and of the build role add up', async () => {
      const marker = path.join(os.tmpdir(), `blazon-exit2-roles-${process.pid}-${Date.now()}`);
      dirs.push(marker);
      const run = make(install({ 'acme.a': { script: script({ v: 2, roles: ['check', 'build'] }, `echo x >> ${marker}\necho 'cannot judge'; exit 2`) } }));
      expect((await run.check(BRAND))[0]!.message).toBe('could not answer: cannot judge');
      expect((await run.check(BRAND))[0]!.message).toBe('could not answer: cannot judge');
      expect((await run.build(BRAND, '/site'))[0]!.message).toBe('could not answer: cannot judge');
      expect((await run.build(BRAND, '/site'))[0]!.message).toContain('stopped for the rest of this run');
      expect((await run.check(BRAND))[0]!.message).toContain('stopped for the rest of this run');
      expect(fs.readFileSync(marker, 'utf-8').trim().split('\n')).toHaveLength(3);
    });

    it('counts a broken manifest call with the exit 2 calls after it: one break and two exit 2 stop the plugin', async () => {
      const marker = path.join(os.tmpdir(), `blazon-exit2-manifest-${process.pid}-${Date.now()}`);
      const flag = `${marker}.flag`;
      dirs.push(marker, flag);
      const program = `#!/bin/sh\ncase "$1" in\n  --blazon-manifest) if [ ! -f ${flag} ]; then touch ${flag}; exit 7; fi; printf '%s' '{"v":2,"roles":["check"]}'; exit 0;;\nesac\ncat > /dev/null\necho x >> ${marker}\necho 'cannot judge'; exit 2\n`;
      const run = make(install({ 'acme.a': { script: program } }));
      expect((await run.check(BRAND))[0]!.message).toContain('the manifest call did not exit 0');
      expect((await run.check(BRAND))[0]!.message).toBe('could not answer: cannot judge');
      expect((await run.check(BRAND))[0]!.message).toBe('could not answer: cannot judge');
      expect((await run.check(BRAND))[0]!.message).toContain('stopped for the rest of this run after 3 breaks in a row');
      expect(fs.readFileSync(marker, 'utf-8').trim().split('\n')).toHaveLength(2);
    });

    it('counts a manifest call that broke as a break too, and then does not start the program at all', async () => {
      const marker = path.join(os.tmpdir(), `blazon-manifest-${process.pid}-${Date.now()}`);
      dirs.push(marker);
      const installed = install({ 'acme.a': { script: `#!/bin/sh\necho x >> ${marker}\nexit 7\n` } });
      const run = make(installed);
      for (let i = 0; i < 3; i++) expect((await run.check(BRAND))[0]!.message).toContain('the manifest call did not exit 0');
      expect((await run.check(BRAND))[0]!.message).toContain('stopped for the rest of this run');
      expect(fs.readFileSync(marker, 'utf-8').trim().split('\n')).toHaveLength(3);
    });

    it('is a new one for a new run', async () => {
      const { installed } = counted();
      const first = make(installed);
      for (let i = 0; i < 4; i++) await first.check(BRAND);
      expect((await make(installed).check(BRAND))[0]!.message).toContain('exited with 3');
    });

    it('counts an answer as a reset', async () => {
      const flag = path.join(os.tmpdir(), `blazon-flag-${process.pid}-${Date.now()}`);
      dirs.push(flag);
      const installed = install({ 'acme.a': { script: script({ v: 2, roles: ['check'] }, `if [ -f ${flag} ]; then\n${answer([])}\nelse\ntouch ${flag}\nexit 3\nfi`) } });
      const run = make(installed);
      expect((await run.check(BRAND))[0]!.message).toContain('exited with 3');
      for (let i = 0; i < 5; i++) expect(await run.check(BRAND)).toEqual([]);
    });
  });

  describe('secrets', () => {
    const SECRET = 'sk_live_Zm9v+/bar=baz';
    const withSecret = (body: string, manifest: object, approve: string[] = ['BLAZON_SECRET_TOKEN', 'NOT_LISTED']) => install({ 'acme.a': { script: script({ v: 2, roles: ['check'], ...manifest }, body), approve } });
    const run = async (installed: Installed) => {
      process.env.BLAZON_SECRET_TOKEN = SECRET;
      process.env.NOT_LISTED = 'plain';
      try {
        return await make(installed).check(BRAND);
      } finally {
        delete process.env.BLAZON_SECRET_TOKEN;
        delete process.env.NOT_LISTED;
      }
    };

    it('removes a labelled value, and its forms, from everything the plugin hands back', async () => {
      const b64 = Buffer.from(SECRET).toString('base64').replace(/=+$/, '');
      const installed = withSecret(
        answer([{ code: 'acme.a/x', severity: 'error', path: `at-${SECRET}`, message: `leaked ${SECRET} and ${b64} and ${encodeURIComponent(SECRET)}` }]),
        { env: ['BLAZON_SECRET_TOKEN'], secret_env: ['BLAZON_SECRET_TOKEN'] }
      );
      const [found] = await run(installed);
      const text = JSON.stringify(found);
      for (const form of [SECRET, b64, encodeURIComponent(SECRET)]) expect(text).not.toContain(form);
      expect(found!.message).toContain('[REDACTED]');
      expect(found!.path).toBe('at-[REDACTED]');
    });

    it('scrubs the reason a plugin gives for exit 2 too', async () => {
      const installed = withSecret(`echo "cannot use ${SECRET}"; exit 2`, { env: ['BLAZON_SECRET_TOKEN'], secret_env: ['BLAZON_SECRET_TOKEN'] });
      const [found] = await run(installed);
      expect(found!.message).not.toContain(SECRET);
      expect(found!.message).toContain('[REDACTED]');
    });

    it('refuses a plugin that takes a labelled variable without accepting it as secret, and does not start it', async () => {
      const marker = path.join(os.tmpdir(), `blazon-ran-${process.pid}-${Date.now()}-s`);
      dirs.push(marker);
      const installed = withSecret(`touch ${marker}\n${answer([])}`, { env: ['BLAZON_SECRET_TOKEN'] });
      const found = await run(installed);
      expect(found[0]).toMatchObject({ code: 'plugin-failed', path: 'acme.a' });
      expect(found[0]!.message).toContain('takes BLAZON_SECRET_TOKEN, which is labelled secret, but its manifest does not list it in secret_env');
      expect(fs.existsSync(marker)).toBe(false);
    });

    it('gives a plugin only the variables its manifest lists', async () => {
      const installed = withSecret(
        `v=$(env | grep -c -E '^(BLAZON_SECRET_TOKEN|NOT_LISTED)=')\nprintf '{"findings":[{"code":"acme.a/env","severity":"info","path":"p","message":"seen:%s"}]}' "$v"`,
        { env: ['NOT_LISTED'] }
      );
      const [found] = await run(installed);
      expect(found!.message).toBe('seen:1');
    });

    it('treats a secret_env with no BLAZON_SECRET_ name as the plugin\'s own claim, which labels nothing', async () => {
      const installed = withSecret(answer([]), { env: ['NOT_LISTED'], secret_env: ['NOT_LISTED'] });
      expect(await run(installed)).toEqual([]);
    });
  });

  it('refuses a request over the cap, and does not start the plugin', async () => {
    const marker = path.join(os.tmpdir(), `blazon-ran-${process.pid}-${Date.now()}-c`);
    dirs.push(marker);
    const installed = install({ 'acme.a': { script: script({ v: 2, roles: ['check'] }, `touch ${marker}\n${answer([])}`), options: { big: 'x'.repeat(4 * 1024 * 1024 + 1) } } });
    const found = await make(installed).check(BRAND);
    expect(found[0]).toMatchObject({ code: 'plugin-failed', path: 'acme.a' });
    expect(found[0]!.message).toMatch(/request is \d+ bytes, over the cap of 4194304/);
    expect(fs.existsSync(marker)).toBe(false);
  });

  it('lets a check plugin print up to 1 MiB, where the core allows 64 KB', async () => {
    const many = Array.from({ length: 400 }, (_, i) => ({ code: 'acme.a/x', severity: 'info', path: `p${i}`, message: 'm'.repeat(500) }));
    const installed = install({ 'acme.a': { script: script({ v: 2, roles: ['check'] }, answer(many)) } });
    expect(await make(installed).check(BRAND)).toHaveLength(400);
  });
});

describe('the folder a build plugin is given', () => {
  it('is not emptied when it holds a file the brand reads, even for a plugin named only on the command line', async () => {
    const log = path.join(os.tmpdir(), `blazon-build-held-${process.pid}-${Date.now()}`);
    dirs.push(log);
    // No plugin in the config: acme.export is allowed by the command line alone, so nothing in the config lists it
    const installed = install(
      { 'acme.export': { script: script({ v: 2, roles: ['build'] }, `echo ran >> ${log}\n${answer([])}`), pinned: false } },
      { plugins: [], tokensOutDir: './extras', resolver: 'blazon.resolver.json' },
    );
    const source = path.join(installed.cwd, 'extras/acme.export/base.json');
    fs.mkdirSync(path.dirname(source), { recursive: true });
    fs.writeFileSync(source, '{}');
    fs.writeFileSync(path.join(installed.cwd, 'blazon.resolver.json'), JSON.stringify({ version: '2025.10', sets: { base: { sources: [{ $ref: 'extras/acme.export/base.json' }] } }, resolutionOrder: [{ $ref: '#/sets/base' }] }));
    const siteDir = path.join(installed.cwd, 'dist', 'site');
    fs.mkdirSync(siteDir, { recursive: true });
    const found = await make(installed, { named: [path.join(installed.cwd, '.blazon', 'plugins', 'blazon-acme.export')] }).build(BRAND, siteDir);
    expect(codes(found)).toEqual(['plugin-failed']);
    expect(found[0]!.message).toMatch(/output folder[^]*resolver source[^]*extras\/acme\.export\/base\.json[^]*would delete/);
    expect(fs.existsSync(source)).toBe(true);
    expect(fs.existsSync(log)).toBe(false);
  });
});

describe('the build role', () => {
  const BUILD = (body: string, extra: object = {}) => script({ v: 2, roles: ['build'], ...extra }, body);

  it('writes into its own out_dir, which blazon creates empty, and gets the site and out directories in the request', async () => {
    const copy = path.join(os.tmpdir(), `blazon-build-${process.pid}-${Date.now()}`);
    dirs.push(copy);
    const installed = install({ 'acme.deck': { script: BUILD('printf deck > "$(sed -n \'s/.*"out_dir":"\\([^"]*\\)".*/\\1/p\' "$REQUEST_COPY")/deck.txt"', { env: ['REQUEST_COPY'] }), pinned: true, approve: ['REQUEST_COPY'] } });
    const siteDir = path.join(installed.cwd, 'dist', 'site');
    fs.mkdirSync(siteDir, { recursive: true });
    process.env.REQUEST_COPY = copy;
    try {
      expect(await make(installed).build(BRAND, siteDir)).toEqual([]);
    } finally {
      delete process.env.REQUEST_COPY;
    }
    const outDir = path.join(installed.cwd, 'dist', 'tokens', 'acme.deck');
    expect(fs.readFileSync(path.join(outDir, 'deck.txt'), 'utf-8')).toBe('deck');
    expect(JSON.parse(fs.readFileSync(copy, 'utf-8'))).toEqual({ v: 1, type: 'build', options: {}, brand: BRAND, site_dir: siteDir, tokens_dir: path.join(installed.cwd, 'dist', 'tokens'), out_dir: outDir });
  });

  it('empties out_dir before each run, so a file from an earlier run does not stay', async () => {
    const installed = install({ 'acme.deck': { script: BUILD('exit 0') } });
    const outDir = path.join(installed.cwd, 'dist', 'tokens', 'acme.deck');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'old.txt'), 'old');
    await make(installed).build(BRAND, path.join(installed.cwd, 'dist', 'site'));
    expect(fs.readdirSync(outDir)).toEqual([]);
  });

  it('may answer with nothing, or with findings under the same rules', async () => {
    const quiet = install({ 'acme.deck': { script: BUILD('exit 0') } });
    expect(await make(quiet).build(BRAND, '/site')).toEqual([]);
    const found = [{ code: 'acme.deck/slow', severity: 'warning', path: 'deck', message: 'It took long' }];
    const talking = install({ 'acme.deck': { script: BUILD(answer(found)) } });
    expect(await make(talking).build(BRAND, '/site')).toEqual(found);
    const bad = install({ 'acme.deck': { script: BUILD(answer([{ code: 'other/x', severity: 'error', path: 'p', message: 'm' }])) } });
    expect(codes(await make(bad).build(BRAND, '/site'))).toEqual(['plugin-failed']);
  });

  it('runs unpinned, because only a check plugin must be pinned', async () => {
    const installed = install({ 'acme.deck': { script: BUILD('exit 0'), pinned: false } });
    expect(await make(installed).build(BRAND, '/site')).toEqual([]);
  });

  it('is held to the core\'s 64 KB of output, where a check plugin gets 1 MiB', async () => {
    const installed = install({ 'acme.deck': { script: BUILD("head -c 100000 /dev/zero | tr '\\0' a") } });
    const found = await make(installed).build(BRAND, '/site');
    expect(found[0]!.message).toContain('output over the limit of 65536 bytes');
  });

  it('is behind the breaker like the check role: exit 1 is a break, three stop it', async () => {
    const installed = install({ 'acme.deck': { script: BUILD('exit 1') } });
    const run = make(installed);
    for (let i = 0; i < 3; i++) expect((await run.build(BRAND, '/site'))[0]!.message).toContain('exited with 1');
    expect((await run.build(BRAND, '/site'))[0]!.message).toContain('stopped for the rest of this run');
  });

  it('is not run by the check role, and a check plugin is not run by the build role', async () => {
    const installed = install({ 'acme.deck': { script: BUILD('exit 3') } });
    expect(await make(installed).check(BRAND)).toEqual([]);
    const checking = install({ 'acme.a': { script: script({ v: 2, roles: ['check'] }, 'exit 3') } });
    expect(await make(checking).build(BRAND, '/site')).toEqual([]);
  });
});

// Plugin instances (RFC 0014): one plugin listed more than once, each entry with an id of its own. The pin follows the plugin's
// name; the output folder, the breaker and the name in a finding follow the id.
describe('plugin instances', () => {
  const book = (ids: string[], options: (id: string) => Record<string, unknown> = () => ({})) => ids.map((id) => ({ name: 'acme.book', as: id, options: options(id), env: ['REQUEST_COPY'] }));
  const IDS = ['acme.book-a', 'acme.book-b', 'acme.book-c', 'acme.book-d'];
  // A build plugin that writes the same file name in whatever folder it is given, and logs the request it got
  const writer = (log: string) =>
    script(
      { v: 2, roles: ['build'], env: ['REQUEST_COPY'] },
      `d=$(sed -n 's/.*"out_dir":"\\([^"]*\\)".*/\\1/p' "$REQUEST_COPY")\nprintf '%s' "$(basename "$d")" > "$d/brand-book.txt"\ncat "$REQUEST_COPY" >> ${log}\necho >> ${log}\n${answer([])}`,
    );
  const logged = (name: string) => {
    const file = path.join(os.tmpdir(), `blazon-instances-${name}-${process.pid}-${Date.now()}`);
    dirs.push(file);
    return file;
  };
  const withRequest = async <T>(copy: string, work: () => Promise<T>): Promise<T> => {
    process.env.REQUEST_COPY = copy;
    try {
      return await work();
    } finally {
      delete process.env.REQUEST_COPY;
    }
  };

  it('builds one plugin listed four times into four folders, and none empties another, each request with its own options', async () => {
    const log = logged('log');
    const installed = install({ 'acme.book': { script: writer(log) } }, { plugins: book(IDS, (id) => ({ pages: id.slice(-1) })) });
    const siteDir = path.join(installed.cwd, 'dist', 'site');
    fs.mkdirSync(siteDir, { recursive: true });
    expect(await withRequest(`${log}.request`, () => make(installed).build(BRAND, siteDir))).toEqual([]);
    for (const id of IDS) expect(fs.readFileSync(path.join(installed.cwd, 'dist', 'tokens', id, 'brand-book.txt'), 'utf-8')).toBe(id);
    expect(fs.existsSync(path.join(installed.cwd, 'dist', 'tokens', 'acme.book'))).toBe(false);
    const requests = fs.readFileSync(log, 'utf-8').trim().split('\n').map((line) => JSON.parse(line));
    expect(requests.map((r) => r.options)).toEqual([{ pages: 'a' }, { pages: 'b' }, { pages: 'c' }, { pages: 'd' }]);
    expect(requests.map((r) => path.basename(r.out_dir))).toEqual(IDS);
  });

  it('keeps a finding message within 1000 characters with the instance suffix counted', async () => {
    const id = `acme.${'x'.repeat(59)}`;
    const long = [{ code: 'acme.book/long', severity: 'error', path: 'p', message: 'y'.repeat(2000) }];
    const installed = install({ 'acme.book': { script: script({ v: 2, roles: ['check'] }, answer(long)) } }, { plugins: [{ name: 'acme.book', as: id, options: {} }] });
    const found = await make(installed).check(BRAND);
    expect(found).toHaveLength(1);
    expect(found[0]!.message.endsWith(` (instance ${id})`)).toBe(true);
    expect(found[0]!.message.length).toBe(1000);
  });

  it('empties only the folder of the instance that runs', async () => {
    const installed = install({ 'acme.book': { script: script({ v: 2, roles: ['build'] }, 'exit 0') } }, { plugins: book(['acme.book-a']) });
    const mine = path.join(installed.cwd, 'dist', 'tokens', 'acme.book-a');
    const other = path.join(installed.cwd, 'dist', 'tokens', 'acme.book-b');
    for (const dir of [mine, other]) {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'old.txt'), 'old');
    }
    await make(installed).build(BRAND, path.join(installed.cwd, 'dist', 'site'));
    expect(fs.readdirSync(mine)).toEqual([]);
    expect(fs.readdirSync(other)).toEqual(['old.txt']);
  });

  it('refuses to empty a folder that holds a file the brand reads, and names the instance', async () => {
    const log = logged('held');
    const installed = install({ 'acme.book': { script: script({ v: 2, roles: ['build'] }, `echo ran >> ${log}\n${answer([])}`) } }, { plugins: book(IDS.slice(0, 2)), tokensOutDir: './extras', resolver: 'blazon.resolver.json' });
    const source = path.join(installed.cwd, 'extras/acme.book-b/base.json');
    fs.mkdirSync(path.dirname(source), { recursive: true });
    fs.writeFileSync(source, '{}');
    fs.writeFileSync(path.join(installed.cwd, 'blazon.resolver.json'), JSON.stringify({ version: '2025.10', sets: { base: { sources: [{ $ref: 'extras/acme.book-b/base.json' }] } }, resolutionOrder: [{ $ref: '#/sets/base' }] }));
    const found = await make(installed).build(BRAND, path.join(installed.cwd, 'dist', 'site'));
    expect(found.map((f) => [f.code, f.path])).toEqual([['plugin-failed', 'acme.book-b']]);
    expect(found[0]!.message).toMatch(/^instance of acme\.book: its output folder[^]*would delete/);
    expect(fs.existsSync(source)).toBe(true);
    expect(fs.readFileSync(log, 'utf-8').trim().split('\n')).toHaveLength(1);
  });

  // RFC 0014 sections 3.1 and 3.3: every id is checked, and ids are unique across the plugins that run, those named for one run too
  describe('ids across the config and the command line', () => {
    // A build plugin that writes a file named after itself into the folder it is given
    const marking = (mark: string, log: string) => script({ v: 2, roles: ['build'], env: ['REQUEST_COPY'] }, `d=$(sed -n 's/.*"out_dir":"\\([^"]*\\)".*/\\1/p' "$REQUEST_COPY")\nprintf ${mark} > "$d/${mark}.txt"\necho ${mark} >> ${log}\n${answer([])}`);

    it('refuses a program named with --plugin whose id is the "as" of a config entry, so the two never share a folder or a breaker', async () => {
      const log = logged('collide');
      const installed = install({ 'acme.a': { script: marking('a', log) }, 'acme.b': { script: marking('b', log), pinned: false } }, { plugins: [{ name: 'acme.a', as: 'acme.b', env: ['REQUEST_COPY'] }] });
      const siteDir = path.join(installed.cwd, 'dist', 'site');
      fs.mkdirSync(siteDir, { recursive: true });
      const found = await withRequest(`${log}.request`, () => make(installed, { named: [path.join(installed.cwd, '.blazon', 'plugins', 'blazon-acme.b')] }).build(BRAND, siteDir));
      expect(found.map((f) => [f.code, f.path])).toEqual([['plugin-failed', 'acme.b']]);
      expect(found[0]!.message).toMatch(/id acme\.b[^]*--plugin[^]*plugins\[0\]\.as/);
      expect(fs.readdirSync(path.join(installed.cwd, 'dist', 'tokens', 'acme.b'))).toEqual(['a.txt']);
      expect(fs.readFileSync(log, 'utf-8').trim().split('\n')).toEqual(['a']);
    });

    it('refuses a program named with --plugin whose name, its id, is longer than 64 characters', async () => {
      const name = `acme.${'x'.repeat(60)}`;
      const installed = install({}, { plugins: [] });
      const found = await make(installed, { named: [path.join(installed.cwd, `blazon-${name}`)] }).check(BRAND);
      expect(found.map((f) => [f.code, f.path])).toEqual([['plugin-failed', name]]);
      expect(found[0]!.message).toContain('is 65 characters; an instance id is at most 64');
    });

    it('refuses a second, different program named with --plugin under the same name', async () => {
      const installed = install({}, { plugins: [] });
      const found = await make(installed, { named: [path.join(installed.cwd, 'one', 'blazon-acme.x'), path.join(installed.cwd, 'two', 'blazon-acme.x')] }).check(BRAND);
      expect(found.map((f) => f.path)).toEqual(['acme.x', 'acme.x']);
      expect(found.map((f) => f.message).filter((m) => /--plugin [^ ]*two[^]*plugin acme\.x[^]*--plugin [^ ]*one/.test(m))).toHaveLength(1);
    });
  });

  describe('the breaker', () => {
    it('is the instance\'s: three breaks of one instance do not rest another instance of the same plugin', async () => {
      const marker = logged('marker');
      const installed = install({ 'acme.book': { script: script({ v: 2, roles: ['check'], env: ['REQUEST_COPY'] }, `echo x >> ${marker}\nif grep -q '"fail":true' "$REQUEST_COPY"; then exit 3; fi\n${answer([])}`) } }, {
        plugins: [{ name: 'acme.book', as: 'acme.book-a', options: { fail: true }, env: ['REQUEST_COPY'] }, { name: 'acme.book', as: 'acme.book-b', options: { fail: false }, env: ['REQUEST_COPY'] }],
      });
      const run = make(installed);
      await withRequest(`${marker}.request`, async () => {
        for (let i = 0; i < 3; i++) await run.check(BRAND);
        const fourth = await run.check(BRAND);
        expect(fourth.map((f) => [f.path, f.message.includes('stopped for the rest of this run')])).toEqual([['acme.book-a', true]]);
      });
      // three calls of a, then (a stopped, so no manifest call either) b ran on each of the four rounds: 4 requests
      expect(fs.readFileSync(marker, 'utf-8').trim().split('\n')).toHaveLength(3 + 4);
    });
  });

  describe('the pin', () => {
    const checker = () => script({ v: 2, roles: ['check'] }, answer([]));

    it('is looked up by the plugin\'s name for every instance: a check plugin pinned once runs under each id', async () => {
      const installed = install({ 'acme.book': { script: checker() } }, { plugins: book(IDS.slice(0, 2)) });
      expect(await make(installed).check(BRAND)).toEqual([]);
    });

    it('is checked before every call of every instance: a program that changed is refused under each id', async () => {
      const installed = install({ 'acme.book': { script: checker() } }, { plugins: book(IDS.slice(0, 2)) });
      const run = make(installed);
      expect(await run.check(BRAND)).toEqual([]);
      fs.appendFileSync(path.join(installed.cwd, 'plugins', 'acme.book', 'blazon-acme.book'), '# changed\n');
      const found = await run.check(BRAND);
      expect(found.map((f) => [f.code, f.path])).toEqual([['plugin-failed', 'acme.book-a'], ['plugin-failed', 'acme.book-b']]);
    });

    it('is not a pin of the id: an instance whose plugin is not pinned is refused with the plugin\'s name in the advice', async () => {
      const installed = install({ 'acme.book': { script: checker(), pinned: false } }, { plugins: book(['acme.book-a']) });
      const [found] = await make(installed).check(BRAND);
      expect(found!.path).toBe('acme.book-a');
      expect(found!.message).toContain('--name acme.book');
    });
  });

  describe('what a person reads', () => {
    const finding = [{ code: 'acme.book/too-long', severity: 'warning', path: 'page.3', message: 'Too long' }];
    const checking = (plugins: object[]) => install({ 'acme.book': { script: script({ v: 2, roles: ['check'] }, answer(finding)) } }, { plugins: plugins as never });

    it('names the instance in a finding of a plugin listed more than once, and keeps the plugin\'s own code and path', async () => {
      const found = await make(checking(book(IDS.slice(0, 2)))).check(BRAND);
      expect(found).toEqual([
        { code: 'acme.book/too-long', severity: 'warning', path: 'page.3', message: 'Too long (instance acme.book-a)' },
        { code: 'acme.book/too-long', severity: 'warning', path: 'page.3', message: 'Too long (instance acme.book-b)' },
      ]);
    });

    it('names the instance when the id is not the name, even for a plugin listed once', async () => {
      expect((await make(checking(book(['acme.book-a']))).check(BRAND))[0]!.message).toBe('Too long (instance acme.book-a)');
    });

    it('adds nothing for an entry with no id', async () => {
      expect(await make(checking([{ name: 'acme.book' }])).check(BRAND)).toEqual(finding);
    });

    it('names the instance of every entry when the plugin is listed twice, the one whose id is its name too', async () => {
      const found = await make(checking([{ name: 'acme.book' }, { name: 'acme.book', as: 'acme.book-b' }])).check(BRAND);
      expect(found.map((f) => f.message)).toEqual(['Too long (instance acme.book)', 'Too long (instance acme.book-b)']);
    });
  });
});
