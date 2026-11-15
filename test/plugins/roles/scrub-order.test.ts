import { describe, it, expect, afterEach } from 'vitest';
import { PluginRun, readAnswer, stderrTail } from '../../../src/plugins/roles/roles.js';
import { BRAND, cleanup, install, script } from '../support/fixtures.js';

// A secret split by a character that is later stripped (a zero-width space, a bare ESC) must not survive the scrubber
// and be joined whole by the strip step: control and format characters come out first, then the scrub.

afterEach(cleanup);

const VALUE = 'hidden-value-0042';
const SPLIT = ['hidden-va​lue-0042', 'hidden-va\u001blue-0042', 'hid\u0007den-value-0042'];

const answerWith = (message: string) => Buffer.from(JSON.stringify({ findings: [{ code: 'acme.a/x', severity: 'error', path: 'p', message }] }));

describe('scrubbing after control characters are stripped', () => {
  it.each(SPLIT)('removes a secret split inside a finding message (%j)', (split) => {
    const read = readAnswer('check', 'acme.a', answerWith(`token ${split} end`), [VALUE]);
    expect('findings' in read && read.findings[0]!.message).toBe('token [REDACTED] end');
  });

  it('removes one split inside a finding path', () => {
    const body = Buffer.from(JSON.stringify({ findings: [{ code: 'acme.a/x', severity: 'error', path: 'hidden-va​lue-0042', message: 'm' }] }));
    const read = readAnswer('check', 'acme.a', body, [VALUE]);
    expect('findings' in read && read.findings[0]!.path).toBe('[REDACTED]');
  });

  it('removes a secret that itself holds a format character', () => {
    const read = readAnswer('check', 'acme.a', answerWith('t abc​def x'), ['abc​def']);
    expect('findings' in read && read.findings[0]!.message).toBe('t [REDACTED] x');
  });

  it.each(SPLIT)('removes one split inside stderr (%j)', (split) => {
    expect(stderrTail(Buffer.from(`boom ${split} done\n`), [VALUE])).toBe('boom [REDACTED] done');
  });

  it.each(SPLIT)('removes one split inside the first line of an exit 2 (%j)', async (split) => {
    const SECRETVAR = 'BLAZON_SECRET_TOKEN';
    process.env[SECRETVAR] = VALUE;
    try {
      const installed = install({ 'acme.a': { script: script({ v: 2, roles: ['check'], env: [SECRETVAR], secret_env: [SECRETVAR] }, `printf 'no: %s\\n' '${split}'; exit 2`) } });
      const found = await new PluginRun(installed.config, installed.cwd).check(BRAND);
      expect(found[0]!.message).toBe('could not answer: no: [REDACTED]');
    } finally {
      delete process.env[SECRETVAR];
    }
  });
});

describe('a finding code is never a way out for a secret', () => {
  it('refuses a finding whose code changes under the scrubber', () => {
    const secret = 'deadbeef0123';
    const body = Buffer.from(JSON.stringify({ findings: [{ code: `acme.a/${secret}`, severity: 'error', path: 'p', message: 'm' }] }));
    const read = readAnswer('check', 'acme.a', body, [secret]);
    expect(read).toMatchObject({ problem: expect.stringContaining('finding 1: code') });
  });

  it('still accepts a code that holds no secret', () => {
    const body = Buffer.from(JSON.stringify({ findings: [{ code: 'acme.a/fine', severity: 'error', path: 'p', message: 'm' }] }));
    expect(readAnswer('check', 'acme.a', body, ['deadbeef0123'])).toHaveProperty('findings');
  });
});
